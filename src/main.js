import { audioManager } from './audio/audioManager.js';
import { PeerManager } from './network/peerManager.js';
import { initSocial, updateSocialCallState, getSocialState, openSocialChannel, closeSocialChannel, leaveSocialVoiceChannel } from './social/panel.js';
import { urlParaVer, obtenerAvatarCache } from './social/adjuntos.js';
import { initUpdater } from './updater.js';
import { initDeepLink } from './social/deeplink.js';
import { createElasticSlider } from './components/elasticSlider.js';

// DOM Elements
const audioPermissionBanner = document.getElementById('audioPermissionBanner');
const btnActivateAudio = document.getElementById('btnActivateAudio');

const callStatus = document.getElementById('callStatus');
const btnLeaveCall = document.getElementById('btnLeaveCall');
const studioCallBar = document.getElementById('studioCallBar');
const btnMinimizeCall = document.getElementById('btnMinimizeCall');

// Mini dock de llamada en barra lateral (Posición 2 del croquis)
const sidebarCallMiniDock = document.getElementById('sidebarCallMiniDock');
const sidebarCallMiniTitle = document.getElementById('sidebarCallMiniTitle');
const sidebarCallMiniTimer = document.getElementById('sidebarCallMiniTimer');
const btnSidebarCallHangup = document.getElementById('btnSidebarCallHangup');
let isCallViewMinimized = false;

// Estado de canal de voz y participantes múltiples (Malla WebRTC hasta 5 personas)
let activeVoiceChannel = null;
const remotePeerSessions = new Map(); // peerId -> session data
const remoteAudioContainer = document.getElementById('remoteAudioContainer');

// La cabecera dice con quién estás hablando, no en qué sala técnica estás.
let conQuien = null;
let conQuienAvatarKey = null;
function setCallStatus(texto) { if (callStatus) callStatus.textContent = texto; }

// Local Booth DOM
const hostBooth = document.getElementById('hostBooth');
const hostUserName = document.getElementById('hostUserName');
const hostAvatarContent = document.getElementById('hostAvatarContent');
const hostVocalAura = document.getElementById('hostVocalAura');
const hostAvatarDisc = document.getElementById('hostAvatarDisc');
const hostElasticSliderMount = document.getElementById('hostElasticSlider');
const sensitivityVal = document.getElementById('sensitivityVal');
const hostSpeakingStatus = document.getElementById('hostSpeakingStatus');
const hostBoothChipText = document.getElementById('hostBoothChipText');

// Remote Booth DOM
const guestBooth = document.getElementById('guestBooth');
const guestUserName = document.getElementById('guestUserName');
const guestAvatarContent = document.getElementById('guestAvatarContent');
const guestVocalAura = document.getElementById('guestVocalAura');
const guestAvatarDisc = document.getElementById('guestAvatarDisc');
const guestElasticSliderMount = document.getElementById('guestElasticSlider');
const remoteVolumeVal = document.getElementById('remoteVolumeVal');
const remoteAudioElement = document.getElementById('remoteAudioElement');
const guestSpeakingStatus = document.getElementById('guestSpeakingStatus');
const guestBoothChipText = document.getElementById('guestBoothChipText');
const toastContainer = document.getElementById('toastContainer');

// Controles y reproductores de video en llamada
const hostVideoWrapper = document.getElementById('hostVideoWrapper');
const hostVideoElement = document.getElementById('hostVideoElement');
const hostVideoBadgeText = document.getElementById('hostVideoBadgeText');
const guestVideoWrapper = document.getElementById('guestVideoWrapper');
const guestVideoElement = document.getElementById('guestVideoElement');
const guestVideoBadgeText = document.getElementById('guestVideoBadgeText');
const btnToggleVideo = document.getElementById('btnToggleVideo');
const btnHostSpotlight = document.getElementById('btnHostSpotlight');
const btnGuestSpotlight = document.getElementById('btnGuestSpotlight');
let isCameraOn = false;
let isRemoteVideoOn = false;
let activeSpotlight = null; // 'host' | 'guest' | null
let localVideoStream = null;

// Cronómetro de llamada activa en tiempo real
const callDurationTimer = document.getElementById('callDurationTimer');
const callLiveDot = document.getElementById('callLiveDot');
let callStartTime = null;
let callDurationInterval = null;

function startCallTimer() {
  stopCallTimer();
  callStartTime = Date.now();
  updateCallDurationDisplay();
  callDurationInterval = setInterval(updateCallDurationDisplay, 1000);
  if (callLiveDot) callLiveDot.classList.add('active');
}

function stopCallTimer() {
  if (callDurationInterval) {
    clearInterval(callDurationInterval);
    callDurationInterval = null;
  }
  callStartTime = null;
  if (callDurationTimer) callDurationTimer.textContent = '00:00';
  if (sidebarCallMiniTimer) sidebarCallMiniTimer.textContent = '00:00';
  if (callLiveDot) callLiveDot.classList.remove('active');
}

function updateCallDurationDisplay() {
  if (!callStartTime) return;
  const elapsedSec = Math.floor((Date.now() - callStartTime) / 1000);
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (callDurationTimer) callDurationTimer.textContent = formatted;
  if (sidebarCallMiniTimer) sidebarCallMiniTimer.textContent = formatted;
}

// Layout Views, Footer Mic & Loopback Monitor
const channelChatView = document.getElementById('channelChatView');
const studioBoothsView = document.getElementById('studioBoothsView');
const standbyView = document.getElementById('standbyView');
const btnSidebarMic = document.getElementById('btnSidebarMic');
const btnDeafen = document.getElementById('btnDeafen');
const mutedSpeechTooltip = document.getElementById('mutedSpeechTooltip');
const mutedSpeechTooltipText = document.getElementById('mutedSpeechTooltipText');

// Frases rotativas al hablar silenciado
const MUTED_SPEECH_PHRASES = [
  'Te escuchamos cuando toques acá',
  'Sonido: 0%. Ganas de hablar: 100%.',
  'Psst... estás en silencio',
  'Estás silenciado',
  'Desmuteate para hablar',
  'Hablá con confianza, pero desmuteate primero.',
  'El micrófono no te está escuchando.',
  'Le estás hablando a la pared',
  'Ojo, mic off.',
  '¿Te leemos los labios?'
];

let mutedPhraseIndex = 0;
let mutedTooltipHideTimer = null;
let mutedSpeechConsecutiveFrames = 0;
let isDeafened = false;
let wasMutedBeforeDeafen = false;
let currentActiveChannel = null;
let isUserLoggedIn = false;

// Rastreo confiable de foco de ventana (SO y DOM)
// Permite no molestar al usuario si está chateando activamente en la ventana,
// pero garantiza enviar notificación si la ventana está minimizada o en segundo plano.
let windowHasDomFocus = typeof document !== 'undefined' ? document.hasFocus() : true;
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { windowHasDomFocus = true; });
  window.addEventListener('blur', () => { windowHasDomFocus = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) windowHasDomFocus = false;
  });

  // Comportamiento nativo de aplicación de escritorio (apariencia y controles)
  // 1. Suprimir el menú contextual genérico del navegador (Inspeccionar, Atrás, Recargar, Imprimir).
  // Se conserva el menú nativo del sistema en campos editables (input, textarea) para Copiar/Pegar.
  // Y se respetan los menús contextuales propios de la app (canales, amigos).
  window.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (!target) return;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    if (isInput) return; // Permitir menú nativo para copiar/cortar/pegar texto

    // Permitir si pertenece a menús contextuales propios de Llamadita
    if (target.closest?.('#channelContextMenu, .channel-btn, .sidebar-friend-item, [data-custom-contextmenu]')) {
      return;
    }

    e.preventDefault();
  }, false);

  // 2. Prevenir arrastre fantasma de imágenes y enlaces estilo página web
  window.addEventListener('dragstart', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'IMG' || target.tagName === 'A' || target.closest?.('a, img'))) {
      e.preventDefault();
    }
  }, false);

  // 3. Prevenir atajos de navegador que interfieren con la app (F5, Ctrl+R, Ctrl+P, F7, Ctrl+U)
  window.addEventListener('keydown', (e) => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // F5 o Ctrl+R (recarga accidental durante llamada o chat)
    if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
      if (!isDev || !e.shiftKey) {
        e.preventDefault();
      }
    }
    // Ctrl+P (diálogo de impresión del navegador)
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
    }
    // F7 (navegación por cursor de Edge)
    if (e.key === 'F7') {
      e.preventDefault();
    }
    // Ctrl+U (ver código fuente)
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
    }
  }, false);
}

async function isAppInForeground() {
  if (typeof document !== 'undefined') {
    if (document.hidden) return false;
    if (!document.hasFocus()) return false;
    if (!windowHasDomFocus) return false;
  }
  if (typeof window !== 'undefined' && typeof window.NL_PORT !== 'undefined') {
    try {
      const nl = await import('@neutralinojs/lib');
      if (await nl.window.isMinimized()) return false;
      if (!(await nl.window.isVisible())) return false;
    } catch (_) {}
  }
  return true;
}

async function updateBoothProfiles() {
  const social = typeof getSocialState === 'function' ? getSocialState() : null;

  // 1. Host (Local)
  const localName = social?.me?.display_name || social?.me?.username || 'Tú';
  if (hostUserName) hostUserName.textContent = localName;
  if (hostVideoBadgeText) hostVideoBadgeText.textContent = (localName || 'Tú').toUpperCase();
  const hostPipBadgeText = document.getElementById('hostPipBadgeText');
  if (hostPipBadgeText) hostPipBadgeText.textContent = (localName || 'Tú').toUpperCase();
  if (hostBoothChipText) hostBoothChipText.textContent = 'Tu cabina';
  if (hostAvatarContent) {
    if (social?.me?.avatar_key) {
      const cached = obtenerAvatarCache(social.me.avatar_key);
      if (cached) {
        hostAvatarContent.innerHTML = `<img src="${cached}" class="booth-avatar-img" alt="${localName}" />`;
      }
      try {
        const url = await urlParaVer(social.me.avatar_key);
        hostAvatarContent.innerHTML = `<img src="${url}" class="booth-avatar-img" alt="${localName}" />`;
      } catch (e) {
        if (!cached) {
          const initials = (localName || 'YO').substring(0, 2).toUpperCase();
          hostAvatarContent.textContent = initials;
        }
      }
    } else {
      const initials = (localName || 'YO').substring(0, 2).toUpperCase();
      hostAvatarContent.textContent = initials;
    }
  }

  // 2. Guest (Remote)
  const remoteName = conQuien || 'Participante';
  if (guestUserName) guestUserName.textContent = remoteName;
  if (guestVideoBadgeText) guestVideoBadgeText.textContent = (remoteName || 'Participante').toUpperCase();
  const guestPipBadgeText = document.getElementById('guestPipBadgeText');
  if (guestPipBadgeText) guestPipBadgeText.textContent = (remoteName || 'Participante').toUpperCase();
  if (guestBoothChipText) guestBoothChipText.textContent = conQuien ? `Con ${conQuien}` : 'Participante';
  if (guestAvatarContent) {
    let friendAvatarKey = conQuienAvatarKey || null;

    if (!friendAvatarKey && social?.friendships && conQuien) {
      const item = social.friendships.find(f => {
        const other = f.requester_id === social.me?.id ? f.addressee : f.requester;
        return other && (other.display_name === conQuien || other.username === conQuien);
      });
      if (item) {
        const other = item.requester_id === social.me?.id ? item.addressee : item.requester;
        friendAvatarKey = other?.avatar_key;
      }
    }

    if (friendAvatarKey) {
      const cached = obtenerAvatarCache(friendAvatarKey);
      if (cached) {
        guestAvatarContent.innerHTML = `<img src="${cached}" class="booth-avatar-img" alt="${remoteName}" />`;
      }
      try {
        const url = await urlParaVer(friendAvatarKey);
        guestAvatarContent.innerHTML = `<img src="${url}" class="booth-avatar-img" alt="${remoteName}" />`;
      } catch (e) {
        if (!cached) {
          if (conQuien && conQuien !== 'Participante') {
            guestAvatarContent.textContent = conQuien.substring(0, 2).toUpperCase();
          } else {
            guestAvatarContent.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
            `;
          }
        }
      }
    } else if (conQuien && conQuien !== 'Participante') {
      guestAvatarContent.textContent = conQuien.substring(0, 2).toUpperCase();
    } else {
      guestAvatarContent.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        </svg>
      `;
    }
  }
}

function updateMainViews() {
  if (!isUserLoggedIn) {
    if (btnLeaveCall) btnLeaveCall.hidden = true;
    if (channelChatView) channelChatView.style.display = 'none';
    if (studioBoothsView) studioBoothsView.style.display = 'none';
    if (sidebarCallMiniDock) sidebarCallMiniDock.style.display = 'none';
    if (standbyView) standbyView.style.display = 'flex';
    isCallViewMinimized = false;
    return;
  }

  const hasActiveCall = !!activeVoiceChannel || isConnected || (peerManager && peerManager.connectedPeers.length > 0);

  // El botón de cortar en la barra flotante de estudio solo tiene sentido si hay llamada activa
  if (btnLeaveCall) btnLeaveCall.hidden = !hasActiveCall;

  if (hasActiveCall) {
    // Si el usuario navegó a un chat O minimizó la llamada para ver otra cosa:
    if (currentActiveChannel || isCallViewMinimized) {
      if (studioBoothsView) studioBoothsView.style.display = 'none';

      if (currentActiveChannel) {
        if (channelChatView) channelChatView.style.display = 'flex';
        if (standbyView) standbyView.style.display = 'none';
      } else {
        if (channelChatView) channelChatView.style.display = 'none';
        if (standbyView) standbyView.style.display = 'flex';
      }

      // Mostrar el mini dock en la barra lateral (Posición 2 del croquis)
      if (sidebarCallMiniDock) {
        sidebarCallMiniDock.style.display = 'flex';
        if (sidebarCallMiniTitle) {
          const miniTitulo = activeVoiceChannel ? `#${activeVoiceChannel.name}` : (conQuien ? `En llamada con ${conQuien}` : 'En llamada');
          sidebarCallMiniTitle.textContent = miniTitulo;
        }
      }
    } else {
      // Vista completa de llamada (estudio / cabinas)
      if (sidebarCallMiniDock) sidebarCallMiniDock.style.display = 'none';
      if (channelChatView) channelChatView.style.display = 'none';
      if (standbyView) standbyView.style.display = 'none';
      if (studioBoothsView) studioBoothsView.style.display = 'flex';
      updateBoothProfiles();
      syncBoothsLayout();
    }
  } else {
    // No hay llamada activa
    if (sidebarCallMiniDock) sidebarCallMiniDock.style.display = 'none';
    isCallViewMinimized = false;

    if (currentActiveChannel) {
      if (channelChatView) channelChatView.style.display = 'flex';
      if (studioBoothsView) studioBoothsView.style.display = 'none';
      if (standbyView) standbyView.style.display = 'none';
    } else {
      if (channelChatView) channelChatView.style.display = 'none';
      if (studioBoothsView) studioBoothsView.style.display = 'none';
      if (standbyView) standbyView.style.display = 'flex';
    }
  }
}

// State
let localStream = null;
let remoteStream = null;
let remoteAudioProcessor = null;
let isRemoteMuted = false;
let isConnected = false;
let peerManager = new PeerManager();

// Toast helper
function showToast(message, duration = 3000) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// User Interaction to unblock Audio
async function unlockAndStart() {
  await audioManager.resumeContext();
  await startMicrophone();
  if (remoteAudioElement && remoteStream) {
    remoteAudioElement.play().catch(() => {});
  }
  if (audioPermissionBanner) {
    audioPermissionBanner.style.display = 'none';
  }
}

btnActivateAudio?.addEventListener('click', unlockAndStart);
document.addEventListener('click', () => {
  audioManager.resumeContext();
  if (remoteAudioElement && remoteStream && remoteAudioElement.paused) {
    remoteAudioElement.play().catch(() => {});
  }
}, { passive: true });

// Start or reconnect microphone
async function startMicrophone(deviceId = null) {
  try {
    const target = deviceId || audioManager.currentDeviceId || null;
    localStream = await audioManager.initLocalStream(target);
    peerManager.updateLocalStream(localStream);
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'none';
    }
    return true;
  } catch (err) {
    console.error('Error de acceso a micrófono:', err);
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'flex';
    }
    showToast('Permiso de micrófono no concedido', 4000);
    return false;
  }
}

// Initialize Application
async function init() {
  peerManager.detectRoom();
  setCallStatus('Sin llamada');
  peerManager.setLocalProfile('Usuario Local');
  updateBoothProfiles();

  await startMicrophone();
  setupNetworking();
  initBoothSliders();
  updateMainViews();
  requestAnimationFrame(renderAudioMetrics);
}

// Deslizadores elásticos de cabina (física de resorte de ReactBits adaptada para Llamadita)
let hostElasticSlider = null;
let guestElasticSlider = null;

const ICON_MIC_LOW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
const ICON_MIC_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><path d="M22 8a10 10 0 0 1 0 8"/><path d="M2 8a10 10 0 0 0 0 8"/></svg>`;

const ICON_SPEAKER_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
const ICON_SPEAKER_LOW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const ICON_SPEAKER_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

function initBoothSliders() {
  if (hostElasticSliderMount && !hostElasticSlider) {
    hostElasticSlider = createElasticSlider({
      container: hostElasticSliderMount,
      startingValue: 50,
      maxValue: 350,
      defaultValue: 160,
      stepSize: 5,
      isStepped: true,
      leftIcon: ICON_MIC_LOW,
      rightIcon: ICON_MIC_HIGH,
      leftIconTitle: 'Sensibilidad mínima (50%)',
      rightIconTitle: 'Sensibilidad máxima (350%)',
      onLeftIconClick: () => {
        hostElasticSlider?.setValue(50);
        audioManager.setMicSensitivity(0.5);
        if (sensitivityVal) sensitivityVal.textContent = '50%';
      },
      onRightIconClick: () => {
        hostElasticSlider?.setValue(350);
        audioManager.setMicSensitivity(3.5);
        if (sensitivityVal) sensitivityVal.textContent = '350%';
      },
      onChange: (val) => {
        const rounded = Math.round(val);
        if (sensitivityVal) sensitivityVal.textContent = `${rounded}%`;
        audioManager.setMicSensitivity(rounded / 100);
      },
      ariaLabel: 'Sensibilidad y ganancia del micrófono'
    });
  }

  if (guestElasticSliderMount && !guestElasticSlider) {
    guestElasticSlider = createElasticSlider({
      container: guestElasticSliderMount,
      startingValue: 0,
      maxValue: 100,
      defaultValue: 100,
      stepSize: 1,
      isStepped: true,
      leftIcon: isRemoteMuted ? ICON_SPEAKER_MUTE : ICON_SPEAKER_LOW,
      rightIcon: ICON_SPEAKER_HIGH,
      leftIconTitle: isRemoteMuted ? 'Activar audio de tu amigo' : 'Silenciar audio de tu amigo',
      rightIconTitle: 'Volumen al 100%',
      onLeftIconClick: () => {
        isRemoteMuted = !isRemoteMuted;
        if (remoteAudioElement) remoteAudioElement.muted = isRemoteMuted;
        syncRemoteMuteIcon();
        showToast(isRemoteMuted ? 'Audio de tu amigo silenciado' : 'Audio de tu amigo activado');
      },
      onRightIconClick: () => {
        guestElasticSlider?.setValue(100);
        if (remoteAudioElement) {
          remoteAudioElement.volume = 1;
          remoteAudioElement.muted = false;
        }
        isRemoteMuted = false;
        syncRemoteMuteIcon();
        if (remoteVolumeVal) remoteVolumeVal.textContent = '100%';
      },
      onChange: (val) => {
        const rounded = Math.round(val);
        if (remoteVolumeVal) remoteVolumeVal.textContent = `${rounded}%`;
        if (remoteAudioElement) {
          remoteAudioElement.volume = rounded / 100;
          if (isRemoteMuted && rounded > 0) {
            isRemoteMuted = false;
            remoteAudioElement.muted = false;
            syncRemoteMuteIcon();
          }
        }
      },
      ariaLabel: 'Volumen de tu amigo'
    });
  }
}

function syncRemoteMuteIcon() {
  if (!guestElasticSlider) return;
  const leftIconEl = guestElasticSliderMount?.querySelector('.elastic-icon-left');
  if (leftIconEl) {
    if (isRemoteMuted) {
      leftIconEl.classList.add('muted');
      leftIconEl.title = 'Activar audio de tu amigo';
      guestElasticSlider.setLeftIcon(ICON_SPEAKER_MUTE);
    } else {
      leftIconEl.classList.remove('muted');
      leftIconEl.title = 'Silenciar audio de tu amigo';
      guestElasticSlider.setLeftIcon(ICON_SPEAKER_LOW);
    }
  }
}

// Sincronización del botón de ensordecer (auriculares)
function syncDeafenUi() {
  if (btnDeafen) {
    if (isDeafened) {
      btnDeafen.className = 'sidebar-mic-btn muted';
      btnDeafen.title = 'Des-ensordecer (volver a escuchar)';
    } else {
      btnDeafen.className = 'sidebar-mic-btn active';
      btnDeafen.title = 'Ensordecer (dejar de escuchar y mutear)';
    }
  }
}

// Botón de ensordecer / des-ensordecer (pie de la barra lateral)
btnDeafen?.addEventListener('click', () => {
  isDeafened = !isDeafened;

  if (isDeafened) {
    // 1. Guardamos el estado previo del micrófono
    wasMutedBeforeDeafen = audioManager.isMuted;

    // 2. Silenciamos la salida de audio (dejar de escuchar al resto)
    if (remoteAudioElement) remoteAudioElement.muted = true;

    // 3. Mutear el micrófono siempre al ensordecer
    if (!audioManager.isMuted) {
      audioManager.setMute(true);
      syncMicUi(true);
      peerManager.sendData({ type: 'mute', muted: true });
    }

    syncDeafenUi();
    showToast('Ensordecido (audio y micro silenciados)');
  } else {
    // Des-ensordecer: volver a escuchar al resto
    // Respetamos si el usuario había silenciado a su amigo manualmente en cabina
    if (remoteAudioElement) remoteAudioElement.muted = isRemoteMuted;

    // Lógica del micrófono:
    // "En caso de estar muteado previamente y no ensordecido, al momento de ensordecerte y des-ensordecerte no se activará el microfono.
    //  En caso de no estar muteado y ensordecerte. Te muteara y al momento de des-ensordecerte también te vuelve a desmutear."
    if (!wasMutedBeforeDeafen) {
      audioManager.setMute(false);
      syncMicUi(false);
      peerManager.sendData({ type: 'mute', muted: false });
    }

    syncDeafenUi();
    showToast('Des-ensordecido');
  }
});

function syncBoothsLayout(totalCount) {
  const boothsRow = document.querySelector('.studio-booths-row');
  if (!boothsRow) return;
  const count = typeof totalCount === 'number' ? totalCount : Math.max(1, Math.min(5, 1 + remotePeerSessions.size));
  boothsRow.classList.remove('count-1', 'count-2', 'count-3', 'count-4', 'count-5');
  boothsRow.classList.add(`count-${count}`);
}

function attachAudioToSession(session, stream) {
  if (!stream) return;
  if (!session.audioEl) {
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    if (remoteAudioContainer) remoteAudioContainer.appendChild(audioEl);
    session.audioEl = audioEl;
  }

  session.audioEl.srcObject = stream;
  session.audioEl.muted = isDeafened || session.isMuted;
  session.audioEl.volume = session.volume;
  session.audioEl.play().catch(() => {
    if (audioPermissionBanner) audioPermissionBanner.style.display = 'flex';
  });

  if (session.audioProcessor) {
    try { session.audioProcessor.destroy(); } catch (_) {}
  }
  const proc = audioManager.createRemoteStreamProcessor(stream);
  session.audioProcessor = proc;
  session.analyser = proc.analyser;

  if (session.isPeer0) {
    remoteStream = stream;
    remoteAudioProcessor = proc;
  }
}

function attachVideoToSession(session, videoStream) {
  if (!session.boothEl) return;
  const videoEl = session.boothEl.querySelector('video.guest-video');
  const wrapperEl = session.boothEl.querySelector('.booth-video-wrapper');
  if (videoEl && videoStream) {
    videoEl.srcObject = videoStream;
    videoEl.play().catch(() => {});
  }
  if (wrapperEl) {
    wrapperEl.style.display = videoStream ? 'flex' : 'none';
  }
  session.boothEl.classList.toggle('has-video', !!videoStream);
}

function createDynamicBooth(session) {
  const boothsRow = document.querySelector('.studio-booths-row');
  if (!boothsRow) return;

  const section = document.createElement('section');
  section.className = 'studio-booth booth-guest dynamic-booth';
  section.dataset.peerId = session.peerId;

  const displayName = session.name || 'Participante';
  const initials = displayName.slice(0, 2).toUpperCase();

  section.innerHTML = `
    <button class="booth-spotlight-btn" title="Ampliar a pantalla completa" aria-label="Ampliar">
      <svg class="spotlight-icon-expand" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
      <svg class="spotlight-icon-restore" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <polyline points="4 14 10 14 10 20"></polyline>
        <polyline points="20 10 14 10 14 4"></polyline>
        <line x1="14" y1="10" x2="21" y2="3"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    </button>

    <div class="booth-video-wrapper" style="display: none;" title="Toca para ampliar">
      <video class="booth-video-player guest-video" autoplay playsinline></video>
      <div class="booth-video-overlay-badge">
        <span class="video-live-dot"></span>
        <span class="booth-video-badge-text">${displayName}</span>
      </div>
    </div>

    <div class="booth-visual-center" title="Toca para ampliar">
      <div class="avatar-wrapper">
        <div class="vocal-aura"></div>
        <div class="avatar-disc">
          <span class="booth-avatar-content">${initials}</span>
        </div>
      </div>
      <div class="booth-user-name">${displayName}</div>
      <div class="booth-pip-badge">
        <span class="video-live-dot"></span>
        <span>${displayName.toUpperCase()}</span>
      </div>
    </div>

    <div class="booth-slider-container">
      <div class="booth-slider-header">
        <span class="booth-slider-title">Volumen de ${displayName}</span>
        <span class="booth-slider-val dynamic-vol-val">100%</span>
      </div>
      <div class="booth-elastic-mount"></div>
    </div>
  `;

  boothsRow.appendChild(section);
  session.boothEl = section;

  // Montar deslizador elástico independiente para este participante
  const sliderMount = section.querySelector('.booth-elastic-mount');
  const volValEl = section.querySelector('.dynamic-vol-val');
  if (sliderMount) {
    session.elasticSlider = createElasticSlider({
      container: sliderMount,
      startingValue: 0,
      maxValue: 100,
      defaultValue: 100,
      stepSize: 1,
      isStepped: true,
      leftIcon: ICON_SPEAKER_LOW,
      rightIcon: ICON_SPEAKER_HIGH,
      leftIconTitle: 'Silenciar a este participante',
      rightIconTitle: 'Volumen al 100%',
      onLeftIconClick: () => {
        session.isMuted = !session.isMuted;
        if (session.audioEl) session.audioEl.muted = session.isMuted;
        session.elasticSlider?.setLeftIcon(session.isMuted ? ICON_SPEAKER_MUTE : ICON_SPEAKER_LOW);
        showToast(session.isMuted ? `Audio de ${session.name} silenciado` : `Audio de ${session.name} activado`);
      },
      onRightIconClick: () => {
        session.elasticSlider?.setValue(100);
        session.volume = 1;
        session.isMuted = false;
        if (session.audioEl) {
          session.audioEl.volume = 1;
          session.audioEl.muted = false;
        }
        session.elasticSlider?.setLeftIcon(ICON_SPEAKER_LOW);
        if (volValEl) volValEl.textContent = '100%';
      },
      onChange: (val) => {
        const rounded = Math.round(val);
        if (volValEl) volValEl.textContent = `${rounded}%`;
        session.volume = rounded / 100;
        if (session.audioEl) {
          session.audioEl.volume = session.volume;
          if (session.isMuted && rounded > 0) {
            session.isMuted = false;
            session.audioEl.muted = false;
            session.elasticSlider?.setLeftIcon(ICON_SPEAKER_LOW);
          }
        }
      },
      ariaLabel: `Volumen de ${displayName}`
    });
  }

  // Clic en foto/video para ampliar a spotlight
  const visualCenter = section.querySelector('.booth-visual-center');
  const videoWrapper = section.querySelector('.booth-video-wrapper');
  const spotlightBtn = section.querySelector('.booth-spotlight-btn');

  const onExpandClick = () => {
    toggleDynamicSpotlight(session);
  };
  visualCenter?.addEventListener('click', onExpandClick);
  videoWrapper?.addEventListener('click', onExpandClick);
  spotlightBtn?.addEventListener('click', onExpandClick);

  updateSessionBoothUi(session);
}

async function updateSessionBoothUi(session) {
  if (!session.boothEl) return;
  const nameEl = session.boothEl.querySelector('.booth-user-name');
  const badgeText = session.boothEl.querySelector('.booth-video-badge-text');
  const avatarContent = session.boothEl.querySelector('.booth-avatar-content');

  const name = session.name || 'Participante';
  if (nameEl) nameEl.textContent = name;
  if (badgeText) badgeText.textContent = name;

  if (avatarContent) {
    if (session.avatarKey) {
      const cached = obtenerAvatarCache(session.avatarKey);
      if (cached) {
        avatarContent.innerHTML = `<img src="${cached}" class="booth-avatar-img" alt="${name}" />`;
      }
      try {
        const url = await urlParaVer(session.avatarKey);
        avatarContent.innerHTML = `<img src="${url}" class="booth-avatar-img" alt="${name}" />`;
      } catch (_) {
        if (!cached) avatarContent.textContent = name.slice(0, 2).toUpperCase();
      }
    } else {
      avatarContent.textContent = name.slice(0, 2).toUpperCase();
    }
  }
}

function toggleDynamicSpotlight(session) {
  if (activeSpotlight === session.peerId) {
    activeSpotlight = null;
  } else {
    activeSpotlight = session.peerId;
  }
  updateSpotlightUi();
}

function handlePeersUpdate(peersList) {
  if (!peersList) return;
  const currentPeerIds = new Set(peersList.map(p => p.peerId));

  // 1. Limpiar sesiones de peers que ya no están
  for (const [pId, session] of remotePeerSessions.entries()) {
    if (!currentPeerIds.has(pId)) {
      handlePeerLeave(pId);
    }
  }

  // 2. Actualizar o registrar cada peer de la lista
  peersList.forEach((peer, idx) => {
    let session = remotePeerSessions.get(peer.peerId);
    if (!session) {
      session = {
        peerId: peer.peerId,
        name: peer.name || 'Participante',
        avatarKey: peer.avatarKey || null,
        stream: peer.stream || null,
        videoStream: peer.videoStream || null,
        isVideoOn: !!peer.isVideoOn,
        audioEl: null,
        analyser: null,
        audioProcessor: null,
        volume: 1,
        isMuted: false,
        boothEl: null,
        elasticSlider: null,
        isPeer0: idx === 0
      };
      remotePeerSessions.set(peer.peerId, session);

      if (idx === 0) {
        session.boothEl = guestBooth;
        if (guestBooth) guestBooth.dataset.peerId = peer.peerId;
        session.audioEl = remoteAudioElement;
      } else {
        createDynamicBooth(session);
      }
    } else {
      session.name = peer.name || session.name;
      if (peer.avatarKey) session.avatarKey = peer.avatarKey;
      session.isVideoOn = !!peer.isVideoOn;
      if (peer.stream && !session.stream) {
        session.stream = peer.stream;
        attachAudioToSession(session, peer.stream);
      }
      if (peer.videoStream && !session.videoStream) {
        session.videoStream = peer.videoStream;
        attachVideoToSession(session, peer.videoStream);
      }
    }

    updateSessionBoothUi(session);
  });

  // Si no hay participantes remotos y estamos en un canal de voz:
  if (peersList.length === 0) {
    if (activeVoiceChannel) {
      if (guestBooth) {
        guestBooth.style.display = '';
        if (guestUserName) guestUserName.textContent = 'Esperando a tus amigos…';
        if (guestAvatarContent) {
          guestAvatarContent.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
          `;
        }
        if (guestBoothChipText) guestBoothChipText.textContent = `#${activeVoiceChannel.name}`;
      }
    }
  } else {
    conQuien = peersList[0].name;
    if (peersList[0].avatarKey) conQuienAvatarKey = peersList[0].avatarKey;
  }

  const totalParticipants = Math.max(1, Math.min(5, 1 + peersList.length));
  syncBoothsLayout(totalParticipants);
  updateCallLayoutState();
  updateBoothProfiles();
}

function handleRemoteStream(stream, peerId, profile) {
  let session = peerId ? remotePeerSessions.get(peerId) : Array.from(remotePeerSessions.values())[0];
  if (!session && peerId) {
    session = {
      peerId,
      name: profile?.name || 'Participante',
      avatarKey: profile?.avatarKey || null,
      stream,
      videoStream: null,
      isVideoOn: false,
      audioEl: null,
      analyser: null,
      audioProcessor: null,
      volume: 1,
      isMuted: false,
      boothEl: null,
      elasticSlider: null,
      isPeer0: remotePeerSessions.size === 0
    };
    remotePeerSessions.set(peerId, session);
    if (session.isPeer0) {
      session.boothEl = guestBooth;
      session.audioEl = remoteAudioElement;
    } else {
      createDynamicBooth(session);
    }
  }

  if (session) {
    session.stream = stream;
    attachAudioToSession(session, stream);
    updateSessionBoothUi(session);
  }
}

function handleRemoteVideoStream(videoStream, track, peerId) {
  const session = peerId ? remotePeerSessions.get(peerId) : Array.from(remotePeerSessions.values())[0];
  if (session) {
    session.videoStream = videoStream;
    session.isVideoOn = true;
    attachVideoToSession(session, videoStream);
  } else if (guestVideoElement) {
    guestVideoElement.srcObject = videoStream;
    guestVideoElement.play().catch(() => {});
    if (guestVideoWrapper) guestVideoWrapper.style.display = 'flex';
    isRemoteVideoOn = true;
  }
  updateCallLayoutState();
}

function handleRemoteVideoStateChange(enabled, peerId) {
  const session = peerId ? remotePeerSessions.get(peerId) : Array.from(remotePeerSessions.values())[0];
  if (session) {
    session.isVideoOn = !!enabled;
    if (session.boothEl) {
      session.boothEl.classList.toggle('has-video', !!enabled);
      const wrapperEl = session.boothEl.querySelector('.booth-video-wrapper');
      if (wrapperEl) wrapperEl.style.display = enabled ? 'flex' : 'none';
      if (!enabled) {
        const videoEl = session.boothEl.querySelector('video.guest-video');
        if (videoEl) videoEl.srcObject = null;
      }
    }
  }

  if (!peerId || (session && session.isPeer0)) {
    isRemoteVideoOn = !!enabled;
    if (guestVideoWrapper) guestVideoWrapper.style.display = enabled ? 'flex' : 'none';
    if (!enabled && guestVideoElement) guestVideoElement.srcObject = null;
  }

  updateCallLayoutState();
}

function handlePeerLeave(peerId) {
  const session = remotePeerSessions.get(peerId);
  if (!session) return;

  try {
    if (session.audioProcessor) session.audioProcessor.destroy();
    if (session.audioEl && !session.isPeer0) {
      session.audioEl.pause();
      session.audioEl.srcObject = null;
      session.audioEl.remove();
    }
    if (session.boothEl && session.boothEl.classList.contains('dynamic-booth')) {
      session.boothEl.remove();
    }
  } catch (_) {}

  remotePeerSessions.delete(peerId);
  syncBoothsLayout();
  updateCallLayoutState();
}

// Setup WebRTC and Event Listeners
function setupNetworking() {
  peerManager.onConnectionStatusChange = (status, msg) => {
    if (status === 'connected') {
      isConnected = true;
      startCallTimer();
      setCallStatus(activeVoiceChannel ? `Canal de voz: #${activeVoiceChannel.name}` : (conQuien ? `En llamada con ${conQuien}` : 'En llamada'));
      updateSocialCallState();
      updateBoothProfiles();
      const social = typeof getSocialState === 'function' ? getSocialState() : null;
      peerManager.setLocalProfile(
        social?.me?.display_name || social?.me?.username || 'Usuario',
        social?.me?.avatar_key || null
      );
    } else if (status === 'waiting') {
      isConnected = false;
      stopCallTimer();
      setCallStatus(activeVoiceChannel ? `Canal de voz: #${activeVoiceChannel.name} · Esperando…` : (conQuien ? `Llamando a ${conQuien}…` : 'Esperando participante…'));
    } else if (status === 'connecting') {
      isConnected = false;
      stopCallTimer();
      setCallStatus(activeVoiceChannel ? `Canal de voz: #${activeVoiceChannel.name} · Conectando…` : 'Conectando…');
    } else if (status === 'disconnected') {
      stopCallTimer();
      if (!activeVoiceChannel && (isConnected || conQuien)) {
        showToast(conQuien ? `${conQuien} cortó la llamada` : 'Llamada finalizada');
        leaveCall(false);
      }
    } else if (status === 'error') {
      stopCallTimer();
      showToast(msg || 'Error de conexión', 4000);
    }
    updateMainViews();
  };

  peerManager.onPeersUpdate = handlePeersUpdate;
  peerManager.onRemoteStream = handleRemoteStream;
  peerManager.onRemoteVideoStream = handleRemoteVideoStream;
  peerManager.onRemoteVideoStateChange = handleRemoteVideoStateChange;
  peerManager.onPeerLeave = handlePeerLeave;

  peerManager.onRemoteData = (data, fromPeerId) => {
    if (data.type === 'profile' && data.name) {
      if (!activeVoiceChannel) {
        conQuien = data.name;
        if (data.avatarKey) conQuienAvatarKey = data.avatarKey;
        if (isConnected) setCallStatus(`En llamada con ${data.name}`);
      }
      updateBoothProfiles();
      updateSocialCallState();
    } else if (data.type === 'hangup') {
      if (!activeVoiceChannel) {
        showToast(conQuien ? `${conQuien} cortó la llamada` : 'Tu amigo cortó la llamada');
        leaveCall(false);
      }
    }
  };

  peerManager.onError = (err) => {
    console.error('Error de conexión:', err);
  };

  peerManager.initPeer(localStream);
}

// Detección de voz silenciada y compuerta de ruido local.
// Corre de forma continua mientras haya micrófono activo o llamada, sin importar la vista.
function procesarVozLocal() {
  const raw = audioManager.rawLocalMetrics;
  if (!raw) return;

  if (!audioManager.isMuted) {
    audioManager.processNoiseGate(raw);
    mutedSpeechConsecutiveFrames = 0;
  } else if (isConnected) {
    // Detección de voz estando silenciado en llamada:
    // Usa el umbral calibrado en audioManager y sostenido por 2 cuadros
    // para evitar falsos positivos con respiración, tecleo o estática de condensador.
    const isHumanSpeech = audioManager.isVoiceDetected(raw);
    if (isHumanSpeech) {
      mutedSpeechConsecutiveFrames++;
      if (mutedSpeechConsecutiveFrames >= 2) {
        showSpeakingWhileMuted();
      }
    } else {
      mutedSpeechConsecutiveFrames = 0;
    }
  } else {
    mutedSpeechConsecutiveFrames = 0;
  }
}

// Bucle liviano de animación vocal: solo actualiza el aura y disco cuando las cabinas están a la vista
let ultimoCuadro = 0;

function renderAudioMetrics(ahora = 0) {
  // Siempre procesamos la voz local (compuerta de ruido y aviso de silenciado en cualquier vista)
  procesarVozLocal();

  const cabinasALaVista = studioBoothsView && studioBoothsView.style.display !== 'none';
  if (!cabinasALaVista || document.hidden) {
    requestAnimationFrame(renderAudioMetrics);
    return;
  }
  if (!document.hasFocus() && ahora - ultimoCuadro < 32) {
    requestAnimationFrame(renderAudioMetrics);
    return;
  }
  ultimoCuadro = ahora;

  const isSuspended = audioManager.audioCtx && audioManager.audioCtx.state === 'suspended';

  // 1. Aura vocal del usuario local (solo aspecto visual de la cabina)
  if (isSuspended) {
    if (audioPermissionBanner) audioPermissionBanner.style.display = 'flex';
  } else if (audioManager.isMuted) {
    hostAvatarDisc?.classList.remove('active');
    if (hostSpeakingStatus) {
      hostSpeakingStatus.textContent = 'Silenciado';
      hostSpeakingStatus.className = 'booth-speaking-indicator is-muted';
    }
    if (hostVocalAura) {
      hostVocalAura.style.transform = 'scale(1)';
      hostVocalAura.style.opacity = '0.04';
    }
  } else {
    const { volume, isSpeaking } = audioManager.localMetrics;
    if (isSpeaking) {
      hostAvatarDisc?.classList.add('active');
      if (hostSpeakingStatus) {
        hostSpeakingStatus.textContent = 'Hablando';
        hostSpeakingStatus.className = 'booth-speaking-indicator is-speaking';
      }
      const scale = 1 + (volume / 100) * 0.75;
      if (hostVocalAura) {
        hostVocalAura.style.transform = `scale(${scale})`;
        hostVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.5}`;
      }
    } else {
      hostAvatarDisc?.classList.remove('active');
      if (hostSpeakingStatus) {
        hostSpeakingStatus.textContent = 'En silencio';
        hostSpeakingStatus.className = 'booth-speaking-indicator';
      }
      if (hostVocalAura) {
        hostVocalAura.style.transform = 'scale(1)';
        hostVocalAura.style.opacity = '0.08';
      }
    }
  }

  // 2. Aura vocal del participante remoto (amigo)
  if (remoteAudioProcessor && isConnected && !isRemoteMuted) {
    const { volume, isSpeaking } = audioManager.remoteMetrics;
    if (isSpeaking) {
      guestAvatarDisc?.classList.add('active');
      if (guestSpeakingStatus) {
        guestSpeakingStatus.textContent = 'Hablando';
        guestSpeakingStatus.className = 'booth-speaking-indicator is-speaking';
      }
      const scale = 1 + (volume / 100) * 0.75;
      if (guestVocalAura) {
        guestVocalAura.style.transform = `scale(${scale})`;
        guestVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.5}`;
      }
    } else {
      guestAvatarDisc?.classList.remove('active');
      if (guestSpeakingStatus) {
        guestSpeakingStatus.textContent = 'En silencio';
        guestSpeakingStatus.className = 'booth-speaking-indicator';
      }
      if (guestVocalAura) {
        guestVocalAura.style.transform = 'scale(1)';
        guestVocalAura.style.opacity = '0.08';
      }
    }
  } else {
    guestAvatarDisc?.classList.remove('active');
    if (guestSpeakingStatus) {
      guestSpeakingStatus.textContent = isRemoteMuted ? 'Silenciado' : 'En silencio';
      guestSpeakingStatus.className = isRemoteMuted ? 'booth-speaking-indicator is-muted' : 'booth-speaking-indicator';
    }
    if (guestVocalAura) {
      guestVocalAura.style.transform = 'scale(1)';
      guestVocalAura.style.opacity = '0.04';
    }
  }

  // 3. Auras vocales de participantes dinámicos (Mesh hasta 5 personas)
  for (const session of remotePeerSessions.values()) {
    if (!session.analyser || !session.boothEl || session.isPeer0) continue;
    const metrics = audioManager.measureAnalyser(session.analyser);
    const auraEl = session.boothEl.querySelector('.vocal-aura');
    const discEl = session.boothEl.querySelector('.avatar-disc');

    if (metrics.isSpeaking && !session.isMuted) {
      discEl?.classList.add('active');
      const scale = 1 + (metrics.volume / 100) * 0.75;
      if (auraEl) {
        auraEl.style.transform = `scale(${scale})`;
        auraEl.style.opacity = `${0.35 + (metrics.volume / 100) * 0.5}`;
      }
    } else {
      discEl?.classList.remove('active');
      if (auraEl) {
        auraEl.style.transform = 'scale(1)';
        auraEl.style.opacity = '0.08';
      }
    }
  }

  requestAnimationFrame(renderAudioMetrics);
}

// Respaldo de fondo a 60ms (~16Hz): si la pestaña o ventana queda en segundo plano,
// los navegadores congelan o ralentizan requestAnimationFrame. Este intervalo garantiza
// que si estás en llamada y hablás silenciado, la detección no se interrumpa jamás.
setInterval(() => {
  if (document.hidden && isConnected && audioManager.isMuted) {
    procesarVozLocal();
  }
}, 60);

// Garantiza que la burbuja nunca se desborde fuera de la ventana ni se corte por la izquierda
function keepTooltipInViewport() {
  if (!mutedSpeechTooltip) return;
  mutedSpeechTooltip.style.right = '-4px';
  const rect = mutedSpeechTooltip.getBoundingClientRect();
  if (rect.left < 8) {
    const shift = 8 - rect.left;
    mutedSpeechTooltip.style.right = `${-4 - shift}px`;
  }
}

// Tooltip flotante al hablar silenciado
function showSpeakingWhileMuted() {
  if (!mutedSpeechTooltip || !btnSidebarMic) return;

  // Si no está visible todavía, elegimos la siguiente frase rotativa
  if (!mutedSpeechTooltip.classList.contains('show')) {
    if (mutedSpeechTooltipText) {
      mutedSpeechTooltipText.textContent = MUTED_SPEECH_PHRASES[mutedPhraseIndex];
      mutedPhraseIndex = (mutedPhraseIndex + 1) % MUTED_SPEECH_PHRASES.length;
    }
    mutedSpeechTooltip.hidden = false;
    // Forzar reflow para animación elástica suave y garantizar que quede dentro de la ventana
    void mutedSpeechTooltip.offsetWidth;
    keepTooltipInViewport();
    mutedSpeechTooltip.classList.add('show');

    // Preparado para futuro aviso sonoro
    // playMutedSpeechBeep();
  }

  // Animación de vibración / rebote sutil del botón rojo
  btnSidebarMic.classList.add('vibrating');

  // Reiniciar temporizador de ocultado (1.5 segundos después de que deje de hablar)
  if (mutedTooltipHideTimer) {
    clearTimeout(mutedTooltipHideTimer);
  }
  mutedTooltipHideTimer = setTimeout(() => {
    hideSpeakingWhileMuted();
  }, 1500);
}

function hideSpeakingWhileMuted() {
  if (mutedTooltipHideTimer) {
    clearTimeout(mutedTooltipHideTimer);
    mutedTooltipHideTimer = null;
  }
  if (btnSidebarMic) {
    btnSidebarMic.classList.remove('vibrating');
  }
  if (mutedSpeechTooltip) {
    mutedSpeechTooltip.classList.remove('show');
    setTimeout(() => {
      if (!mutedSpeechTooltip.classList.contains('show')) {
        mutedSpeechTooltip.hidden = true;
        mutedSpeechTooltip.style.right = '';
      }
    }, 250);
  }
}

// Sincronización del botón de micrófono en la barra lateral
function syncMicUi(isMuted) {
  if (btnSidebarMic) {
    if (isMuted) {
      btnSidebarMic.className = 'sidebar-mic-btn muted';
      btnSidebarMic.title = 'Activar Micrófono';
    } else {
      btnSidebarMic.className = 'sidebar-mic-btn active';
      btnSidebarMic.title = 'Silenciar Micrófono';
      hideSpeakingWhileMuted();
    }
  }
}

// Silenciar / Activar micrófono local
function toggleMic() {
  const isMuted = audioManager.toggleMute();
  syncMicUi(isMuted);

  // Si estaba ensordecido y ahora se desmutea el micrófono, también se des-ensordece automáticamente
  if (!isMuted && isDeafened) {
    isDeafened = false;
    if (remoteAudioElement) remoteAudioElement.muted = isRemoteMuted;
    syncDeafenUi();
    showToast('Micrófono activo (des-ensordecido)');
  } else {
    showToast(isMuted ? 'Micrófono silenciado' : 'Micrófono activo');
  }

  peerManager.sendData({
    type: 'mute',
    muted: isMuted
  });
}

btnSidebarMic?.addEventListener('click', toggleMic);

// Control de cámara de video en llamada
function updateCameraUi(active) {
  if (!btnToggleVideo) return;
  const iconOn = btnToggleVideo.querySelector('.camera-icon-on');
  const iconOff = btnToggleVideo.querySelector('.camera-icon-off');

  if (active) {
    btnToggleVideo.classList.add('active');
    btnToggleVideo.title = 'Apagar cámara';
    btnToggleVideo.setAttribute('aria-label', 'Apagar cámara');
    if (iconOn) iconOn.style.display = 'none';
    if (iconOff) iconOff.style.display = 'block';
  } else {
    btnToggleVideo.classList.remove('active');
    btnToggleVideo.title = 'Encender cámara';
    btnToggleVideo.setAttribute('aria-label', 'Encender cámara');
    if (iconOn) iconOn.style.display = 'block';
    if (iconOff) iconOff.style.display = 'none';
  }
}

// Actualizar dimensiones de las tarjetas cuando hay video activo
function updateCallLayoutState() {
  const hasVideoCall = isCameraOn || isRemoteVideoOn;
  if (studioBoothsView) {
    studioBoothsView.classList.toggle('has-active-video', hasVideoCall);
  }
  if (hostBooth) {
    hostBooth.classList.toggle('has-video', isCameraOn);
  }
  if (guestBooth) {
    guestBooth.classList.toggle('has-video', isRemoteVideoOn);
  }
}

// Control de Spotlight / Pantalla completa de participante
let pipCorner = 'top-right';
let isPipDragging = false;
let wasPipDrag = false;

function toggleSpotlight(who) {
  if (activeSpotlight === who) {
    activeSpotlight = null;
  } else {
    activeSpotlight = who;
  }
  updateSpotlightUi();
}

function updateSpotlightUi() {
  const boothsRow = document.querySelector('.studio-booths-row');
  if (!boothsRow) return;

  boothsRow.classList.remove('has-spotlight', 'spotlight-host', 'spotlight-guest');
  boothsRow.classList.remove('pip-in-top-right', 'pip-in-top-left', 'pip-in-bottom-left', 'pip-in-bottom-right');

  const resetBoothPip = (b) => {
    if (!b) return;
    b.classList.remove('is-spotlighted', 'is-pip', 'is-dragging', 'pip-corner-top-right', 'pip-corner-top-left', 'pip-corner-bottom-left', 'pip-corner-bottom-right');
    b.style.left = '';
    b.style.top = '';
    b.style.right = '';
    b.style.bottom = '';
  };

  resetBoothPip(hostBooth);
  resetBoothPip(guestBooth);

  const hostIconExpand = btnHostSpotlight?.querySelector('.spotlight-icon-expand');
  const hostIconRestore = btnHostSpotlight?.querySelector('.spotlight-icon-restore');
  const guestIconExpand = btnGuestSpotlight?.querySelector('.spotlight-icon-expand');
  const guestIconRestore = btnGuestSpotlight?.querySelector('.spotlight-icon-restore');

  if (activeSpotlight === 'host') {
    boothsRow.classList.add('has-spotlight', 'spotlight-host', `pip-in-${pipCorner}`);
    hostBooth?.classList.add('is-spotlighted');
    guestBooth?.classList.add('is-pip', `pip-corner-${pipCorner}`);

    if (hostIconExpand) hostIconExpand.style.display = 'none';
    if (hostIconRestore) hostIconRestore.style.display = 'block';
    if (btnHostSpotlight) btnHostSpotlight.title = 'Restaurar vista dividida';
    if (guestIconExpand) guestIconExpand.style.display = 'block';
    if (guestIconRestore) guestIconRestore.style.display = 'none';
    if (btnGuestSpotlight) btnGuestSpotlight.title = 'Ampliar a pantalla completa';
  } else if (activeSpotlight === 'guest') {
    boothsRow.classList.add('has-spotlight', 'spotlight-guest', `pip-in-${pipCorner}`);
    guestBooth?.classList.add('is-spotlighted');
    hostBooth?.classList.add('is-pip', `pip-corner-${pipCorner}`);

    if (guestIconExpand) guestIconExpand.style.display = 'none';
    if (guestIconRestore) guestIconRestore.style.display = 'block';
    if (btnGuestSpotlight) btnGuestSpotlight.title = 'Restaurar vista dividida';
    if (hostIconExpand) hostIconExpand.style.display = 'block';
    if (hostIconRestore) hostIconRestore.style.display = 'none';
    if (btnHostSpotlight) btnHostSpotlight.title = 'Ampliar a pantalla completa';
  } else {
    if (hostIconExpand) hostIconExpand.style.display = 'block';
    if (hostIconRestore) hostIconRestore.style.display = 'none';
    if (btnHostSpotlight) btnHostSpotlight.title = 'Ampliar a pantalla completa';
    if (guestIconExpand) guestIconExpand.style.display = 'block';
    if (guestIconRestore) guestIconRestore.style.display = 'none';
    if (btnGuestSpotlight) btnGuestSpotlight.title = 'Ampliar a pantalla completa';
  }
}

// Arrastre suave de ventana flotante PiP con snapping a las 4 esquinas (media_1790318442467.png)
function setupPipDrag(boothEl) {
  if (!boothEl) return;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let boothsRowRect = null;
  let elRect = null;
  let dragStarted = false;

  boothEl.addEventListener('pointerdown', (e) => {
    if (!boothEl.classList.contains('is-pip')) return;
    if (e.target.closest('button, input, .elastic-slider-root')) return;

    startX = e.clientX;
    startY = e.clientY;
    dragStarted = false;

    const boothsRow = document.querySelector('.studio-booths-row');
    if (!boothsRow) return;

    boothsRowRect = boothsRow.getBoundingClientRect();
    elRect = boothEl.getBoundingClientRect();

    initialLeft = elRect.left - boothsRowRect.left;
    initialTop = elRect.top - boothsRowRect.top;

    boothEl.setPointerCapture(e.pointerId);
  });

  boothEl.addEventListener('pointermove', (e) => {
    if (!boothEl.hasPointerCapture(e.pointerId)) return;
    if (!boothEl.classList.contains('is-pip')) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragStarted && Math.hypot(dx, dy) > 5) {
      dragStarted = true;
      isPipDragging = true;
      boothEl.classList.add('is-dragging');
    }

    if (dragStarted && boothsRowRect && elRect) {
      const maxLeft = boothsRowRect.width - elRect.width;
      const maxTop = boothsRowRect.height - elRect.height;
      const newLeft = Math.max(8, Math.min(maxLeft - 8, initialLeft + dx));
      const newTop = Math.max(8, Math.min(maxTop - 8, initialTop + dy));

      boothEl.style.left = `${newLeft}px`;
      boothEl.style.top = `${newTop}px`;
      boothEl.style.right = 'auto';
      boothEl.style.bottom = 'auto';
    }
  });

  const finishDrag = (e) => {
    if (!boothEl.hasPointerCapture(e.pointerId)) return;
    try {
      boothEl.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (dragStarted) {
      wasPipDrag = true;
      setTimeout(() => { wasPipDrag = false; }, 120);

      const boothsRow = document.querySelector('.studio-booths-row');
      if (boothsRow) {
        const rowRect = boothsRow.getBoundingClientRect();
        const currentRect = boothEl.getBoundingClientRect();
        const pipCenterX = currentRect.left + currentRect.width / 2;
        const pipCenterY = currentRect.top + currentRect.height / 2;
        const rowCenterX = rowRect.left + rowRect.width / 2;
        const rowCenterY = rowRect.top + rowRect.height / 2;

        const isTop = pipCenterY < rowCenterY;
        const isLeft = pipCenterX < rowCenterX;
        pipCorner = `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;

        boothsRow.classList.remove('pip-in-top-right', 'pip-in-top-left', 'pip-in-bottom-left', 'pip-in-bottom-right');
        boothsRow.classList.add(`pip-in-${pipCorner}`);
      }

      boothEl.classList.remove('pip-corner-top-right', 'pip-corner-top-left', 'pip-corner-bottom-left', 'pip-corner-bottom-right');
      boothEl.classList.add(`pip-corner-${pipCorner}`);

      boothEl.style.left = '';
      boothEl.style.top = '';
      boothEl.style.right = '';
      boothEl.style.bottom = '';
    }

    dragStarted = false;
    isPipDragging = false;
    boothEl.classList.remove('is-dragging');
  };

  boothEl.addEventListener('pointerup', finishDrag);
  boothEl.addEventListener('pointercancel', finishDrag);
}

setupPipDrag(hostBooth);
setupPipDrag(guestBooth);

// Clic en la foto o video para ampliar a pantalla completa
hostAvatarDisc?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('host');
});
hostVisualCenter?.addEventListener('click', (e) => {
  if (e.target.closest('.booth-slider-container')) return;
  toggleSpotlight('host');
});
hostVideoWrapper?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('host');
});
btnHostSpotlight?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('host');
});

guestAvatarDisc?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('guest');
});
guestVisualCenter?.addEventListener('click', (e) => {
  if (e.target.closest('.booth-slider-container')) return;
  toggleSpotlight('guest');
});
guestVideoWrapper?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('guest');
});
btnGuestSpotlight?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSpotlight('guest');
});

// Clic en tarjeta PiP para cambiar el foco a esa persona (ignora si fue arrastre)
hostBooth?.addEventListener('click', () => {
  if (wasPipDrag) return;
  if (hostBooth.classList.contains('is-pip')) {
    toggleSpotlight('host');
  }
});
guestBooth?.addEventListener('click', () => {
  if (wasPipDrag) return;
  if (guestBooth.classList.contains('is-pip')) {
    toggleSpotlight('guest');
  }
});

async function startCamera() {
  if (isCameraOn) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user'
      }
    });

    localVideoStream = stream;
    isCameraOn = true;

    if (hostVideoElement) {
      hostVideoElement.srcObject = stream;
      try {
        await hostVideoElement.play();
      } catch (e) {
        console.warn('hostVideoElement play error:', e);
      }
    }
    if (hostVideoWrapper) hostVideoWrapper.style.display = 'flex';

    updateCameraUi(true);
    updateCallLayoutState();
    await peerManager.setLocalVideoStream(stream);
    showToast('Cámara encendida (1080p 30fps)');
    return true;
  } catch (err) {
    console.error('Error accediendo a la cámara:', err);
    showToast('No se pudo acceder a la cámara');
    updateCameraUi(false);
    updateCallLayoutState();
    return false;
  }
}

async function stopCamera() {
  if (!isCameraOn && !localVideoStream) return;

  if (localVideoStream) {
    localVideoStream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (e) {}
    });
    localVideoStream = null;
  }
  isCameraOn = false;

  if (hostVideoElement) {
    hostVideoElement.srcObject = null;
  }
  if (hostVideoWrapper) hostVideoWrapper.style.display = 'none';

  updateCameraUi(false);
  updateCallLayoutState();
  await peerManager.setLocalVideoStream(null);
  showToast('Cámara apagada');
}

async function toggleCamera() {
  if (isCameraOn) {
    await stopCamera();
  } else {
    await startCamera();
  }
}

btnToggleVideo?.addEventListener('click', toggleCamera);

// SVG para ícono de audio activo (altavoz con ondas)
const ICON_AUDIO_ON = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
// SVG para ícono de audio silenciado (altavoz con X)
const ICON_AUDIO_MUTED = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;

// Salir de la llamada: corta, vuelve a una sala propia vacía y deja la app en standby.
function leaveCall(sendSignal = true) {
  if (sendSignal) {
    try { peerManager.sendData({ type: 'hangup' }); } catch (e) {}
  }
  peerManager.leaveRoom();

  stopCallTimer();
  isConnected = false;
  isCallViewMinimized = false;
  remoteStream = null;
  if (remoteAudioElement) remoteAudioElement.srcObject = null;
  if (remoteAudioProcessor) {
    remoteAudioProcessor.destroy();
    remoteAudioProcessor = null;
  }

  // Limpiar todas las sesiones y cabinas dinámicas de la malla
  for (const session of remotePeerSessions.values()) {
    try {
      if (session.audioProcessor) session.audioProcessor.destroy();
      if (session.audioEl && !session.isPeer0) {
        session.audioEl.pause();
        session.audioEl.srcObject = null;
        session.audioEl.remove();
      }
      if (session.boothEl && session.boothEl.classList.contains('dynamic-booth')) {
        session.boothEl.remove();
      }
    } catch (_) {}
  }
  remotePeerSessions.clear();

  // Salir de canal de voz social en presencia
  activeVoiceChannel = null;
  leaveSocialVoiceChannel();

  // Detener cámara local y apagar LED de hardware de inmediato
  if (isCameraOn || localVideoStream) {
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      localVideoStream = null;
    }
    isCameraOn = false;
    if (hostVideoElement) hostVideoElement.srcObject = null;
    if (hostVideoWrapper) hostVideoWrapper.style.display = 'none';
    updateCameraUi(false);
    try { peerManager.setLocalVideoStream(null); } catch (e) {}
  }

  // Reset de video remoto, spotlight y layout
  if (guestVideoElement) guestVideoElement.srcObject = null;
  if (guestVideoWrapper) guestVideoWrapper.style.display = 'none';
  isRemoteVideoOn = false;
  activeSpotlight = null;
  updateSpotlightUi();
  updateCallLayoutState();

  conQuien = null;
  conQuienAvatarKey = null;
  if (guestAvatarDisc) guestAvatarDisc.classList.remove('active');
  if (guestSpeakingStatus) {
    guestSpeakingStatus.textContent = 'En silencio';
    guestSpeakingStatus.className = 'booth-speaking-indicator';
  }
  if (guestVocalAura) {
    guestVocalAura.style.transform = 'scale(1)';
    guestVocalAura.style.opacity = '0.04';
  }

  // Reset de volumen de amigo
  if (remoteVolumeVal) remoteVolumeVal.textContent = '100%';
  guestElasticSlider?.setValue(100);
  isRemoteMuted = false;
  syncRemoteMuteIcon();

  syncBoothsLayout(2);
  updateBoothProfiles();
  setCallStatus('Sin llamada');
  updateMainViews();
  updateSocialCallState();
}

btnLeaveCall?.addEventListener('click', () => {
  showToast('Saliste de la llamada');
  leaveCall(true);
});

btnSidebarCallHangup?.addEventListener('click', (e) => {
  e.stopPropagation();
  showToast('Saliste de la llamada');
  leaveCall(true);
});

btnMinimizeCall?.addEventListener('click', () => {
  isCallViewMinimized = true;
  updateMainViews();
});

sidebarCallMiniDock?.addEventListener('click', (e) => {
  if (e.target.closest('#btnSidebarCallHangup')) return;
  isCallViewMinimized = false;
  currentActiveChannel = null;
  closeSocialChannel();
  updateMainViews();
});

// Start the app on load
window.addEventListener('DOMContentLoaded', async () => {
  // En escritorio (Neutralino), verificar si ya hay una instancia previa corriendo para no duplicar procesos ni colisionar
  if (typeof window !== 'undefined' && typeof window.NL_PORT !== 'undefined') {
    try {
      const nl = await import('@neutralinojs/lib');
      try { await nl.init(); } catch (_) {}
      const isPrimary = await ensureSingleInstance(nl);
      if (!isPrimary) return; // Se restauró la instancia existente y esta copia se cerró
    } catch (e) {
      console.warn('Error comprobando instancia única de escritorio:', e);
    }
  }

  init();
  // Cuenta, amigos, canales y llamadas directas (Supabase). Aditivo a la sala P2P.
  // No espera al micrófono: la cuenta tiene que estar disponible aunque el permiso demore o falle.
  initSocial({
    joinVoiceChannel: (channel) => {
      activeVoiceChannel = channel;
      currentActiveChannel = null;
      isCallViewMinimized = false;
      conQuien = channel.name;
      setCallStatus(`Canal de voz: #${channel.name}`);
      peerManager.setRoom(channel.room_code);
      updateBoothProfiles();
      updateMainViews();
      updateSocialCallState();
      showToast(`Te uniste a #${channel.name}`);
    },
    showVoiceStudio: (channel) => {
      activeVoiceChannel = channel;
      currentActiveChannel = null;
      isCallViewMinimized = false;
      updateMainViews();
    },
    leaveVoiceChannel: () => {
      activeVoiceChannel = null;
      leaveCall(true);
    },
    joinRoom: (code, nombre) => {
      if (peerManager.setRoom(code)) {
        conQuien = nombre || null;
        setCallStatus(nombre ? `Llamando a ${nombre}…` : 'Conectando…');
        updateBoothProfiles();
        updateSocialCallState();
      }
    },
    getRoom: () => peerManager.roomId,
    setLocalName: (name) => {
      const social = typeof getSocialState === 'function' ? getSocialState() : null;
      peerManager.setLocalProfile(name, social?.me?.avatar_key || null);
      updateBoothProfiles();
    },
    toast: showToast,
    onChannelChange: (channel) => {
      currentActiveChannel = channel;
      updateMainViews();
    },
    onAuthStateChange: (loggedIn) => {
      isUserLoggedIn = !!loggedIn;
      if (!loggedIn && isConnected) {
        leaveCall(true);
      }
      updateBoothProfiles();
      updateMainViews();
    },
    isCallActiveWith: (friend) => {
      if (!isConnected || !conQuien || !friend) return false;
      if (activeVoiceChannel) return false;
      const fn = friend.display_name || friend.username;
      return conQuien === fn || conQuien === friend.username || conQuien === friend.display_name;
    },
    hangup: () => leaveCall(true),
    getAudioInputs: () => audioManager.getAudioInputDevices(),
    changeAudioDevice: (devId) => startMicrophone(devId),
    getCurrentAudioInput: () => audioManager.currentDeviceId,
    getVoiceThreshold: () => audioManager.voiceThresholdDb,
    setVoiceThreshold: (db) => audioManager.setVoiceThreshold(db),
    getRawMetrics: () => audioManager.rawLocalMetrics,
    isVoiceDetected: (rawMetrics) => audioManager.isVoiceDetected(rawMetrics),
    startRingtone: () => audioManager.startRingtone(),
    stopRingtone: () => audioManager.stopRingtone(),
    playMessageSound: (type) => audioManager.playMessageSound(type),
    getMessageSoundType: () => audioManager.messageSoundType,
    setMessageSoundType: (type) => audioManager.setMessageSoundType(type),
    getNotificationsEnabled: () => audioManager.notificationsEnabled,
    setNotificationsEnabled: (v) => audioManager.setNotificationsEnabled(v),
    getRingtoneVolume: () => audioManager.ringtoneVolume,
    setRingtoneVolume: (v) => audioManager.setRingtoneVolume(v),
    getMessageVolume: () => audioManager.messageVolume,
    setMessageVolume: (v) => audioManager.setMessageVolume(v),
    isWindowFocused: () => isAppInForeground(),
    showNativeDesktopNotification: (opts) => showNativeDesktopNotification(opts)
  });

  // Respaldo de seguridad: si tras 4.5s el splash sigue presente, cerrarlo suavemente
  setTimeout(() => {
    const splash = document.getElementById('appLoadingSplash');
    if (splash && !splash._dismissed) {
      splash._dismissed = true;
      splash.classList.add('splash-dismissed');
      setTimeout(() => { splash.style.display = 'none'; }, 400);
    }
  }, 4500);

  // Buscar actualizaciones al abrir (opcional) + popover en el tag de versión del header.
  initUpdater({ toast: showToast });
  // El enlace del mail o de la notificación abre la app y el chat (esquema llamadita://).
  initDeepLink({ toast: showToast, onOpenChat: (channelId) => openSocialChannel(channelId) });
  // Bandeja del sistema (System Tray) e intercepción de la "X" para ocultar en segundo plano
  initDesktopTrayAndWindow();
});

// Instancia única en escritorio: si el usuario vuelve a abrir Llamadita teniendo ya
// la app minimizada en segundo plano (System Tray), restaura la existente y sale de inmediato.
async function ensureSingleInstance(nl) {
  if (!nl || typeof window === 'undefined' || typeof window.NL_PORT === 'undefined') return true;
  try {
    const myPid = window.NL_PID || (await nl.app.getProcessId().catch(() => null));
    if (!myPid) return true;

    const ruta = window.NL_PATH || '.';
    const tempDir = (await nl.os.getEnv('TEMP').catch(() => '')) || 'C:\\Windows\\Temp';
    const pidFile = `${ruta}/.tmp/active_instance.pid`;
    const tempPidFile = `${tempDir}\\llamadita_active_instance.pid`;

    let existingPid = null;

    // 1. Intentar leer PID activo registrado previamente
    try {
      existingPid = (await nl.filesystem.readFile(pidFile)).trim();
    } catch (_) {
      try {
        existingPid = (await nl.filesystem.readFile(tempPidFile)).trim();
      } catch (_) {}
    }

    // 2. Si hay un PID registrado diferente al nuestro, verificar si sigue vivo en Windows
    let isOtherInstanceRunning = false;
    if (existingPid && existingPid !== String(myPid)) {
      try {
        const checkCmd = `tasklist /FI "PID eq ${existingPid}" /NH`;
        const checkRes = await nl.os.execCommand(checkCmd);
        const out = (checkRes?.stdOut || '').toLowerCase();
        if (out.includes(String(existingPid)) || out.includes('llamadita')) {
          isOtherInstanceRunning = true;
        }
      } catch (_) {}
    }

    // 3. Respaldo: si no había archivo de PID o el proceso murió, verificar si hay múltiples procesos Llamadita
    if (!isOtherInstanceRunning) {
      try {
        const listCmd = 'tasklist /FI "IMAGENAME eq Llamadita*" /FO CSV /NH';
        const listRes = await nl.os.execCommand(listCmd);
        const out = listRes?.stdOut || '';
        const matches = out.match(/"?Llamadita[^"\r\n]*"?,\s*"(\d+)"/gi);
        if (matches && matches.length > 1) {
          // Consultar el proceso más antiguo por fecha de inicio en el SO
          const sortCmd = `powershell -NoProfile -NonInteractive -Command "(Get-Process -Name Llamadita* -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1).Id"`;
          const sortRes = await nl.os.execCommand(sortCmd);
          const oldestPid = (sortRes?.stdOut || '').trim();
          if (oldestPid && oldestPid !== String(myPid)) {
            isOtherInstanceRunning = true;
          }
        }
      } catch (_) {}
    }

    // 4. Si otra instancia anterior ya está activa:
    if (isOtherInstanceRunning) {
      console.log('Otra instancia de Llamadita ya está activa en segundo plano. Restaurando ventana y cerrando proceso duplicado...');
      const args = (window.NL_ARGS || []).join(' ');
      const deepLink = args.match(/llamadita:\/\/[^\s"']+/i)?.[0] || 'llamadita://focus';

      try {
        await nl.filesystem.createDirectory(`${ruta}/.tmp`);
        await nl.filesystem.writeFile(`${ruta}/.tmp/enlace.txt`, deepLink);
      } catch (_) {}

      try {
        await nl.filesystem.writeFile(`${tempDir}\\llamadita_enlace.txt`, deepLink);
      } catch (_) {}

      try { await nl.window.hide(); } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
      try { await nl.app.exit(); } catch (_) { window.close?.(); }
      return false;
    }

    // 5. Somos la instancia principal: registrar nuestro PID
    try {
      await nl.filesystem.createDirectory(`${ruta}/.tmp`);
      await nl.filesystem.writeFile(pidFile, String(myPid));
    } catch (_) {}
    try {
      await nl.filesystem.writeFile(tempPidFile, String(myPid));
    } catch (_) {}

    // Limpiar archivo de PID al cerrarse la aplicación
    window.addEventListener('beforeunload', () => {
      try { nl.filesystem.remove(pidFile); } catch (_) {}
      try { nl.filesystem.remove(tempPidFile); } catch (_) {}
    });

    return true;
  } catch (err) {
    console.warn('Error en ensureSingleInstance:', err);
    return true;
  }
}

// Comportamiento de ventana de escritorio y bandeja del sistema (Neutralino)
async function initDesktopTrayAndWindow() {
  if (typeof window === 'undefined' || typeof window.NL_PORT === 'undefined') return;
  try {
    const nl = await import('@neutralinojs/lib');
    try { await nl.init(); } catch (_) {}

    // 1. Configurar icono y menú contextual en la bandeja del sistema (System Tray)
    const tray = {
      icon: '/resources/icons/trayIcon.png',
      menuItems: [
        { id: 'SHOW', text: 'Abrir Llamadita' },
        { id: 'SEP', text: '-' },
        { id: 'QUIT', text: 'Salir de Llamadita' }
      ]
    };
    try {
      await nl.os.setTray(tray);
    } catch (e) {
      console.warn('No se pudo inicializar la bandeja del sistema:', e);
    }

    // 2. Acciones del menú contextual de la bandeja
    nl.events.on('trayMenuItemClicked', async (event) => {
      const id = event?.detail?.id;
      if (id === 'SHOW') {
        await restoreDesktopWindow(nl);
      } else if (id === 'QUIT') {
        try {
          const ruta = window.NL_PATH || '.';
          const tempDir = (await nl.os.getEnv('TEMP').catch(() => '')) || 'C:\\Windows\\Temp';
          await nl.filesystem.remove(`${ruta}/.tmp/active_instance.pid`).catch(() => {});
          await nl.filesystem.remove(`${tempDir}\\llamadita_active_instance.pid`).catch(() => {});
        } catch (_) {}
        try { await nl.app.exit(); } catch (_) { window.close?.(); }
      }
    });

    // 3. Interceptar clic en la "X" de la ventana para minimizar a la bandeja en lugar de salir
    nl.events.on('windowClose', async () => {
      try {
        // Recordar si la ventana estaba maximizada para restaurarla con su tamaño original
        try {
          const isMax = await nl.window.isMaximized();
          if (isMax) localStorage.setItem('llamadita_was_maximized', '1');
          else localStorage.removeItem('llamadita_was_maximized');
        } catch (_) {}

        // Ocultar ventana: desaparece de la pantalla y de la barra de tareas de Windows,
        // quedando activa en segundo plano en la bandeja de notificaciones.
        await nl.window.hide();
      } catch (err) {
        console.warn('Error al ocultar ventana en windowClose:', err);
      }
    });
  } catch (err) {
    console.warn('Error configurando bandeja y ventana de escritorio:', err);
  }
}

async function restoreDesktopWindow(nl) {
  if (!nl) return;
  try {
    const wasMaximized = (await nl.window.isMaximized()) || (localStorage.getItem('llamadita_was_maximized') === '1');
    const isMin = await nl.window.isMinimized();
    if (isMin) {
      await nl.window.unminimize();
    }
    await nl.window.show();
    if (wasMaximized) {
      await nl.window.maximize();
    }
    await nl.window.focus();
    try {
      await nl.window.setAlwaysOnTop(true);
      await nl.window.setAlwaysOnTop(false);
    } catch (_) {}
  } catch (err) {
    console.warn('Error restaurando ventana:', err);
  }
}

// Solicitar permisos de notificación en navegador web con la primera interacción del usuario
if (typeof window !== 'undefined' && 'Notification' in window) {
  document.addEventListener('click', () => {
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }, { once: true, passive: true });
}

// Script PowerShell embebido como respaldo infalible
const NOTIFIER_PS1 = `param([string]$PayloadFile)
$ErrorActionPreference = 'Stop'
try {
  if (-not $PayloadFile -or -not (Test-Path $PayloadFile)) { throw "Payload file not found" }
  $raw = [System.IO.File]::ReadAllText($PayloadFile, [System.Text.Encoding]::UTF8)
  $data = $raw | ConvertFrom-Json
  $title = if ($data.title) { $data.title } else { "Llamadita" }
  $body = if ($data.body) { $data.body } else { "" }
  $avatarUrl = $data.avatarUrl
  $launchUri = if ($data.launchUri) { $data.launchUri } else { "llamadita://focus" }
  $appId = $data.appId
  if (-not $appId) {
    $startApp = Get-StartApps | Where-Object { $_.Name -like "*Llamadita*" } | Select-Object -First 1
    if ($startApp -and $startApp.AppID) {
      $appId = $startApp.AppID
    } else {
      $proc = Get-Process -Name "Llamadita*", "Llama-dita*" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($proc -and $proc.Path) { $appId = $proc.Path } else { $appId = "Llamadita" }
    }
  }
  $localAvatarPath = ""
  if ($avatarUrl -and $avatarUrl -match "^https?://") {
    $cacheDir = Join-Path $env:TEMP "llamadita_cache"
    if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($avatarUrl))
    $hash = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").Substring(0, 16)
    $targetFile = Join-Path $cacheDir "avatar_$hash.webp"
    if (-not (Test-Path $targetFile)) {
      try { Invoke-WebRequest -Uri $avatarUrl -OutFile $targetFile -UseBasicParsing -TimeoutSec 4 } catch { $targetFile = "" }
    }
    if ($targetFile -and (Test-Path $targetFile)) { $localAvatarPath = $targetFile }
  } elseif ($avatarUrl -and (Test-Path $avatarUrl)) {
    $localAvatarPath = $avatarUrl
  }
  $escTitle = [System.Security.SecurityElement]::Escape($title)
  $escBody = [System.Security.SecurityElement]::Escape($body)
  $escLaunch = [System.Security.SecurityElement]::Escape($launchUri)
  $imgTag = ""
  if ($localAvatarPath) {
    $escImg = [System.Security.SecurityElement]::Escape($localAvatarPath)
    $imgTag = "<image placement=\`"appLogoOverride\`" hint-crop=\`"circle\`" src=\`"$escImg\`"/>"
  }
  $xml = @"
<toast activationType="protocol" launch="$escLaunch">
  <visual>
    <binding template="ToastGeneric">
      <text>$escTitle</text>
      <text>$escBody</text>
      $imgTag
    </binding>
  </visual>
</toast>
"@
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $xmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xmlDoc.LoadXml($xml)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xmlDoc
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  exit 1
}`;

// Notificaciones nativas del sistema operativo (Windows Neutralino o Web Notification API)
async function showNativeDesktopNotification({ title, body, avatarUrl, channelId, onClick }) {
  // 1. Escritorio (Neutralino en Windows)
  if (typeof window.NL_PORT !== 'undefined') {
    try {
      const nl = await import('@neutralinojs/lib');
      let tmpDir = '';
      try { tmpDir = await nl.os.getEnv('TEMP'); } catch (_) {}
      if (!tmpDir) try { tmpDir = await nl.os.getEnv('TMP'); } catch (_) {}
      if (!tmpDir) tmpDir = 'C:\\Windows\\Temp';

      const launchUri = channelId ? `llamadita://chat/${encodeURIComponent(channelId)}` : 'llamadita://focus';

      // 1.1 Asegurar que el script PowerShell esté listo en TEMP
      const scriptPath = `${tmpDir}\\llamadita_notifier.ps1`;
      try {
        await nl.filesystem.writeFile(scriptPath, NOTIFIER_PS1);
      } catch (_) {}

      // 1.2 Escribir payload JSON (0 problemas de quoting / escaping)
      const payloadFile = `${tmpDir}\\llamadita_payload_${Date.now()}_${Math.floor(Math.random()*1000)}.json`;
      const payloadData = {
        title: String(title || 'Llamadita'),
        body: String(body || ''),
        avatarUrl: avatarUrl || '',
        launchUri,
        appId: ''
      };
      await nl.filesystem.writeFile(payloadFile, JSON.stringify(payloadData));

      // 1.3 Ejecutar script PowerShell con ExecutionPolicy Bypass
      const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" -PayloadFile "${payloadFile}"`;
      const res = await nl.os.execCommand(cmd, { background: false });

      if (res && res.exitCode !== 0) {
        console.warn('Toast PowerShell falló:', res.stdErr);
        // Fallback a API de Neutralino si fallara WinRT
        try { await nl.os.showNotification(String(title || 'Llamadita'), String(body || ''), 'INFO'); } catch (_) {}
      }

      // Limpieza del archivo temporal de datos
      setTimeout(() => {
        try { nl.filesystem.remove(payloadFile); } catch (_) {}
      }, 5000);
    } catch (err) {
      console.warn('Error emitiendo notificación nativa:', err);
      try {
        const nl2 = await import('@neutralinojs/lib');
        await nl2.os.showNotification(String(title || 'Llamadita'), String(body || ''), 'INFO');
      } catch (_) {}
    }
    return;
  }

  // 2. Navegador web estándar
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        const notif = new Notification(String(title || 'Llamadita'), {
          body: String(body || ''),
          icon: avatarUrl || '/favicon.svg'
        });
        notif.onclick = () => {
          window.focus?.();
          if (onClick) onClick();
          else if (channelId) openSocialChannel(channelId);
        };
      } else if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (_) {}
  }
}
