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
const archivoVbs = () => `${rutaApp()}/abrir-enlace.vbs`;
const archivoCmd = () => `${rutaApp()}/abrir-enlace.cmd`;

// VBScript silencioso: se ejecuta con wscript.exe sin ventana negra ni parpadeos
const SCRIPT_VBS = [
  'On Error Resume Next',
  'Set objArgs = WScript.Arguments',
  'If objArgs.Count > 0 Then',
  '  url = objArgs(0)',
  '  Set fso = CreateObject("Scripting.FileSystemObject")',
  '  Set wshShell = CreateObject("WScript.Shell")',
  '  tempDir = fso.GetSpecialFolder(2)',
  '  Set file1 = fso.CreateTextFile(tempDir & "\\llamadita_enlace.txt", True)',
  '  file1.WriteLine url',
  '  file1.Close',
  '  appDir = fso.GetParentFolderName(WScript.ScriptFullName)',
  '  tmpDir = appDir & "\\.tmp"',
  '  If Not fso.FolderExists(tmpDir) Then fso.CreateFolder(tmpDir)',
  '  Set file2 = fso.CreateTextFile(tmpDir & "\\enlace.txt", True)',
  '  file2.WriteLine url',
  '  file2.Close',
  '  Set wmi = GetObject("winmgmts:")',
  '  Set procs = wmi.ExecQuery("Select * from Win32_Process where Name = \'Llamadita-win_x64.exe\' or Name = \'Llamadita.exe\'")',
  '  If procs.Count = 0 Then',
  '    exeWin = appDir & "\\Llamadita-win_x64.exe"',
  '    exeNorm = appDir & "\\Llamadita.exe"',
  '    If fso.FileExists(exeWin) Then',
  '      wshShell.Run """" & exeWin & """", 1, False',
  '    ElseIf fso.FileExists(exeNorm) Then',
  '      wshShell.Run """" & exeNorm & """", 1, False',
  '    End If',
  '  End If',
  'End If'
].join('\r\n') + '\r\n';

const SCRIPT_CMD = [
  '@echo off',
  'setlocal enabledelayedexpansion',
  'set "URL=%~1"',
  'if not exist "%~dp0.tmp" mkdir "%~dp0.tmp"',
  '> "%~dp0.tmp\\enlace.txt" echo !URL!',
  'if defined TEMP (> "%TEMP%\\llamadita_enlace.txt" echo !URL!)',
  'endlocal'
].join('\r\n') + '\r\n';

async function instalarScriptYEsquema(nl) {
  try {
    await nl.filesystem.writeFile(archivoVbs(), SCRIPT_VBS);
    await nl.filesystem.writeFile(archivoCmd(), SCRIPT_CMD);
  } catch (_) {}

  // Registrar el esquema llamadita:// usando PowerShell para evitar sintaxis rota en reg.exe
  const vbsWin = aWindows(archivoVbs());
  const psReg = `powershell -NoProfile -NonInteractive -Command "New-Item -Path 'HKCU:\\Software\\Classes\\${ESQUEMA}\\shell\\open\\command' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\${ESQUEMA}' -Name '(Default)' -Value 'URL:Llamadita'; Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\${ESQUEMA}' -Name 'URL Protocol' -Value ''; Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\${ESQUEMA}\\shell\\open\\command' -Name '(Default)' -Value 'wscript.exe //B //Nologo \\\"${vbsWin.replace(/\\/g, '\\\\')}\\\" \\\"%1\\\"'"`;
  try {
    await nl.os.execCommand(psReg);
  } catch (_) {}
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

  // Restaurar y enfocar la ventana preservando el estado maximizado si correspondía
  const enfocarVentana = async () => {
    if (!nl) return;
    try {
      const wasMaximized = (await nl.window.isMaximized()) || (localStorage.getItem('llamadita_was_maximized') === '1');
      const isMin = await nl.window.isMinimized();
      if (isMin) {
        await nl.window.unminimize();
      }
      if (wasMaximized) {
        await nl.window.maximize();
      }
      await nl.window.show();
      await nl.window.focus();
      try {
        await nl.window.setAlwaysOnTop(true);
        await nl.window.setAlwaysOnTop(false);
      } catch (_) {}
    } catch (_) {}
  };

  // Enlace a un chat o canal
  if (enlace.toLowerCase().startsWith(`${ESQUEMA}://chat/`)) {
    const channelId = enlace.substring(`${ESQUEMA}://chat/`.length).split(/[?#]/)[0].trim();
    await enfocarVentana();
    if (channelId && onOpenChat) {
      onOpenChat(channelId);
    }
    return;
  }

  // Foco general
  if (enlace.toLowerCase().startsWith(`${ESQUEMA}://focus`)) {
    await enfocarVentana();
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

  // Rastrear si el usuario usa la app maximizada para no achicársela al enfocar desde notificaciones
  const checkMax = async () => {
    try {
      if (await nl.window.isMaximized()) {
        localStorage.setItem('llamadita_was_maximized', '1');
      } else if (!(await nl.window.isMinimized())) {
        localStorage.setItem('llamadita_was_maximized', '0');
      }
    } catch (_) {}
  };
  checkMax();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(checkMax, 300);
  });

  await revisarEnlace(nl, toast, onOpenChat);
  setInterval(() => revisarEnlace(nl, toast, onOpenChat), 500);
  revisarPortapapeles(nl, toast);
  setInterval(() => revisarPortapapeles(nl, toast), 1500);
}
