// El enlace del mail abre la app de escritorio.
//
// Cómo funciona:
//  1. La app registra en Windows el esquema llamadita:// apuntando a un script propio
//     (`abrir-enlace.cmd`), NO al ejecutable. Abrir una segunda copia de la app no
//     funciona: usa un puerto fijo y la segunda muere.
//  2. El script deja la dirección en un archivo y, si la app no estaba abierta, la abre.
//  3. La app lee ese archivo (al arrancar y cada segundo y medio), saca los tokens y
//     entra la sesión.
//  4. El mail no apunta directo a llamadita:// sino a la página del sitio /entrar/,
//     porque los navegadores no saltan a una app desde una redirección del servidor.
import { supabase } from '../supabase/client.js';

const ESQUEMA = 'llamadita';
export const REDIRECT_APP = 'https://llamadita.com.ar/entrar/';

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
const aWindows = (p) => p.split('/').join('\\');
const archivoUrl = () => `${rutaApp()}/.tmp/enlace.txt`;
const archivoScript = () => `${rutaApp()}/abrir-enlace.cmd`;

const SCRIPT = [
  '@echo off',
  'setlocal enabledelayedexpansion',
  'set "URL=%~1"',
  'if not exist "%~dp0.tmp" mkdir "%~dp0.tmp"',
  '> "%~dp0.tmp\\enlace.txt" echo !URL!',
  'if defined TEMP (> "%TEMP%\\llamadita_enlace.txt" echo !URL!)',
  'tasklist /FI "IMAGENAME eq Llamadita-win_x64.exe" | find /I "Llamadita-win_x64.exe" >nul',
  'if not errorlevel 1 goto fin',
  'tasklist /FI "IMAGENAME eq Llamadita.exe" | find /I "Llamadita.exe" >nul',
  'if not errorlevel 1 goto fin',
  'if exist "%~dp0Llamadita-win_x64.exe" (',
  '  start "" "%~dp0Llamadita-win_x64.exe"',
  ') else (',
  '  start "" "%~dp0Llamadita.exe"',
  ')',
  ':fin',
  'endlocal'
].join('\r\n') + '\r\n';

async function instalarScriptYEsquema(nl) {
  // Se reescribe solo si falta o quedó viejo.
  try {
    const actual = await nl.filesystem.readFile(archivoScript());
    if (!actual.includes('llamadita_enlace.txt')) throw new Error('viejo');
  } catch (_) {
    try { await nl.filesystem.writeFile(archivoScript(), SCRIPT); } catch (_) { return; }
  }
  const cmd = aWindows(archivoScript());
  const base = `HKCU\\Software\\Classes\\${ESQUEMA}`;
  const ordenes = [
    `reg add "${base}" /ve /d "URL:Llamadita" /f`,
    `reg add "${base}" /v "URL Protocol" /d "" /f`,
    `reg add "${base}\\shell\\open\\command" /ve /d "cmd /c \\"\\"${cmd}\\" \\"%1\\"\\"" /f`
  ];
  for (const o of ordenes) {
    try { await nl.os.execCommand(o); } catch (_) { /* si falla, siempre queda el código */ }
  }
}

// ---------------------------------------------------------------- tokens
function tokensDesde(url) {
  try {
    const u = new URL(url.trim());
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

async function procesarEnlace(enlace, nl, toast, onOpenChat) {
  if (!enlace) return;

  // Enlace a un chat o canal
  if (enlace.toLowerCase().startsWith(`${ESQUEMA}://chat/`)) {
    const channelId = enlace.substring(`${ESQUEMA}://chat/`.length).split(/[?#]/)[0].trim();
    if (nl) {
      try { await nl.window.unminimize(); } catch (_) {}
      try { await nl.window.show(); } catch (_) {}
      try { await nl.window.focus(); } catch (_) {}
    }
    if (channelId && onOpenChat) {
      onOpenChat(channelId);
    }
    return;
  }

  const tokens = tokensDesde(enlace);
  if (tokens?.error) { toast?.('Ese enlace ya no sirve. Pedí un código nuevo.'); return; }
  if (!tokens) return;

  const { error } = await supabase.auth.setSession(tokens);
  toast?.(error ? 'El enlace ya fue usado o venció. Pedí un código nuevo.' : 'Entraste desde el enlace del mail');
}

async function revisarEnlace(nl, toast, onOpenChat) {
  let contenido = null;
  // 1. Intentar archivo local de la app
  try {
    contenido = await nl.filesystem.readFile(archivoUrl());
    await nl.filesystem.remove(archivoUrl());
  } catch (_) {}

  // 2. Si no estaba, intentar archivo compartido en TEMP
  if (!contenido) {
    try {
      const tempDir = (await nl.os.getEnv('TEMP')) || 'C:\\Windows\\Temp';
      const tempFile = `${tempDir}\\llamadita_enlace.txt`;
      contenido = await nl.filesystem.readFile(tempFile);
      await nl.filesystem.remove(tempFile);
    } catch (_) {}
  }

  if (!contenido) return;

  const enlace = contenido.match(new RegExp(`${ESQUEMA}://[^\\s"']+`, 'i'))?.[0];
  if (!enlace) return;
  await procesarEnlace(enlace, nl, toast, onOpenChat);
}

// ------------------------------------------------- portapapeles (camino seguro)
// Chrome no siempre deja que una página abra una app. Por eso la página /entrar/
// también copia el enlace: la app lo detecta, entra y limpia el portapapeles.
// Solo mira textos que empiezan con llamadita://auth, nada más.
const PREFIJO = `${ESQUEMA}://auth`;
let ultimoVisto = '';

async function revisarPortapapeles(nl, toast) {
  let texto = '';
  try { texto = (await nl.clipboard.readText()) || ''; } catch (_) { return; }
  const limpio = texto.trim();
  if (!limpio.startsWith(PREFIJO) || limpio === ultimoVisto) return;
  ultimoVisto = limpio;

  const tokens = tokensDesde(limpio);
  if (!tokens || tokens.error) return;

  const { error } = await supabase.auth.setSession(tokens);
  try { await nl.clipboard.writeText(''); } catch (_) {}
  toast?.(error ? 'El enlace ya fue usado o venció. Pedí un código nuevo.' : 'Entraste desde el enlace del mail');
}

// ---------------------------------------------------------------- arranque
export async function initDeepLink({ toast, onOpenChat } = {}) {
  const nl = await neutralino();
  if (!nl) return;

  try { await nl.filesystem.createDirectory(`${rutaApp()}/.tmp`); } catch (_) { /* ya existe */ }

  // Arranque en frío: la app se abrió por el enlace y el dato ya está esperando.
  const args = (window.NL_ARGS || []).join(' ');
  const enArgs = args.match(new RegExp(`${ESQUEMA}://[^\\s"']+`, 'i'))?.[0];
  if (enArgs) {
    await procesarEnlace(enArgs, nl, toast, onOpenChat);
  }

  await instalarScriptYEsquema(nl);
  await revisarEnlace(nl, toast, onOpenChat);
  setInterval(() => revisarEnlace(nl, toast, onOpenChat), 500);
  revisarPortapapeles(nl, toast);
  setInterval(() => revisarPortapapeles(nl, toast), 1500);
}
