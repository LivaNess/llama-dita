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
import * as archivos from './adjuntos.js';

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
  porMandar: [],       // archivos elegidos que todavia no se enviaron
  mandando: false,     // hay una subida en curso: no dejar mandar dos veces
  editando: null,      // id del mensaje que se esta editando en linea
  respondiendoA: null, // mensaje al que le vamos a responder
  escribiendo: new Map(), // quien esta escribiendo ahora mismo -> cuando se apaga solo
  busqueda: null,
  incomingCall: null,
  outgoingCall: null,
  unsub: [],
  heartbeat: null,
  ringTimer: null,
  tab: 'amigos'
};

let hooks = {};
let root, drawer, overlay, headerBtn;

// --- Silenciado de Chats y Canales ---
let mutedChats = {};
try {
  mutedChats = JSON.parse(localStorage.getItem('llamadita_muted_chats') || '{}');
} catch (_) {
  mutedChats = {};
}

function saveMutedChats() {
  try {
    localStorage.setItem('llamadita_muted_chats', JSON.stringify(mutedChats));
  } catch (_) {}
}

function isChatMuted(id) {
  if (!id) return false;
  const until = mutedChats[String(id)];
  if (!until) return false;
  if (until === 'always' || until === Infinity || until > Date.now()) return true;
  delete mutedChats[String(id)];
  saveMutedChats();
  return false;
}

function muteChat(id, duration) {
  if (!id) return;
  const until = (duration === 'always' || duration === Infinity) ? 'always' : Date.now() + duration;
  mutedChats[String(id)] = until;
  saveMutedChats();
}

function unmuteChat(id) {
  if (!id) return;
  delete mutedChats[String(id)];
  saveMutedChats();
}

let lastMessageSoundId = null;

async function notificarMensajeEscritorio(fila) {
  if (!fila || fila.author_id === state.me?.id) return;
  if (hooks.getNotificationsEnabled && !hooks.getNotificationsEnabled()) return;
  if (isChatMuted(fila.channel_id) || isChatMuted(fila.author_id)) return;

  // Si la ventana tiene el foco real del SO y estamos en el mismo canal, no notificamos.
  // Pero si la app está minimizada, en segundo plano, en otra pestaña o en otro canal: notificar SIEMPRE.
  const tieneFoco = hooks.isWindowFocused ? await Promise.resolve(hooks.isWindowFocused()) : (document.hasFocus() && !document.hidden);
  if (tieneFoco && state.currentChannel?.id === fila.channel_id) {
    return;
  }

  const canal = state.channels?.find((c) => c.id === fila.channel_id) || state.directos?.get(fila.channel_id);
  const amigo = state.friendships
    ?.map((f) => f.requester_id === state.me?.id ? f.addressee : f.requester)
    ?.find((u) => u?.id === fila.author_id);
  const miembro = state.members?.find((m) => m.user_id === fila.author_id)?.profile;
  const autor = fila.author || amigo || miembro;
  const nombreAutor = autor?.display_name || autor?.username || 'Alguien';

  let titulo = 'Llamadita';
  if (canal) {
    titulo = canal.kind === 'dm' ? nombreAutor : `${nombreAutor} (#${canal.name})`;
  } else {
    titulo = nombreAutor;
  }

  const cuerpo = fila.body
    ? (fila.body.length > 85 ? fila.body.substring(0, 82) + '…' : fila.body)
    : 'Envió un archivo adjunto';

  let avatarUrl = '';
  if (autor?.avatar_key) {
    try { avatarUrl = await archivos.urlParaVer(autor.avatar_key); } catch (_) {}
  }

  hooks.showNativeDesktopNotification?.({
    title: titulo,
    body: cuerpo,
    avatarUrl,
    channelId: fila.channel_id,
    onClick: () => {
      if (fila.channel_id) openChannel(fila.channel_id);
    }
  });
}

function onGlobalMessage(fila) {
  if (!fila || fila.author_id === state.me?.id) return;
  if (hooks.getNotificationsEnabled && !hooks.getNotificationsEnabled()) return;
  if (isChatMuted(fila.channel_id) || isChatMuted(fila.author_id)) return;
  if (lastMessageSoundId === fila.id) return;
  lastMessageSoundId = fila.id;
  hooks.playMessageSound?.();
  notificarMensajeEscritorio(fila);
}


// El emoji de telefono en Windows se dibuja rosa: el boton de llamar parecia de colgar.
// Icono vectorial que toma el color del boton (verde) en vez de traer el suyo.
const ICONO_TELEFONO = `<svg class="sc-icono-tel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const ICONO_COLGAR = `<svg class="sc-icono-tel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randomRoom = () => 'llamadita-' + Math.random().toString(36).substring(2, 8);

function isOnline(p) {
  return !!p && state.online.has(p.id);
}

// La foto de perfil, o las iniciales si todavia no puso ninguna.
//
// Se dibuja vacia con la direccion anotada y despues `pintarImagenes` le pone la direccion
// firmada. Se hace asi porque el permiso de lectura hay que pedirlo: si se pidiera en cada
// redibujado, una lista de 30 amigos serian 30 pedidos cada vez que cambia una presencia.
// `urlParaVer` los guarda una hora en memoria, asi que en la practica es uno por persona.
function fotoDe(perfil, clase = 'sc-foto') {
  const nombre = perfil?.display_name || perfil?.username || '?';
  const iniciales = esc(nombre.slice(0, 2).toUpperCase());
  if (!perfil?.avatar_key) return `<span class="${clase} sin-foto">${iniciales}</span>`;
  return `<span class="${clase}"><img data-key="${esc(perfil.avatar_key)}" alt="${esc(nombre)}" loading="lazy" /></span>`;
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

  const standbyLogin = document.getElementById('standbyLoginContainer');
  if (standbyLogin) {
    standbyLogin.addEventListener('focusout', () => setTimeout(() => {
      if (state.pendingRender && !standbyLogin.contains(document.activeElement)) {
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
    stopMeterLoop();
    stopTestRingtone();
    return;
  }
  const open = force ?? drawer.hidden;
  drawer.hidden = !open;
  overlay.hidden = !open;
  headerBtn.classList.toggle('active', open);
  const userBtn = document.getElementById('btnSidebarUser');
  if (userBtn) userBtn.classList.toggle('active', open);
  if (!open) {
    stopMeterLoop();
    stopTestRingtone();
  } else if (state.tab === 'ajustes') {
    startMeterLoop();
  }
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
  const standbyLogin = document.getElementById('standbyLoginContainer');
  const inDrawer = drawer && !drawer.hidden && a && drawer.contains(a);
  const inStandbyLogin = standbyLogin && a && standbyLogin.contains(a);
  if ((inDrawer || inStandbyLogin) && /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName)) {
    state.pendingRender = true;
    return;
  }
  render();
}

function onLogout() {
  hooks.stopRingtone?.();
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
    { table: 'call_invites', event: 'UPDATE', filter: `callee_id=eq.${uid}`, cb: (p) => onIncomingCallUpdate(p.new) },
    { table: 'messages', event: 'INSERT', cb: (p) => onGlobalMessage(p.new) }
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
  hooks.startRingtone?.();
  let avatarUrl = '';
  if (from?.avatar_key) {
    try { archivos.urlParaVer(from.avatar_key).then((u) => { avatarUrl = u; }); } catch (_) {}
  }
  hooks.showNativeDesktopNotification?.({
    title: 'Llamada entrante',
    body: `${from.display_name || from.username || 'Un amigo'} te está llamando…`,
    avatarUrl
  });
  clearTimeout(state.ringTimer);
  state.ringTimer = setTimeout(() => answerCall('missed'), RING_TIMEOUT_MS);
  render();
}

function onIncomingCallUpdate(row) {
  if (state.incomingCall && row.id === state.incomingCall.id && row.status !== 'ringing') {
    hooks.stopRingtone?.();
    state.incomingCall = null;
    clearTimeout(state.ringTimer);
    render();
  }
}

async function answerCall(status) {
  hooks.stopRingtone?.();
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
      ${['amigos', 'canales', 'perfil', 'ajustes'].map((t) => `<button data-tab="${t}" class="${state.tab === t ? 'active' : ''}">${{ amigos: 'Amigos', canales: 'Canales', perfil: 'Perfil', ajustes: 'Ajustes' }[t]}${t === 'amigos' && pendingCount() ? ` <b class="sc-badge">${pendingCount()}</b>` : ''}</button>`).join('')}
    </nav>
    <div class="sc-body">${{ amigos: friendsView, canales: channelsView, perfil: profileView, ajustes: settingsView }[state.tab]()}</div>`;
  bindMain();
}

function pendingCount() { return state.friendships.filter((f) => f.status === 'pending' && f.addressee_id === state.me.id).length; }

function profileHeader() {
  return `<header class="sc-head">
    <div class="sc-avatar ${state.me.avatar_key ? 'con-foto' : ''}">${state.me.avatar_key
      ? `<img data-key="${esc(state.me.avatar_key)}" alt="${esc(state.me.display_name || state.me.username)}" />`
      : esc((state.me.display_name || state.me.username).slice(0, 2).toUpperCase())}</div>
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
        ${signup ? `
        <div class="sc-consent-row" style="display:flex; align-items:flex-start; gap:0.5rem; margin:0.6rem 0; font-size:0.75rem; color: var(--text-secondary);">
          <input type="checkbox" id="scTermsConsent" style="margin-top:2px; flex-shrink:0;" required />
          <label for="scTermsConsent">Acepto los <a href="https://llamadita.com.ar/terminos/" target="_blank" rel="noopener" style="color:#93c5fd; text-decoration:underline;">Términos</a> y la <a href="https://llamadita.com.ar/privacidad/" target="_blank" rel="noopener" style="color:#93c5fd; text-decoration:underline;">Privacidad</a>.</label>
        </div>` : ''}
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
    if (state.loginMode !== 'login') {
      const consent = container.querySelector('#scTermsConsent');
      if (!consent || !consent.checked) {
        showLoginError('Tenés que aceptar los Términos y la Política de Privacidad para crear tu cuenta.', container);
        return;
      }
    }
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
      <div class="sc-item sc-clickable" data-chat="${p.id}" title="Abrir chat privado">${fotoDe(p)}${statusDot(p)}<div class="sc-item-text"><strong>${esc(p.display_name || p.username)}</strong><small>@${esc(p.username)}</small></div>
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
      <div class="sc-messages" id="scMessages">${state.messages.map(msgItem).join('') || `<p class="sc-empty">Acá todavía no pasó nada.</p>`}</div>
      <form class="sc-row" id="scMsgForm"><input type="text" id="scMsg" placeholder="Escribí un mensaje" maxlength="2000" autocomplete="off" required /><button class="sc-primary sc-small" type="submit">Enviar</button></form>`}
    <h4>Miembros (${state.members.length})</h4>
    ${state.members.map((m) => `<div class="sc-item">${fotoDe(m.profile)}${statusDot(m.profile || {})}<div class="sc-item-text"><strong>${esc(m.profile?.display_name || m.profile?.username || '…')}</strong><small>@${esc(m.profile?.username || '')}${m.role === 'owner' ? ' · dueño' : ''}</small></div>
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

// Una imagen se dibuja adentro de la conversacion; cualquier otra cosa, como un renglon con
// su nombre y su peso. La direccion real se pide despues (vence en una hora), asi que aca solo
// queda anotada la llave y `pintarAdjuntos` la completa.
function adjuntoItem(a) {
  const esFoto = archivos.esImagen(a.mime);
  const peso = archivos.pesoLegible(a.bytes);
  if (esFoto) {
    // El alto se reserva de entrada con las medidas guardadas: sin esto, la conversacion
    // pega un salto cada vez que termina de cargar una imagen.
    const ancho = Math.min(360, a.ancho || 360);
    const alto = a.ancho && a.alto ? Math.round((ancho * a.alto) / a.ancho) : 200;
    return `<button type="button" class="sc-adj-foto" data-ver="${esc(a.object_key)}" data-nombre="${esc(a.nombre)}" style="width:${ancho}px;height:${alto}px" title="${esc(a.nombre)} · ${peso}">
      <img data-key="${esc(a.object_key)}" alt="${esc(a.nombre)}" loading="lazy" />
    </button>`;
  }
  return `<button type="button" class="sc-adj-archivo" data-bajar="${esc(a.object_key)}" data-nombre="${esc(a.nombre)}">
    <span class="sc-adj-icono">⬇</span>
    <span class="sc-adj-texto"><strong>${esc(a.nombre)}</strong><small>${peso}</small></span>
  </button>`;
}

// Formato del texto de un mensaje.
//
// REGLA DE ORO: se escapa PRIMERO y se da formato DESPUES. Al reves, cualquiera manda un
// mensaje con html adentro y se lo ejecuta la app del otro. Por eso `esc()` va antes que todo
// y de aca en adelante ya no hay texto crudo dando vueltas.
function conFormato(texto) {
  let t = esc(texto);

  // Bloques de codigo: se sacan primero y se guardan aparte, para que nada de lo de abajo les
  // toque el contenido (un asterisco adentro de un bloque de codigo es un asterisco).
  const bloques = [];
  t = t.replace(/```([\s\S]*?)```/g, (_, codigo) => {
    bloques.push(codigo.replace(/^\n/, ''));
    return `\u0000BLOQUE${bloques.length - 1}\u0000`;
  });

  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

  // Las direcciones quedan clickeables. `noopener` no es decorativo: sin eso, la pagina que se
  // abre puede manipular la que la abrio.
  t = t.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

  return t.replace(/\u0000BLOQUE(\d+)\u0000/g, (_, i) => `<pre class="sc-codigo">${bloques[Number(i)]}</pre>`);
}

// Las reacciones se muestran agrupadas por emoji, con cuantos son y si vos estas adentro.
function reaccionesItem(m) {
  const lista = m.reacciones || [];
  if (!lista.length) return '';
  const porEmoji = new Map();
  for (const r of lista) {
    const c = porEmoji.get(r.emoji) || { cuantos: 0, mia: false };
    c.cuantos++;
    if (r.user_id === state.me?.id) c.mia = true;
    porEmoji.set(r.emoji, c);
  }
  return `<div class="sc-reacciones">${[...porEmoji.entries()].map(([emoji, c]) =>
    `<button type="button" class="sc-reaccion ${c.mia ? 'mia' : ''}" data-reaccion="${esc(m.id)}" data-emoji="${esc(emoji)}" title="${c.mia ? 'Sacar la tuya' : 'Sumarte'}">${esc(emoji)} ${c.cuantos}</button>`
  ).join('')}<button type="button" class="sc-reaccion sc-reaccion-sumar" data-abrir-emojis="${esc(m.id)}" title="Sumar reacción">+</button></div>`;
}

// La cita del mensaje al que se le responde. Si ese mensaje ya no esta, se dice; no se
// esconde. Borrar un mensaje NO borra las respuestas: seria borrar conversacion ajena.
function citaItem(m) {
  if (!m.reply_to) return '';
  const al = state.messages.find((x) => String(x.id) === String(m.reply_to));
  if (!al) return `<div class="sc-cita ausente">El mensaje al que respond\u00eda ya no est\u00e1</div>`;
  const resumen = al.body ? al.body.slice(0, 90) : (al.adjuntos?.length ? 'un archivo' : '');
  return `<button type="button" class="sc-cita" data-ir="${esc(al.id)}" title="Ir al mensaje">
    <strong>${esc(autorDe(al))}</strong><span>${esc(resumen)}${al.body && al.body.length > 90 ? '\u2026' : ''}</span>
  </button>`;
}

const EMOJIS_RAPIDOS = ['\ud83d\udc4d', '\ud83d\ude02', '\u2764\ufe0f', '\ud83d\udd25', '\ud83d\ude2e', '\ud83d\ude22'];

function msgItem(m) {
  const mine = m.author_id === state.me.id;
  // Lo tuyo lo borrás siempre. Lo ajeno, solo el dueño de un canal, y nunca en un chat
  // privado: si no, el que abrió la conversación podría borrar lo que dijo el otro.
  const puedoBorrar = mine || (!esDirecto(state.currentChannel) && state.currentChannel?.owner_id === state.me.id);
  const puedoFijar = esDirecto(state.currentChannel) || state.currentChannel?.owner_id === state.me.id;
  const editando = String(state.editando || '') === String(m.id);
  const t = new Date(m.created_at);
  const hora = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;

  const cuerpo = editando
    ? `<form class="sc-editor" data-editor="${esc(m.id)}">
         <input type="text" value="${esc(m.body)}" maxlength="2000" />
         <div class="sc-editor-pie"><button type="submit" class="sc-primary sc-small">Guardar</button><button type="button" class="sc-ghost sc-small" data-cancelar-edicion>Cancelar</button><span class="sc-muted sc-tiny">Enter guarda \u00b7 Esc cancela</span></div>
       </form>`
    : m.body ? `<div class="sc-msg-body">${conFormato(m.body)}</div>` : '';

  return `<div class="sc-msg ${mine ? 'mine' : ''} ${m.fijado ? 'fijado' : ''}" data-msg="${esc(m.id)}">
    ${m.fijado ? `<small class="sc-fijado-sello">\ud83d\udccc fijado</small>` : ''}
    <small class="sc-msg-author">${esc(autorDe(m))}</small>
    ${citaItem(m)}
    ${cuerpo}
    ${(m.adjuntos || []).length ? `<div class="sc-msg-adjuntos">${m.adjuntos.map(adjuntoItem).join('')}</div>` : ''}
    ${reaccionesItem(m)}
    <small class="sc-msg-time">${hora}${m.edited_at ? ' · editado' : ''}</small>
    ${editando ? '' : `<div class="sc-msg-acciones">
      <button type="button" class="sc-msg-accion" data-abrir-emojis="${esc(m.id)}" title="Reaccionar">😊</button>
      <button type="button" class="sc-msg-accion" data-responder="${esc(m.id)}" title="Responder">↩</button>
      ${puedoFijar ? `<button type="button" class="sc-msg-accion" data-fijar="${esc(m.id)}" title="${m.fijado ? 'Soltarlo' : 'Fijarlo'}">\ud83d\udccc</button>` : ''}
      ${mine && m.body ? `<button type="button" class="sc-msg-accion" data-editar="${esc(m.id)}" title="Editar el texto">✎</button>` : ''}
      ${puedoBorrar ? `<button type="button" class="sc-msg-accion" data-borrar="${esc(m.id)}" title="Borrar para todos">✕</button>` : ''}
    </div>`}
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
  for (const m of actuales) porId.set(String(m.id), m);

  for (const m of nuevos) {
    const clave = String(m.id);
    const viejo = porId.get(clave);
    // El aviso en vivo trae la fila PELADA: el mensaje sin los archivos que le cuelgan. Si se
    // reemplazara sin mirar, editar el texto de un mensaje con una imagen la hacia desaparecer.
    // Lo que llega manda, pero solo sobre lo que efectivamente trae.
    if (!viejo) { porId.set(clave, m); continue; }
    porId.set(clave, {
      ...viejo,
      ...m,
      adjuntos: m.adjuntos ?? viejo.adjuntos,
      reacciones: m.reacciones ?? viejo.reacciones
    });
  }

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

async function llegoMensaje(channelId, fila, isUpdate = false) {
  // Ya mando: los puntitos se apagan ahora y no a los 7 segundos.
  if (fila.author_id && state.escribiendo.has(fila.author_id)) {
    clearTimeout(state.escribiendo.get(fila.author_id).timer);
    state.escribiendo.delete(fila.author_id);
    pintarEscribiendo();
  }
  if (!isUpdate && fila.author_id && state.me?.id && fila.author_id !== state.me.id) {
    if (hooks.getNotificationsEnabled && !hooks.getNotificationsEnabled()) {
      // Notificaciones desactivadas
    } else if (isChatMuted(channelId) || isChatMuted(fila.author_id)) {
      // Chat silenciado
    } else {
      if (lastMessageSoundId !== fila.id) {
        lastMessageSoundId = fila.id;
        hooks.playMessageSound?.();
      }
      notificarMensajeEscritorio(fila);
    }
  }
  const perfil = state.members.find((m) => m.user_id === fila.author_id)?.profile;
  const m = { ...fila, author: perfil ? { username: perfil.username, display_name: perfil.display_name } : null };
  // Lo que haya llegado antes que el mensaje.
  const esperando = adjuntosHuerfanos.get(String(m.id));
  if (esperando) {
    adjuntosHuerfanos.delete(String(m.id));
    for (const a of esperando) pegarAdjunto(m, a);
  }

  // Si no trae texto ni archivos, es un mensaje de puro archivo cuyo aviso todavia no llego:
  // sin esto quedaria un globo vacio si el aviso se pierde por un parpadeo de la conexion.
  if (!m.body && !m.adjuntos?.length) {
    try { m.adjuntos = await api.adjuntosDe(m.id); } catch (_) {}
  }
  await cache.guardarMensajes([m]);
  await cache.guardarMarca(channelId, marcaMasNueva([m], []));
  if (state.currentChannel?.id !== channelId) return;
  state.messages = mezclar(state.messages, [m]);
  render();
}

// El aviso de un mensaje nuevo trae la fila pelada, sin lo que cuelga de ella. El adjunto
// llega por separado (se inserta en la misma transaccion, asi que es casi al mismo tiempo) y
// se pega al mensaje que ya esta en pantalla.
// El mensaje y su archivo se guardan en la misma transaccion, asi que los dos avisos llegan
// casi juntos, pero no hay garantia de en que orden. Si el archivo llega primero, se guarda
// aca hasta que aparezca su mensaje; si no, un mensaje de texto CON imagen se dibujaba con el
// texto solo.
const adjuntosHuerfanos = new Map(); // id de mensaje -> adjuntos que llegaron antes de tiempo

function pegarAdjunto(m, fila) {
  m.adjuntos = [...(m.adjuntos || []).filter((a) => a.id !== fila.id), fila];
  return m;
}

async function llegoAdjunto(channelId, fila) {
  const m = state.messages.find((x) => String(x.id) === String(fila.message_id));
  if (!m) {
    const clave = String(fila.message_id);
    adjuntosHuerfanos.set(clave, [...(adjuntosHuerfanos.get(clave) || []), fila]);
    // No se guardan para siempre: si el mensaje nunca llega (lo borraron, o no era para
    // nosotros), esto no puede quedar creciendo en memoria.
    setTimeout(() => adjuntosHuerfanos.delete(clave), 30000);
    return;
  }
  pegarAdjunto(m, fila);
  await cache.guardarMensajes([m]);
  if (state.currentChannel?.id !== channelId) return;
  render();
}

async function refrescarReacciones(channelId, messageId) {
  if (!messageId || state.currentChannel?.id !== channelId) return;
  const m = state.messages.find((x) => String(x.id) === String(messageId));
  if (!m) return;
  try { m.reacciones = await api.reaccionesDe(messageId); } catch (_) { return; }
  await cache.guardarMensajes([m]);
  if (state.currentChannel?.id !== channelId) return;
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
    { table: 'messages', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => llegoMensaje(id, p.new, false) },
    { table: 'messages', event: 'UPDATE', filter: `channel_id=eq.${id}`, cb: (p) => llegoMensaje(id, p.new, true) },
    { table: 'message_tombstones', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => llegoBorrado(id, p.new) },
    { table: 'attachments', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => llegoAdjunto(id, p.new) },
    // Las altas se filtran por canal. Las bajas no se pueden filtrar (el aviso de una fila
    // borrada viaja solo con su clave), asi que llegan todas las que tenemos permiso de ver,
    // que son poquitas, y se descartan las de mensajes que no tenemos en pantalla.
    { table: 'reactions', event: 'INSERT', filter: `channel_id=eq.${id}`, cb: (p) => refrescarReacciones(id, p.new?.message_id) },
    { table: 'reactions', event: 'DELETE', cb: (p) => refrescarReacciones(id, p.old?.message_id) },
    { table: 'channel_members', filter: `channel_id=eq.${id}`, cb: async () => { if (state.currentChannel?.id === id) { state.members = await api.listMembers(id); render(); } } }
  ]);
}

async function openChannel(id) {
  cerrarSelectorEmojis();
  const c = buscarCanal(id);
  if (!c) return;
  if (c.id !== state.currentChannel?.id) {
    vaciarBandeja();
    state.respondiendoA = null;
    state.editando = null;
    state.busqueda = null;
    state.escribiendo.clear();
  }
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
  if (conTexto) abrirEscritura(id);
  render();
}

// Abre un chat privado con un perfil. Si ya existia el canal, va directo a esa
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
  cerrarSelectorEmojis();
  if (state.channelUnsub) { state.channelUnsub(); state.channelUnsub = null; }
  cerrarEscritura();
  state.currentChannel = null;
  state.respondiendoA = null;
  state.editando = null;
  state.busqueda = null;
  state.escribiendo.clear();
  vaciarBandeja();
  cerrarVisor();
  render();
}

// ------------------------------------------------------------------
// "Esta escribiendo"
// ------------------------------------------------------------------
// Es la funcion con peor relacion entre lo que aporta y lo que gasta del cupo comun. Si se
// mandara un aviso por tecla, un mensaje de 40 caracteres con 6 personas mirando serian 240
// avisos para anunciar UN mensaje. Con las tres reglas de abajo baja a un 4,5% del cupo.
//
//   1. Cuentagotas de 5 segundos, sin excepcion.
//   2. NO se manda "dejo de escribir": se apaga solo a los 7 segundos del otro lado. Eso
//      ahorra la mitad de los avisos y nadie lo nota.
//   3. No se manda si no hay nadie del otro lado conectado. Si escribis en un canal donde no
//      hay nadie, los puntitos no viajan a ningun lado.
//
// (La regla 3 de la ficha era "nadie MIRANDO ese canal". Sin presencia por canal, lo mas
// cercano que tenemos es "nadie del canal conectado", que ahorra el caso que importa: el canal
// vacio. Queda anotado por si algun dia hay presencia por canal.)
const CUENTAGOTAS_MS = 5000;
const SE_APAGA_MS = 7000;

let avisoEscritura = null;
let ultimoAviso = 0;

function abrirEscritura(channelId) {
  cerrarEscritura();
  const canal = api.canalDeEscritura(channelId, (p) => llegoEscribiendo(channelId, p));
  avisoEscritura = { channelId, ...canal };
}

function cerrarEscritura() {
  try { avisoEscritura?.cerrar(); } catch (_) {}
  avisoEscritura = null;
  ultimoAviso = 0;
  for (const v of state.escribiendo.values()) clearTimeout(v.timer);
  state.escribiendo.clear();
}

function llegoEscribiendo(channelId, payload) {
  if (state.currentChannel?.id !== channelId) return;
  if (!payload?.id || payload.id === state.me?.id) return;
  clearTimeout(state.escribiendo.get(payload.id)?.timer);
  state.escribiendo.set(payload.id, {
    nombre: payload.nombre || 'Alguien',
    timer: setTimeout(() => { state.escribiendo.delete(payload.id); pintarEscribiendo(); }, SE_APAGA_MS)
  });
  pintarEscribiendo();
}

function avisarQueEscribo() {
  if (!avisoEscritura || !state.currentChannel || !state.me) return;
  // Regla 3: si no hay nadie del otro lado, no viaja.
  const hayAlguien = state.members.some((m) => m.user_id !== state.me.id && state.online.has(m.user_id));
  if (!hayAlguien) return;
  // Regla 1: el cuentagotas.
  const ahora = Date.now();
  if (ahora - ultimoAviso < CUENTAGOTAS_MS) return;
  ultimoAviso = ahora;
  try { avisoEscritura.avisar({ id: state.me.id, nombre: state.me.display_name || state.me.username }); } catch (_) {}
}

// Al mandar el mensaje se deja de avisar. No se manda un "ya termine" (regla 2): del otro lado
// los puntitos se apagan solos, y ademas al llegar el mensaje se apagan al toque.
function dejarDeAvisarQueEscribo() { ultimoAviso = 0; }

function pintarEscribiendo() {
  const caja = document.getElementById('chatEscribiendo');
  if (!caja) return;
  const nombres = [...state.escribiendo.values()].map((v) => v.nombre);
  if (!nombres.length) { caja.hidden = true; caja.textContent = ''; return; }
  caja.hidden = false;
  caja.textContent = nombres.length === 1
    ? `${nombres[0]} est\u00e1 escribiendo\u2026`
    : nombres.length === 2
      ? `${nombres[0]} y ${nombres[1]} est\u00e1n escribiendo\u2026`
      : 'Varios est\u00e1n escribiendo\u2026';
}

// ------------------------------------------------------------------
// Buscar en el historial
// ------------------------------------------------------------------
// Primero en lo que ya esta en esta PC, que es instantaneo y no cuesta nada. Al servidor se le
// pregunta solo por lo que nunca bajaste, y los repetidos se descartan por identificador.
async function buscar(termino) {
  const t = (termino || '').trim();
  const canal = state.currentChannel;
  if (!canal) return;
  if (t.length < 2) { state.busqueda = null; render(); return; }

  const local = (await cache.leerMensajes(canal.id, 5000))
    .filter((m) => (m.body || '').toLowerCase().includes(t.toLowerCase()));

  state.busqueda = { termino: t, resultados: local, buscandoAfuera: true };
  render();

  let delServidor = [];
  try { delServidor = await api.buscarEnElServidor(t, canal.id); } catch (_) {}
  if (state.busqueda?.termino !== t) return; // ya escribio otra cosa

  const porId = new Map(local.map((m) => [String(m.id), m]));
  for (const m of delServidor) if (!porId.has(String(m.id))) porId.set(String(m.id), m);

  state.busqueda = {
    termino: t,
    resultados: [...porId.values()].sort((a, b) => hora(b.created_at) - hora(a.created_at)),
    buscandoAfuera: false
  };
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

// Se edita el TEXTO, nunca los archivos: un mensaje que es solo una imagen no tiene nada que
// editar, y por eso ni siquiera muestra el lapiz.
async function editarMensaje(id) {
  const actual = state.messages.find((m) => String(m.id) === String(id));
  if (!actual || !actual.body) return;
  const texto = prompt('Editar el mensaje (los archivos no se tocan):', actual.body);
  if (texto === null || texto.trim() === actual.body) return;
  if (!texto.trim()) {
    hooks.toast?.('Un mensaje no puede quedar vacío. Si lo querés sacar, borralo.');
    return;
  }
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

// Las imagenes se dibujan vacias y despues se les pone la direccion firmada. Se hace asi y no
// al reves porque el permiso de lectura hay que pedirlo, y pedirlo para cada imagen en cada
// redibujado seria un pedido por imagen por render.
// Rellena cualquier imagen diferida: sirve igual para los adjuntos del chat y para las fotos
// de perfil, porque las dos se piden con un permiso que vence.
async function pintarImagenes(contenedor) {
  if (!contenedor) return;
  for (const img of contenedor.querySelectorAll('img[data-key]:not([src])')) {
    const key = img.dataset.key;
    try {
      img.src = await archivos.urlParaVer(key);
    } catch (e) {
      const caja = img.closest('.sc-adj-foto');
      if (caja) {
        caja.classList.add('rota');
        img.replaceWith(Object.assign(document.createElement('span'), {
          className: 'sc-adj-error', textContent: 'No se pudo cargar'
        }));
      } else {
        // Una foto de perfil que no carga no es un problema: se cae a las iniciales.
        const burbuja = img.parentElement;
        if (burbuja) {
          burbuja.classList.add('sin-foto');
          burbuja.textContent = (img.alt || '?').slice(0, 2).toUpperCase();
        }
      }
    }
  }
}

async function pintarAdjuntos(contenedor) {
  if (!contenedor) return;
  await pintarImagenes(contenedor);

  contenedor.querySelectorAll('[data-ver]').forEach((b) => {
    b.onclick = () => abrirVisor(b.dataset.ver, b.dataset.nombre);
  });
  contenedor.querySelectorAll('[data-bajar]').forEach((b) => {
    b.onclick = async () => {
      try { await archivos.descargar(b.dataset.bajar, b.dataset.nombre); }
      catch (e) { hooks.toast?.(e.message); }
    };
  });
}

// ------------------------------------------------------------------
// Lo que esta por mandarse
// ------------------------------------------------------------------
function sumarArchivos(lista) {
  const nuevos = [...(lista || [])].filter(Boolean);
  if (!nuevos.length) return;
  if (!state.currentChannel) { hooks.toast?.('Abrí un chat antes de adjuntar.'); return; }

  for (const file of nuevos) {
    if (state.porMandar.length >= 10) { hooks.toast?.('Hasta diez archivos por mensaje.'); break; }
    if (file.size > archivos.TOPE_POR_ARCHIVO) {
      hooks.toast?.(`"${file.name}" pesa ${archivos.pesoLegible(file.size)} y el tope es 100 MB.`);
      continue;
    }
    const item = { file, avance: 0, vista: null };
    // La miniatura sale del archivo que ya está en memoria: no hace falta subir nada para verla.
    if (archivos.esImagen(file.type)) item.vista = URL.createObjectURL(file);
    state.porMandar.push(item);
  }
  renderBandeja();
  pintarRespondiendo();
  pintarEscribiendo();
  pintarBuscador();
}

function sacarArchivo(i) {
  const [fuera] = state.porMandar.splice(i, 1);
  if (fuera?.vista) URL.revokeObjectURL(fuera.vista);
  renderBandeja();
}

function vaciarBandeja() {
  for (const p of state.porMandar) if (p.vista) URL.revokeObjectURL(p.vista);
  state.porMandar = [];
  renderBandeja();
}

function renderBandeja() {
  const caja = document.getElementById('chatAdjuntos');
  if (!caja) return;
  if (!state.porMandar.length) { caja.style.display = 'none'; caja.innerHTML = ''; return; }

  caja.style.display = 'flex';
  caja.innerHTML = state.porMandar.map((p, i) => `
    <div class="sc-pendiente ${state.mandando ? 'subiendo' : ''}">
      ${p.vista ? `<img src="${p.vista}" alt="" />` : `<span class="sc-pendiente-icono">📄</span>`}
      <div class="sc-pendiente-texto">
        <strong title="${esc(p.file.name)}">${esc(p.file.name)}</strong>
        <small>${archivos.pesoLegible(p.file.size)}</small>
      </div>
      ${state.mandando
        ? `<div class="sc-barra"><i style="width:${Math.round((p.avance || 0) * 100)}%"></i></div>`
        : `<button type="button" class="sc-pendiente-sacar" data-sacar="${i}" title="Sacar">✕</button>`}
    </div>`).join('');

  caja.querySelectorAll('[data-sacar]').forEach((b) => {
    b.onclick = () => sacarArchivo(Number(b.dataset.sacar));
  });
}

// El unico camino de salida de un mensaje, lo use el cajon o la pantalla grande.
async function mandarMensaje(texto, devolverTexto) {
  const c = state.currentChannel;
  if (!c || !state.me || state.mandando) return;

  const pendientes = state.porMandar;
  if (!texto.trim() && !pendientes.length) return;

  const responde = state.respondiendoA?.id || null;

  if (!pendientes.length) {
    try {
      await api.sendMessage(c.id, state.me.id, texto, null, responde);
      state.respondiendoA = null;
      dejarDeAvisarQueEscribo();
      render();
    } catch (e) { hooks.toast?.(e.message); devolverTexto?.(texto); }
    return;
  }

  state.mandando = true;
  renderBandeja();
  try {
    // Se suben de a uno: con varios a la vez, la barra no dice nada útil y una conexión
    // hogareña de subida se satura igual.
    const fichas = [];
    for (const p of pendientes) {
      fichas.push(await archivos.subir(p.file, c.id, {
        alAvanzar: (v) => { p.avance = v; renderBandeja(); }
      }));
    }
    await api.enviarConArchivos(c.id, texto, fichas);
    state.mandando = false;
    state.respondiendoA = null;
    dejarDeAvisarQueEscribo();
    vaciarBandeja();
    // Red de seguridad para el que manda: en vez de confiar en que los avisos en vivo lleguen
    // completos y en orden, se le pide al servidor lo que cambio. Es una consulta chica y se
    // hace solo al mandar un archivo, no en cada mensaje.
    if (state.currentChannel?.id === c.id) { await sincronizar(c.id); render(); }
  } catch (e) {
    state.mandando = false;
    renderBandeja();
    hooks.toast?.(e.message);
    devolverTexto?.(texto);
  }
}

// Cambiar (o sacar) la foto de perfil.
//
// El borrado de la anterior NO se hace desde aca: lo hace un disparador de la base cuando ve
// que `avatar_key` cambio. Asi vale para todos los caminos (cambiarla, sacarla, borrar la
// cuenta) sin que la app tenga que acordarse en cada uno.
async function cambiarFoto(file) {
  if (!state.me || state.cambiandoFoto) return;
  state.cambiandoFoto = true;
  try {
    const key = file ? await archivos.subirAvatar(file) : null;
    state.me = await api.updateMyProfile(state.me.id, { avatar_key: key });
    // La foto vieja ya no existe: si quedara su permiso guardado, se seguiria viendo un rato.
    archivos.olvidarPermisos();
    hooks.toast?.(file ? 'Foto actualizada.' : 'Foto sacada.');
  } catch (e) {
    hooks.toast?.(e.message);
  } finally {
    state.cambiandoFoto = false;
    render();
  }
}

// ------------------------------------------------------------------
// El visor de imagenes
// ------------------------------------------------------------------
async function abrirVisor(key, nombre) {
  const visor = document.getElementById('visorImagen');
  const img = document.getElementById('visorImg');
  if (!visor || !img) return;
  document.getElementById('visorNombre').textContent = nombre || '';
  visor.hidden = false;
  try { img.src = await archivos.urlParaVer(key); }
  catch (e) { hooks.toast?.(e.message); visor.hidden = true; return; }
  document.getElementById('visorBajar').onclick = () => archivos.descargar(key, nombre).catch((e) => hooks.toast?.(e.message));
}

function cerrarVisor() {
  const visor = document.getElementById('visorImagen');
  if (!visor || visor.hidden) return;
  visor.hidden = true;
  document.getElementById('visorImg').removeAttribute('src'); // soltar la imagen grande
}

// Los botones de cada mensaje, que aparecen tanto en el cajón como en la pantalla grande.
function bindAccionesMensaje(contenedor) {
  if (!contenedor) return;

  contenedor.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = () => { if (confirm('¿Borrar este mensaje? Se va de verdad, para todos.')) borrarMensaje(b.dataset.borrar); };
  });

  // Editar es en linea: el globo se convierte en un campo de texto y listo.
  contenedor.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => { state.editando = b.dataset.editar; render(); };
  });
  contenedor.querySelectorAll('[data-cancelar-edicion]').forEach((b) => {
    b.onclick = () => { state.editando = null; render(); };
  });
  contenedor.querySelectorAll('[data-editor]').forEach((form) => {
    const campo = form.querySelector('input');
    campo?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { state.editando = null; render(); } });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const id = form.dataset.editor;
      const texto = campo.value;
      const antes = state.messages.find((m) => String(m.id) === String(id));
      state.editando = null;
      if (!texto.trim()) { hooks.toast?.('Un mensaje no puede quedar vacío. Si lo querés sacar, borralo.'); render(); return; }
      if (antes && texto.trim() === antes.body) { render(); return; }
      render();
      try { await api.editMessage(id, texto); } catch (err) { hooks.toast?.(err.message); }
    };
    setTimeout(() => { campo?.focus(); campo?.setSelectionRange(campo.value.length, campo.value.length); }, 0);
  });

  contenedor.querySelectorAll('[data-responder]').forEach((b) => {
    b.onclick = () => {
      state.respondiendoA = state.messages.find((m) => String(m.id) === String(b.dataset.responder)) || null;
      pintarRespondiendo();
      document.getElementById('chatMessageInput')?.focus();
    };
  });

  contenedor.querySelectorAll('[data-fijar]').forEach((b) => {
    b.onclick = async () => {
      const m = state.messages.find((x) => String(x.id) === String(b.dataset.fijar));
      try { await api.fijarMensaje(b.dataset.fijar, !m?.fijado); }
      catch (e) { hooks.toast?.(e.message); }
    };
  });

  contenedor.querySelectorAll('[data-reaccion]').forEach((b) => {
    b.onclick = () => alternarReaccion(b.dataset.reaccion, b.dataset.emoji);
  });

  contenedor.querySelectorAll('[data-abrir-emojis]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      abrirSelectorEmojis(b.dataset.abrirEmojis, b);
    };
  });

  // Ir al mensaje citado: se lo lleva a la vista y se lo marca un segundo.
  contenedor.querySelectorAll('[data-ir]').forEach((b) => {
    b.onclick = () => {
      const destino = contenedor.querySelector(`[data-msg="${CSS.escape(b.dataset.ir)}"]`);
      if (!destino) return;
      destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
      destino.classList.add('resaltado');
      setTimeout(() => destino.classList.remove('resaltado'), 1200);
    };
  });
}

// Reaccionar es un interruptor: si ya estaba la tuya, la saca.
async function alternarReaccion(messageId, emoji) {
  const m = state.messages.find((x) => String(x.id) === String(messageId));
  if (!m || !state.currentChannel) return;
  const yaEsta = (m.reacciones || []).some((r) => r.emoji === emoji && r.user_id === state.me.id);

  // Se dibuja al toque y despues se manda: esperar el ida y vuelta para ver un emoji se nota.
  m.reacciones = yaEsta
    ? (m.reacciones || []).filter((r) => !(r.emoji === emoji && r.user_id === state.me.id))
    : [...(m.reacciones || []), { emoji, user_id: state.me.id }];
  render();

  try {
    if (yaEsta) await api.sacarReaccion(messageId, state.me.id, emoji);
    else await api.reaccionar(messageId, state.currentChannel.id, state.me.id, emoji);
  } catch (e) {
    hooks.toast?.(e.message);
    // No salió: se vuelve a lo que dice el servidor en vez de dejar una mentira en pantalla.
    try { m.reacciones = await api.reaccionesDe(messageId); } catch (_) {}
    render();
  }
}

const LISTA_EMOJIS_PICKER = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬',
  '😮','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤','😡','😠','🤬',
  '😎','🤓','🧐','🥳','🤠','🤡','👻','💀','👽','🤖',
  '👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','👌','🤌','🤏',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❣️','💕','💞','💓','💗','💖','💘','💝',
  '🔥','✨','⭐','🌟','💥','🎉','🎊','🎈','🏆','🥇','🚀','💯','👀','🧠','⚡','💡','🎯','🍕','🍻','☕'
];

let selectorEmojisActivo = null;

function cerrarSelectorEmojis() {
  if (selectorEmojisActivo) {
    try { selectorEmojisActivo.popover.remove(); } catch (_) {}
    try { selectorEmojisActivo.parentAcciones?.classList.remove('forzar-visible'); } catch (_) {}
    document.removeEventListener('pointerdown', selectorEmojisActivo.onPointerDown);
    document.removeEventListener('keydown', selectorEmojisActivo.onKeyDown);
    selectorEmojisActivo = null;
  }
}

function abrirSelectorEmojis(messageId, triggerBtn) {
  if (selectorEmojisActivo && selectorEmojisActivo.messageId === messageId) {
    cerrarSelectorEmojis();
    return;
  }
  cerrarSelectorEmojis();

  const parentAcciones = triggerBtn.closest('.sc-msg-acciones');
  parentAcciones?.classList.add('forzar-visible');

  const popover = document.createElement('div');
  popover.className = 'sc-emoji-picker-popover';
  popover.innerHTML = `
    <div class="sc-emoji-picker-header">
      <span class="sc-emoji-picker-title">Reaccionar</span>
      <button type="button" class="sc-emoji-picker-close" title="Cerrar">✕</button>
    </div>
    <div class="sc-emoji-picker-quick">
      ${EMOJIS_RAPIDOS.map((e) => `<button type="button" class="sc-emoji-picker-quick-item" data-pick-emoji="${e}" title="${e}">${e}</button>`).join('')}
    </div>
    <div class="sc-emoji-picker-grid">
      ${LISTA_EMOJIS_PICKER.map((emoji) => `<button type="button" class="sc-emoji-picker-item" data-pick-emoji="${emoji}">${emoji}</button>`).join('')}
    </div>
  `;

  document.body.appendChild(popover);

  const rect = triggerBtn.getBoundingClientRect();
  const popoverWidth = 290;
  const popoverHeight = 270;

  let top = rect.top - popoverHeight - 8;
  if (top < 10) {
    top = rect.bottom + 8;
  }

  let left = rect.right - popoverWidth;
  if (left < 10) {
    left = 10;
  } else if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }

  popover.style.top = `${Math.max(10, Math.round(top))}px`;
  popover.style.left = `${Math.max(10, Math.round(left))}px`;

  const onPointerDown = (e) => {
    if (!popover.contains(e.target) && !triggerBtn.contains(e.target)) {
      cerrarSelectorEmojis();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      cerrarSelectorEmojis();
    }
  };

  popover.querySelector('.sc-emoji-picker-close').onclick = () => cerrarSelectorEmojis();

  popover.querySelectorAll('[data-pick-emoji]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const emoji = btn.dataset.pickEmoji;
      cerrarSelectorEmojis();
      alternarReaccion(messageId, emoji);
    };
  });

  setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  }, 10);

  selectorEmojisActivo = {
    messageId,
    popover,
    parentAcciones,
    onPointerDown,
    onKeyDown
  };
}

// ---- Perfil ----
function profileView() {
  return `<div class="sc-foto-editor">
      ${fotoDe(state.me, 'sc-foto-grande')}
      <div class="sc-foto-acciones">
        <input type="file" id="scFotoInput" accept="image/*" hidden />
        <button class="sc-primary sc-small" type="button" id="scCambiarFoto">${state.me.avatar_key ? 'Cambiarla' : 'Ponerla'}</button>
        ${state.me.avatar_key ? `<button class="sc-ghost sc-small" type="button" id="scSacarFoto">Sacarla</button>` : ''}
        <p class="sc-muted sc-tiny">Se recorta cuadrada y se achica sola. La anterior se borra: no se van juntando.</p>
      </div>
    </div>
    <form id="scProfileForm" class="sc-form">
    <label>Nombre visible</label><input type="text" id="scDisplayName" value="${esc(state.me.display_name)}" maxlength="40" />
    <label>Usuario (letras, números y _)</label><input type="text" id="scUsername" value="${esc(state.me.username)}" maxlength="20" pattern="[a-z0-9_]{3,20}" />
    <p class="sc-muted sc-tiny">Tus amigos te encuentran por el usuario. Mail: ${esc(state.session.user.email)}</p>
    <button class="sc-primary" type="submit">Guardar</button>
    <button class="sc-ghost" type="button" id="scLogout">Cerrar sesión</button>
  </form>`;
}

// ---- Ajustes ----
let meterAnimFrame = null;

function stopMeterLoop() {
  if (meterAnimFrame) {
    cancelAnimationFrame(meterAnimFrame);
    meterAnimFrame = null;
  }
}

let isTestingRingtone = false;
function stopTestRingtone() {
  if (isTestingRingtone) {
    isTestingRingtone = false;
    hooks.stopRingtone?.();
    const btn = drawer?.querySelector('#btnTestRingtone');
    if (btn) {
      btn.classList.remove('active');
      const icon = btn.querySelector('.sc-sound-btn-icon');
      const label = btn.querySelector('.sc-sound-btn-label');
      if (icon) icon.textContent = '▶';
      if (label) label.textContent = 'Probar';
    }
  }
}

function startMeterLoop() {
  stopMeterLoop();
  if (state.tab !== 'ajustes' || !drawer || drawer.hidden) return;

  const bar = drawer.querySelector('#scMeterBar');
  const badge = drawer.querySelector('#scVoiceBadge');
  const levelText = drawer.querySelector('#scCurrentLevel');
  if (!bar) return;

  const loop = () => {
    if (state.tab !== 'ajustes' || !drawer || drawer.hidden) {
      meterAnimFrame = null;
      return;
    }

    const raw = hooks.getRawMetrics ? hooks.getRawMetrics() : null;
    if (raw) {
      const vol = raw.volume;
      bar.style.width = `${vol}%`;

      const isVoice = hooks.isVoiceDetected ? hooks.isVoiceDetected(raw) : false;
      if (badge) {
        if (isVoice) {
          if (!badge.classList.contains('speaking')) {
            badge.classList.add('speaking');
            badge.textContent = 'Hablando';
          }
        } else {
          if (badge.classList.contains('speaking')) {
            badge.classList.remove('speaking');
            badge.textContent = 'Silencio';
          }
        }
      }

      if (levelText) {
        levelText.textContent = `Nivel: ${raw.db} dB`;
      }
    }

    meterAnimFrame = requestAnimationFrame(loop);
  };

  meterAnimFrame = requestAnimationFrame(loop);
}

async function populateAudioInputs(selectEl) {
  if (!selectEl) return;
  try {
    const devices = hooks.getAudioInputs ? await hooks.getAudioInputs() : [];
    const currentId = hooks.getCurrentAudioInput ? hooks.getCurrentAudioInput() : null;

    if (!devices || devices.length === 0) {
      selectEl.innerHTML = `<option value="">Micrófono predeterminado del sistema</option>`;
      return;
    }

    selectEl.innerHTML = devices.map((d, index) => {
      const label = d.label || `Micrófono ${index + 1}`;
      const isSelected = (currentId && d.deviceId === currentId) || (!currentId && index === 0);
      return `<option value="${esc(d.deviceId)}" ${isSelected ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
  } catch (err) {
    console.warn('Error listando micrófonos:', err);
    selectEl.innerHTML = `<option value="">Micrófono predeterminado</option>`;
  }
}

function settingsView() {
  const thresholdDb = hooks.getVoiceThreshold ? hooks.getVoiceThreshold() : -34;
  const thresholdPct = Math.max(0, Math.min(100, Math.round(((thresholdDb + 55) / 52) * 100)));
  const msgSound = hooks.getMessageSoundType ? hooks.getMessageSoundType() : 'bubble';
  const notifyEnabled = hooks.getNotificationsEnabled ? hooks.getNotificationsEnabled() : true;
  const ringVol = hooks.getRingtoneVolume ? hooks.getRingtoneVolume() : 0.85;
  const msgVol = hooks.getMessageVolume ? hooks.getMessageVolume() : 0.85;

  return `<div class="sc-settings">
    <div class="sc-settings-group">
      <div class="sc-settings-title">
        <span>Micrófono de entrada</span>
      </div>
      <select id="scAudioInput" class="sc-select">
        <option value="">Cargando micrófonos…</option>
      </select>
    </div>

    <div class="sc-settings-group">
      <div class="sc-settings-title">
        <span>Umbral de activación de voz</span>
        <span class="sc-voice-badge" id="scVoiceBadge">Silencio</span>
      </div>

      <div class="sc-meter-wrap" id="scMeterWrap">
        <div class="sc-meter-bar" id="scMeterBar"></div>
        <div class="sc-meter-marker" id="scMeterMarker" style="left: ${thresholdPct}%;"></div>
      </div>

      <div class="sc-meter-status">
        <span id="scCurrentLevel">Nivel: - dB</span>
        <span id="scThresholdLabel">Corte: ${thresholdDb} dB</span>
      </div>

      <div class="sc-slider-row">
        <input type="range" id="scVoiceThreshold" class="sc-slider" min="-50" max="-18" step="1" value="${thresholdDb}" />
      </div>

      <p class="sc-muted sc-tiny">
        La <b>línea roja</b> marca cuándo se activa el micrófono. Ajustala para que el ruido ambiente quede a la izquierda (silencio) y tu voz la supere al hablar (verde), cortando cualquier estática automáticamente.
      </p>
    </div>

    <div class="sc-settings-group">
      <div class="sc-settings-title">
        <span>Tono de llamada entrante</span>
      </div>
      <div class="sc-sound-row">
        <div class="sc-sound-info">
          <strong>Llamadita Clásica</strong>
          <span class="sc-muted sc-tiny">Marimba melódica</span>
        </div>
        <button type="button" id="btnTestRingtone" class="sc-sound-btn ${isTestingRingtone ? 'active' : ''}">
          <span class="sc-sound-btn-icon">${isTestingRingtone ? '⏹' : '▶'}</span>
          <span class="sc-sound-btn-label">${isTestingRingtone ? 'Detener' : 'Probar'}</span>
        </button>
      </div>
      <div class="sc-vol-row">
        <span>Volumen de llamada</span>
        <span id="scRingtoneVolLabel">${Math.round(ringVol * 100)}%</span>
      </div>
      <div class="sc-slider-row">
        <input type="range" id="scRingtoneVol" class="sc-slider" min="0" max="100" step="1" value="${Math.round(ringVol * 100)}" />
      </div>
    </div>

    <div class="sc-settings-group">
      <div class="sc-settings-title">
        <span>Sonido de mensaje</span>
      </div>
      <label class="sc-toggle-row">
        <span>Notificaciones de sonido</span>
        <input type="checkbox" id="scNotifyEnabled" ${notifyEnabled ? 'checked' : ''} />
      </label>
      <div class="sc-sound-row">
        <select id="scMsgSound" class="sc-select">
          <option value="bubble" ${msgSound === 'bubble' ? 'selected' : ''}>Burbuja (Pop suave)</option>
          <option value="mini_dna" ${msgSound === 'mini_dna' ? 'selected' : ''}>Mini ADN (Do# - Re#)</option>
          <option value="wood" ${msgSound === 'wood' ? 'selected' : ''}>Toque de Madera / Marimba</option>
          <option value="droplet" ${msgSound === 'droplet' ? 'selected' : ''}>Gota de agua</option>
          <option value="chime" ${msgSound === 'chime' ? 'selected' : ''}>Campana de Cristal</option>
          <option value="coin" ${msgSound === 'coin' ? 'selected' : ''}>Moneda Arcade 8-bit</option>
          <option value="none" ${msgSound === 'none' ? 'selected' : ''}>Silencio (Desactivado)</option>
        </select>
        <button type="button" id="btnTestMsgSound" class="sc-sound-btn" title="Escuchar sonido">
          <span>▶</span>
        </button>
      </div>
      <div class="sc-vol-row">
        <span>Volumen de mensaje</span>
        <span id="scMsgVolLabel">${Math.round(msgVol * 100)}%</span>
      </div>
      <div class="sc-slider-row">
        <input type="range" id="scMsgVol" class="sc-slider" min="0" max="100" step="1" value="${Math.round(msgVol * 100)}" />
      </div>
    </div>

    <!-- Legal y Privacidad -->
    <div class="sc-setting-card" style="margin-top: 1rem; border-color: rgba(143,166,255,0.18);">
      <div class="sc-setting-title">Legal y Privacidad</div>
      <p style="font-size: 0.74rem; color: var(--text-muted, #94a3b8); margin-bottom: 0.6rem; line-height: 1.4;">
        Llamadita protege tus datos personales (Ley 25.326). Las llamadas de voz viajan cifradas punto a punto y no se graban.
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 0.7rem; font-size: 0.76rem;">
        <a href="https://llamadita.com.ar/terminos/" target="_blank" rel="noopener" style="color: #93c5fd; text-decoration: underline;">Términos</a>
        <span style="color: var(--text-muted, #64748b);">·</span>
        <a href="https://llamadita.com.ar/privacidad/" target="_blank" rel="noopener" style="color: #93c5fd; text-decoration: underline;">Privacidad</a>
        <span style="color: var(--text-muted, #64748b);">·</span>
        <a href="https://llamadita.com.ar/cookies/" target="_blank" rel="noopener" style="color: #93c5fd; text-decoration: underline;">Cookies</a>
        <span style="color: var(--text-muted, #64748b);">·</span>
        <a href="https://llamadita.com.ar/reembolsos/" target="_blank" rel="noopener" style="color: #93c5fd; text-decoration: underline;">Reembolsos y Baja</a>
      </div>
    </div>
  </div>`;
}

// ---- Eventos ----
function bindMain() {
  const q = (s) => drawer.querySelector(s);
  q('#scClose')?.addEventListener('click', () => toggleDrawer(false));
  drawer.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    if (state.tab !== 'ajustes') {
      stopMeterLoop();
      stopTestRingtone();
    }
    render();
  }));
  q('#scStatus')?.addEventListener('change', async (e) => { state.me.status = e.target.value; state.presence?.track({ status: myStatus() }); await api.setStatus(state.me.id, e.target.value); });

  // ajustes
  if (state.tab === 'ajustes') {
    const audioSelect = q('#scAudioInput');
    populateAudioInputs(audioSelect);
    audioSelect?.addEventListener('change', async (e) => {
      const devId = e.target.value;
      if (hooks.changeAudioDevice) {
        await hooks.changeAudioDevice(devId);
        hooks.toast?.('Micrófono cambiado');
      }
    });

    const threshSlider = q('#scVoiceThreshold');
    const threshMarker = q('#scMeterMarker');
    const threshLabel = q('#scThresholdLabel');
    threshSlider?.addEventListener('input', (e) => {
      const db = Number(e.target.value);
      if (hooks.setVoiceThreshold) {
        hooks.setVoiceThreshold(db);
      }
      const pct = Math.max(0, Math.min(100, Math.round(((db + 55) / 52) * 100)));
      if (threshMarker) threshMarker.style.left = `${pct}%`;
      if (threshLabel) threshLabel.textContent = `Corte: ${db} dB`;
    });

    const btnRingtone = q('#btnTestRingtone');
    btnRingtone?.addEventListener('click', () => {
      if (isTestingRingtone) {
        stopTestRingtone();
      } else {
        isTestingRingtone = true;
        hooks.startRingtone?.();
        btnRingtone.classList.add('active');
        const icon = btnRingtone.querySelector('.sc-sound-btn-icon');
        const label = btnRingtone.querySelector('.sc-sound-btn-label');
        if (icon) icon.textContent = '⏹';
        if (label) label.textContent = 'Detener';
      }
    });

    const ringVolSlider = q('#scRingtoneVol');
    const ringVolLabel = q('#scRingtoneVolLabel');
    ringVolSlider?.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      if (hooks.setRingtoneVolume) hooks.setRingtoneVolume(pct / 100);
      if (ringVolLabel) ringVolLabel.textContent = `${pct}%`;
    });

    const notifyCheck = q('#scNotifyEnabled');
    notifyCheck?.addEventListener('change', (e) => {
      if (hooks.setNotificationsEnabled) hooks.setNotificationsEnabled(e.target.checked);
      if (e.target.checked && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (_) {}
      }
    });

    const msgSoundSelect = q('#scMsgSound');
    msgSoundSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (hooks.setMessageSoundType) hooks.setMessageSoundType(val);
      if (hooks.playMessageSound) hooks.playMessageSound(val);
    });

    const btnTestMsg = q('#btnTestMsgSound');
    btnTestMsg?.addEventListener('click', () => {
      const val = msgSoundSelect ? msgSoundSelect.value : (hooks.getMessageSoundType?.() || 'bubble');
      if (hooks.playMessageSound) hooks.playMessageSound(val);
    });

    const msgVolSlider = q('#scMsgVol');
    const msgVolLabel = q('#scMsgVolLabel');
    msgVolSlider?.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      if (hooks.setMessageVolume) hooks.setMessageVolume(pct / 100);
      if (msgVolLabel) msgVolLabel.textContent = `${pct}%`;
    });

    startMeterLoop();
  }

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
    await mandarMensaje(text, (t) => { input.value = t; });
  });
  const msgs = q('#scMessages');
  if (msgs) { bindAccionesMensaje(msgs); pintarAdjuntos(msgs); msgs.scrollTop = msgs.scrollHeight; }
  pintarImagenes(drawer);
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
  // ---- La foto de perfil ----
  const fotoInput = q('#scFotoInput');
  q('#scCambiarFoto')?.addEventListener('click', () => fotoInput?.click());
  fotoInput?.addEventListener('change', async () => {
    const file = fotoInput.files?.[0];
    fotoInput.value = '';
    if (!file) return;
    await cambiarFoto(file);
  });
  q('#scSacarFoto')?.addEventListener('click', () => {
    if (confirm('¿Sacar tu foto de perfil? La imagen se borra del servidor, no queda guardada.')) cambiarFoto(null);
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
  const standbyLogin = document.getElementById('standbyLoginContainer');
  const sidebarLogin = document.getElementById('sidebarLoginContainer');
  const sidebarScrollable = document.getElementById('sidebarScrollable');
  const sidebarUserFooter = document.getElementById('sidebarUserFooter');

  const standbyTitle = document.getElementById('standbyTitle');
  const standbyDesc = document.getElementById('standbyDesc');

  if (!isLogged) {
    document.body.classList.add('is-logged-out');

    if (sidebarLogin) {
      sidebarLogin.style.display = 'none';
      sidebarLogin.innerHTML = '';
    }
    if (sidebarScrollable) sidebarScrollable.style.display = 'none';
    if (sidebarUserFooter) sidebarUserFooter.style.display = 'none';

    if (standbyTitle) standbyTitle.textContent = '¿Otra vez chateando solo, en serio?';
    if (standbyDesc) standbyDesc.textContent = 'Iniciá sesión o creá tu cuenta para acceder al programa, canales y llamadas.';

    if (standbyLogin) {
      standbyLogin.style.display = 'block';
      standbyLogin.innerHTML = loginView({ isSidebar: true });
      bindLogin(standbyLogin);
    }

    return;
  }

  // Usuario autenticado
  document.body.classList.remove('is-logged-out');
  if (standbyLogin) {
    standbyLogin.style.display = 'none';
    standbyLogin.innerHTML = '';
  }
  if (sidebarLogin) {
    sidebarLogin.style.display = 'none';
    sidebarLogin.innerHTML = '';
  }
  if (sidebarScrollable) sidebarScrollable.style.display = '';
  if (sidebarUserFooter) sidebarUserFooter.style.display = '';

  if (standbyTitle) standbyTitle.textContent = 'Sin sesión activa';
  if (standbyDesc) standbyDesc.textContent = 'Seleccioná un canal de texto en la barra lateral o llamá a un amigo.';

  const channelsList = document.getElementById('sidebarChannelsList');
  const friendsList = document.getElementById('sidebarFriendsList');
  const requestsList = document.getElementById('sidebarRequestsList');
  const userAvatar = document.getElementById('sidebarUserAvatar');
  const userName = document.getElementById('sidebarUserName');
  const userHandle = document.getElementById('sidebarUserHandle');

  // 1. Pie de Usuario
  const name = state.me.display_name || state.me.username;
  const initials = name.slice(0, 2).toUpperCase();
  if (userAvatar) {
    if (state.me.avatar_key) {
      userAvatar.innerHTML = `<img data-key="${esc(state.me.avatar_key)}" alt="${esc(name)}" />`;
      userAvatar.classList.add('con-foto');
    } else {
      userAvatar.textContent = initials;
      userAvatar.classList.remove('con-foto');
    }
  }
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
        const muted = isChatMuted(c.id);
        return `
          <button class="sidebar-channel-item ${isActive ? 'active' : ''}" data-sidebar-channel="${c.id}" title="${esc(c.name)} (${c.kind === 'voice' ? 'Voz' : 'Texto'})${muted ? ' · Silenciado' : ''} · Clic derecho para opciones">
            <span class="channel-kind">${icon}</span>
            <span class="channel-name">${esc(c.name)}</span>
            ${muted ? `<span class="sc-chat-muted-icon" title="Notificaciones silenciadas">🔕</span>` : ''}
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
        friendsList.innerHTML = friends.map(({ f, p }) => {
          const isSelected = esDirecto(state.currentChannel) && state.currentChannel?.otro?.id === p.id;
          const inCall = hooks.isCallActiveWith ? hooks.isCallActiveWith(p) : false;
          const muted = isChatMuted(p.id);
          return `
            <div class="sidebar-friend-item sc-clickable ${isSelected ? 'active' : ''}" data-sidebar-dm="${p.id}" role="button" tabindex="0" title="${isSelected ? 'Cerrar chat' : 'Abrir chat privado'} con ${esc(p.display_name || p.username)}${muted ? ' · Silenciado' : ''} · Clic derecho para opciones">
              ${fotoDe(p)}
              ${statusDot(p)}
              <div class="friend-info">
                <span class="friend-name">${esc(p.display_name || p.username)}</span>
                <span class="friend-handle">@${esc(p.username)}</span>
              </div>
              ${muted ? `<span class="sc-chat-muted-icon" title="Notificaciones silenciadas">🔕</span>` : ''}
              ${inCall ? `
                <button class="btn-friend-call in-call" data-sidebar-hangup="${p.id}" title="Colgar llamada">${ICONO_COLGAR}</button>
              ` : `
                <button class="btn-friend-call" data-sidebar-call="${p.id}" title="Llamar" ${isOnline(p) ? '' : 'disabled'}>${ICONO_TELEFONO}</button>
              `}
            </div>
          `;
        }).join('');

        friendsList.querySelectorAll('[data-sidebar-call]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const friend = friends.find((x) => x.p.id === b.dataset.sidebarCall)?.p;
            if (friend) callFriend(friend);
          });
        });

        friendsList.querySelectorAll('[data-sidebar-hangup]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            hooks.hangup?.();
          });
        });

        // El cuerpo del renglón abre o cierra la conversación privada si ya está abierta
        friendsList.querySelectorAll('[data-sidebar-dm]').forEach((el) => {
          const friendId = el.dataset.sidebarDm;
          const friend = friends.find((x) => x.p.id === friendId)?.p;
          if (friend) {
            el.addEventListener('contextmenu', (e) => showFriendContextMenu(e, friend));
          }
          const alternar = () => {
            const friendId = el.dataset.sidebarDm;
            if (esDirecto(state.currentChannel) && state.currentChannel?.otro?.id === friendId) {
              closeChannel();
            } else {
              const friend = friends.find((x) => x.p.id === friendId)?.p;
              if (friend) abrirChatPrivado(friend);
            }
          };
          el.addEventListener('click', (e) => {
            if (!e.target.closest('[data-sidebar-call]') && !e.target.closest('[data-sidebar-hangup]')) alternar();
          });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              alternar();
            }
          });
        });
      }
    }
  }

  // Lo ultimo: rellenar las fotos. La barra se redibuja entera en cada render, asi que los
  // `img` vuelven a salir vacios y hay que volver a pedirles la direccion firmada (que se
  // guarda una hora en memoria, asi que en la practica es un pedido por persona).
  pintarImagenes(friendsList);
  pintarImagenes(userAvatar);
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

  const isMuted = isChatMuted(channel.id);

  function renderMainMenu() {
    menu.innerHTML = `
      <button type="button" data-action="copy">
        <span>📋 Copiar invitación</span>
      </button>
      <div class="menu-divider"></div>
      ${isMuted ? `
        <button type="button" data-action="unmute">
          <span>🔔 Reactivar notificaciones</span>
        </button>
      ` : `
        <button type="button" data-action="mute-menu">
          <span>🔕 Silenciar notificaciones ›</span>
        </button>
      `}
      <div class="menu-divider"></div>
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
    bindMenuEvents();
  }

  function renderMuteMenu() {
    menu.innerHTML = `
      <div class="submenu-header">Silenciar notificaciones</div>
      <button type="button" data-mute-duration="3600000"><span>⏱️ Por 1 hora</span></button>
      <button type="button" data-mute-duration="86400000"><span>📅 Por 1 día</span></button>
      <button type="button" data-mute-duration="604800000"><span>📆 Por 1 semana</span></button>
      <button type="button" data-mute-duration="always"><span>🔕 Siempre</span></button>
      <div class="menu-divider"></div>
      <button type="button" data-action="back"><span>← Volver</span></button>
    `;
    bindSubmenuEvents();
  }

  function bindMenuEvents() {
    menu.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      menu.remove();
      navigator.clipboard.writeText(channel.invite_code).then(() => {
        hooks.toast?.('Código de invitación copiado');
      });
    });

    menu.querySelector('[data-action="unmute"]')?.addEventListener('click', () => {
      menu.remove();
      unmuteChat(channel.id);
      hooks.toast?.('Notificaciones reactivadas');
      render();
    });

    menu.querySelector('[data-action="mute-menu"]')?.addEventListener('click', () => {
      renderMuteMenu();
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
  }

  function bindSubmenuEvents() {
    menu.querySelectorAll('[data-mute-duration]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dur = btn.dataset.muteDuration === 'always' ? 'always' : Number(btn.dataset.muteDuration);
        muteChat(channel.id, dur);
        hooks.toast?.('Canal silenciado');
        render();
        menu.remove();
      });
    });
    menu.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      renderMainMenu();
    });
  }

  renderMainMenu();
  document.body.appendChild(menu);

  const x = Math.min(e.clientX, window.innerWidth - 210);
  const y = Math.min(e.clientY, window.innerHeight - 170);
  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;

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
// Menú Contextual para Amigos (Clic derecho en sidebar)
// ------------------------------------------------------------------
function showFriendContextMenu(e, friend) {
  e.preventDefault();
  e.stopPropagation();

  document.getElementById('channelContextMenu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'channelContextMenu';
  menu.className = 'channel-context-menu';

  const isMuted = isChatMuted(friend.id);

  function renderMainMenu() {
    menu.innerHTML = `
      <button type="button" data-action="chat">
        <span>💬 Abrir chat privado</span>
      </button>
      <button type="button" data-action="call">
        <span>📞 Llamar</span>
      </button>
      <div class="menu-divider"></div>
      ${isMuted ? `
        <button type="button" data-action="unmute">
          <span>🔔 Reactivar notificaciones</span>
        </button>
      ` : `
        <button type="button" data-action="mute-menu">
          <span>🔕 Silenciar notificaciones ›</span>
        </button>
      `}
      <div class="menu-divider"></div>
      <button type="button" data-action="remove-friend" class="danger">
        <span>🗑️ Eliminar de amigos</span>
      </button>
    `;
    bindMenuEvents();
  }

  function renderMuteMenu() {
    menu.innerHTML = `
      <div class="submenu-header">Silenciar notificaciones</div>
      <button type="button" data-mute-duration="3600000"><span>⏱️ Por 1 hora</span></button>
      <button type="button" data-mute-duration="86400000"><span>📅 Por 1 día</span></button>
      <button type="button" data-mute-duration="604800000"><span>📆 Por 1 semana</span></button>
      <button type="button" data-mute-duration="always"><span>🔕 Siempre</span></button>
      <div class="menu-divider"></div>
      <button type="button" data-action="back"><span>← Volver</span></button>
    `;
    bindSubmenuEvents();
  }

  function bindMenuEvents() {
    menu.querySelector('[data-action="chat"]')?.addEventListener('click', () => {
      menu.remove();
      abrirChatPrivado(friend);
    });
    menu.querySelector('[data-action="call"]')?.addEventListener('click', () => {
      menu.remove();
      callFriend(friend);
    });
    menu.querySelector('[data-action="unmute"]')?.addEventListener('click', () => {
      menu.remove();
      unmuteChat(friend.id);
      hooks.toast?.('Notificaciones reactivadas');
      render();
    });
    menu.querySelector('[data-action="mute-menu"]')?.addEventListener('click', () => {
      renderMuteMenu();
    });
    menu.querySelector('[data-action="remove-friend"]')?.addEventListener('click', () => {
      menu.remove();
      const f = state.friendships.find((x) => x.requester_id === friend.id || x.addressee_id === friend.id);
      if (f && confirm(`¿Seguro que querés eliminar a ${friend.display_name || friend.username} de tus amigos?`)) {
        act(() => api.removeFriendship(f.id));
      }
    });
  }

  function bindSubmenuEvents() {
    menu.querySelectorAll('[data-mute-duration]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dur = btn.dataset.muteDuration === 'always' ? 'always' : Number(btn.dataset.muteDuration);
        muteChat(friend.id, dur);
        hooks.toast?.('Chat silenciado');
        render();
        menu.remove();
      });
    });
    menu.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      renderMainMenu();
    });
  }

  renderMainMenu();
  document.body.appendChild(menu);

  const x = Math.min(e.clientX, window.innerWidth - 210);
  const y = Math.min(e.clientY, window.innerHeight - 170);
  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;

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
  const menuWrapper = document.getElementById('chatMenuWrapper');
  const menuBtn = document.getElementById('btnChatMenu');
  const dropdownMenu = document.getElementById('chatDropdownMenu');
  const btnEliminarChat = document.getElementById('btnChatEliminarChat');
  const messagesBox = document.getElementById('chatMessages');
  const input = document.getElementById('chatMessageInput');

  const otro = dm ? c.otro || state.members.find((m) => m.user_id !== state.me?.id)?.profile : null;

  if (icon) {
    if (dm) {
      if (otro?.avatar_key) {
        icon.innerHTML = `<img data-key="${esc(otro.avatar_key)}" alt="${esc(nombreCanal(c))}" class="chat-channel-avatar" />`;
        pintarImagenes(icon);
      } else {
        icon.textContent = '@';
      }
    } else {
      icon.textContent = c.kind === 'voice' ? '🔊' : '#';
    }
  }

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

  // En un chat privado: botón de llamada que conmuta a "Colgar" si ya se está en llamada con él.
  const inCall = dm && otro && hooks.isCallActiveWith ? hooks.isCallActiveWith(otro) : false;
  if (callBtn) {
    callBtn.style.display = dm ? 'inline-flex' : 'none';
    if (inCall) {
      callBtn.classList.add('in-call');
      callBtn.disabled = false;
      callBtn.title = 'Colgar llamada';
      callBtn.innerHTML = `${ICONO_COLGAR}<span>Colgar</span>`;
      callBtn.onclick = () => { hooks.hangup?.(); };
    } else {
      callBtn.classList.remove('in-call');
      callBtn.disabled = !otro || !isOnline(otro);
      callBtn.title = otro && isOnline(otro) ? `Llamar a ${nombreCanal(c)}` : 'No está conectado';
      callBtn.innerHTML = `${ICONO_TELEFONO}<span>Llamar</span>`;
      callBtn.onclick = () => { if (otro) callFriend(otro); };
    }
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

  // El menú de opciones del chat. Empezó siendo solo de los privados; ahora también vive en
  // los canales de texto, porque adentro están buscar y la retención, que no son cosa de los
  // privados. Los items que solo aplican a un privado se esconden solos.
  if (menuWrapper) {
    menuWrapper.style.display = c.kind === 'voice' ? 'none' : 'inline-block';
  }
  if (dropdownMenu) {
    dropdownMenu.style.display = 'none';
  }
  if (menuBtn && !menuBtn._bound) {
    menuBtn._bound = true;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.style.display === 'none' || !dropdownMenu.style.display;
      dropdownMenu.style.display = isHidden ? 'block' : 'none';
      menuBtn.setAttribute('aria-expanded', String(isHidden));
    });

    document.addEventListener('click', (e) => {
      if (dropdownMenu && !menuWrapper.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const cerrarMenu = () => { if (dropdownMenu) dropdownMenu.style.display = 'none'; };

  if (btnEliminarChat) {
    // Solo en un privado: en un canal, "salir" o "borrar el canal" ya viven en su ficha.
    btnEliminarChat.style.display = dm ? '' : 'none';
    btnEliminarChat.onclick = () => { cerrarMenu(); sacarDeMiVista(c.id); };
  }

  // La otra mitad del borrado, la que sí toca el servidor. Es la decisión de Martín: dos
  // acciones separadas y escritas sin eufemismos, una de esta PC y otra del servidor.
  const btnAmbos = document.getElementById('btnChatBorrarAmbos');
  if (btnAmbos) {
    btnAmbos.style.display = dm ? '' : 'none';
    btnAmbos.onclick = () => { cerrarMenu(); borrarParaLosDos(c.id); };
  }

  const btnBuscarMenu = document.getElementById('btnChatBuscar');
  if (btnBuscarMenu) btnBuscarMenu.onclick = () => { cerrarMenu(); abrirBuscador(); };

  const btnRetencionMenu = document.getElementById('btnChatRetencion');
  if (btnRetencionMenu) btnRetencionMenu.onclick = () => { cerrarMenu(); alternarRetencion(); };

  if (closeBtn) {
    closeBtn.onclick = () => closeChannel();
  }

  renderBandeja();
  pintarRespondiendo();
  pintarBuscador();
  pintarEscribiendo();

  if (messagesBox) {
    if (state.busqueda) {
      const r = state.busqueda.resultados;
      messagesBox.innerHTML = r.length
        ? `<p class="sc-buscando">Resultados de “${esc(state.busqueda.termino)}”</p>` + r.map(msgItem).join('')
        : `<p class="sc-empty">Nada con “${esc(state.busqueda.termino)}”.</p>`;
      bindAccionesMensaje(messagesBox);
      pintarAdjuntos(messagesBox);
      messagesBox.scrollTop = 0;
    } else if (c.kind === 'voice') {
      messagesBox.innerHTML = `<p class="sc-empty">Es un canal de voz. Entrá a la sala con el botón de arriba.</p>`;
    } else if (!state.messages.length) {
      messagesBox.innerHTML = `<p class="sc-empty">Acá todavía no pasó nada.</p>`;
    } else {
      messagesBox.innerHTML = state.messages.map(msgItem).join('');
      bindAccionesMensaje(messagesBox);
      pintarAdjuntos(messagesBox);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }
  }
}

function pintarRespondiendo() {
  const caja = document.getElementById('chatRespondiendo');
  if (!caja) return;
  const m = state.respondiendoA;
  if (!m) { caja.hidden = true; caja.innerHTML = ''; return; }
  const resumen = m.body ? m.body.slice(0, 100) : (m.adjuntos?.length ? 'un archivo' : '');
  caja.hidden = false;
  caja.innerHTML = `
    <span class="chat-respondiendo-icono">↩</span>
    <span class="chat-respondiendo-texto">Respondi\u00e9ndole a <strong>${esc(autorDe(m))}</strong>: \u201c${esc(resumen)}${m.body && m.body.length > 100 ? '\u2026' : ''}\u201d</span>
    <button type="button" class="chat-respondiendo-cancelar" id="chatRespondiendoCancelar" title="Cancelar respuesta">\u2715 Cancelar</button>
  `;
  caja.querySelector('#chatRespondiendoCancelar').onclick = () => {
    state.respondiendoA = null;
    pintarRespondiendo();
    document.getElementById('chatMessageInput')?.focus();
  };
}

function pintarBuscador() {
  const caja = document.getElementById('chatBuscador');
  const info = document.getElementById('chatBuscarInfo');
  if (!caja) return;
  caja.hidden = !state.busqueda && !caja.dataset.abierto;
  if (!info) return;
  if (!state.busqueda) { info.textContent = ''; return; }
  const n = state.busqueda.resultados.length;
  info.textContent = state.busqueda.buscandoAfuera
    ? `${n} en esta PC, mirando el resto\u2026`
    : n === 0 ? 'Nada' : n === 1 ? '1 resultado' : `${n} resultados`;
}

function abrirBuscador() {
  const buscador = document.getElementById('chatBuscador');
  const campo = document.getElementById('chatBuscarInput');
  if (!buscador || !campo) return;
  if (buscador.dataset.abierto === '1') { cerrarBuscador(); return; }
  buscador.dataset.abierto = '1';
  buscador.hidden = false;
  campo.value = '';
  campo.focus();
}

function alternarRetencion() {
  const caja = document.getElementById('chatRetencion');
  if (!caja) return;
  if (!caja.hidden) { caja.hidden = true; return; }
  pintarRetencion();
  caja.hidden = false;
}

function cerrarBuscador() {
  const buscador = document.getElementById('chatBuscador');
  if (buscador) { buscador.dataset.abierto = ''; buscador.hidden = true; }
  state.busqueda = null;
  render();
}

// Cuanto se guarda en este canal. El texto y los adjuntos vencen por separado a proposito: el
// texto es barato y lo queres tener, las imagenes son el volumen.
const OPCIONES_RETENCION = [
  { valor: '', texto: 'Para siempre' },
  { valor: '365', texto: '1 a\u00f1o' },
  { valor: '90', texto: '90 d\u00edas' },
  { valor: '30', texto: '30 d\u00edas' },
  { valor: '7', texto: '7 d\u00edas' },
  { valor: '1', texto: '24 horas' }
];

function pintarRetencion() {
  const caja = document.getElementById('chatRetencion');
  const c = state.currentChannel;
  if (!caja || !c) return;

  const puedo = esDirecto(c) || c.owner_id === state.me?.id;
  const opciones = (sel, conSiempre) => OPCIONES_RETENCION
    .filter((o) => conSiempre || o.valor !== '')
    .map((o) => `<option value="${o.valor}" ${String(sel ?? '') === o.valor ? 'selected' : ''}>${o.texto}</option>`).join('');

  caja.innerHTML = `
    <div class="chat-retencion-fila">
      <label>Los mensajes</label>
      <select id="retTexto" ${puedo ? '' : 'disabled'}>${opciones(c.retencion_texto_dias, true)}</select>
      <label>Los archivos</label>
      <select id="retAdjuntos" ${puedo ? '' : 'disabled'}>${opciones(c.retencion_adjuntos_dias ?? 90, false)}</select>
      ${puedo ? `<button type="button" class="sc-primary sc-small" id="retGuardar">Guardar</button>` : ''}
      <button type="button" class="sc-ghost sc-small" id="retCerrar">Cerrar</button>
    </div>
    <p class="sc-muted sc-tiny">Lo que vence se borra de verdad, del servidor y del almacenamiento. El texto pesa poco y conviene guardarlo; las im\u00e1genes son las que llenan el espacio.${puedo ? '' : ' Esto lo cambia el due\u00f1o del canal.'}</p>`;

  caja.querySelector('#retCerrar').onclick = () => { caja.hidden = true; };
  const guardar = caja.querySelector('#retGuardar');
  if (guardar) guardar.onclick = async () => {
    const texto = caja.querySelector('#retTexto').value;
    const adj = caja.querySelector('#retAdjuntos').value;
    try {
      await api.definirRetencion(c.id, texto === '' ? null : Number(texto), Number(adj));
      c.retencion_texto_dias = texto === '' ? null : Number(texto);
      c.retencion_adjuntos_dias = Number(adj);
      hooks.toast?.('Listo. Lo vencido se limpia solo.');
      caja.hidden = true;
    } catch (e) { hooks.toast?.(e.message); }
  };
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
      const text = chatMsgInput.value;
      // Ya no se exige texto: un mensaje puede ser solo una imagen.
      if (!text.trim() && !state.porMandar.length) return;
      chatMsgInput.value = '';
      await mandarMensaje(text, (t) => { chatMsgInput.value = t; });
    });
  }

  // ---- El clip ----
  const clip = document.getElementById('btnChatAdjuntar');
  const fileInput = document.getElementById('chatFileInput');
  if (clip && fileInput && !clip._bound) {
    clip._bound = true;
    clip.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      sumarArchivos(fileInput.files);
      fileInput.value = ''; // si no, elegir dos veces el mismo archivo no dispara nada
    });
  }

  // ---- Pegar una captura con Ctrl+V ----
  // Es la forma en que esto se usa de verdad: apretar Impr Pant y pegar. El navegador entrega
  // la captura como un archivo sin nombre, asi que se le pone uno legible.
  if (chatMsgInput && !chatMsgInput._pegar) {
    chatMsgInput._pegar = true;
    chatMsgInput.addEventListener('paste', (e) => {
      const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file');
      if (!items.length) return;
      e.preventDefault();
      const ahora = new Date();
      const sello = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')} ${String(ahora.getHours()).padStart(2, '0')}.${String(ahora.getMinutes()).padStart(2, '0')}.${String(ahora.getSeconds()).padStart(2, '0')}`;
      const pegados = items.map((i) => {
        const f = i.getAsFile();
        if (!f) return null;
        if (f.name && f.name !== 'image.png') return f;
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        return new File([f], `captura ${sello}.${ext}`, { type: f.type });
      });
      sumarArchivos(pegados);
    });
  }

  // ---- Arrastrar y soltar sobre la conversacion ----
  const vistaChat = document.getElementById('channelChatView');
  const cartel = document.getElementById('chatSoltar');
  if (vistaChat && !vistaChat._soltar) {
    vistaChat._soltar = true;
    let encima = 0; // los eventos de entrar/salir tambien saltan al pasar sobre los hijos
    const traeArchivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

    vistaChat.addEventListener('dragenter', (e) => {
      if (!traeArchivos(e) || !state.currentChannel) return;
      e.preventDefault();
      encima++;
      if (cartel) cartel.hidden = false;
    });
    vistaChat.addEventListener('dragover', (e) => { if (traeArchivos(e)) e.preventDefault(); });
    vistaChat.addEventListener('dragleave', () => {
      encima = Math.max(0, encima - 1);
      if (!encima && cartel) cartel.hidden = true;
    });
    vistaChat.addEventListener('drop', (e) => {
      if (!traeArchivos(e)) return;
      e.preventDefault();
      encima = 0;
      if (cartel) cartel.hidden = true;
      sumarArchivos(e.dataTransfer.files);
    });
  }

  // ---- Avisar que estoy escribiendo ----
  if (chatMsgInput && !chatMsgInput._escribiendo) {
    chatMsgInput._escribiendo = true;
    chatMsgInput.addEventListener('input', () => { if (chatMsgInput.value.trim()) avisarQueEscribo(); });
  }

  // ---- La barra del buscador ----
  // El boton que la abre vive en el menu de opciones del chat y se engancha en `renderChat`.
  const buscarInput = document.getElementById('chatBuscarInput');
  if (buscarInput && !buscarInput._bound) {
    buscarInput._bound = true;
    document.getElementById('chatBuscarCerrar')?.addEventListener('click', cerrarBuscador);
    let demora;
    buscarInput.addEventListener('input', () => {
      clearTimeout(demora);
      // Se espera a que deje de tipear: sin esto, cada tecla seria una consulta al servidor.
      demora = setTimeout(() => buscar(buscarInput.value), 300);
    });
    buscarInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarBuscador(); });
  }

  // ---- El visor ----
  const visorCerrarBtn = document.getElementById('visorCerrar');
  const visor = document.getElementById('visorImagen');
  if (visorCerrarBtn && !visorCerrarBtn._bound) {
    visorCerrarBtn._bound = true;
    visorCerrarBtn.addEventListener('click', cerrarVisor);
    visor?.addEventListener('click', (e) => { if (e.target === visor) cerrarVisor(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarVisor(); });
  }
}

export function getSocialState() {
  return state;
}

export function updateSocialCallState() {
  renderSidebar();
  renderChat();
}

export function openSocialChannel(id) {
  return openChannel(id);
}

if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (state.tab === 'ajustes' && drawer && !drawer.hidden) {
      populateAudioInputs(drawer.querySelector('#scAudioInput'));
    }
  });
}
