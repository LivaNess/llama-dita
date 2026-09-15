// Panel social: cuenta, amigos, canales y llamadas directas.
// Se monta solo (no toca el layout existente) y habla con la app por `hooks`:
//   hooks.joinRoom(code)      -> cambia la sala de voz P2P
//   hooks.getRoom()           -> sala actual
//   hooks.setLocalName(name)  -> nombre visible en la cabina local
//   hooks.toast(msg)          -> aviso corto
import './social.css';
import { getSession, onAuthChange, sendCode, verifyCode, signOut } from './auth.js';
import * as api from './api.js';

const RING_TIMEOUT_MS = 45000;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

const state = {
  session: null,
  me: null,
  friendships: [],
  channels: [],
  members: [],
  messages: [],
  currentChannel: null,
  incomingCall: null,
  outgoingCall: null,
  unsub: [],
  heartbeat: null,
  ringTimer: null,
  tab: 'amigos'
};

let hooks = {};
let root, drawer, overlay, headerBtn;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randomRoom = () => 'llamadita-' + Math.random().toString(36).substring(2, 8);

function isOnline(p) {
  if (!p || p.status === 'offline') return false;
  const seen = p.last_seen_at ? Date.parse(p.last_seen_at) : 0;
  return Date.now() - seen < ONLINE_WINDOW_MS;
}

function statusDot(p) {
  const on = isOnline(p);
  const cls = on ? (p.status === 'dnd' ? 'dnd' : p.status === 'idle' ? 'idle' : 'online') : 'offline';
  const label = on ? ({ online: 'Conectado', idle: 'Ausente', dnd: 'No molestar' }[p.status] || 'Conectado') : 'Desconectado';
  return `<span class="sc-dot ${cls}" title="${label}"></span>`;
}

// ------------------------------------------------------------------
// Montaje
// ------------------------------------------------------------------
export async function initSocial(h) {
  hooks = h;
  mount();
  state.session = await getSession();
  onAuthChange(async (session) => {
    const wasLogged = !!state.session;
    state.session = session;
    if (session && !wasLogged) await onLogin();
    if (!session && wasLogged) onLogout();
    render();
  });
  if (state.session) await onLogin();
  render();
  // Primera vez / sin sesión: abrir el panel para que cree la cuenta con su mail.
  if (!state.session) setTimeout(() => toggleDrawer(true), 600);
}

function mount() {
  root = document.createElement('div');
  root.id = 'socialRoot';
  document.body.appendChild(root);

  headerBtn = document.createElement('button');
  headerBtn.className = 'btn-invite sc-header-btn';
  headerBtn.id = 'btnSocialToggle';
  headerBtn.title = 'Cuenta, amigos y canales';
  headerBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Crear cuenta</span>`;
  headerBtn.addEventListener('click', () => toggleDrawer());
  (document.querySelector('.room-actions') || document.querySelector('.app-header') || document.body).appendChild(headerBtn);

  overlay = document.createElement('div');
  overlay.className = 'sc-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', () => toggleDrawer(false));
  root.appendChild(overlay);

  drawer = document.createElement('aside');
  drawer.className = 'sc-drawer';
  drawer.hidden = true;
  root.appendChild(drawer);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) toggleDrawer(false); });
}

function toggleDrawer(force) {
  const open = force ?? drawer.hidden;
  drawer.hidden = !open;
  overlay.hidden = !open;
  headerBtn.classList.toggle('active', open);
}

// ------------------------------------------------------------------
// Sesión
// ------------------------------------------------------------------
async function onLogin() {
  const uid = state.session.user.id;
  try {
    state.me = await api.getMyProfile(uid);
  } catch (e) {
    // El perfil lo crea un trigger al registrarse; si tardó un instante, reintentamos.
    await new Promise((r) => setTimeout(r, 800));
    state.me = await api.getMyProfile(uid);
  }
  hooks.setLocalName?.(state.me.display_name || state.me.username);
  await api.setStatus(uid, 'online');
  state.heartbeat = setInterval(() => api.setStatus(uid, state.me?.status === 'offline' ? 'online' : state.me.status), 60000);
  window.addEventListener('beforeunload', () => api.setStatus(uid, 'offline'));
  await Promise.all([refreshFriends(), refreshChannels()]);
  subscribeAll(uid);
  headerBtn.querySelector('span').textContent = state.me.display_name || state.me.username;
}

function onLogout() {
  state.unsub.forEach((u) => { try { u(); } catch (_) {} });
  state.unsub = [];
  clearInterval(state.heartbeat);
  Object.assign(state, { me: null, friendships: [], channels: [], members: [], messages: [], currentChannel: null, incomingCall: null, outgoingCall: null });
  headerBtn.querySelector('span').textContent = 'Crear cuenta';
  setTimeout(() => toggleDrawer(true), 300);
}

function subscribeAll(uid) {
  state.unsub.push(api.subscribe('social-' + uid, [
    { table: 'friendships', cb: () => refreshFriends().then(render) },
    { table: 'profiles', event: 'UPDATE', cb: (p) => onProfileChange(p.new) },
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
  if (state.currentChannel && !state.channels.find((c) => c.id === state.currentChannel.id)) state.currentChannel = null;
}

// ------------------------------------------------------------------
// Llamadas directas
// ------------------------------------------------------------------
function otherSide(f) { return f.requester_id === state.me.id ? f.addressee : f.requester; }

async function callFriend(friendProfile) {
  const room = randomRoom();
  hooks.joinRoom?.(room);
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
      hooks.joinRoom?.(call.room_code);
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
  renderCallBanner();
  if (!state.session) { drawer.innerHTML = loginView(); bindLogin(); return; }
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
function loginView() {
  const step = state.loginEmail ? 2 : 1;
  return `<div class="sc-login">
    <div class="sc-row"><h2>Creá tu cuenta</h2><button class="sc-icon-btn" id="scCloseLogin" title="Cerrar">✕</button></div>
    <p class="sc-muted">Solo con tu mail, sin contraseña. Te mandamos un código y un enlace: con cualquiera de los dos entrás. Si ya tenés cuenta, es el mismo paso con el mismo mail.</p>
    ${step === 1 ? `
      <form id="scEmailForm">
        <label>Tu mail</label>
        <input type="email" id="scEmail" placeholder="vos@ejemplo.com" autocomplete="email" required />
        <button class="sc-primary" type="submit">Crear cuenta / Entrar</button>
      </form>` : `
      <form id="scCodeForm">
        <p class="sc-ok">Listo, revisá <b>${esc(state.loginEmail)}</b> (también spam).</p>
        <label>Código del mail, o pegá el enlace completo</label>
        <input type="text" id="scCode" placeholder="123456" autocomplete="one-time-code" required />
        <button class="sc-primary" type="submit">Entrar</button>
        <button class="sc-link" type="button" id="scBack">Usar otro mail</button>
      </form>`}
    <p class="sc-error" id="scLoginError" hidden></p>
  </div>`;
}

function bindLogin() {
  drawer.querySelector('#scEmailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { state.loginEmail = await sendCode(drawer.querySelector('#scEmail').value); render(); }
    catch (err) { showLoginError(err.message); btn.disabled = false; }
  });
  drawer.querySelector('#scCodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await verifyCode(state.loginEmail, drawer.querySelector('#scCode').value); state.loginEmail = null; }
    catch (err) { showLoginError(err.message); btn.disabled = false; }
  });
  drawer.querySelector('#scBack')?.addEventListener('click', () => { state.loginEmail = null; render(); });
  drawer.querySelector('#scCloseLogin')?.addEventListener('click', () => toggleDrawer(false));
  drawer.querySelector('#scEmail')?.focus();
  drawer.querySelector('#scCode')?.focus();
}

function showLoginError(msg) {
  const el = drawer.querySelector('#scLoginError');
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
      <div class="sc-item">${statusDot(p)}<div class="sc-item-text"><strong>${esc(p.display_name || p.username)}</strong><small>@${esc(p.username)}</small></div>
        <button class="sc-call sc-small" data-call="${p.id}" title="Llamar" ${isOnline(p) ? '' : 'disabled'}>📞</button>
        <button class="sc-ghost sc-small" data-remove="${f.id}" title="Quitar amigo">✕</button></div>`).join('')
      : `<p class="sc-empty">Todavía no tenés amigos agregados. Buscá a alguien por su nombre de usuario.</p>`}
    ${sent.length ? `<h4>Solicitudes enviadas</h4>${sent.map((f) => `
      <div class="sc-item"><div class="sc-item-text"><strong>${esc(f.addressee.display_name || f.addressee.username)}</strong><small>@${esc(f.addressee.username)} · pendiente</small></div>
        <button class="sc-ghost sc-small" data-remove="${f.id}">Cancelar</button></div>`).join('')}` : ''}`;
}

// ---- Canales ----
function channelsView() {
  if (state.currentChannel) return channelDetail();
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

function msgItem(m) {
  const mine = m.author_id === state.me.id;
  const t = new Date(m.created_at);
  return `<div class="sc-msg ${mine ? 'mine' : ''}"><small>${esc(m.author?.display_name || m.author?.username || '')} · ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}</small><div>${esc(m.body)}</div></div>`;
}

async function openChannel(id) {
  const c = state.channels.find((x) => x.id === id);
  if (!c) return;
  state.currentChannel = c;
  state.members = [];
  state.messages = [];
  render();
  [state.members, state.messages] = await Promise.all([api.listMembers(id), c.kind === 'text' ? api.listMessages(id) : Promise.resolve([])]);
  if (state.channelUnsub) state.channelUnsub();
  state.channelUnsub = api.subscribe('chan-' + id, [
    { table: 'messages', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: async (p) => {
      if (state.currentChannel?.id !== id) return;
      const author = state.members.find((m) => m.user_id === p.new.author_id)?.profile;
      state.messages.push({ ...p.new, author });
      render();
    } },
    { table: 'channel_members', filter: `channel_id=eq.${id}`, cb: async () => { if (state.currentChannel?.id === id) { state.members = await api.listMembers(id); render(); } } }
  ]);
  render();
}

function closeChannel() {
  if (state.channelUnsub) { state.channelUnsub(); state.channelUnsub = null; }
  state.currentChannel = null;
  render();
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
  q('#scStatus')?.addEventListener('change', async (e) => { state.me.status = e.target.value; await api.setStatus(state.me.id, e.target.value); });

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
  drawer.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', () => {
    const p = state.friendships.map(otherSide).find((x) => x.id === b.dataset.call);
    if (p) callFriend(p);
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
  const msgs = q('#scMessages'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
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
  q('#scLogout')?.addEventListener('click', async () => { await api.setStatus(state.me.id, 'offline'); await signOut(); });
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
    el.innerHTML = `<span class="sc-ring">📞</span><div><strong>${esc(c.from.display_name || c.from.username)}</strong> te está llamando</div>
      <button class="sc-primary sc-small" id="scAccept">Atender</button><button class="sc-danger sc-small" id="scDecline">Rechazar</button>`;
    el.querySelector('#scAccept').onclick = () => answerCall('accepted');
    el.querySelector('#scDecline').onclick = () => answerCall('declined');
  } else {
    const c = state.outgoingCall;
    el.innerHTML = `<span class="sc-ring">📞</span><div>Llamando a <strong>${esc(c.profile?.display_name || c.profile?.username || '')}</strong>…</div>
      <button class="sc-danger sc-small" id="scCancel">Cancelar</button>`;
    el.querySelector('#scCancel').onclick = cancelOutgoing;
  }
}
