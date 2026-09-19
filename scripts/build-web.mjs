// Arma la web oficial (llamadita.com.ar) en site-dist/.
//  - web/            → páginas, estilos y registro
//  - public/brand/   → logos      · public/favicon.svg
//  - installer/Llamadita-Setup.exe → /descargas/ (el instalador que se ofrece para bajar)
//  - version de package.json → reemplaza {{VERSION}} y escribe /version.json
// Uso: npm run build:web    (publicar: npm run deploy:web)
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site-dist');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'web'), out, { recursive: true });
cpSync(join(root, 'public', 'brand'), join(out, 'brand'), { recursive: true });
if (existsSync(join(root, 'public', 'sounds'))) {
  cpSync(join(root, 'public', 'sounds'), join(out, 'sounds'), { recursive: true });
}
copyFileSync(join(root, 'public', 'favicon.svg'), join(out, 'favicon.svg'));

const installer = join(root, 'installer', 'Llamadita-Setup.exe');
let sizeMb = '?';
if (existsSync(installer)) {
  mkdirSync(join(out, 'descargas'), { recursive: true });
  copyFileSync(installer, join(out, 'descargas', 'Llamadita-Setup.exe'));
  sizeMb = (statSync(installer).size / 1024 / 1024).toFixed(1).replace('.', ',');
} else {
  console.warn('AVISO: no existe installer/Llamadita-Setup.exe; el botón de descarga va a dar 404.');
}

// Actualizaciones de la app instalada: el manifiesto y el paquete viajan con la web.
const manifiesto = join(root, 'desktop', 'update-manifest.json');
const paquete = join(root, 'desktop', 'dist', 'Llamadita', 'resources.neu');
if (existsSync(manifiesto) && existsSync(paquete)) {
  copyFileSync(manifiesto, join(out, 'update-manifest.json'));
  mkdirSync(join(out, 'descargas'), { recursive: true });
  copyFileSync(paquete, join(out, 'descargas', 'resources.neu'));
} else {
  console.warn('AVISO: falta desktop/update-manifest.json o resources.neu; corré antes "npm run build:desktop" o las apps instaladas no verán la actualización.');
}

const indexPath = join(out, 'index.html');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replaceAll('{{VERSION}}', version).replaceAll('{{INSTALLER_SIZE_MB}}', sizeMb));
writeFileSync(join(out, 'version.json'), JSON.stringify({ version, installer: '/descargas/Llamadita-Setup.exe', builtAt: new Date().toISOString() }, null, 2) + '\n');

console.log(`Web lista en site-dist/ · versión ${version} · instalador ${sizeMb} MB`);
