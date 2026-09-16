// Caché local del historial: el chat vive en la PC de cada uno.
//
// Por qué existe: hasta la 0.20.1A, cada vez que abrías un canal la app le pedía al servidor
// los últimos 60 mensajes. Siempre, aunque ya los hubieras visto mil veces. El plan gratis da
// 5 GB de bajada por mes: con 200 personas bajando 1 MB de historial por día son 6 GB y nos
// pasamos sin haber hecho una sola llamada.
//
// Con esto, el historial se guarda acá y al servidor solo se le pide lo que cambió desde la
// última vez. Abrir un canal pasa a ser instantáneo y, si no hubo novedades, no baja nada.
//
// Guarda tres cosas:
//   mensajes → el historial, con índice por canal
//   marcas   → por canal, "de acá tengo todo hasta tal momento"
//   lapidas  → los borrados que ya aplicamos, para no volver a pedirlos
//
// Es caché, no es la verdad: si se pierde, se vuelve a bajar. Por eso nada de acá se considera
// definitivo y todo se puede reconstruir desde el servidor.

const DB_NOMBRE = 'llamadita';
const DB_VERSION = 1;

// Postgres pone la hora del mensaje cuando la transacción ARRANCA, pero la fila se hace visible
// cuando TERMINA. Dos mensajes mandados casi juntos pueden aparecer en orden distinto al de su
// hora: si pedimos "desde mi marca exacta", uno que todavía no había terminado de guardarse no
// lo vemos nunca más. Pedimos siempre un poco para atrás y tiramos los repetidos.
export const SOLAPE_MS = 30000;

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Sin almacenamiento local'));
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mensajes')) {
        const s = db.createObjectStore('mensajes', { keyPath: 'id' });
        s.createIndex('por_canal', ['channel_id', 'created_at']);
      }
      if (!db.objectStoreNames.contains('marcas')) db.createObjectStore('marcas', { keyPath: 'channel_id' });
      if (!db.objectStoreNames.contains('lapidas')) db.createObjectStore('lapidas', { keyPath: 'message_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromesa;
}

function tx(db, stores, modo) {
  const t = db.transaction(stores, modo);
  return { t, ...Object.fromEntries(stores.map((s) => [s, t.objectStore(s)])) };
}

const esperar = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

// La caché nunca puede voltear la app: si el almacenamiento falla (disco lleno, ventana
// privada, permisos), se sigue como antes, pidiéndole todo al servidor.
async function seguro(fn, siFalla) {
  try { return await fn(await abrir()); } catch (e) { console.warn('[cache] ', e?.message || e); return siFalla; }
}

// ------------------------------------------------------------------
// Almacenamiento duradero
// ------------------------------------------------------------------
// El motor de la app puede tirar la caché cuando el disco se llena. Esto le pide que no lo
// haga. Devuelve si lo concedió, que es una de las cosas que la ficha del chat pedía verificar.
export async function pedirAlmacenamientoDuradero() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) { return null; }
}

export async function espacioUsado() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage ?? null;
  } catch (_) { return null; }
}

// ------------------------------------------------------------------
// Mensajes
// ------------------------------------------------------------------
export function leerMensajes(channelId, limite = 300) {
  return seguro(async (db) => {
    const { mensajes } = tx(db, ['mensajes'], 'readonly');
    const rango = IDBKeyRange.bound([channelId, ''], [channelId, '￿']);
    const idx = mensajes.index('por_canal');
    const todos = await esperar(idx.getAll(rango));
    return todos.slice(-limite);
  }, []);
}

export function guardarMensajes(lista) {
  if (!lista?.length) return Promise.resolve();
  return seguro(async (db) => {
    const { t, mensajes } = tx(db, ['mensajes'], 'readwrite');
    for (const m of lista) mensajes.put(m);
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

export function olvidarMensajes(ids) {
  if (!ids?.length) return Promise.resolve();
  return seguro(async (db) => {
    const { t, mensajes } = tx(db, ['mensajes'], 'readwrite');
    for (const id of ids) mensajes.delete(id);
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

// ------------------------------------------------------------------
// Marcas de sincronización
// ------------------------------------------------------------------
export function leerMarca(channelId) {
  return seguro(async (db) => {
    const { marcas } = tx(db, ['marcas'], 'readonly');
    return (await esperar(marcas.get(channelId)))?.hasta || null;
  }, null);
}

export function guardarMarca(channelId, hasta) {
  return seguro(async (db) => {
    const { t, marcas } = tx(db, ['marcas'], 'readwrite');
    marcas.put({ channel_id: channelId, hasta });
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

// ------------------------------------------------------------------
// Lápidas ya aplicadas
// ------------------------------------------------------------------
export function guardarLapidas(lista) {
  if (!lista?.length) return Promise.resolve();
  return seguro(async (db) => {
    const { t, lapidas } = tx(db, ['lapidas'], 'readwrite');
    for (const l of lista) lapidas.put(l);
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

// ------------------------------------------------------------------
// Borrado
// ------------------------------------------------------------------
// "Sacarlo de mi vista": borra la copia de esta PC y la marca, así que al volver a abrir el
// canal se vuelve a bajar. Es reversible a propósito, y no toca nada del servidor.
export function vaciarCanal(channelId) {
  return seguro(async (db) => {
    const { t, mensajes, marcas } = tx(db, ['mensajes', 'marcas'], 'readwrite');
    const rango = IDBKeyRange.bound([channelId, ''], [channelId, '￿']);
    const idx = mensajes.index('por_canal');
    const todos = await esperar(idx.getAll(rango));
    for (const m of todos) mensajes.delete(m.id);
    marcas.delete(channelId);
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

export function vaciarTodo() {
  return seguro(async (db) => {
    const { t, mensajes, marcas, lapidas } = tx(db, ['mensajes', 'marcas', 'lapidas'], 'readwrite');
    mensajes.clear(); marcas.clear(); lapidas.clear();
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  });
}

export function contarMensajes() {
  return seguro(async (db) => {
    const { mensajes } = tx(db, ['mensajes'], 'readonly');
    return await esperar(mensajes.count());
  }, 0);
}
