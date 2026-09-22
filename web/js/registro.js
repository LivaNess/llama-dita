// Registro e ingreso desde la web oficial. Misma cuenta que la app (Supabase Auth, sin contraseña).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const SUPABASE_URL = 'https://mwzkrahindnheuheoycv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SiB6rCFCoaa6O4_g0_Sc2Q_gPhbcdXL';
const DOWNLOAD_URL = '/descargas/Llamadita-Setup.exe';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
});

const card = document.getElementById('registroCard');
const state = { mode: 'signup', step: 'email', email: '', session: null, profile: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_RE = /^[a-z0-9_]{3,20}$/;

function translate(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('signups not allowed') || m.includes('user not found')) return 'No hay ninguna cuenta con ese mail. Tocá "Crear cuenta".';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Hay muchos pedidos de código en este momento. Esperá unos minutos y volvé a probar.';
  if (m.includes('expired')) return 'El código venció. Pedí uno nuevo.';
  if (m.includes('invalid') || m.includes('token')) return 'Código o enlace incorrecto.';
  if (m.includes('duplicate') || m.includes('unique')) return 'Ese usuario ya está tomado. Probá con otro.';
  return error?.message || 'Algo falló. Probá de nuevo.';
}

function setMsg(text, kind = 'error') {
  const el = card.querySelector('.msg');
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = !text;
}

function busy(form, on) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = on;
}

// ---------------------------------------------------------------- vistas
function render() {
  if (state.session) return renderDone();
  if (state.step === 'code') return renderCode();
  return renderEmail();
}

function renderEmail() {
  const signup = state.mode === 'signup';
  card.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Modo de acceso">
      <button type="button" role="tab" data-mode="signup" class="${signup ? 'active' : ''}" aria-selected="${signup}">Crear cuenta</button>
      <button type="button" role="tab" data-mode="login" class="${signup ? '' : 'active'}" aria-selected="${!signup}">Ya tengo cuenta</button>
    </div>
    <h3>${signup ? 'Creá tu cuenta gratuita' : 'Entrá a tu cuenta'}</h3>
    <p class="hint">${signup ? 'Te mandamos un código de 6 dígitos a tu mail para confirmar tu usuario.' : 'Escribí el mail con el que te registraste para recibir tu código.'}</p>
    <form id="fEmail" novalidate>
      <div class="field">
        <label for="email">Tu correo electrónico</label>
        <input id="email" type="email" autocomplete="email" placeholder="vos@ejemplo.com" value="${esc(state.email)}" required aria-required="true" />
      </div>
      ${signup ? `
      <div class="field-checkbox">
        <input type="checkbox" id="termsConsent" name="termsConsent" required aria-required="true" />
        <label for="termsConsent">
          He leído y acepto los <a href="/terminos/" target="_blank" rel="noopener">Términos y Condiciones</a> y la <a href="/privacidad/" target="_blank" rel="noopener">Política de Privacidad</a> de Llamadita.
        </label>
      </div>` : ''}
      <button class="btn btn-primary" type="submit">${signup ? 'Crear cuenta gratuita' : 'Pedir código de acceso'}</button>
    </form>
    <button class="link" type="button" id="haveCode">Ya tengo un código de acceso</button>
    <p class="msg" role="alert" aria-live="polite" hidden></p>`;

  card.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; render(); }));
  const form = card.querySelector('#fEmail');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = card.querySelector('#email').value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setMsg('Escribí un mail válido.');

    if (state.mode === 'signup') {
      const consent = card.querySelector('#termsConsent');
      if (!consent || !consent.checked) {
        return setMsg('Tenés que aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.');
      }
    }

    busy(form, true);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: state.mode === 'signup', emailRedirectTo: `${location.origin}/?registro=1` }
    });
    busy(form, false);
    if (error) return setMsg(translate(error));
    state.email = email;
    state.step = 'code';
    state.codeOnly = false;
    render();
  });
  card.querySelector('#haveCode').addEventListener('click', () => {
    const email = card.querySelector('#email').value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setMsg('Primero escribí tu mail.');
    state.email = email;
    state.step = 'code';
    state.codeOnly = true;
    render();
  });
  card.querySelector('#email').focus();
}

function renderCode() {
  card.innerHTML = `
    <h3>Revisá tu correo</h3>
    <p class="hint">${state.codeOnly ? 'Escribí el código' : 'Te enviamos un código'} para <strong>${esc(state.email)}</strong>. Si no lo ves en tu bandeja de entrada, revisá en correo no deseado (spam).</p>
    <form id="fCode" novalidate>
      <div class="field">
        <label for="code">Código de acceso (6 dígitos)</label>
        <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" required aria-required="true" />
      </div>
      <button class="btn btn-primary" type="submit">Verificar código y entrar</button>
    </form>
    <button class="link" type="button" id="back">Usar otro correo electrónico</button>
    <p class="msg" role="alert" aria-live="polite" hidden></p>`;

  const form = card.querySelector('#fCode');
  const input = card.querySelector('#code');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) form.requestSubmit();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = input.value.replace(/\D/g, '');
    if (token.length !== 6) return setMsg('El código tiene 6 dígitos.');
    busy(form, true);
    const { data, error } = await sb.auth.verifyOtp({ email: state.email, token, type: 'email' });
    busy(form, false);
    if (error) return setMsg(translate(error));
    state.session = data.session;
    await loadProfile();
    render();
  });
  card.querySelector('#back').addEventListener('click', () => { state.step = 'email'; render(); });
  input.focus();
}

function renderDone() {
  const p = state.profile;
  const name = p?.display_name || p?.username || state.session.user.email;
  card.innerHTML = `
    <div class="done-head">
      <div class="done-avatar">${esc(name.slice(0, 2).toUpperCase())}</div>
      <div><h3>Tu cuenta está lista</h3><small>${esc(state.session.user.email)}</small></div>
    </div>
    ${p ? `
    <form id="fProfile" novalidate>
      <div class="field">
        <label for="displayName">Nombre público (cómo te ven los demás)</label>
        <input id="displayName" maxlength="40" value="${esc(p.display_name)}" />
      </div>
      <div class="field">
        <label for="username">Usuario único (para que te agreguen tus amigos)</label>
        <input id="username" maxlength="20" value="${esc(p.username)}" autocapitalize="off" spellcheck="false" />
      </div>
      <button class="btn btn-ghost" type="submit">Guardar cambios de perfil</button>
    </form>
    <p class="msg" role="status" aria-live="polite" hidden></p>
    <div class="divider"></div>` : '<p class="hint">Estamos terminando de preparar tu perfil. Recargá en unos segundos.</p>'}
    <a class="btn btn-primary" href="${DOWNLOAD_URL}" download>Bajar Llamadita para Windows (64-bit)</a>
    <p class="hint" style="margin-top:0.9rem">Abrí la aplicación instalada e ingresá con este mismo correo para conectar.</p>
    <button class="link" type="button" id="logout">Cerrar sesión en esta página</button>`;

  const form = card.querySelector('#fProfile');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = card.querySelector('#username').value.trim().toLowerCase();
    const display_name = card.querySelector('#displayName').value.trim();
    if (!USER_RE.test(username)) return setMsg('El usuario va de 3 a 20 caracteres: letras minúsculas, números o _.');
    busy(form, true);
    const { data, error } = await sb.from('profiles').update({ username, display_name }).eq('id', state.session.user.id).select().single();
    busy(form, false);
    if (error) return setMsg(translate(error));
    state.profile = data;
    renderDone();
    setMsg('Guardado.', 'ok');
  });
  card.querySelector('#logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    Object.assign(state, { session: null, profile: null, step: 'email' });
    render();
  });
}

// ---------------------------------------------------------------- datos
async function loadProfile() {
  for (let i = 0; i < 4; i++) {
    const { data } = await sb.from('profiles').select('username, display_name').eq('id', state.session.user.id).maybeSingle();
    if (data) { state.profile = data; return; }
    await new Promise((r) => setTimeout(r, 700));
  }
  state.profile = null;
}

async function init() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (state.session) await loadProfile();
  render();

  sb.auth.onAuthStateChange(async (_event, session) => {
    const changed = !!session !== !!state.session;
    state.session = session;
    if (session && changed) { await loadProfile(); render(); }
  });

  // Vuelta desde el enlace del mail
  const params = new URLSearchParams(location.search);
  if (params.has('registro') || location.hash.includes('access_token')) {
    document.getElementById('registro')?.scrollIntoView({ behavior: 'smooth' });
    history.replaceState({}, '', '/#registro');
  }
}

init();
