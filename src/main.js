import { audioManager } from './audio/audioManager.js';
import { PeerManager } from './network/peerManager.js';
import { initSocial, updateSocialCallState, getSocialState, openSocialChannel } from './social/panel.js';
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

// Remote Booth DOM
const guestBooth = document.getElementById('guestBooth');
const guestUserName = document.getElementById('guestUserName');
const guestAvatarContent = document.getElementById('guestAvatarContent');
const guestVocalAura = document.getElementById('guestVocalAura');
const guestAvatarDisc = document.getElementById('guestAvatarDisc');
const guestElasticSliderMount = document.getElementById('guestElasticSlider');
const remoteVolumeVal = document.getElementById('remoteVolumeVal');
const remoteAudioElement = document.getElementById('remoteAudioElement');
const toastContainer = document.getElementById('toastContainer');

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
    if (standbyView) standbyView.style.display = 'flex';
    return;
  }

  // El botón de cortar solo tiene sentido si hay llamada activa
  if (btnLeaveCall) btnLeaveCall.hidden = !(isConnected || peerManager.remotePeerId);

  if (currentActiveChannel) {
    if (channelChatView) channelChatView.style.display = 'flex';
    if (studioBoothsView) studioBoothsView.style.display = 'none';
    if (standbyView) standbyView.style.display = 'none';
  } else if (isConnected) {
    if (channelChatView) channelChatView.style.display = 'none';
    if (studioBoothsView) studioBoothsView.style.display = 'flex';
    if (standbyView) standbyView.style.display = 'none';
    updateBoothProfiles();
  } else {
    if (channelChatView) channelChatView.style.display = 'none';
    if (studioBoothsView) studioBoothsView.style.display = 'none';
    if (standbyView) standbyView.style.display = 'flex';
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

// Setup WebRTC and Event Listeners
function setupNetworking() {
  peerManager.onConnectionStatusChange = (status, msg) => {
    if (status === 'connected') {
      isConnected = true;
      setCallStatus(conQuien ? `En llamada con ${conQuien}` : 'En llamada');
      updateSocialCallState();
      updateBoothProfiles();
      const social = typeof getSocialState === 'function' ? getSocialState() : null;
      peerManager.setLocalProfile(
        social?.me?.display_name || social?.me?.username || 'Usuario',
        social?.me?.avatar_key || null
      );
    } else if (status === 'waiting') {
      isConnected = false;
      setCallStatus(conQuien ? `Llamando a ${conQuien}…` : 'Esperando participante…');
    } else if (status === 'connecting') {
      isConnected = false;
      setCallStatus('Conectando…');
    } else if (status === 'disconnected') {
      if (isConnected || conQuien) {
        showToast(conQuien ? `${conQuien} cortó la llamada` : 'Llamada finalizada');
        leaveCall(false);
      }
    } else if (status === 'error') {
      showToast(msg || 'Error de conexión', 4000);
    }
    updateMainViews();
  };

  peerManager.onRemoteStream = (stream) => {
    remoteStream = stream;
    if (remoteAudioElement) {
      remoteAudioElement.srcObject = stream;
      remoteAudioElement.muted = isDeafened || isRemoteMuted;
      remoteAudioElement.play().catch(() => {
        if (audioPermissionBanner) {
          audioPermissionBanner.style.display = 'flex';
        }
      });
    }

    if (remoteAudioProcessor) {
      remoteAudioProcessor.destroy();
    }
    remoteAudioProcessor = audioManager.createRemoteStreamProcessor(stream);
  };

  peerManager.onRemoteData = (data) => {
    if (data.type === 'profile' && data.name) {
      conQuien = data.name;
      if (data.avatarKey) conQuienAvatarKey = data.avatarKey;
      if (isConnected) setCallStatus(`En llamada con ${data.name}`);
      updateBoothProfiles();
      updateSocialCallState();
    } else if (data.type === 'hangup') {
      showToast(conQuien ? `${conQuien} cortó la llamada` : 'Tu amigo cortó la llamada');
      leaveCall(false);
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
    if (hostVocalAura) {
      hostVocalAura.style.transform = 'scale(1)';
      hostVocalAura.style.opacity = '0.08';
    }
  } else {
    const { volume, isSpeaking } = audioManager.localMetrics;
    if (isSpeaking) {
      hostAvatarDisc?.classList.add('active');
      const scale = 1 + (volume / 100) * 0.9;
      if (hostVocalAura) {
        hostVocalAura.style.transform = `scale(${scale})`;
        hostVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.65}`;
      }
    } else {
      hostAvatarDisc?.classList.remove('active');
      if (hostVocalAura) {
        hostVocalAura.style.transform = 'scale(1)';
        hostVocalAura.style.opacity = '0.12';
      }
    }
  }

  // 2. Aura vocal del participante remoto (amigo)
  if (remoteAudioProcessor && isConnected && !isRemoteMuted) {
    const { volume, isSpeaking } = audioManager.remoteMetrics;
    if (isSpeaking) {
      guestAvatarDisc?.classList.add('active');
      const scale = 1 + (volume / 100) * 0.9;
      if (guestVocalAura) {
        guestVocalAura.style.transform = `scale(${scale})`;
        guestVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.65}`;
      }
    } else {
      guestAvatarDisc?.classList.remove('active');
      if (guestVocalAura) {
        guestVocalAura.style.transform = 'scale(1)';
        guestVocalAura.style.opacity = '0.12';
      }
    }
  } else {
    guestAvatarDisc?.classList.remove('active');
    if (guestVocalAura) {
      guestVocalAura.style.transform = 'scale(1)';
      guestVocalAura.style.opacity = '0.05';
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

  isConnected = false;
  remoteStream = null;
  if (remoteAudioElement) remoteAudioElement.srcObject = null;
  if (remoteAudioProcessor) {
    remoteAudioProcessor.destroy();
    remoteAudioProcessor = null;
  }

  conQuien = null;
  conQuienAvatarKey = null;
  if (guestAvatarDisc) guestAvatarDisc.classList.remove('active');
  if (guestVocalAura) {
    guestVocalAura.style.transform = 'scale(1)';
    guestVocalAura.style.opacity = '0.05';
  }

  // Reset de volumen de amigo
  if (remoteVolumeVal) remoteVolumeVal.textContent = '100%';
  guestElasticSlider?.setValue(100);
  isRemoteMuted = false;
  syncRemoteMuteIcon();

  updateBoothProfiles();
  setCallStatus('Sin llamada');
  updateMainViews();
  updateSocialCallState();
}

btnLeaveCall?.addEventListener('click', () => {
  showToast('Saliste de la llamada');
  leaveCall(true);
});

// Start the app on load
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Cuenta, amigos, canales y llamadas directas (Supabase). Aditivo a la sala P2P.
  // No espera al micrófono: la cuenta tiene que estar disponible aunque el permiso demore o falle.
  initSocial({
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
