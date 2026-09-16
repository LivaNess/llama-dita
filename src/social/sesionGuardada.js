// La sesión sobrevive a reinstalar y a cambiar de versión.
//
// El problema: la sesión vive en el almacenamiento del navegador interno, y ese almacenamiento
// está atado a dos cosas frágiles.
//   1. El puerto local con el que se sirve la app. Si cambia, es "otro sitio" para el
//      navegador y la sesión se pierde. Por eso el puerto está fijo en 24024 desde la 1.5.1A.
//   2. La carpeta donde el navegador interno guarda sus datos. Al desinstalar se borra, así que
//      reinstalar te dejaba afuera y había que pedir el código de nuevo.
//
// La solución: además del almacenamiento del navegador, guardamos una copia de la sesión en un
// archivo **fuera de la carpeta de la aplicación**. Si al abrir no hay sesión en el navegador
// pero sí en el archivo, se restaura sola.
//
// Sobre el archivo: guarda el mismo dato que ya guardaba el navegador en disco, ni más ni
// menos. Quien tenga acceso a tu usuario de Windows tiene acceso a los dos por igual.
import { supabase } from '../supabase/client.js';

const ARCHIVO = 'sesion.json';

const esEscritorio = () => typeof window.NL_PORT !== 'undefined';

let NL = null;
async function neutralino() {
  if (!esEscritorio()) return null;
  if (!NL) {
    NL = window.Neutralino || (await import('@neutralinojs/lib')).default || window.Neutralino;
    try { await NL.init(); } catch (_) { /* ya estaba iniciado */ }
  }
  return NL;
}

// Carpeta estable: la de datos del usuario en Windows, no la de la instalación.
async function carpeta(nl) {
  let base = '';
  try {
    base = await nl.os.getEnv('LOCALAPPDATA');
  } catch (_) {}
  if (!base) base = window.NL_PATH || '.';
  return `${base}/Llamadita`;
}

async function rutaArchivo(nl) {
  return `${await carpeta(nl)}/${ARCHIVO}`;
}

// Guarda la sesión en el archivo. Se llama cada vez que cambia.
export async function guardarSesion(session) {
  const nl = await neutralino();
  if (!nl) return;
  try {
    if (!session?.refresh_token) {
      try { await nl.filesystem.remove(await rutaArchivo(nl)); } catch (_) {}
      return;
    }
    try { await nl.filesystem.createDirectory(await carpeta(nl)); } catch (_) { /* ya existe */ }
    await nl.filesystem.writeFile(
      await rutaArchivo(nl),
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        guardada: new Date().toISOString()
      })
    );
  } catch (err) {
    console.warn('No pude guardar la sesión en disco:', err);
  }
}

// Si el navegador no tiene sesión pero el archivo sí, la restaura.
// Devuelve la sesión recuperada, o null.
export async function recuperarSesion() {
  const nl = await neutralino();
  if (!nl) return null;
  try {
    const crudo = await nl.filesystem.readFile(await rutaArchivo(nl));
    const guardada = JSON.parse(crudo);
    if (!guardada?.refresh_token) return null;

    const { data, error } = await supabase.auth.setSession({
      access_token: guardada.access_token,
      refresh_token: guardada.refresh_token
    });
    if (error) {
      // El token puede haber vencido o haberse revocado: se limpia y a entrar de nuevo.
      try { await nl.filesystem.remove(await rutaArchivo(nl)); } catch (_) {}
      return null;
    }
    return data.session || null;
  } catch (_) {
    return null; // no hay archivo: es lo normal la primera vez
  }
}
