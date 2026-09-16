// Verifica que se haya cumplido el protocolo del proyecto (ver AGENTS.md).
// Corre solo en cada push a main y también a mano: npm run verificar
//
// Controla tres cosas:
//   1. La versión de package.json está registrada en CAMBIOS.md.
//   2. Cada carpeta de src/ y cada pieza de la web está nombrada en ESQUELETO.md.
//   3. SYNC.md quedó sin bloqueos abiertos (nadie se olvidó de liberar el suyo).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '');
const fallas = [];

// 1. La versión está documentada
const version = JSON.parse(leer('package.json')).version;
const cambios = leer('CAMBIOS.md');
if (!cambios) {
  fallas.push('Falta CAMBIOS.md.');
} else if (!cambios.includes(`### ${version} `) && !cambios.includes(`### ${version}\n`)) {
  fallas.push(
    `La versión ${version} no está en CAMBIOS.md.\n` +
    '   Agregá su ficha: qué cambió, por qué, dónde y cómo se verifica.'
  );
}

// 2. Las áreas están mapeadas
const esqueleto = leer('ESQUELETO.md');
if (!esqueleto) {
  fallas.push('Falta ESQUELETO.md.');
} else {
  const areas = readdirSync(join(root, 'src'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `src/${d.name}/`);
  for (const a of areas) {
    if (!esqueleto.includes(a.replace(/\/$/, ''))) {
      fallas.push(
        `El área ${a} no figura en ESQUELETO.md.\n` +
        '   Agregá su ficha: qué hace, de qué depende y quién depende de ella.'
      );
    }
  }
  for (const suelto of readdirSync(join(root, 'src'), { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.js'))) {
    if (!esqueleto.includes(`src/${suelto.name}`)) {
      fallas.push(`El archivo src/${suelto.name} no figura en ESQUELETO.md.`);
    }
  }
}

// 3. Ninguna tabla sin sus políticas de seguridad activadas.
// Motivo: la migración 001 termina dando permiso de lectura y escritura sobre TODAS las tablas
// del esquema a cualquiera que tenga cuenta. Lo único que protege los datos es que cada tabla
// tenga RLS activado. Una tabla nueva sin esa línea queda abierta de par en par.
const dirMigraciones = join(root, 'supabase', 'migrations');
if (existsSync(dirMigraciones)) {
  const sql = readdirSync(dirMigraciones)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dirMigraciones, f), 'utf8'))
    .join(String.fromCharCode(10))
    .toLowerCase();

  const tablas = [...sql.matchAll(/create table (?:if not exists )?public[.]([a-z0-9_]+)/g)].map((m) => m[1]);
  for (const t of new Set(tablas)) {
    if (!sql.includes('alter table public.' + t + ' enable row level security')) {
      fallas.push(
        'La tabla public.' + t + ' no tiene activadas las políticas de seguridad (RLS).' +
        String.fromCharCode(10) +
        '   Sin eso queda abierta a cualquiera con cuenta, por el permiso general de la migración 001.' +
        String.fromCharCode(10) +
        '   Agregá: alter table public.' + t + ' enable row level security;'
      );
    }
  }
}

// 4. No quedaron bloqueos abiertos
const sync = leer('SYNC.md');
const tablaLocks = sync.split('## 🗺️')[0] || sync;
if (tablaLocks && !/\*Ninguno\*/.test(tablaLocks)) {
  fallas.push(
    'SYNC.md tiene un bloqueo sin liberar.\n' +
    '   Al terminar, la fila vuelve a: | *Ninguno* | - | - | *Libre para tomar tareas* |'
  );
}

if (fallas.length) {
  console.error('\nEl protocolo del proyecto no se cumplió (ver AGENTS.md):\n');
  fallas.forEach((f, i) => console.error(` ${i + 1}. ${f}`));
  console.error('');
  process.exit(1);
}

console.log(`Protocolo cumplido. Versión ${version} documentada y áreas mapeadas.`);
