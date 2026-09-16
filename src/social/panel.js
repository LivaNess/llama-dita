// Panel social: cuenta, amigos, canales y llamadas directas.
// Se monta solo (no toca el layout existente) y habla con la app por `hooks`:
//   hooks.joinRoom(code)      -> cambia la sala de voz P2P
//   hooks.getRoom()           -> sala actual
//   hooks.setLocalName(name)  -> nombre visible en la cabina local
//   hooks.toast(msg)          -> aviso corto
import './social.css';
import { supabase } from '../supabase/client.js';
import { getSession, onAuthChange, sendCode, verifyCode, signOut } from './auth.js';
import { guardarSesion, recuperarSesion } from './sesionGuardada.js';
import * as api from './api.js';
import * as cache from './cacheLocal.js';

const RING_TIMEOUT_MS = 45000;

const state = {
  session: null,
  online: new Map(), // user_id -> estado, desde Realtime Presence (sin escribir en la base)
  presence: null,
  me: null,
  friendships: [],
  channels: [],
  members: [],
  messages: [],
  currentChannel: null,
  directos: new Map(), // id de canal -> chat privado abierto (no salen en la lista de canales)
  incomingCall: null,
  outgoingCall: null,
  unsub: [],
  heartbeat: null,
  ringTimer: null,
  tab: 'amigos'
};

let hooks = {};
let root, drawer, overlay, headerBtn;

// El emoji de telefono en Windows se dibuja rosa: el boton de llamar parecia de colgar.
// Icono vectorial que toma el color del boton (verde) en vez de traer el suyo.
const ICONO_TELEFONO = `<svg class="sc-icono-tel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randomRoom = () => 'llamadita-' + Math.random().toString(36).substring(2, 8);

function isOnline(p) {
  return !!p && state.online.has(p.id);
}

function statusDot(p) {
  const st = p ? state.online.get(p.id) : null;
  const cls = st ? (st === 'dnd' ? 'dnd' : st === 'idle' ? 'idle' : 'online') : 'offline';
  const label = st ? ({ online: 'Conectado', idle: 'Ausente', dnd: 'No molestar' }[st] || 'Conectado') : 'Desconectado';
  return `<span class="sc-dot ${cls}" title="${label}"></span>`;
}

// ------------------------------------------------------------------
// Montaje
// ------------------------------------------------------------------
export async function initSocial(h) {
  hooks = h;
  mount();
  state.session = await getSession();

  // Si el navegador interno perdió la sesión (pasa al reinstalar, porque se borra su carpeta
  // de datos), se recupera de la copia que guardamos aparte en vez de pedir el código otra vez.
  if (!state.session) state.session = await recuperarSesion();

  onAuthChange(async (session) => {
    const wasLogged = !!state.session;
    state.session = session;
    guardarSesion(session); // copia de respaldo, fuera de la carpeta de la instalación
    if (session && !wasLogged) await onLogin();
    if (!session && wasLogged) onLogout();
    render();
  });

  // Y se refresca la copia con la sesión que haya ahora mismo.
  if (state.session) guardarSesion(state.session);
  if (state.session) await onLogin();
  render();
}

function mount() {
  root = document.createElement('div');
  root.id = 'socialRoot';
  document.body.appendChild(root);

  headerBtn = document.createElement('button');
  headerBtn.className = 'btn-invite sc-header-btn';
  headerBtn.id = 'btnSocialToggle';
  headerBtn.title = 'Cuenta, amigos y canales';
  headerBtn.style.display = 'none';
  headerBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Crear cuenta</span>`;
  headerBtn.addEventListener('click', () => toggleDrawer());
  (document.querySelector('.room-actions') || document.querySelector('.app-header') || document.body).appendChild(headerBtn);

  const sidebarUserBtn = document.getElementById('btnSidebarUser');
  if (sidebarUserBtn) {
    sidebarUserBtn.addEventListener('click', () => toggleDrawer());
  }

  overlay = document.createElement('div');
  overlay.className = 'sc-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', () => toggleDrawer(false));
  root.appendChild(overlay);

  drawer = document.createElement('aside');
  drawer.className = 'sc-drawer';
  drawer.hidden = true;
  root.appendChild(drawer);
  drawer.addEventListener('focusout', () => setTimeout(() => {
    if (state.pendingRender && !drawer.contains(document.activeElement)) { state.pendingRender = false; render(); }
  }, 0));

  const sidebarLogin = document.getElementById('sidebarLoginContainer');
  if (sidebarLogin) {
    sidebarLogin.addEventListener('focusout', () => setTimeout(() => {
      if (state.pendingRender && !sidebarLogin.contains(document.activeElement)) {
        state.pendingRender = false;
        render();
      }
    }, 0));
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) toggleDrawer(false); });
  bindSidebarForms();
}

function toggleDrawer(force) {
  if (!state.session || !state.me) {
    if (drawer) drawer.hidden = true;
    if (overlay) overlay.hidden = true;
    return;
  }
  const open = force ?? drawer.hidden;
  drawer.hidden = !open;
  overlay.hidden = !open;
  headerBtn.classList.toggle('active', open);
  const userBtn = document.getElementById('btnSidebarUser');
  if (userBtn) userBtn.classList.toggle('active', open);
}

// ------------------------------------------------------------------
// Sesión
// ------------------------------------------------------------------
async function onLogin() {
  const uid = state.session.user.id;
  // El perfil lo crea un trigger al registrarse: reintentar un par de veces por si tardó.
  for (let i = 0; i < 3 && !state.me; i++) {
    try { state.me = await api.getMyProfile(uid); }
    catch (_) { await new Promise((r) => setTimeout(r, 700)); }
  }
  if (!state.me) {
    // Sesión guardada de una cuenta que ya no existe (o token vencido): cerrar y pedir entrar de nuevo.
    await signOut();
    return;
  }
  hooks.setLocalName?.(state.me.display_name || state.me.username);

  // El historial vive en esta PC. Le pedimos al motor que no tire la caché cuando el disco se
  // llena: si dice que no, el chat anda igual, solo que vuelve a bajar lo que ya tenía.
  cache.pedirAlmacenamientoDuradero().then((ok) => {
    if (ok === false) console.warn('[cache] el motor no garantiza el historial local');
  });

  startPresence(uid);
  await Promise.all([refreshFriends(), refreshChannels()]);
  subscribeAll(uid);
  headerBtn.querySelector('span').textContent = state.me.display_name || state.me.username;
}

// Presencia: un canal compartido. Cada cliente "anuncia" que está conectado y Supabase
// avisa solo altas y bajas. No escribe en la base ni manda nada mientras nadie cambia.
function myStatus() {
  return state.me?.status && state.me.status !== 'offline' ? state.me.status : 'online';
}

function startPresence(uid) {
  const ch = supabase.channel('presencia', { config: { presence: { key: uid } } });
  ch.on('presence', { event: 'sync' }, () => {
    const s = ch.presenceState();
    state.online = new Map(Object.entries(s).map(([id, metas]) => [id, metas[metas.length - 1]?.status || 'online']));
    safeRender();
  });
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await ch.track({ status: myStatus() });
  });
  state.presence = ch;
  state.unsub.push(() => { supabase.removeChannel(ch); state.presence = null; state.online = new Map(); });
}

// No re-dibujar el panel mientras alguien está escribiendo en él (perdería lo tipeado).
function safeRender() {
  const a = document.activeElement;
  const sidebarLogin = document.getElementById('sidebarLoginContainer');
  const inDrawer = drawer && !drawer.hidden && a && drawer.contains(a);
  const inSidebarLogin = sidebarLogin && a && sidebarLogin.contains(a);
  if ((inDrawer || inSidebarLogin) && /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName)) {
    state.pendingRender = true;
    return;
  }
  render();
}

function onLogout() {
  state.unsub.forEach((u) => { try { u(); } catch (_) {} });
  state.unsub = [];
  clearInterval(state.heartbeat);
  state.directos.clear();
  Object.assign(state, { me: null, friendships: [], channels: [], members: [], messages: [], currentChannel: null, incomingCall: null, outgoingCall: null });
  if (drawer) drawer.hidden = true;
  if (overlay) overlay.hidden = true;
  headerBtn.querySelector('span').textContent = 'Crear cuenta';
  render();
}

function subscribeAll(uid) {
  state.unsub.push(api.subscribe('social-' + uid, [
    { table: 'friendships', cb: () => refreshFriends().then(render) },
    { table: 'channel_members', cb: () => refreshChannels().then(render) },
    { table: 'call_invites', event: 'INSERT', filter: `callee_id=eq.${uid}`, cb: (p) => onIncomingCall(p.new) },
    { table: 'call_invites', event: 'UPDATE', filter: `caller_id=eq.${uid}`, cb: (p) => onOutgoingCallUpdate(p.new) },
    { table: 'call_invites', event: 'UPDATE', filter: `callee_id=eq.${uid}`, cb: (p) => onIncomingCallUpdate(p.new) }
  ]));
}

function onProfileChange(p) {
  if (!p) return;
  if (state.me && p.id === state.me.id) state.me = { ...state.me, ...p };
  for (const f of state.friendships) {
    if (f.requester?.id === p.id) f.requester = { ...f.requester, ...p };
    if (f.addressee?.id === p.id) f.addressee = { ...f.addressee, ...p };
  }
  for (const m of state.members) if (m.profile?.id === p.id) m.profile = { ...m.profile, ...p };
  render();
}

async function refreshFriends() { state.friendships = await api.listFriendships(); }
async function refreshChannels() {
  state.channels = await api.listChannels();
  if (state.currentChannel && !esDirecto(state.currentChannel) && !state.channels.find((c) => c.id === state.currentChannel.id)) state.currentChannel = null;
}

// ------------------------------------------------------------------
// Llamadas directas
// ------------------------------------------------------------------
function otherSide(f) { return f.requester_id === state.me.id ? f.addressee : f.requester; }

async function callFriend(friendProfile) {
  const room = randomRoom();
  hooks.joinRoom?.(room, friendProfile.display_name || friendProfile.username);
  try {
    state.outgoingCall = await api.createCallInvite(state.me.id, friendProfile.id, room);
    state.outgoingCall.profile = friendProfile;
    hooks.toast?.(`Llamando a ${friendProfile.display_name || friendProfile.username}…`);
    toggleDrawer(false);
    render();
  } catch (e) { hooks.toast?.(e.message); }
}

function onOutgoingCallUpdate(row) {
  if (!state.outgoingCall || row.id !== state.outgoingCall.id) return;
  const name = state.outgoingCall.profile?.display_name || 'Tu amigo';
  if (row.status === 'accepted') hooks.toast?.(`${name} aceptó la llamada`);
  if (row.status === 'declined') hooks.toast?.(`${name} no puede atender ahora`);
  if (row.status === 'missed') hooks.toast?.(`${name} no contestó`);
  if (row.status !== 'ringing') state.outgoingCall = null;
  render();
}

function onIncomingCall(row) {
  if (row.status !== 'ringing') return;
  const f = state.friendships.find((x) => x.status === 'accepted' && (x.requester_id === row.caller_id || x.addressee_id === row.caller_id));
  const from = f ? otherSide(f) : { display_name: 'Alguien', username: '' };
  state.incomingCall = { ...row, from };
  clearTimeout(state.ringTimer);
  state.ringTimer = setTimeout(() => answerCall('missed'), RING_TIMEOUT_MS);
  render();
}

function onIncomingCallUpdate(row) {
  if (state.incomingCall && row.id === state.incomingCall.id && row.status !== 'ringing') {
    state.incomingCall = null;
    clearTimeout(state.ringTimer);
    render();
  }
}

async function answerCall(status) {
  const call = state.incomingCall;
  if (!call) return;
  clearTimeout(state.ringTimer);
  state.incomingCall = null;
  try {
    await api.updateCallInvite(call.id, status);
    if (status === 'accepted') {
      hooks.joinRoom?.(call.room_code, call.from?.display_name || call.from?.username);
      toggleDrawer(false);
    }
  } catch (e) { hooks.toast?.(e.message); }
  render();
}

async function cancelOutgoing() {
  if (!state.outgoingCall) return;
  try { await api.updateCallInvite(state.outgoingCall.id, 'ended'); } catch (_) {}
  state.outgoingCall = null;
  render();
}

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
function render() {
  const isLogged = !!(state.session && state.me);
  hooks.onAuthStateChange?.(isLogged);

  renderCallBanner();
  renderSidebar();
  renderChat();
  hooks.onChannelChange?.(state.currentChannel);

  if (!state.session) {
    if (drawer) {
      drawer.hidden = true;
      drawer.innerHTML = '';
    }
    if (overlay) overlay.hidden = true;
    return;
  }
  if (!state.me) { drawer.innerHTML = `<div class="sc-empty">Cargando tu cuenta…</div>`; return; }
  drawer.innerHTML = `
    ${profileHeader()}
    <nav class="sc-tabs">
      ${['amigos', 'canales', 'perfil'].map((t) => `<button data-tab="${t}" class="${state.tab === t ? 'active' : ''}">${{ amigos: 'Amigos', canales: 'Canales', perfil: 'Perfil' }[t]}${t === 'amigos' && pendingCount() ? ` <b class="sc-badge">${pendingCount()}</b>` : ''}</button>`).join('')}
    </nav>
    <div class="sc-body">${{ amigos: friendsView, canales: channelsView, perfil: profileView }[state.tab]()}</div>`;
  bindMain();
}

function pendingCount() { return state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === state.me.id).length; }

function profileHeader() {
  return `<header class="sc-head">
    <div class="sc-avatar">${esc((state.me.display_name || state.me.username).slice(0, 2).toUpperCase())}</div>
    <div class="sc-head-text"><strong>${esc(state.me.display_name || state.me.username)}</strong><small>@${esc(state.me.username)}</small></div>
    <select class="sc-status" id="scStatus" title="Tu estado">
      ${['online', 'idle', 'dnd'].map((s) => `<option value="${s}" ${state.me.status === s ? 'selected' : ''}>${{ online: 'Conectado', idle: 'Ausente', dnd: 'No molestar' }[s]}</option>`).join('')}
    </select>
    <button class="sc-icon-btn" id="scClose" title="Cerrar">✕</button>
  </header>`;
}

// ---- Login ----
function loginView({ isSidebar = false } = {}) {
  const step = state.loginEmail ? 2 : 1;
  const signup = state.loginMode !== 'login';
  const closeBtn = isSidebar ? '' : '<button class="sc-icon-btn" id="scCloseLogin" title="Cerrar">✕</button>';
  return `<div class="sc-login ${isSidebar ? 'sc-login-sidebar' : ''}">
    <div class="sc-row"><h2>${signup ? 'Creá tu cuenta' : 'Iniciá sesión'}</h2>${closeBtn}</div>
    <div class="sc-mode">
      <button type="button" class="${signup ? 'active' : ''}" data-mode="signup">Crear cuenta</button>
      <button type="button" class="${signup ? '' : 'active'}" data-mode="login">Ya tengo cuenta</button>
    </div>
    <p class="sc-muted">${signup
      ? 'Solo con tu mail, sin contraseña. Te mandamos un código para entrar.'
      : 'Escribí el mail con el que creaste la cuenta. Te mandamos un código para entrar.'}</p>
    ${step === 1 ? `
      <form id="scEmailForm">
        <label>Tu mail</label>
        <input type="email" id="scEmail" placeholder="vos@ejemplo.com" autocomplete="email" required />
        <button class="sc-primary" type="submit">${signup ? 'Crear cuenta' : 'Mandarme el código'}</button>
        <button class="sc-link" type="button" id="scHaveCode">Ya tengo un código</button>
      </form>` : `
      <form id="scCodeForm">
        <p class="sc-ok">${state.codeOnly ? `Escribí el código para <b>${esc(state.loginEmail)}</b>.` : `Listo, revisá <b>${esc(state.loginEmail)}</b> (mirá también en spam).`}</p>
        <label>Código de 6 dígitos, o el enlace completo del mail</label>
        <input type="text" id="scCode" placeholder="https://... o 123456" autocomplete="one-time-code" required />
        <button class="sc-primary" type="submit">Entrar</button>
        <button class="sc-link" type="button" id="scBack">Usar otro mail</button>
      </form>`}
    <p class="sc-error" id="scLoginError" hidden></p>
  </div>`;
}

function bindLogin(container = drawer) {
  if (!container) return;
  container.querySelector('#scEmailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); if (btn) btn.disabled = true;
    try { state.loginEmail = await sendCode(container.querySelector('#scEmail').value, { createUser: state.loginMode !== 'login' }); state.codeOnly = false; render(); }
    catch (err) { showLoginError(err.message + (/Demasiados/.test(err.message) ? ' Si ya tenés un código, tocá "Ya tengo un código".' : ''), container); if (btn) btn.disabled = false; }
  });
  container.querySelector('#scCodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); if (btn) btn.disabled = true;
    try { await verifyCode(state.loginEmail, container.querySelector('#scCode').value); state.loginEmail = null; }
    catch (err) { showLoginError(err.message, container); if (btn) btn.disabled = false; }
  });
  container.querySelector('#scBack')?.addEventListener('click', () => { state.loginEmail = null; state.codeOnly = false; render(); });
  container.querySelector('#scHaveCode')?.addEventListener('click', () => {
    const v = (container.querySelector('#scEmail').value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return showLoginError('Primero escribí tu mail.', container);
    state.loginEmail = v; state.codeOnly = true; render();
  });
  container.querySelector('#scCloseLogin')?.addEventListener('click', () => toggleDrawer(false));
  container.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.loginMode = b.dataset.mode; state.loginEmail = null; render(); }));
  container.querySelector('#scEmail')?.focus();
  container.querySelector('#scCode')?.focus();
}

function showLoginError(msg, container = drawer) {
  const el = container?.querySelector('#scLoginError') || drawer?.querySelector('#scLoginError');
  if (el) { el.textContent = msg; el.hidden = false; }
}

// ---- Amigos ----
function friendsView() {
  const me = state.me.id;
  const received = state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === me);
  const sent = state.friendships.filter((f) => f.status === 'pending' && f.requester_id === me);
  const friends = state.friendships.filter((f) => f.status === 'accepted')
    .map((f) => ({ f, p: otherSide(f) }))
    .sort((a, b) => (isOnline(b.p) - isOnline(a.p)) || (a.p.display_name || a.p.username).localeCompare(b.p.display_name || b.p.username));

  return `
    <form class="sc-row" id="scSearchForm">
      <input type="text" id="scSearch" placeholder="Buscar por usuario (ej: juan)" autocomplete="off" />
      <button class="sc-primary sc-small" type="submit">Buscar</button>
    </form>
    <div id="scSearchResults"></div>
    ${received.length ? `<h4>Te agregaron</h4>${received.map((f) => `
      <div class="sc-item">${statusDot(f.requester)}<div class="sc-item-text"><strong>${esc(f.requester.display_name || f.requester.username)}</strong><small>@${esc(f.requester.username)}</small></div>
        <button class="sc-primary sc-small" data-accept="${f.id}">Aceptar</button><button class="sc-ghost sc-small" data-remove="${f.id}">No</button></div>`).join('')}` : ''}
    <h4>Amigos ${friends.length ? `<span class="sc-muted">(${friends.filter((x) => isOnline(x.p)).length} conectados)</span>` : ''}</h4>
    ${friends.length ? friends.map(({ f, p }) => `
      <div class="sc-item sc-clickable" data-chat="${p.id}" title="Abrir chat privado">${statusDot(p)}<div class="sc-item-text"><strong>${esc(p.display_name || p.username)}</strong><small>@${esc(p.username)}</small></div>
        <button class="sc-call sc-small" data-call="${p.id}" title="Llamar" ${isOnline(p) ? '' : 'disabled'}>${ICONO_TELEFONO}</button>
        <button class="sc-ghost sc-small" data-remove="${f.id}" title="Quitar amigo">✕</button></div>`).join('')
      : `<p class="sc-empty">Todavía no tenés amigos agregados. Buscá a alguien por su nombre de usuario.</p>`}
    ${sent.length ? `<h4>Solicitudes enviadas</h4>${sent.map((f) => `
      <div class="sc-item"><div class="sc-item-text"><strong>${esc(f.addressee.display_name || f.addressee.username)}</strong><small>@${esc(f.addressee.username)} · pendiente</small></div>
        <button class="sc-ghost sc-small" data-remove="${f.id}">Cancelar</button></div>`).join('')}` : ''}`;
}

// ---- Canales ----
function channelsView() {
  if (state.currentChannel && !esDirecto(state.currentChannel)) return channelDetail();
  const mine = state.channels.filter((c) => c.owner_id === state.me.id);
  const others = state.channels.filter((c) => c.owner_id !== state.me.id);
  const item = (c) => `<button class="sc-item sc-clickable" data-open="${c.id}"><span class="sc-kind">${c.kind === 'voice' ? '🔊' : '#'}</span><div class="sc-item-text"><strong>${esc(c.name)}</strong><small>${c.kind === 'voice' ? 'Canal de voz' : 'Canal de texto'}${c.owner_id === state.me.id ? ' · tuyo' : ''}</small></div></button>`;
  return `
    <form class="sc-row" id="scCreateForm">
      <input type="text" id="scChannelName" placeholder="Nuevo canal" maxlength="40" required />
      <select id="scChannelKind"><option value="text">Texto</option><option value="voice">Voz</option></select>
      <button class="sc-primary sc-small" type="submit">Crear</button>
    </form>
    <form class="sc-row" id="scJoinForm">
      <input type="text" id="scJoinCode" placeholder="Código de invitación" required />
      <button class="sc-ghost sc-small" type="submit">Unirme</button>
    </form>
    ${mine.length ? `<h4>Tus canales</h4>${mine.map(item).join('')}` : ''}
    ${others.length ? `<h4>Canales donde estás</h4>${others.map(item).join('')}` : ''}
    ${!mine.length && !others.length ? `<p class="sc-empty">Creá tu primer canal o entrá a uno con un código de invitación.</p>` : ''}`;
}

function channelDetail() {
  const c = state.currentChannel;
  const owner = c.owner_id === state.me.id;
  const friendsNotIn = state.friendships.filter((f) => f.status === 'accepted').map(otherSide).filter((p) => !state.members.find((m) => m.user_id === p.id));
  return `
    <div class="sc-channel-head">
      <button class="sc-link" id="scBackChannels">← Canales</button>
      <strong>${c.kind === 'voice' ? '🔊' : '#'} ${esc(c.name)}</strong>
      <button class="sc-ghost sc-small" id="scCopyInvite" title="Copiar código de invitación">Código: ${esc(c.invite_code)}</button>
    </div>
    ${c.kind === 'voice' ? `<button class="sc-primary" id="scJoinVoice">Entrar a la sala de voz</button><p class="sc-muted sc-tiny">Sala P2P: ${esc(c.room_code)} · por ahora de a dos personas por sala.</p>` : `
      <div class="sc-messages" id="scMessages">${state.messages.map(msgItem).join('') || `<p class="sc-empty">Sin mensajes todavía.</p>`}</div>
      <form class="sc-row" id="scMsgForm"><input type="text" id="scMsg" placeholder="Escribí un mensaje" maxlength="2000" autocomplete="off" required /><button class="sc-primary sc-small" type="submit">Enviar</button></form>`}
    <h4>Miembros (${state.members.length})</h4>
    ${state.members.map((m) => `<div class="sc-item">${statusDot(m.profile || {})}<div class="sc-item-text"><strong>${esc(m.profile?.display_name || m.profile?.username || '…')}</strong><small>@${esc(m.profile?.username || '')}${m.role === 'owner' ? ' · dueño' : ''}</small></div>
      ${owner && m.role !== 'owner' ? `<button class="sc-ghost sc-small" data-kick="${m.user_id}">Sacar</button>` : ''}</div>`).join('')}
    ${owner && friendsNotIn.length ? `<div class="sc-row"><select id="scAddFriend">${friendsNotIn.map((p) => `<option value="${p.id}">${esc(p.display_name || p.username)}</option>`).join('')}</select><button class="sc-ghost sc-small" id="scAddFriendBtn">Sumar amigo</button></div>` : ''}
    <div class="sc-row sc-danger-row">${owner ? `<button class="sc-danger sc-small" id="scDeleteChannel">Borrar canal</button>` : `<button class="sc-danger sc-small" id="scLeaveChannel">Salir del canal</button>`}</div>`;
}

function autorDe(m) {
  // El nombre vivo del miembro le gana al que quedó guardado en la caché: si alguien se
  // cambió el nombre, el historial viejo no se queda con el anterior.
  const vivo = state.members.find((x) => x.user_id === m.author_id)?.profile
    || (m.author_id === state.me?.id ? state.me : null);
  return vivo?.display_name || vivo?.username || m.author?.display_name || m.author?.username || 'cuenta borrada';
}

function msgItem(m) {
  const mine = m.author_id === state.me.id;
  // Lo tuyo lo borrás siempre. Lo ajeno, solo el dueño de un canal, y nunca en un chat
  // privado: si no, el que abrió la conversación podría borrar lo que dijo el otro.
  const puedoBorrar = mine || (!esDirecto(state.currentChannel) && state.currentChannel?.owner_id === state.me.id);
  const t = new Date(m.created_at);
  const hora = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
  return `<div class="sc-msg ${mine ? 'mine' : ''}" data-msg="${esc(m.id)}">
    <small>${esc(autorDe(m))} · ${hora}${m.edited_at ? ' · editado' : ''}</small>
    <div class="sc-msg-body">${esc(m.body)}</div>
    ${puedoBorrar ? `<div class="sc-msg-acciones">${mine ? `<button type="button" class="sc-msg-accion" data-editar="${esc(m.id)}" title="Editar">✎</button>` : ''}<button type="button" class="sc-msg-accion" data-borrar="${esc(m.id)}" title="Borrar para todos">✕</button></div>` : ''}
  </div>`;
}

// ------------------------------------------------------------------
// Historial: la caché local y la sincronización por diferencia
// ------------------------------------------------------------------
function esDirecto(c) { return c?.kind === 'dm'; }

function buscarCanal(id) {
  return state.channels.find((x) => x.id === id) || state.directos.get(id) || null;
}

function nombreCanal(c) {
  if (!c) return '';
  if (!esDirecto(c)) return c.name;
  if (c.conNombre) return c.conNombre;
  const otro = state.members.find((m) => m.user_id !== state.me?.id)?.profile;
  return otro?.display_name || otro?.username || 'Chat privado';
}

// Junta lo que ya teníamos con lo que vino, tira los repetidos por identificador (el solape de
// 30 segundos los trae a propósito) y saca los que tienen lápida.
function mezclar(actuales, nuevos, lapidas = []) {
  const borrados = new Set(lapidas.map((l) => String(l.message_id)));
  const porId = new Map();
  for (const m of [...actuales, ...nuevos]) porId.set(String(m.id), m);
  for (const id of borrados) porId.delete(id);
  // Se ordena por la hora convertida a numero, no por el texto: el aviso en vivo y la consulta
  // al servidor no siempre escriben la fecha igual, y comparar textos pondria un mensaje nuevo
  // en el lugar equivocado.
  return [...porId.values()].sort((a, b) => (hora(a.created_at) - hora(b.created_at)) || (Number(a.id) - Number(b.id)));
}

const hora = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; };

function marcaMasNueva(mensajes, lapidas) {
  let max = 0;
  for (const m of mensajes) max = Math.max(max, hora(m.updated_at || m.created_at));
  for (const l of lapidas) max = Math.max(max, hora(l.deleted_at));
  return max ? new Date(max).toISOString() : null;
}

async function sincronizar(channelId) {
  const marca = await cache.leerMarca(channelId);
  let res;
  try {
    res = await api.sincronizarCanal(channelId, marca, cache.SOLAPE_MS);
  } catch (e) { hooks.toast?.(e.message); return; }

  const { mensajes, lapidas } = res;
  if (mensajes.length) await cache.guardarMensajes(mensajes.map((m) => ({ ...m, channel_id: channelId })));
  if (lapidas.length) {
    await cache.guardarLapidas(lapidas);
    await cache.olvidarMensajes(lapidas.map((l) => l.message_id));
  }
  const nueva = marcaMasNueva(mensajes, lapidas);
  if (nueva) await cache.guardarMarca(channelId, nueva);

  if (state.currentChannel?.id !== channelId) return;
  state.messages = mezclar(state.messages, mensajes, lapidas);
}

async function llegoMensaje(channelId, fila) {
  const perfil = state.members.find((m) => m.user_id === fila.author_id)?.profile;
  const m = { ...fila, author: perfil ? { username: perfil.username, display_name: perfil.display_name } : null };
  await cache.guardarMensajes([m]);
  await cache.guardarMarca(channelId, marcaMasNueva([m], []));
  if (state.currentChannel?.id !== channelId) return;
  state.messages = mezclar(state.messages, [m]);
  render();
}

// Un borrado no viaja como "fila borrada" (ese aviso llega solo con la clave y no se puede
// filtrar por canal): viaja como el alta de una lápida.
async function llegoBorrado(channelId, lapida) {
  await cache.guardarLapidas([lapida]);
  await cache.olvidarMensajes([lapida.message_id]);
  await cache.guardarMarca(channelId, marcaMasNueva([], [lapida]));
  if (state.currentChannel?.id !== channelId) return;
  state.messages = mezclar(state.messages, [], [lapida]);
  render();
}

function suscribirCanal(id) {
  if (state.channelUnsub) state.channelUnsub();
  state.channelUnsub = api.subscribe('chan-' + id, [
    { table: 'messages', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => llegoMensaje(id, p.new) },
    { table: 'messages', event: 'UPDATE', filter: `channel_id=eq.${id}`, cb: (p) => llegoMensaje(id, p.new) },
    { table: 'message_tombstones', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => llegoBorrado(id, p.new) },
    { table: 'channel_members', filter: `channel_id=eq.${id}`, cb: async () => { if (state.currentChannel?.id === id) { state.members = await api.listMembers(id); render(); } } }
  ]);
}

async function openChannel(id) {
  const c = buscarCanal(id);
  if (!c) return;
  state.currentChannel = c;
  toggleDrawer(false);
  state.members = [];
  state.messages = [];
  const conTexto = c.kind !== 'voice';

  // 1. Lo que ya está en esta PC se pinta al toque. Abrir un canal no espera a la red.
  if (conTexto) state.messages = await cache.leerMensajes(id);
  if (state.currentChannel?.id !== id) return;
  render();

  // 2. Y recién después se le pide al servidor lo que cambió desde la última vez.
  state.members = await api.listMembers(id);
  if (state.currentChannel?.id !== id) return;
  if (conTexto) await sincronizar(id);
  if (state.currentChannel?.id !== id) return;

  suscribirCanal(id);
  render();
}

// Abrir el chat privado con un amigo. El servidor comprueba que sean amigos y devuelve la
// conversación, creándola la primera vez.
async function abrirChatPrivado(p) {
  if (!p) return;
  try {
    const ch = await api.abrirChatDirecto(p.id);
    if (!ch?.id) return;
    state.directos.set(ch.id, { ...ch, conNombre: p.display_name || p.username, otro: p });
    await openChannel(ch.id);
  } catch (e) { hooks.toast?.(e.message); }
}

function closeChannel() {
  if (state.channelUnsub) { state.channelUnsub(); state.channelUnsub = null; }
  state.currentChannel = null;
  render();
}

// ------------------------------------------------------------------
// Borrar
// ------------------------------------------------------------------
async function borrarMensaje(id) {
  try {
    await api.deleteMessage(id);
    // No esperamos al aviso de vuelta: se va de la pantalla ya.
    await cache.olvidarMensajes([Number(id)]);
    state.messages = state.messages.filter((m) => String(m.id) !== String(id));
    render();
  } catch (e) { hooks.toast?.(e.message); }
}

async function editarMensaje(id) {
  const actual = state.messages.find((m) => String(m.id) === String(id));
  if (!actual) return;
  const texto = prompt('Editar el mensaje:', actual.body);
  if (texto === null || texto.trim() === actual.body) return;
  try { await api.editMessage(id, texto); } catch (e) { hooks.toast?.(e.message); }
}

// "Sacarlo de mi vista": borra la copia de esta PC y nada más. Es reversible: al volver a
// abrir el chat se sincroniza de nuevo y vuelve todo.
async function sacarDeMiVista(channelId) {
  if (!confirm('Esto borra la conversación de esta computadora, no del servidor.\n\nSi volvés a abrir el chat, se descarga de nuevo. ¿Seguimos?')) return;
  await cache.vaciarCanal(channelId);
  state.messages = [];
  render();
  hooks.toast?.('Sacado de esta PC. Sigue en el servidor.');
}

// "Borrarlo para los dos": borra del servidor, y solo alcanza lo que escribiste vos.
async function borrarParaLosDos(channelId) {
  if (!confirm('Esto borra del servidor los mensajes que escribiste VOS en esta conversación.\n\nSe van de verdad y también desaparecen de la pantalla del otro. Lo que escribió la otra persona queda.\n\n¿Seguro?')) return;
  try {
    await api.deleteMyMessages(channelId, state.me.id);
    state.messages = state.messages.filter((m) => m.author_id !== state.me.id);
    render();
    hooks.toast?.('Borrado para los dos.');
  } catch (e) { hooks.toast?.(e.message); }
}

// Los botones de cada mensaje, que aparecen tanto en el cajón como en la pantalla grande.
function bindAccionesMensaje(contenedor) {
  if (!contenedor) return;
  contenedor.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = () => { if (confirm('¿Borrar este mensaje? Se va de verdad, para todos.')) borrarMensaje(b.dataset.borrar); };
  });
  contenedor.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => editarMensaje(b.dataset.editar); });
}

// ---- Perfil ----
function profileView() {
  return `<form id="scProfileForm" class="sc-form">
    <label>Nombre visible</label><input type="text" id="scDisplayName" value="${esc(state.me.display_name)}" maxlength="40" />
    <label>Usuario (letras, números y _)</label><input type="text" id="scUsername" value="${esc(state.me.username)}" maxlength="20" pattern="[a-z0-9_]{3,20}" />
    <p class="sc-muted sc-tiny">Tus amigos te encuentran por el usuario. Mail: ${esc(state.session.user.email)}</p>
    <button class="sc-primary" type="submit">Guardar</button>
    <button class="sc-ghost" type="button" id="scLogout">Cerrar sesión</button>
  </form>`;
}

// ---- Eventos ----
function bindMain() {
  const q = (s) => drawer.querySelector(s);
  q('#scClose')?.addEventListener('click', () => toggleDrawer(false));
  drawer.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
  q('#scStatus')?.addEventListener('change', async (e) => { state.me.status = e.target.value; state.presence?.track({ status: myStatus() }); await api.setStatus(state.me.id, e.target.value); });

  // amigos
  q('#scSearchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = q('#scSearchResults');
    box.innerHTML = `<p class="sc-muted sc-tiny">Buscando…</p>`;
    try {
      const res = await api.searchUsers(q('#scSearch').value, state.me.id);
      box.innerHTML = res.length ? res.map((p) => {
        const rel = state.friendships.find((f) => f.requester_id === p.id || f.addressee_id === p.id);
        return `<div class="sc-item">${statusDot(p)}<div class="sc-item-text"><strong>${esc(p.display_name || p.username)}</strong><small>@${esc(p.username)}</small></div>
          ${rel ? `<small class="sc-muted">${rel.status === 'accepted' ? 'ya es tu amigo' : 'pendiente'}</small>` : `<button class="sc-primary sc-small" data-add="${p.id}">Agregar</button>`}</div>`;
      }).join('') : `<p class="sc-muted sc-tiny">No encontré a nadie con ese usuario.</p>`;
      box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => act(() => api.sendFriendRequest(state.me.id, b.dataset.add), 'Solicitud enviada')));
    } catch (err) { box.innerHTML = `<p class="sc-error">${esc(err.message)}</p>`; }
  });
  drawer.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', () => act(() => api.acceptFriendRequest(b.dataset.accept), 'Ahora son amigos')));
  drawer.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => act(() => api.removeFriendship(b.dataset.remove))));
  drawer.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const p = state.friendships.map(otherSide).find((x) => x.id === b.dataset.call);
    if (p) callFriend(p);
  }));
  drawer.querySelectorAll('[data-chat]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-call]') || e.target.closest('[data-remove]')) return;
    const p = state.friendships.map(otherSide).find((x) => x.id === el.dataset.chat);
    if (p) abrirChatPrivado(p);
  }));

  // canales
  q('#scCreateForm')?.addEventListener('submit', (e) => { e.preventDefault(); act(() => api.createChannel(state.me.id, q('#scChannelName').value, q('#scChannelKind').value), 'Canal creado'); });
  q('#scJoinForm')?.addEventListener('submit', (e) => { e.preventDefault(); act(() => api.joinChannelByCode(q('#scJoinCode').value), 'Entraste al canal'); });
  drawer.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openChannel(b.dataset.open)));
  q('#scBackChannels')?.addEventListener('click', closeChannel);
  q('#scCopyInvite')?.addEventListener('click', () => navigator.clipboard.writeText(state.currentChannel.invite_code).then(() => hooks.toast?.('Código de invitación copiado')));
  q('#scJoinVoice')?.addEventListener('click', () => { hooks.joinRoom?.(state.currentChannel.room_code); toggleDrawer(false); hooks.toast?.(`Entrando a ${state.currentChannel.name}`); });
  q('#scMsgForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = q('#scMsg'); const text = input.value; input.value = '';
    try { await api.sendMessage(state.currentChannel.id, state.me.id, text); } catch (err) { hooks.toast?.(err.message); }
  });
  const msgs = q('#scMessages');
  if (msgs) { bindAccionesMensaje(msgs); msgs.scrollTop = msgs.scrollHeight; }
  drawer.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => act(() => api.leaveChannel(state.currentChannel.id, b.dataset.kick))));
  q('#scAddFriendBtn')?.addEventListener('click', () => act(() => api.addFriendToChannel(state.currentChannel.id, q('#scAddFriend').value), 'Amigo sumado'));
  q('#scDeleteChannel')?.addEventListener('click', () => { if (confirm(`¿Borrar el canal "${state.currentChannel.name}"?`)) act(async () => { await api.deleteChannel(state.currentChannel.id); closeChannel(); }); });
  q('#scLeaveChannel')?.addEventListener('click', () => act(async () => { await api.leaveChannel(state.currentChannel.id, state.me.id); closeChannel(); }));

  // perfil
  q('#scProfileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = q('#scUsername').value.trim().toLowerCase();
    const display_name = q('#scDisplayName').value.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return hooks.toast?.('Usuario inválido: 3 a 20 caracteres, letras minúsculas, números o _');
    act(async () => {
      state.me = await api.updateMyProfile(state.me.id, { username, display_name });
      hooks.setLocalName?.(display_name || username);
      headerBtn.querySelector('span').textContent = display_name || username;
    }, 'Perfil guardado');
  });
  q('#scLogout')?.addEventListener('click', async () => { await signOut(); });
}

async function act(fn, okMsg) {
  try {
    await fn();
    if (okMsg) hooks.toast?.(okMsg);
    await Promise.all([refreshFriends(), refreshChannels()]);
    if (state.currentChannel) state.members = await api.listMembers(state.currentChannel.id);
  } catch (err) { hooks.toast?.(err.message); }
  render();
}

// ---- Banner de llamada (entrante o saliente) ----
function renderCallBanner() {
  let el = document.getElementById('scCallBanner');
  if (!state.incomingCall && !state.outgoingCall) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'scCallBanner'; el.className = 'sc-call-banner'; root.appendChild(el); }
  if (state.incomingCall) {
    const c = state.incomingCall;
    el.innerHTML = `<span class="sc-ring">${ICONO_TELEFONO}</span><div><strong>${esc(c.from.display_name || c.from.username)}</strong> te está llamando</div>
      <button class="sc-primary sc-small" id="scAccept">Atender</button><button class="sc-danger sc-small" id="scDecline">Rechazar</button>`;
    el.querySelector('#scAccept').onclick = () => answerCall('accepted');
    el.querySelector('#scDecline').onclick = () => answerCall('declined');
  } else {
    const c = state.outgoingCall;
    el.innerHTML = `<span class="sc-ring">${ICONO_TELEFONO}</span><div>Llamando a <strong>${esc(c.profile?.display_name || c.profile?.username || '')}</strong>…</div>
      <button class="sc-danger sc-small" id="scCancel">Cancelar</button>`;
    el.querySelector('#scCancel').onclick = cancelOutgoing;
  }
}

// ------------------------------------------------------------------
// Renderizado de Barra Lateral (Canales, Amigos y Pie de Usuario)
// ------------------------------------------------------------------
function renderSidebar() {
  const isLogged = !!(state.session && state.me);
  const sidebarLogin = document.getElementById('sidebarLoginContainer');
  const sidebarScrollable = document.getElementById('sidebarScrollable');
  const sidebarUserFooter = document.getElementById('sidebarUserFooter');

  const standbyTitle = document.getElementById('standbyTitle');
  const standbyDesc = document.getElementById('standbyDesc');
  const callStatus = document.getElementById('callStatus');
  const onAirBadge = document.getElementById('onAirBadge');
  const onAirText = document.getElementById('onAirText');

  if (!isLogged) {
    document.body.classList.add('is-logged-out');

    if (sidebarLogin) {
      sidebarLogin.style.display = 'block';
      sidebarLogin.innerHTML = loginView({ isSidebar: true });
      bindLogin(sidebarLogin);
    }
    if (sidebarScrollable) sidebarScrollable.style.display = 'none';
    if (sidebarUserFooter) sidebarUserFooter.style.display = 'none';

    if (standbyTitle) standbyTitle.textContent = 'Acceso restringido';
    if (standbyDesc) standbyDesc.textContent = 'Iniciá sesión o creá tu cuenta en la barra lateral para acceder al programa, canales y llamadas.';
    if (callStatus) callStatus.textContent = 'Sin sesión';
    if (onAirBadge) onAirBadge.classList.remove('live');
    if (onAirText) onAirText.textContent = 'BLOQUEADO';

    return;
  }

  // Usuario autenticado
  document.body.classList.remove('is-logged-out');
  if (sidebarLogin) {
    sidebarLogin.style.display = 'none';
    sidebarLogin.innerHTML = '';
  }
  if (sidebarScrollable) sidebarScrollable.style.display = '';
  if (sidebarUserFooter) sidebarUserFooter.style.display = '';

  if (standbyTitle) standbyTitle.textContent = 'Sin sesión activa';
  if (standbyDesc) standbyDesc.textContent = 'Seleccioná un canal de texto en la barra lateral o llamá a un amigo.';
  if (callStatus && callStatus.textContent === 'Sin sesión') callStatus.textContent = 'Sin llamada';
  if (onAirText && onAirText.textContent === 'BLOQUEADO') onAirText.textContent = 'STANDBY';

  const channelsList = document.getElementById('sidebarChannelsList');
  const friendsList = document.getElementById('sidebarFriendsList');
  const requestsList = document.getElementById('sidebarRequestsList');
  const userAvatar = document.getElementById('sidebarUserAvatar');
  const userName = document.getElementById('sidebarUserName');
  const userHandle = document.getElementById('sidebarUserHandle');

  // 1. Pie de Usuario
  const name = state.me.display_name || state.me.username;
  const initials = name.slice(0, 2).toUpperCase();
  if (userAvatar) userAvatar.textContent = initials;
  if (userName) userName.textContent = name;
  if (userHandle) userHandle.textContent = `@${state.me.username}`;

  // 2. Lista de Canales
  if (channelsList) {
    // Los chats privados no son canales de la lista: viven abajo, en la lista de amigos.
    const regularChannels = state.channels.filter((c) => !esDirecto(c));
    if (!state.session) {
      channelsList.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.5rem 0.6rem;">Iniciá sesión para ver canales.</p>`;
    } else if (!regularChannels.length) {
      channelsList.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.5rem 0.6rem;">Sin canales. Creá uno con +.</p>`;
    } else {
      channelsList.innerHTML = regularChannels.map((c) => {
        const isActive = state.currentChannel?.id === c.id;
        const icon = c.kind === 'voice' ? '🔊' : '#';
        return `
          <button class="sidebar-channel-item ${isActive ? 'active' : ''}" data-sidebar-channel="${c.id}" title="${esc(c.name)} (${c.kind === 'voice' ? 'Voz' : 'Texto'}) · Clic derecho para opciones">
            <span class="channel-kind">${icon}</span>
            <span class="channel-name">${esc(c.name)}</span>
          </button>
        `;
      }).join('');

      channelsList.querySelectorAll('[data-sidebar-channel]').forEach((btn) => {
        const id = btn.dataset.sidebarChannel;
        const chan = regularChannels.find((x) => x.id === id);
        btn.addEventListener('click', () => {
          if (state.currentChannel?.id === id) {
            closeChannel();
          } else {
            openChannel(id);
          }
        });
        if (chan) {
          btn.addEventListener('contextmenu', (e) => showChannelContextMenu(e, chan));
        }
      });
    }
  }

  // 3. Solicitudes de amistad recibidas
  if (requestsList) {
    if (state.session && state.me) {
      const received = state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === state.me.id);
      if (received.length) {
        requestsList.innerHTML = received.map((f) => `
          <div class="sidebar-request-item" style="padding: 0.45rem 0.6rem; background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.25); border-radius: 7px; margin-bottom: 0.4rem; font-size: 0.78rem;">
            <div style="margin-bottom: 0.35rem; color: #fff;"><strong>${esc(f.requester?.display_name || f.requester?.username)}</strong> te agregó</div>
            <div style="display: flex; gap: 0.3rem;">
              <button class="sc-primary sc-small" data-sidebar-accept="${f.id}" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;">Aceptar</button>
              <button class="sc-ghost sc-small" data-sidebar-reject="${f.id}" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;">No</button>
            </div>
          </div>
        `).join('');

        requestsList.querySelectorAll('[data-sidebar-accept]').forEach((b) => {
          b.addEventListener('click', () => act(() => api.acceptFriendRequest(b.dataset.sidebarAccept), 'Ahora son amigos'));
        });
        requestsList.querySelectorAll('[data-sidebar-reject]').forEach((b) => {
          b.addEventListener('click', () => act(() => api.removeFriendship(b.dataset.sidebarReject)));
        });
      } else {
        requestsList.innerHTML = '';
      }
    } else {
      requestsList.innerHTML = '';
    }
  }

  // 4. Lista de Amigos
  if (friendsList) {
    if (!state.session) {
      friendsList.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.5rem 0.6rem;">Iniciá sesión para ver amigos.</p>`;
    } else {
      const friends = state.friendships.filter((f) => f.status === 'accepted')
        .map((f) => ({ f, p: otherSide(f) }))
        .sort((a, b) => (isOnline(b.p) - isOnline(a.p)) || (a.p.display_name || a.p.username).localeCompare(b.p.display_name || b.p.username));

      if (!friends.length) {
        friendsList.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.5rem 0.6rem;">Sin amigos. Agregá con +.</p>`;
      } else {
        friendsList.innerHTML = friends.map(({ f, p }) => `
          <div class="sidebar-friend-item sc-clickable ${esDirecto(state.currentChannel) && state.currentChannel?.otro?.id === p.id ? 'active' : ''}" data-sidebar-dm="${p.id}" role="button" tabindex="0" title="Abrir chat privado con ${esc(p.display_name || p.username)}">
            ${statusDot(p)}
            <div class="friend-info">
              <span class="friend-name">${esc(p.display_name || p.username)}</span>
              <span class="friend-handle">@${esc(p.username)}</span>
            </div>
            <button class="btn-friend-call" data-sidebar-call="${p.id}" title="Llamar" ${isOnline(p) ? '' : 'disabled'}>${ICONO_TELEFONO}</button>
          </div>
        `).join('');

        friendsList.querySelectorAll('[data-sidebar-call]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const friend = friends.find((x) => x.p.id === b.dataset.sidebarCall)?.p;
            if (friend) callFriend(friend);
          });
        });

        // El cuerpo del renglón abre la conversación privada; el teléfono sigue llamando.
        friendsList.querySelectorAll('[data-sidebar-dm]').forEach((el) => {
          const abrir = () => {
            const friend = friends.find((x) => x.p.id === el.dataset.sidebarDm)?.p;
            if (friend) abrirChatPrivado(friend);
          };
          el.addEventListener('click', (e) => { if (!e.target.closest('[data-sidebar-call]')) abrir(); });
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
        });
      }
    }
  }
}

// ------------------------------------------------------------------
// Menú Contextual para Canales (Clic derecho en sidebar)
// ------------------------------------------------------------------
function showChannelContextMenu(e, channel) {
  e.preventDefault();
  e.stopPropagation();

  document.getElementById('channelContextMenu')?.remove();

  const isOwner = channel.owner_id === state.me?.id;
  const menu = document.createElement('div');
  menu.id = 'channelContextMenu';
  menu.className = 'channel-context-menu';

  menu.innerHTML = `
    <button type="button" data-action="copy">
      <span>📋 Copiar invitación</span>
    </button>
    ${isOwner ? `
      <button type="button" data-action="delete" class="danger">
        <span>🗑️ Eliminar canal</span>
      </button>
    ` : `
      <button type="button" data-action="leave" class="danger">
        <span>🚪 Salir del canal</span>
      </button>
    `}
  `;

  document.body.appendChild(menu);
  const x = Math.min(e.clientX, window.innerWidth - 190);
  const y = Math.min(e.clientY, window.innerHeight - 90);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  menu.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
    menu.remove();
    navigator.clipboard.writeText(channel.invite_code).then(() => {
      hooks.toast?.('Código de invitación copiado');
    });
  });

  menu.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
    menu.remove();
    if (confirm(`¿Seguro que querés eliminar el canal "${channel.name}"?`)) {
      act(async () => {
        await api.deleteChannel(channel.id);
        if (state.currentChannel?.id === channel.id) closeChannel();
      }, 'Canal eliminado');
    }
  });

  menu.querySelector('[data-action="leave"]')?.addEventListener('click', () => {
    menu.remove();
    if (confirm(`¿Seguro que querés salir del canal "${channel.name}"?`)) {
      act(async () => {
        await api.leaveChannel(channel.id, state.me.id);
        if (state.currentChannel?.id === channel.id) closeChannel();
      }, 'Saliste del canal');
    }
  });

  const dismiss = (evt) => {
    if (!menu.contains(evt.target)) {
      menu.remove();
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  const onKeyDown = (evt) => {
    if (evt.key === 'Escape') {
      menu.remove();
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
  }, 10);
}

// ------------------------------------------------------------------
// Renderizado de Chat en el Área Principal
// ------------------------------------------------------------------
function renderChat() {
  const chatView = document.getElementById('channelChatView');
  if (!chatView) return;
  if (!state.currentChannel) return;

  const c = state.currentChannel;
  const dm = esDirecto(c);
  const icon = document.getElementById('chatChannelIcon');
  const title = document.getElementById('chatChannelTitle');
  const type = document.getElementById('chatChannelType');
  const voiceBtn = document.getElementById('btnChatVoice');
  const callBtn = document.getElementById('btnChatCall');
  const copyBtn = document.getElementById('btnChatCopyInvite');
  const closeBtn = document.getElementById('btnChatClose');
  const vistaBtn = document.getElementById('btnChatVaciarLocal');
  const ambosBtn = document.getElementById('btnChatBorrarAmbos');
  const messagesBox = document.getElementById('chatMessages');
  const input = document.getElementById('chatMessageInput');

  if (icon) icon.textContent = dm ? '@' : c.kind === 'voice' ? '🔊' : '#';
  if (title) title.textContent = nombreCanal(c);
  const arroba = dm ? (c.otro?.username || state.members.find((m) => m.user_id !== state.me?.id)?.profile?.username) : null;
  if (type) type.textContent = dm ? (arroba ? `@${arroba} · Chat privado` : 'Chat privado') : c.kind === 'voice' ? 'Canal de voz' : 'Canal de texto';
  if (input) input.placeholder = dm ? `Escribile a ${nombreCanal(c)}…` : '@ escriba aquí...';

  if (voiceBtn) {
    voiceBtn.style.display = !dm && c.kind === 'voice' ? 'inline-block' : 'none';
    voiceBtn.onclick = () => {
      hooks.joinRoom?.(c.room_code);
      hooks.toast?.(`Entrando a la sala de voz de ${c.name}`);
    };
  }

  // En un chat privado, llamar a la persona sale de la misma cabecera.
  const otro = dm ? c.otro || state.members.find((m) => m.user_id !== state.me?.id)?.profile : null;
  if (callBtn) {
    callBtn.style.display = dm ? 'inline-flex' : 'none';
    callBtn.disabled = !otro || !isOnline(otro);
    callBtn.title = otro && isOnline(otro) ? `Llamar a ${nombreCanal(c)}` : 'No está conectado';
    callBtn.onclick = () => { if (otro) callFriend(otro); };
  }

  // Un chat privado no se comparte con un código: es de a dos y punto.
  if (copyBtn) {
    copyBtn.style.display = dm ? 'none' : 'inline-block';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(c.invite_code).then(() => {
        hooks.toast?.('Código de invitación copiado');
      });
    };
  }

  // Los dos borrados del chat privado, escritos sin eufemismos: uno es de esta PC y el otro
  // es del servidor.
  if (vistaBtn) {
    vistaBtn.style.display = dm ? 'inline-block' : 'none';
    vistaBtn.onclick = () => sacarDeMiVista(c.id);
  }
  if (ambosBtn) {
    ambosBtn.style.display = dm ? 'inline-block' : 'none';
    ambosBtn.onclick = () => borrarParaLosDos(c.id);
  }

  if (closeBtn) {
    closeBtn.onclick = () => closeChannel();
  }

  if (messagesBox) {
    if (c.kind === 'voice') {
      messagesBox.innerHTML = `<p class="sc-empty">Es un canal de voz. Entrá a la sala con el botón de arriba.</p>`;
    } else if (!state.messages.length) {
      messagesBox.innerHTML = `<p class="sc-empty">Sin mensajes todavía. ¡Sé el primero en escribir!</p>`;
    } else {
      messagesBox.innerHTML = state.messages.map(msgItem).join('');
      bindAccionesMensaje(messagesBox);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }
  }
}

// ------------------------------------------------------------------
// Bindings para formularios de la Barra Lateral y Chat
// ------------------------------------------------------------------
function bindSidebarForms() {
  const btnToggleCreate = document.getElementById('btnToggleCreateChannel');
  const channelForms = document.getElementById('sidebarChannelForms');
  if (btnToggleCreate && channelForms && !btnToggleCreate._bound) {
    btnToggleCreate._bound = true;
    btnToggleCreate.addEventListener('click', () => {
      channelForms.style.display = channelForms.style.display === 'none' ? 'flex' : 'none';
    });
  }

  const createForm = document.getElementById('sidebarCreateChannelForm');
  if (createForm && !createForm._bound) {
    createForm._bound = true;
    createForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.session) { toggleDrawer(true); return; }
      const name = document.getElementById('sidebarChannelName').value.trim();
      const kind = document.getElementById('sidebarChannelKind').value;
      if (!name) return;
      act(async () => {
        const created = await api.createChannel(state.me.id, name, kind);
        createForm.reset();
        channelForms.style.display = 'none';
        if (created?.id) openChannel(created.id);
      }, 'Canal creado');
    });
  }

  const joinForm = document.getElementById('sidebarJoinChannelForm');
  if (joinForm && !joinForm._bound) {
    joinForm._bound = true;
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.session) { toggleDrawer(true); return; }
      const code = document.getElementById('sidebarJoinCode').value.trim();
      if (!code) return;
      act(async () => {
        const res = await api.joinChannelByCode(code);
        joinForm.reset();
        channelForms.style.display = 'none';
        if (res?.id) openChannel(res.id);
      }, 'Entraste al canal');
    });
  }

  const btnToggleAdd = document.getElementById('btnToggleAddFriend');
  const friendSearch = document.getElementById('sidebarFriendSearch');
  if (btnToggleAdd && friendSearch && !btnToggleAdd._bound) {
    btnToggleAdd._bound = true;
    btnToggleAdd.addEventListener('click', () => {
      friendSearch.style.display = friendSearch.style.display === 'none' ? 'flex' : 'none';
    });
  }

  const searchForm = document.getElementById('sidebarSearchFriendForm');
  const resultsBox = document.getElementById('sidebarSearchResults');
  if (searchForm && !searchForm._bound) {
    searchForm._bound = true;
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.session) { toggleDrawer(true); return; }
      const q = document.getElementById('sidebarSearchUser').value.trim();
      if (!q) return;
      if (resultsBox) resultsBox.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.3rem;">Buscando...</p>`;
      try {
        const res = await api.searchUsers(q, state.me.id);
        if (!res.length) {
          if (resultsBox) resultsBox.innerHTML = `<p class="sc-muted sc-tiny" style="padding: 0.3rem;">No se encontraron usuarios.</p>`;
          return;
        }
        if (resultsBox) {
          resultsBox.innerHTML = res.map((p) => {
            const rel = state.friendships.find((f) => f.requester_id === p.id || f.addressee_id === p.id);
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; background: rgba(255,255,255,0.03); border-radius: 6px; margin-top: 0.3rem;">
                <div style="font-size: 0.78rem;"><strong>${esc(p.display_name || p.username)}</strong> <span style="color: #64748b;">@${esc(p.username)}</span></div>
                ${rel ? `<small class="sc-muted">${rel.status === 'accepted' ? 'amigo' : 'pendiente'}</small>` : `<button class="sc-primary sc-small" data-search-add="${p.id}" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;">Sumar</button>`}
              </div>
            `;
          }).join('');

          resultsBox.querySelectorAll('[data-search-add]').forEach((b) => {
            b.addEventListener('click', () => act(() => api.sendFriendRequest(state.me.id, b.dataset.searchAdd), 'Solicitud enviada'));
          });
        }
      } catch (err) {
        if (resultsBox) resultsBox.innerHTML = `<p class="sc-error sc-tiny" style="padding: 0.3rem;">${esc(err.message)}</p>`;
      }
    });
  }

  const chatMsgForm = document.getElementById('chatMessageForm');
  const chatMsgInput = document.getElementById('chatMessageInput');
  if (chatMsgForm && !chatMsgForm._bound) {
    chatMsgForm._bound = true;
    chatMsgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentChannel || !state.me) return;
      const text = chatMsgInput.value.trim();
      if (!text) return;
      chatMsgInput.value = '';
      try {
        await api.sendMessage(state.currentChannel.id, state.me.id, text);
      } catch (err) {
        hooks.toast?.(err.message);
      }
    });
  }
}

export function getSocialState() {
  return state;
}
