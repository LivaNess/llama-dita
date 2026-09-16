// Imágenes y archivos del chat: achicar, subir y mirar.
//
// Los bytes NUNCA pasan por un servidor nuestro. La app le pide permiso al repartidor
// (`workers/adjuntos/`), recibe una dirección firmada que vence, y sube directo al bucket. Para
// mirar, lo mismo al revés: una dirección firmada que dura una hora.
//
// LA DECISIÓN QUE MÁS PLATA AHORRA DE TODO EL CHAT está acá abajo, en `achicar()`. Una captura
// de pantalla pegada pesa entre 2 y 5 MB. La misma imagen llevada a 1600 píxeles de lado mayor
// y guardada en un formato moderno queda entre 200 y 400 KB, y en una ventana de chat no se
// nota la diferencia. Eso convierte "el cupo se llena en 3 meses" en "se llena en dos años", y
// se hace en la máquina del que sube, gratis.
//
// El que quiera mandar el archivo tal cual puede: marca "sin comprimir" y se sube el original.

import { supabase } from '../supabase/client.js';

export const REPARTIDOR = 'https://llamadita-adjuntos.llamadita-adjuntos.workers.dev';

export const TOPE_POR_ARCHIVO = 100 * 1024 * 1024; // 100 MB, la decisión de Martín
const LADO_MAYOR = 1600;
const CALIDAD = 0.82;

// Por debajo de esto no vale la pena tocar nada: el reencodado puede hasta agrandarla.
const NO_VALE_LA_PENA = 180 * 1024;

export const esImagen = (mime) => typeof mime === 'string' && mime.startsWith('image/');

export function pesoLegible(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ------------------------------------------------------------------
// Achicar antes de subir
// ------------------------------------------------------------------
// Los GIF quedan afuera a propósito: dibujarlos en un lienzo se come la animación y te deja el
// primer cuadro. Más vale subir el original que romperlo.
export async function achicar(file) {
  const salida = { blob: file, mime: file.type, ancho: null, alto: null, original: true };
  if (!esImagen(file.type) || file.type === 'image/gif') return salida;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    return salida; // si el motor no la puede leer, va como vino
  }

  // Las medidas se copian antes de soltar el bitmap: despues de cerrarlo quedan en cero.
  const anchoOriginal = bitmap.width;
  const altoOriginal = bitmap.height;

  const escala = Math.min(1, LADO_MAYOR / Math.max(anchoOriginal, altoOriginal));
  if (escala === 1 && file.size <= NO_VALE_LA_PENA) {
    bitmap.close?.();
    return { ...salida, ancho: anchoOriginal, alto: altoOriginal };
  }

  const ancho = Math.max(1, Math.round(anchoOriginal * escala));
  const alto = Math.max(1, Math.round(altoOriginal * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  const chica = await new Promise((res) => lienzo.toBlob(res, 'image/webp', CALIDAD));
  lienzo.width = lienzo.height = 0; // soltar la memoria ya, sin esperar al recolector

  // Si el resultado pesa más que el original (pasa con capturas de pantalla muy planas,
  // que el PNG comprime mejor), nos quedamos con el original.
  if (!chica || chica.size >= file.size) return { ...salida, ancho: anchoOriginal, alto: altoOriginal };

  return { blob: chica, mime: 'image/webp', ancho, alto, original: false };
}

// ------------------------------------------------------------------
// Subir
// ------------------------------------------------------------------
async function miToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Necesitás iniciar sesión.');
  return token;
}

async function alRepartidor(ruta, opciones = {}) {
  const token = await miToken();
  let r;
  try {
    r = await fetch(REPARTIDOR + ruta, {
      ...opciones,
      headers: { ...(opciones.headers || {}), authorization: `Bearer ${token}` }
    });
  } catch (_) {
    throw new Error('No se pudo hablar con el servidor de archivos. ¿Hay internet?');
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || 'El servidor de archivos dijo que no.');
  return cuerpo;
}

// Sube un archivo y devuelve su ficha, lista para mandar con el mensaje.
// `alAvanzar` recibe un número de 0 a 1 para poder mostrar la barrita.
export async function subir(file, channelId, { sinComprimir = false, alAvanzar } = {}) {
  const preparado = sinComprimir
    ? { blob: file, mime: file.type || 'application/octet-stream', ancho: null, alto: null, original: true }
    : await achicar(file);

  if (preparado.blob.size > TOPE_POR_ARCHIVO) {
    throw new Error(`"${file.name}" pesa ${pesoLegible(preparado.blob.size)} y el tope es 100 MB.`);
  }

  const permiso = await alRepartidor('/subir', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      nombre: file.name,
      mime: preparado.mime,
      bytes: preparado.blob.size
    })
  });

  await ponerEnElBucket(permiso.url, preparado.blob, preparado.mime, alAvanzar);

  return {
    object_key: permiso.object_key,
    nombre: file.name,
    mime: preparado.mime,
    bytes: preparado.blob.size,
    ancho: preparado.ancho,
    alto: preparado.alto,
    original: preparado.original
  };
}

// Se usa XMLHttpRequest y no fetch porque es lo único que avisa cuánto va subiendo, y con
// archivos de 100 MB una barra que no se mueve parece que se colgó.
function ponerEnElBucket(url, blob, mime, alAvanzar) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('PUT', url, true);
    req.setRequestHeader('content-type', mime);
    req.upload.onprogress = (e) => {
      if (e.lengthComputable && alAvanzar) alAvanzar(e.loaded / e.total);
    };
    req.onload = () => (req.status >= 200 && req.status < 300
      ? resolve()
      : reject(new Error(`No se pudo guardar el archivo (${req.status}).`)));
    req.onerror = () => reject(new Error('Se cortó la subida.'));
    req.ontimeout = () => reject(new Error('La subida tardó demasiado.'));
    req.send(blob);
  });
}

// ------------------------------------------------------------------
// Mirar
// ------------------------------------------------------------------
// El permiso de lectura dura una hora. Se guarda en memoria para no pedir uno nuevo cada vez
// que se redibuja la conversación: sin esto, cada render sería un pedido por imagen.
const permisos = new Map(); // object_key -> { url, vence }

export async function urlParaVer(objectKey) {
  const guardado = permisos.get(objectKey);
  if (guardado && Date.now() < guardado.vence) return guardado.url;

  const { url, vence_en } = await alRepartidor(`/ver?key=${encodeURIComponent(objectKey)}`);
  // Un minuto de colchón, para que no venza justo entre que se pide y se usa.
  permisos.set(objectKey, { url, vence: Date.now() + (vence_en - 60) * 1000 });
  return url;
}

export function olvidarPermisos() {
  permisos.clear();
}

// Bajar un archivo a la carpeta de descargas, con su nombre de verdad.
export async function descargar(objectKey, nombre) {
  const url = await urlParaVer(objectKey);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre || 'archivo';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
