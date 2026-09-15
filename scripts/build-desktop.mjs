// Empaqueta la app de escritorio a partir del build de Vite (dist/).
//  1. Sincroniza la versión de package.json en neutralino.config.json e installer.iss
//  2. Copia dist/ a desktop/resources/ (conserva icons/ y js/) e inyecta las globals de Neutralino
//  3. Escribe desktop/update-manifest.json (lo que consulta el updater de la app)
//  4. Corre `neu update` (si faltan los binarios) y `neu build` → desktop/dist/Llama-dita/resources.neu
// Uso: npm run build:desktop   (después, si hay Inno Setup: crear-instalador.bat)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const desktop = join(root, 'desktop');
const resources = join(desktop, 'resources');
const dist = join(root, 'dist');

const REPO_RAW = 'https://raw.githubusercontent.com/LivaNess/llama-dita/main';

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

// 2. dist/ → desktop/resources/ (se conservan icons/ y js/)
for (const entry of readdirSync(resources)) {
  if (entry === 'icons' || entry === 'js') continue;
  rmSync(join(resources, entry), { recursive: true, force: true });
}
cpSync(dist, resources, { recursive: true });

const indexPath = join(resources, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('__neutralino_globals.js')) {
  html = html.replace('<head>', '<head>\n  <script src="/__neutralino_globals.js"></script>');
  writeFileSync(indexPath, html);
}

// 3. Manifiesto de actualización
const manifest = {
  applicationId: cfg.applicationId,
  version,
  // ?v= evita que el WebView o el CDN sirvan un resources.neu viejo
  resourcesURL: `${REPO_RAW}/desktop/dist/${cfg.cli.binaryName}/resources.neu?v=${encodeURIComponent(version)}`,
  data: { releasedAt: new Date().toISOString() }
};
writeFileSync(join(desktop, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 4. Paquete Neutralino
const run = (cmd) => { console.log('> ' + cmd); execSync(cmd, { cwd: desktop, stdio: 'inherit', shell: true }); };
if (!existsSync(join(desktop, 'bin'))) run('npx --yes @neutralinojs/neu update');
run('npx --yes @neutralinojs/neu build');

const neu = join(desktop, 'dist', cfg.cli.binaryName, 'resources.neu');
if (!existsSync(neu)) { console.error('No se generó ' + neu); process.exit(1); }
mkdirSync(join(root, 'installer'), { recursive: true });
console.log(`\nListo: v${version}\n- ${neu}\n- desktop/update-manifest.json\nCommiteá y pusheá los dos para que las apps instaladas vean la actualización.`);
