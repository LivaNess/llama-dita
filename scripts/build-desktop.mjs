// Empaqueta la app de escritorio a partir del build de Vite (dist/).
//  1. Sincroniza la versión de package.json en neutralino.config.json e installer.iss
//  2. Copia dist/ a desktop/resources/ (conserva icons/ y js/) e inyecta las globals de Neutralino
//  3. Escribe desktop/update-manifest.json (lo que consulta el updater de la app)
//  4. Corre `neu update` (si faltan los binarios) y `neu build` → desktop/dist/Llamadita/resources.neu
// Uso: npm run build:desktop   (después, si hay Inno Setup: crear-instalador.bat)
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const desktop = join(root, 'desktop');
const resources = join(desktop, 'resources');
const dist = join(root, 'dist');

const SITIO = 'https://llamadita.com.ar';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No existe dist/index.html. Corré primero: npm run build');
  process.exit(1);
}

// 1. Versión única (package.json manda)
const cfgPath = join(desktop, 'neutralino.config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
cfg.version = version;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

const issPath = join(root, 'installer.iss');
writeFileSync(issPath, readFileSync(issPath, 'utf8').replace(/^AppVersion=.*$/m, `AppVersion=${version}`));

// 2. dist/ → desktop/resources/ (se conservan icons/, js/ y scripts/)
for (const entry of readdirSync(resources)) {
  if (entry === 'icons' || entry === 'js' || entry === 'scripts') continue;
  rmSync(join(resources, entry), { recursive: true, force: true });
}
cpSync(dist, resources, { recursive: true });

const indexPath = join(resources, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('__neutralino_globals.js')) {
  html = html.replace('<head>', '<head>\n  <script src="/__neutralino_globals.js"></script>');
  writeFileSync(indexPath, html);
}

// 3. Paquete Neutralino
const run = (cmd) => { console.log('> ' + cmd); execSync(cmd, { cwd: desktop, stdio: 'inherit', shell: true }); };
if (!existsSync(join(desktop, 'bin'))) run('npx --yes @neutralinojs/neu update');
run('npx --yes @neutralinojs/neu build');

const neu = join(desktop, 'dist', cfg.cli.binaryName, 'resources.neu');
if (!existsSync(neu)) { console.error('No se generó ' + neu); process.exit(1); }

// 4. El ícono del ejecutable.
// El ícono de la ventana sale de resources/icons/appIcon.png, pero el que se ve en el
// escritorio, en la barra de tareas y en el Explorador va incrustado DENTRO del .exe, y el
// binario de Neutralino viene con el suyo de fábrica. Se lo reemplazamos acá.
if (process.platform === 'win32') {
  const exe = join(desktop, 'dist', cfg.cli.binaryName, `${cfg.cli.binaryName}-win_x64.exe`);
  const ico = join(desktop, 'resources', 'icons', 'app.ico');
  if (existsSync(exe)) {
    const rcedit = join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
    if (existsSync(rcedit)) {
      const iconArg = existsSync(ico) ? `--set-icon "${ico}"` : '';
      execSync(`"${rcedit}" "${exe}" ${iconArg} --set-version-string "FileDescription" "Llamadita" --set-version-string "ProductName" "Llamadita" --set-version-string "CompanyName" "Llamadita" --set-product-version "${version}"`, { stdio: 'inherit' });
      console.log('Metadatos e ícono del ejecutable actualizados a Llamadita.');
    } else {
      console.warn('No está rcedit: el .exe queda con el ícono de fábrica. Corré npm install.');
    }
  }
}

// 5. Manifiesto de actualización, con la huella del paquete recién generado.
// La huella es lo que le permite al updater comprobar que bajó exactamente esto y no otra
// cosa: su única verificación era que el archivo pesara más de 10 KB.
const huella = createHash('sha256').update(readFileSync(neu)).digest('hex');
const manifest = {
  applicationId: cfg.applicationId,
  version,
  // El paquete se sirve desde la web oficial (lo publica scripts/build-web.mjs).
  // ?v= evita que el WebView sirva un resources.neu viejo.
  resourcesURL: `${SITIO}/descargas/resources.neu?v=${encodeURIComponent(version)}`,
  sha256: huella,
  data: { releasedAt: new Date().toISOString() }
};
writeFileSync(join(desktop, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + String.fromCharCode(10));

// 6. El script del enlace del mail viaja con el instalador.
// Si no, en una instalación nueva el registro de Windows apunta a un archivo que todavía no
// existe (lo escribe la app en su primer arranque) y tocar el enlace del mail no hace nada.
// Tiene que decir lo mismo que el SCRIPT de src/social/deeplink.js.
const CR = String.fromCharCode(13) + String.fromCharCode(10);
const scriptEnlace = [
  '@echo off',
  'setlocal enabledelayedexpansion',
  'set "URL=%~1"',
  'if not exist "%~dp0.tmp" mkdir "%~dp0.tmp"',
  '> "%~dp0.tmp' + String.fromCharCode(92) + 'enlace.txt" echo !URL!',
  'if defined TEMP (> "%TEMP%' + String.fromCharCode(92) + 'llamadita_enlace.txt" echo !URL!)',
  'endlocal'
].join(CR) + CR;
writeFileSync(join(desktop, 'dist', cfg.cli.binaryName, 'abrir-enlace.cmd'), scriptEnlace);

const scriptVbs = [
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
].join(CR) + CR;
writeFileSync(join(desktop, 'dist', cfg.cli.binaryName, 'abrir-enlace.vbs'), scriptVbs);

// 7. Script de notificaciones de Windows
const scriptsDist = join(desktop, 'dist', cfg.cli.binaryName, 'scripts');
mkdirSync(scriptsDist, { recursive: true });
const notifScriptSrc = join(resources, 'scripts', 'send-notification.ps1');
if (existsSync(notifScriptSrc)) {
  cpSync(notifScriptSrc, join(scriptsDist, 'send-notification.ps1'));
}

mkdirSync(join(root, 'installer'), { recursive: true });
console.log(`\nListo: v${version}\n- ${neu}\n- desktop/update-manifest.json\nAhora publicá la web (npm run deploy:web): de ahí bajan la actualización las apps instaladas.`);
