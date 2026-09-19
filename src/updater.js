// Actualizaciones de la app.
// - En escritorio (Neutralino): baja el resources.neu nuevo, lo instala y reinicia.
// - En navegador: compara versión y ofrece recargar.
//
// Fuente principal: la web oficial (llamadita.com.ar), que publica el manifiesto y el
// paquete junto con el instalador (lo arma scripts/build-web.mjs). Si el dominio no
// responde, cae a la API de GitHub, que sirve el mismo contenido del repo.
// raw.githubusercontent quedó descartado: tiene cachés por servidor y llegó a ofrecer
// una versión vieja.

import { supabase } from './supabase/client.js';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

const SITIO = 'https://llamadita.com.ar';
const REPO = 'LivaNess/Llamadita';
const API = `https://api.github.com/repos/${REPO}/contents`;

const FUENTES = [
  {
    nombre: 'sitio',
    manifest: `${SITIO}/update-manifest.json`,
    paquete: `${SITIO}/descargas/resources.neu`,
    headers: {}
  },
  {
    nombre: 'github',
    manifest: `${API}/desktop/update-manifest.json?ref=main`,
    paquete: `${API}/desktop/dist/Llamadita/resources.neu?ref=main`,
    headers: { Accept: 'application/vnd.github.raw' }
  }
];

const PREF_KEY = 'llamadita.autoUpdate'; // '1' = actualizar sola al abrir
const CHECK_DELAY_MS = 4000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sep = (url) => (url.includes('?') ? '&' : '?');

const isDesktop = () => typeof window.NL_PORT !== 'undefined';
let NL = null; // módulo @neutralinojs/lib, solo en escritorio
let fuenteUsada = FUENTES[0];

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

// Devuelve { available, version, manifest, fuente }
export async function checkForUpdates() {
  let ultimoError = null;
  for (const fuente of FUENTES) {
    try {
      const r = await fetch(fuente.manifest + sep(fuente.manifest) + 't=' + Date.now(), { headers: fuente.headers, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const manifest = await r.json();
      if (!manifest || !manifest.version) throw new Error('manifiesto inválido');
      fuenteUsada = fuente;
      const version = String(manifest.version).replace(/[^0-9A-Za-z.]/g, '');
      return { available: newer(version, APP_VERSION), version, manifest, fuente: fuente.nombre };
    } catch (err) {
      ultimoError = err;
    }
  }
  throw new Error('No pude consultar las actualizaciones' + (ultimoError ? ` (${ultimoError.message})` : ''));
}

export async function installUpdate() {
  const nl = await neutralino();
  if (!nl) { window.location.reload(); return; }
  // Escritorio: bajar el resources.neu nuevo, pisar el instalado y reiniciar.
  const url = fuenteUsada.paquete;
  const r = await fetch(url + sep(url) + 't=' + Date.now(), { headers: fuenteUsada.headers, cache: 'no-store' });
  if (!r.ok) throw new Error('No pude bajar la actualización (HTTP ' + r.status + ')');
  const data = await r.arrayBuffer();
  if (data.byteLength < 10000) throw new Error('La descarga vino incompleta');

  // Comprobar que bajó exactamente el paquete que anunciaba el manifiesto. Sin esto, la app
  // se instala encima cualquier cosa que pese más de 10 KB.
  const esperada = lastResult?.manifest?.sha256;
  if (esperada) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const bajada = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (bajada !== esperada) {
      throw new Error('La actualización no coincide con la publicada. No se instaló nada.');
    }
  }
  await nl.filesystem.writeBinaryFile(window.NL_PATH + '/resources.neu', data);
  await nl.app.restartProcess();
}

// ------------------------------------------------------------------
// ------------------------------------------------------------------
// UI: botón de flecha verde cuando hay versión nueva, aviso en vivo
// por Supabase Realtime (sin búsqueda pesada) y comprobación al abrir.
// ------------------------------------------------------------------
let toastHelper = null;
let realtimeChannel = null;

function updateArrowUI() {
  const btn = document.getElementById('btnUpdateAvailable');
  if (!btn) return;
  if (lastResult?.available) {
    btn.hidden = false;
    btn.title = `Actualización v${lastResult.version} disponible · Clic para actualizar`;
  } else {
    btn.hidden = true;
  }
  if (busy) {
    btn.classList.add('is-updating');
    btn.title = 'Actualizando…';
  } else {
    btn.classList.remove('is-updating');
  }
}

export function initUpdater({ toast } = {}) {
  toastHelper = toast || null;

  const tag = document.getElementById('btnUpdates') || document.querySelector('.logo-tag');
  if (tag) {
    tag.textContent = `v${APP_VERSION}`;
    tag.title = `Llamadita v${APP_VERSION}`;
    tag.style.cursor = 'pointer';
    tag.addEventListener('click', togglePopover);
  }

  const btnArrow = document.getElementById('btnUpdateAvailable');
  if (btnArrow && !btnArrow._bound) {
    btnArrow._bound = true;
    btnArrow.addEventListener('click', () => {
      if (busy) return;
      doInstall();
    });
  }

  // 1. Chequeo inicial al entrar a la app (tras 4 segundos de cortesía)
  setTimeout(() => runCheck({ silent: true }), CHECK_DELAY_MS);

  // 2. Escucha reactiva en vivo vía Supabase Realtime (cero consumo de red en reposo):
  // Cuando se publica una nueva versión, el script de deploy emite un broadcast y
  // todos los programas abiertos encienden la flecha verde inmediatamente.
  iniciarEscuchaRealtime();

  // 3. Respaldo pasivo: si la ventana vuelve a recibir foco y pasaron más de 30 minutos
  let ultimoFoco = Date.now();
  window.addEventListener('focus', () => {
    if (Date.now() - ultimoFoco > 30 * 60 * 1000) {
      ultimoFoco = Date.now();
      runCheck({ silent: true });
    }
  });
}

function iniciarEscuchaRealtime() {
  if (realtimeChannel) return;
  try {
    realtimeChannel = supabase.channel('llamadita-actualizaciones', {
      config: { broadcast: { self: false } }
    });
    realtimeChannel.on('broadcast', { event: 'nueva-version' }, (payload) => {
      const v = payload?.payload?.version || payload?.version;
      if (v && newer(v, APP_VERSION)) {
        // Nueva versión detectada en vivo: refrescamos el estado y mostramos la flecha verde
        runCheck({ silent: true }).then(() => {
          if (!lastResult?.available && newer(v, APP_VERSION)) {
            lastResult = { available: true, version: v, fuente: 'en vivo' };
            updateArrowUI();
          }
          toastHelper?.(`Nueva versión v${v} lista para instalar`);
        });
      }
    });
    realtimeChannel.subscribe();
  } catch (err) {
    console.warn('No se pudo suscribir al canal en vivo de actualizaciones:', err);
  }
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
  if (pop && !pop.contains(e.target) && !e.target.closest('#btnUpdates, .logo-tag, #btnUpdateAvailable')) {
    pop.remove();
    pop = null;
    document.removeEventListener('click', onOutside);
  }
}

function renderPopover() {
  if (!pop) return;
  const status = busy ? 'Buscando…'
    : lastResult?.error ? `<span class="upd-err">${esc(lastResult.error)}</span>`
    : lastResult?.available ? `Hay una versión nueva: <b>v${esc(lastResult.version)}</b>`
    : lastResult ? `Estás al día (v${APP_VERSION}).`
    : '';
  pop.innerHTML = `
    <div class="upd-row"><strong>Llamadita v${APP_VERSION}</strong><span class="upd-mode">${isDesktop() ? 'escritorio' : 'navegador'}</span></div>
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
  busy = true;
  updateArrowUI();
  renderPopover();
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
    busy = false;
    updateArrowUI();
    renderPopover();
  }
}

async function doInstall() {
  busy = true;
  updateArrowUI();
  renderPopover();
  const banner = document.getElementById('updBanner');
  if (banner) banner.querySelector('.upd-banner-text').textContent = isDesktop() ? 'Descargando la actualización… la app se reinicia sola.' : 'Recargando…';
  try {
    await installUpdate();
  } catch (err) {
    busy = false;
    lastResult = { error: 'No se pudo actualizar: ' + (err?.message || err) };
    updateArrowUI();
    renderPopover();
    banner?.remove();
    toastHelper?.(lastResult.error);
  }
}

function showBanner(version) {
  if (document.getElementById('updBanner')) return;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.className = 'upd-banner';
  el.innerHTML = `<span class="upd-banner-text">Hay una versión nueva de Llamadita: v${esc(version)} (tenés la v${APP_VERSION}).</span>
    <button class="btn-invite" id="updBannerGo">${isDesktop() ? 'Actualizar ahora' : 'Recargar'}</button>
    <button class="upd-later" id="updBannerLater">Después</button>`;
  document.body.appendChild(el);
  el.querySelector('#updBannerGo').addEventListener('click', doInstall);
  el.querySelector('#updBannerLater').addEventListener('click', () => el.remove());
}
