// Dirección oficial: llamadita.com.ar. Quien entre por la dirección vieja de
// Cloudflare Pages va al dominio, pero solo cuando el dominio ya responde.
const OFICIAL = 'https://llamadita.com.ar';

if (location.hostname.endsWith('.pages.dev')) {
  fetch(OFICIAL + '/version.json', { cache: 'no-store' })
    .then((r) => { if (r.ok) location.replace(OFICIAL + location.pathname + location.search + location.hash); })
    .catch(() => { /* el dominio no responde: se sigue usando esta dirección */ });
}
