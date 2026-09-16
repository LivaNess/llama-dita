// El repartidor de permisos para los archivos del chat.
//
// POR QUÉ EXISTE, en criollo: las imágenes y los archivos del chat van a un bucket de objetos
// (Cloudflare R2), porque da 10 GB gratis y la salida nunca se paga. Pero para escribir ahí
// hace falta una clave secreta, y una clave secreta adentro de la app es una clave publicada:
// cualquiera abre el ejecutable, la saca, y te llena el bucket o te lo vacía.
//
// Esto no es lo mismo que la clave de Supabase que viaja en la app. Esa es pública a propósito
// y lo que protege los datos son las políticas de la base. R2 no tiene políticas: la clave es
// la llave del candado entero.
//
// Así que la clave vive acá, como secreto de este Worker, y no sale nunca. La app le pide
// permiso a este servicio y recibe una dirección firmada que sirve **para ese archivo** y
// **vence**. Los bytes van de la app a R2 directo, sin pasar por acá: el plan gratis tiene 10
// milisegundos de procesador y 100 MB de cuerpo por pedido, así que pasarle los archivos por
// arriba no sería solo caro, no entraría.
//
// CÓMO SABE QUIÉN SOS, sin tener ninguna llave de la base: la app manda su sesión de Supabase.
// La firma se comprueba contra la clave **pública** del proyecto (el proyecto usa ES256, que
// es de clave asimétrica). Y para saber si podés subir a un canal o ver un archivo, este
// servicio le pregunta a la base **con tu propia sesión**: si las políticas te devuelven la
// fila, es que podés. Nunca decide él; solo repite lo que la base ya contestó.
import { AwsClient } from 'aws4fetch';

const CIEN_MB = 104857600;

// Lo que se puede subir. Deliberadamente corto: todo lo demás viaja como archivo común.
const IMAGENES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const TIPOS_PERMITIDOS = [
  ...IMAGENES,
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac',
  'application/pdf', 'application/zip', 'application/x-7z-compressed', 'application/vnd.rar',
  'text/plain', 'application/octet-stream'
];

// Cuánto puede tener guardado cada uno. Con 10 GB de cupo total y 50 personas, 200 MB cada uno
// deja margen de sobra y evita que una sola persona se coma el bucket.
const CUPO_POR_PERSONA = 200 * 1024 * 1024;

const MINUTOS_PARA_SUBIR = 5;
const HORAS_PARA_VER = 1;

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const json = (data, status = 200, origen = '*') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origen) }
  });

function cors(origen) {
  return {
    'access-control-allow-origin': origen,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    'vary': 'origin'
  };
}

// La app de escritorio se sirve siempre desde el mismo puerto fijo; la web, del dominio propio.
function origenPermitido(req, env) {
  const origen = req.headers.get('origin') || '';
  const lista = (env.ORIGENES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origen) return '*';
  return lista.includes(origen) ? origen : null;
}

// ------------------------------------------------------------------
// La sesión: comprobar la firma contra la clave pública del proyecto
// ------------------------------------------------------------------
let clavesCache = null;
let clavesVencen = 0;

async function clavesPublicas(env) {
  const ahora = Date.now();
  if (clavesCache && ahora < clavesVencen) return clavesCache;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!r.ok) throw new Error('No pude leer las claves públicas del proyecto');
  const { keys } = await r.json();
  clavesCache = keys;
  clavesVencen = ahora + 10 * 60 * 1000; // diez minutos: rotarlas es raro y esto evita pedirlas por cada archivo
  return keys;
}

const b64url = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function quienSos(req, env) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
    cuerpo = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
  } catch (_) { return null; }

  if (cabecera.alg !== 'ES256') return null; // el proyecto firma así; nada más se acepta
  if (!cuerpo.sub || !cuerpo.exp || cuerpo.exp * 1000 < Date.now()) return null;

  const jwk = (await clavesPublicas(env)).find((k) => k.kid === cabecera.kid);
  if (!jwk) return null;

  const clave = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  const firmado = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, clave, b64url(partes[2]), firmado
  );
  return ok ? { id: cuerpo.sub, token } : null;
}

// ------------------------------------------------------------------
// Preguntarle a la base con la sesión del que pregunta
// ------------------------------------------------------------------
// Acá está la gracia: este servicio no decide nada. Le hace la consulta a la base usando la
// sesión de la persona, y las políticas de la base contestan. Si no podés, te devuelve vacío.
async function consultarComoVos(env, quien, ruta) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${quien.token}`,
      accept: 'application/json'
    }
  });
  if (!r.ok) return [];
  return await r.json();
}

const estaEnElCanal = async (env, quien, canal) =>
  (await consultarComoVos(env, quien, `channel_members?channel_id=eq.${canal}&user_id=eq.${quien.id}&select=user_id`)).length > 0;

// ------------------------------------------------------------------
// Firmar direcciones de R2
// ------------------------------------------------------------------
function cliente(env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });
}

// Mientras la credencial de R2 no este cargada como secreto, el servicio contesta pero no
// puede firmar nada. Mejor decirlo con todas las letras que devolver "algo se rompio".
function faltaLaCredencial(env) {
  return !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY;
}

async function firmar(env, key, metodo, segundos, extra = {}) {
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(segundos));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const firmada = await cliente(env).sign(url, { method: metodo, aws: { signQuery: true } });
  return firmada.url;
}

// ------------------------------------------------------------------
// 1. Pedir permiso para subir
// ------------------------------------------------------------------
async function permisoParaSubir(req, env, origen) {
  if (faltaLaCredencial(env)) {
    return json({ error: 'Los archivos todavía no están habilitados: falta cargar la credencial del almacenamiento.' }, 503, origen);
  }
  const quien = await quienSos(req, env);
  if (!quien) return json({ error: 'Sesión inválida o vencida.' }, 401, origen);

  let pedido;
  try { pedido = await req.json(); } catch (_) { return json({ error: 'Pedido ilegible.' }, 400, origen); }

  const { channel_id, mime, bytes, nombre } = pedido || {};
  if (!channel_id || !mime || !bytes) return json({ error: 'Falta el canal, el tipo o el tamaño.' }, 400, origen);

  if (!TIPOS_PERMITIDOS.includes(mime)) {
    return json({ error: `Ese tipo de archivo no se puede subir (${mime}).` }, 415, origen);
  }
  if (bytes > CIEN_MB) {
    return json({ error: 'El tope por archivo es de 100 MB.' }, 413, origen);
  }
  if (!(await estaEnElCanal(env, quien, channel_id))) {
    return json({ error: 'No estás en ese canal.' }, 403, origen);
  }

  // El cupo por persona, preguntado a la base con la sesión de la persona.
  const usado = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mi_consumo_de_archivos`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${quien.token}`,
      'content-type': 'application/json'
    },
    body: '{}'
  }).then((r) => (r.ok ? r.json() : 0)).catch(() => 0);

  if (Number(usado) + Number(bytes) > CUPO_POR_PERSONA) {
    return json({
      error: `Te quedaste sin espacio: tenés ${(Number(usado) / 1048576).toFixed(0)} MB guardados de ${CUPO_POR_PERSONA / 1048576} MB. Borrá algo viejo.`
    }, 507, origen);
  }

  // La dirección lleva un identificador al azar, así que no se puede adivinar aunque el bucket
  // dejara de ser privado algún día.
  const extension = (nombre || '').includes('.') ? '.' + nombre.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  const key = `c/${channel_id}/${crypto.randomUUID()}${extension}`;

  const url = await firmar(env, key, 'PUT', MINUTOS_PARA_SUBIR * 60);
  return json({ object_key: key, url, vence_en: MINUTOS_PARA_SUBIR * 60 }, 200, origen);
}

// ------------------------------------------------------------------
// 2. Pedir permiso para ver
// ------------------------------------------------------------------
async function permisoParaVer(req, env, origen) {
  if (faltaLaCredencial(env)) {
    return json({ error: 'Los archivos todavía no están habilitados: falta cargar la credencial del almacenamiento.' }, 503, origen);
  }
  const quien = await quienSos(req, env);
  if (!quien) return json({ error: 'Sesión inválida o vencida.' }, 401, origen);

  const key = new URL(req.url).searchParams.get('key');
  if (!key) return json({ error: 'Falta el archivo.' }, 400, origen);

  // Que la base conteste si lo podés ver. Si no sos del canal, las políticas devuelven vacío.
  const fichas = await consultarComoVos(
    env, quien,
    `attachments?object_key=eq.${encodeURIComponent(key)}&select=object_key,mime,nombre`
  );
  if (!fichas.length) return json({ error: 'Ese archivo no existe o no es para vos.' }, 404, origen);

  const url = await firmar(env, key, 'GET', HORAS_PARA_VER * 3600);
  return json({ url, vence_en: HORAS_PARA_VER * 3600, mime: fichas[0].mime, nombre: fichas[0].nombre }, 200, origen);
}

// ------------------------------------------------------------------
// 3. Borrar objetos de verdad
// ------------------------------------------------------------------
// No lo llama la app: lo llama la base, cuando vacía la cola de objetos a borrar. Va con un
// secreto compartido porque del otro lado no hay ninguna sesión de persona.
async function borrarObjetos(req, env, origen) {
  const secreto = req.headers.get('x-purga') || '';
  if (!env.PURGA_SECRETO || secreto !== env.PURGA_SECRETO) {
    return json({ error: 'No.' }, 403, origen);
  }
  let keys;
  try { keys = (await req.json())?.keys; } catch (_) { return json({ error: 'Pedido ilegible.' }, 400, origen); }
  if (!Array.isArray(keys) || !keys.length) return json({ borrados: 0 }, 200, origen);
  if (keys.length > 200) return json({ error: 'De a 200 como mucho.' }, 400, origen);

  let borrados = 0;
  for (const key of keys) {
    try {
      await env.ADJUNTOS.delete(key); // acá sí conviene el atajo interno: no hay que firmar nada
      borrados++;
    } catch (_) {}
  }
  return json({ borrados }, 200, origen);
}

// ------------------------------------------------------------------
export default {
  async fetch(req, env) {
    const origen = origenPermitido(req, env);
    if (origen === null) return new Response('Origen no permitido', { status: 403 });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origen) });

    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'POST' && pathname === '/subir') return await permisoParaSubir(req, env, origen);
      if (req.method === 'GET' && pathname === '/ver') return await permisoParaVer(req, env, origen);
      if (req.method === 'POST' && pathname === '/borrar') return await borrarObjetos(req, env, origen);
      if (pathname === '/salud') return json({ ok: true, credencial: !faltaLaCredencial(env) }, 200, origen);
    } catch (e) {
      // Nunca devolver el detalle del error hacia afuera: puede traer el nombre del bucket o
      // pedazos de la firma.
      console.error(e);
      return json({ error: 'Algo se rompió de este lado.' }, 500, origen);
    }
    return json({ error: 'No hay nada acá.' }, 404, origen);
  }
};
