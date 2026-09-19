// Emite un aviso en tiempo real a todas las instancias abiertas de Llamadita
// a través del canal de broadcast de Supabase.
// Uso: node scripts/anunciar-actualizacion.mjs
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

let manifest = null;
const manifestPath = join(root, 'desktop', 'update-manifest.json');
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (_) {}
}

const SUPABASE_URL = 'https://mwzkrahindnheuheoycv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SiB6rCFCoaa6O4_g0_Sc2Q_gPhbcdXL';

console.log(`[Actualizaciones] Anunciando versión v${version} en tiempo real a clientes conectados…`);

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const channel = supabase.channel('llamadita-actualizaciones', {
  config: { broadcast: { self: true } }
});

channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    try {
      const resp = await channel.send({
        type: 'broadcast',
        event: 'nueva-version',
        payload: {
          version,
          manifest,
          emittedAt: new Date().toISOString()
        }
      });
      console.log(`[Actualizaciones] ✓ Broadcast emitido con éxito para v${version}:`, resp);
    } catch (err) {
      console.warn('[Actualizaciones] Error al emitir broadcast:', err);
    } finally {
      setTimeout(() => {
        supabase.removeChannel(channel);
        process.exit(0);
      }, 1200);
    }
  }
});

// Fallback por si la conexión demora
setTimeout(() => {
  console.log('[Actualizaciones] Timeout del broadcast alcanzado.');
  process.exit(0);
}, 8000);
