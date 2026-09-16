// El enlace del mail abre la app de escritorio.
//
// Cómo funciona:
//  1. La app registra en Windows el esquema llamadita:// apuntando a su propio .exe.
//  2. Al pedir el código, la app le dice a Supabase que vuelva a llamadita://auth.
//  3. Windows abre la app con esa dirección como argumento; de ahí salen los tokens
//     de la sesión y se entra sin escribir nada.
//  4. Si la app ya estaba abierta, la segunda instancia deja los tokens en un archivo
//     y se cierra sola; la que ya estaba los levanta. Así no quedan dos ventanas.
import { supabase } from '../supabase/client.js';

const ESQUEMA = 'llamadita';
export const REDIRECT_APP = `${ESQUEMA}://auth`;

export const esEscritorio = () => typeof window.NL_PORT !== 'undefined';

let NL = null;
async function neutralino() {
  if (!esEscritorio()) return null;
  if (!NL) {
    NL = await import('@neutralinojs/lib');
    try { await NL.init(); } catch (_) { /* ya inicializado */ }
  }
  return NL;
}

const rutaApp = () => (window.NL_PATH || '.');
const archivoTraspaso = () => `${rutaApp()}/.tmp/auth-traspaso.json`;
const archivoInstancia = () => `${rutaApp()}/.tmp/instancia.json`;

// ---------------------------------------------------------------- Windows
async function registrarEsquema(nl) {
  // Se escribe en el usuario actual (HKCU): no pide permisos de administrador.
  const exe = `${rutaApp()}\\Llama-dita.exe`;
  const base = `HKCU\\Software\\Classes\\${ESQUEMA}`;
  const cmds = [
    `reg add "${base}" /ve /d "URL:Llama-dita" /f`,
    `reg add "${base}" /v "URL Protocol" /d "" /f`,
    `reg add "${base}\\shell\\open\\command" /ve /d "\\"${exe}\\" \\"%1\\"" /f`
  ];
  for (const c of cmds) {
    try { await nl.os.execCommand(c); } catch (_) { /* si falla, queda el código como vía */ }
  }
}

// ---------------------------------------------------------------- tokens
function tokensDesde(url) {
  try {
    const u = new URL(url);
    const frag = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    const qs = u.searchParams;
    const access_token = frag.get('access_token') || qs.get('access_token');
    const refresh_token = frag.get('refresh_token') || qs.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
    const error = frag.get('error_description') || qs.get('error_description');
    if (error) return { error };
  } catch (_) { /* no era una dirección válida */ }
  return null;
}

async function aplicar(tokens) {
  const { error } = await supabase.auth.setSession(tokens);
  return !error;
}

async function leerJson(nl, ruta) {
  try { return JSON.parse(await nl.filesystem.readFile(ruta)); } catch (_) { return null; }
}

async function borrar(nl, ruta) {
  try { await nl.filesystem.remove(ruta); } catch (_) {}
}

async function hayOtraAbierta(nl) {
  const inst = await leerJson(nl, archivoInstancia());
  // Se considera viva si dejó señal hace menos de 15 segundos.
  return !!inst && Date.now() - (inst.at || 0) < 15000;
}

// ---------------------------------------------------------------- arranque
export async function initDeepLink({ toast } = {}) {
  const nl = await neutralino();
  if (!nl) return;

  try { await nl.filesystem.createDirectory(`${rutaApp()}/.tmp`); } catch (_) { /* ya existe */ }

  const args = (window.NL_ARGS || []).join(' ');
  const enlace = args.match(new RegExp(`${ESQUEMA}://[^\\s"']+`, 'i'))?.[0];

  if (enlace) {
    const tokens = tokensDesde(enlace);
    if (tokens?.error) {
      toast?.('El enlace venció. Pedí un código nuevo.');
    } else if (tokens) {
      if (await hayOtraAbierta(nl)) {
        // Ya hay una ventana abierta: le dejo los tokens y me cierro.
        try { await nl.filesystem.writeFile(archivoTraspaso(), JSON.stringify(tokens)); } catch (_) {}
        await nl.app.exit();
        return;
      }
      if (await aplicar(tokens)) toast?.('Entraste desde el enlace del mail');
    }
  }

  await registrarEsquema(nl);

  // Señal de "esta ventana está viva" + revisión de traspasos de otra instancia.
  const marcar = () => nl.filesystem.writeFile(archivoInstancia(), JSON.stringify({ at: Date.now() })).catch(() => {});
  marcar();
  setInterval(marcar, 5000);

  setInterval(async () => {
    const tokens = await leerJson(nl, archivoTraspaso());
    if (!tokens) return;
    await borrar(nl, archivoTraspaso());
    if (await aplicar(tokens)) toast?.('Entraste desde el enlace del mail');
  }, 2000);

  window.addEventListener('beforeunload', () => { borrar(nl, archivoInstancia()); });
}
