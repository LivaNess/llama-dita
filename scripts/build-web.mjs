// Arma la web oficial (llamadita.com.ar) en site-dist/.
//  - web/            → páginas, estilos y registro
//  - public/brand/   → logos      · public/favicon.svg
//  - installer/Llama-dita-Setup.exe → /descargas/ (el instalador que se ofrece para bajar)
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
copyFileSync(join(root, 'public', 'favicon.svg'), join(out, 'favicon.svg'));

const installer = join(root, 'installer', 'Llama-dita-Setup.exe');
let sizeMb = '?';
if (existsSync(installer)) {
  mkdirSync(join(out, 'descargas'), { recursive: true });
  copyFileSync(installer, join(out, 'descargas', 'Llama-dita-Setup.exe'));
  sizeMb = (statSync(installer).size / 1024 / 1024).toFixed(1).replace('.', ',');
} else {
  console.warn('AVISO: no existe installer/Llama-dita-Setup.exe; el botón de descarga va a dar 404.');
}

const indexPath = join(out, 'index.html');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replaceAll('{{VERSION}}', version).replaceAll('{{INSTALLER_SIZE_MB}}', sizeMb));
writeFileSync(join(out, 'version.json'), JSON.stringify({ version, installer: '/descargas/Llama-dita-Setup.exe', builtAt: new Date().toISOString() }, null, 2) + '\n');

console.log(`Web lista en site-dist/ · versión ${version} · instalador ${sizeMb} MB`);
