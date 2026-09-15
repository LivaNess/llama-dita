// Actualizaciones de la app.
// - En escritorio (Neutralino): usa el updater nativo. Baja resources.neu nuevo desde GitHub
//   y reinicia. No hace falta bajar el instalador de vuelta.
// - En navegador: compara versión y ofrece recargar.
// El manifiesto y el resources.neu los publica `npm run build:desktop` en el repo.

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
// Se lee desde la API de GitHub (sin el caché de 5 min de raw.githubusercontent, que llegó a
// ofrecer versiones viejas) con Accept raw: devuelve el archivo tal cual, con CORS y caché de 60 s.
const REPO = 'LivaNess/llama-dita';
const API = `https://api.github.com/repos/${REPO}/contents`;
const MANIFEST_URL = `${API}/desktop/update-manifest.json?ref=main`;
const RESOURCES_URL = `${API}/desktop/dist/Llama-dita/resources.neu?ref=main`;
const RAW_HEADERS = { Accept: 'application/vnd.github.raw' };
const PREF_KEY = 'llamadita.autoUpdate'; // '1' = actualizar sola al abrir
const CHECK_DELAY_MS = 4000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isDesktop = () => typeof window.NL_PORT !== 'undefined';
let NL = null; // módulo @neutralinojs/lib, solo en escritorio

async function neutralino() {
  if (!isDesktop()) return null;
  if (!NL) {
    NL = await import('@neutralinojs/lib');
    try { await NL.init(); } catch (_) { /* ya inicializado */ }
  }
  return NL;
}

function newer(a, b) {
  // Versionado HITO.ÁREA.FOCO+letra (ver VERSIONADO.md): no es semver, no hay orden numérico.
  // Hay actualización cuando la versión publicada es distinta de la instalada.
  return String(a).trim() !== '' && String(a).trim() !== String(b).trim();
}

export function getAutoUpdate() { try { return localStorage.getItem(PREF_KEY) === '1'; } catch (_) { return false; } }
export function setAutoUpdate(on) { try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (_) {} }

// Devuelve { available, version, manifest }
export async function checkForUpdates() {
  const r = await fetch(MANIFEST_URL + '&t=' + Date.now(), { headers: RAW_HEADERS, cache: 'no-store' });
  if (!r.ok) throw new Error('No pude consultar las actualizaciones');
  const manifest = await r.json();
  if (!manifest || !manifest.version) throw new Error('Manifiesto de actualización inválido');
  const version = String(manifest.version).replace(/[^0-9A-Za-z.]/g, '');
  return { available: newer(version, APP_VERSION), version, manifest };
}

export async function installUpdate() {
  const nl = await neutralino();
  if (!nl) { window.location.reload(); return; }
  // Escritorio: bajar resources.neu nuevo, pisar el instalado y reiniciar.
  // (Mismo mecanismo que Neutralino.updater.install, pero con una fuente sin caché.)
  const r = await fetch(RESOURCES_URL + '&t=' + Date.now(), { headers: RAW_HEADERS, cache: 'no-store' });
  if (!r.ok) throw new Error('No pude bajar la actualización');
  const data = await r.arrayBuffer();
  if (data.byteLength < 10000) throw new Error('La descarga vino incompleta');
  await nl.filesystem.writeBinaryFile(window.NL_PATH + '/resources.neu', data);
  await nl.app.restartProcess();
}

// ------------------------------------------------------------------
// UI: el tag de versión del header abre un popover; banner cuando hay versión nueva.
// ------------------------------------------------------------------
export function initUpdater({ toast } = {}) {
  const tag = document.getElementById('btnUpdates') || document.querySelector('.logo-tag');
  if (tag) {
    tag.textContent = `v${APP_VERSION}`;
    tag.title = 'Actualizaciones';
    tag.style.cursor = 'pointer';
    tag.addEventListener('click', togglePopover);
  }
  setTimeout(() => runCheck({ silent: true }), CHECK_DELAY_MS);
}

let pop = null;
let lastResult = null;
let busy = false;

function togglePopover() {
  if (pop) { pop.remove(); pop = null; return; }
  pop = document.createElement('div');
  pop.className = 'upd-pop';
  document.body.appendChild(pop);
  renderPopover();
  setTimeout(() => document.addEventListener('click', onOutside), 0);
}

function onOutside(e) {
  if (pop && !pop.contains(e.target) && !e.target.closest('#btnUpdates, .logo-tag')) { pop.remove(); pop = null; document.removeEventListener('click', onOutside); }
}

function renderPopover() {
  if (!pop) return;
  const status = busy ? 'Buscando…'
    : lastResult?.error ? `<span class="upd-err">${esc(lastResult.error)}</span>`
    : lastResult?.available ? `Hay una versión nueva: <b>v${lastResult.version}</b>`
    : lastResult ? `Estás al día (v${APP_VERSION}).`
    : '';
  pop.innerHTML = `
    <div class="upd-row"><strong>Llama-dita v${APP_VERSION}</strong><span class="upd-mode">${isDesktop() ? 'escritorio' : 'navegador'}</span></div>
    <div class="upd-status">${status}</div>
    <div class="upd-row">
      ${lastResult?.available
        ? `<button class="btn-invite" id="updInstall" ${busy ? 'disabled' : ''}>${isDesktop() ? 'Actualizar y reiniciar' : 'Recargar'}</button>`
        : `<button class="btn-invite" id="updCheck" ${busy ? 'disabled' : ''}>Buscar actualizaciones</button>`}
    </div>
    <label class="upd-pref"><input type="checkbox" id="updAuto" ${getAutoUpdate() ? 'checked' : ''} /> Actualizar sola al abrir la app</label>`;
  pop.querySelector('#updCheck')?.addEventListener('click', () => runCheck({ silent: false }));
  pop.querySelector('#updInstall')?.addEventListener('click', doInstall);
  pop.querySelector('#updAuto')?.addEventListener('change', (e) => setAutoUpdate(e.target.checked));
}

async function runCheck({ silent }) {
  if (busy) return;
  busy = true; renderPopover();
  try {
    lastResult = await checkForUpdates();
    if (lastResult.available) {
      if (silent && getAutoUpdate()) { await doInstall(); return; }
      showBanner(lastResult.version);
    }
  } catch (err) {
    lastResult = { error: err?.message || 'No pude consultar las actualizaciones' };
    if (!silent) console.warn('Actualizaciones:', err);
  } finally {
    busy = false; renderPopover();
  }
}

async function doInstall() {
  busy = true; renderPopover();
  const banner = document.getElementById('updBanner');
  if (banner) banner.querySelector('.upd-banner-text').textContent = isDesktop() ? 'Descargando la actualización… la app se reinicia sola.' : 'Recargando…';
  try {
    await installUpdate();
  } catch (err) {
    busy = false;
    lastResult = { error: 'No se pudo actualizar: ' + (err?.message || err) };
    renderPopover();
    banner?.remove();
  }
}

function showBanner(version) {
  if (document.getElementById('updBanner')) return;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.className = 'upd-banner';
  el.innerHTML = `<span class="upd-banner-text">Hay una versión nueva de Llama-dita: v${version} (tenés la v${APP_VERSION}).</span>
    <button class="btn-invite" id="updBannerGo">${isDesktop() ? 'Actualizar ahora' : 'Recargar'}</button>
    <button class="upd-later" id="updBannerLater">Después</button>`;
  document.body.appendChild(el);
  el.querySelector('#updBannerGo').addEventListener('click', doInstall);
  el.querySelector('#updBannerLater').addEventListener('click', () => el.remove());
}
