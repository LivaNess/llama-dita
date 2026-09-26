// Publica una versión DEV: la que solo ven los admins cuando tocan "Modo dev" en la app.
//
// La versión dev y la live conviven sin pisarse:
//  - la live sale de `npm run build:desktop` + `npm run deploy:web` y vive en llamadita.com.ar;
//  - la dev sale de ACÁ y vive en otro sitio (llamadita-dev.pages.dev). Publicar una nunca
//    toca a la otra.
//
// Este script no modifica ningún archivo del repo: arma todo en .dev-build/ y dev-dist/
// (los dos ignorados por git).
//
// Uso: npm run publicar:dev            (arma y publica)
//      npm run publicar:dev -- --solo-armar   (arma sin publicar, para revisar)
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const soloArmar = process.argv.includes('--solo-armar');

const PROYECTO_DEV = 'llamadita-dev';
const SITIO_DEV = `https://${PROYECTO_DEV}.pages.dev`;

// Número de la versión dev: la live de base + cuándo se armó. Así cada publicación dev es
// distinta de la anterior y el actualizador del canal dev la detecta.
const d = new Date();
const dos = (n) => String(n).padStart(2, '0');
const sello = `${String(d.getFullYear()).slice(2)}${dos(d.getMonth() + 1)}${dos(d.getDate())}${dos(d.getHours())}${dos(d.getMinutes())}`;
const version = `${pkg.version}.dev${sello}`;

const trabajo = join(root, '.dev-build');
const app = join(trabajo, 'app');
const salida = join(root, 'dev-dist');
const run = (cmd, cwd = root, env = process.env) => {
  console.log('> ' + cmd);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true, env });
};

console.log(`\nArmando la versión DEV ${version}\n`);
rmSync(trabajo, { recursive: true, force: true });
rmSync(salida, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
mkdirSync(salida, { recursive: true });

// 1. La web de la app, compilada para el canal dev.
run(`npx vite build --outDir "${join(trabajo, 'web')}" --emptyOutDir`, root, {
  ...process.env,
  LLAMADITA_CANAL: 'dev',
  LLAMADITA_VERSION: version,
});

// 2. Una copia del escritorio para empaquetar sin tocar desktop/ (que es el de la live).
const cfg = JSON.parse(readFileSync(join(root, 'desktop', 'neutralino.config.json'), 'utf8'));
cfg.version = version;
writeFileSync(join(app, 'neutralino.config.json'), JSON.stringify(cfg, null, 2) + '\n');
cpSync(join(root, 'desktop', 'bin'), join(app, 'bin'), { recursive: true });
const recursos = join(app, 'resources');
for (const carpeta of ['icons', 'js', 'scripts']) {
  const origen = join(root, 'desktop', 'resources', carpeta);
  if (existsSync(origen)) cpSync(origen, join(recursos, carpeta), { recursive: true });
}
cpSync(join(trabajo, 'web'), recursos, { recursive: true });
const indexPath = join(recursos, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('__neutralino_globals.js')) {
  html = html.replace('<head>', '<head>\n  <script src="/__neutralino_globals.js"></script>');
  writeFileSync(indexPath, html);
}

// 3. Paquete.
run('npx --yes @neutralinojs/neu build', app);
const neu = join(app, 'dist', cfg.cli.binaryName, 'resources.neu');
if (!existsSync(neu)) {
  console.error('No se generó ' + neu);
  process.exit(1);
}

// 4. Lo que se publica: paquete + manifiesto con su huella.
cpSync(neu, join(salida, 'resources.neu'));
const huella = createHash('sha256').update(readFileSync(neu)).digest('hex');
writeFileSync(join(salida, 'update-manifest.json'), JSON.stringify({
  applicationId: cfg.applicationId,
  canal: 'dev',
  version,
  resourcesURL: `${SITIO_DEV}/resources.neu?v=${encodeURIComponent(version)}`,
  sha256: huella,
  data: { releasedAt: d.toISOString() },
}, null, 2) + '\n');
writeFileSync(join(salida, '_headers'), [
  '/update-manifest.json',
  '  Cache-Control: no-store',
  '  Access-Control-Allow-Origin: *',
  '/resources.neu',
  '  Cache-Control: no-store',
  '  Access-Control-Allow-Origin: *',
  '',
].join('\n'));
writeFileSync(join(salida, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Llamadita dev</title><p>Canal de prueba de Llamadita.</p>\n');

console.log(`\nVersión dev armada: ${version}`);
console.log(`Huella: ${huella}`);

if (soloArmar) {
  console.log('\n--solo-armar: no se publicó nada. Está en dev-dist/.');
  process.exit(0);
}

// 5. Publicar en el sitio dev (se crea la primera vez).
try {
  execSync(`npx wrangler pages project list`, { cwd: root, stdio: 'pipe' }).toString().includes(PROYECTO_DEV)
    || run(`npx wrangler pages project create ${PROYECTO_DEV} --production-branch main`);
} catch (e) {
  console.error('No pude consultar Cloudflare. ¿Está hecho el login de wrangler?');
  process.exit(1);
}
run(`npx wrangler pages deploy dev-dist --project-name ${PROYECTO_DEV} --branch main --commit-dirty=true`);
console.log(`\nListo. Los admins la reciben al tocar "Modo dev". Manifiesto: ${SITIO_DEV}/update-manifest.json`);
