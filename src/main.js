import { audioManager } from './audio/audioManager.js';
import { PeerManager } from './network/peerManager.js';
import { initSocial, updateSocialCallState, getSocialState } from './social/panel.js';
import { urlParaVer } from './social/adjuntos.js';
import { initUpdater } from './updater.js';
import { initDeepLink } from './social/deeplink.js';

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
const micSensitivityRange = document.getElementById('micSensitivityRange');
const sensitivityVal = document.getElementById('sensitivityVal');

// Remote Booth DOM
const guestBooth = document.getElementById('guestBooth');
const guestUserName = document.getElementById('guestUserName');
const guestAvatarContent = document.getElementById('guestAvatarContent');
const guestVocalAura = document.getElementById('guestVocalAura');
const guestAvatarDisc = document.getElementById('guestAvatarDisc');
const remoteVolumeRange = document.getElementById('remoteVolumeRange');
const remoteVolumeVal = document.getElementById('remoteVolumeVal');
const btnToggleRemoteAudio = document.getElementById('btnToggleRemoteAudio');
const btnToggleRemoteAudioText = document.getElementById('btnToggleRemoteAudioText');
const remoteAudioElement = document.getElementById('remoteAudioElement');
const toastContainer = document.getElementById('toastContainer');

// Layout Views, Footer Mic & Loopback Monitor
const channelChatView = document.getElementById('channelChatView');
const studioBoothsView = document.getElementById('studioBoothsView');
const standbyView = document.getElementById('standbyView');
const btnSidebarMic = document.getElementById('btnSidebarMic');
const btnLoopback = document.getElementById('btnLoopback');
let currentActiveChannel = null;
let isUserLoggedIn = false;

async function updateBoothProfiles() {
  const social = typeof getSocialState === 'function' ? getSocialState() : null;

  // 1. Host (Local)
  const localName = social?.me?.display_name || social?.me?.username || 'Tú';
  if (hostUserName) hostUserName.textContent = localName;
  if (hostAvatarContent) {
    if (social?.me?.avatar_key) {
      try {
        const url = await urlParaVer(social.me.avatar_key);
        hostAvatarContent.innerHTML = `<img src="${url}" class="booth-avatar-img" alt="${localName}" />`;
      } catch (e) {
        const initials = (localName || 'YO').substring(0, 2).toUpperCase();
        hostAvatarContent.textContent = initials;
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
      try {
        const url = await urlParaVer(friendAvatarKey);
        guestAvatarContent.innerHTML = `<img src="${url}" class="booth-avatar-img" alt="${remoteName}" />`;
      } catch (e) {
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
    localStream = await audioManager.initLocalStream(deviceId);
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
  updateMainViews();
  requestAnimationFrame(renderAudioMetrics);
}

// Microphone sensitivity range slider
micSensitivityRange?.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (sensitivityVal) sensitivityVal.textContent = `${val}%`;
  audioManager.setMicSensitivity(val / 100);
});

// Remote friend volume slider
remoteVolumeRange?.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (remoteVolumeVal) remoteVolumeVal.textContent = `${val}%`;
  if (remoteAudioElement) remoteAudioElement.volume = val / 100;
});

// Monitor toggle (en el pie de usuario de la barra lateral)
btnLoopback?.addEventListener('click', () => {
  const isEnabled = audioManager.toggleLoopback();
  if (isEnabled) {
    btnLoopback.classList.add('active');
    btnLoopback.title = 'Monitoreo local activo (escucharte)';
    showToast('Monitoreo local activo');
  } else {
    btnLoopback.classList.remove('active');
    btnLoopback.title = 'Monitoreo local (escucharte)';
    showToast('Monitoreo local desactivado');
  }
});

// Setup WebRTC and Event Listeners
function setupNetworking() {
  peerManager.onConnectionStatusChange = (status, msg) => {
    if (status === 'connected') {
      isConnected = true;
      setCallStatus(conQuien ? `En llamada con ${conQuien}` : 'En llamada');
      showToast('Participante conectado a la sala');
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

// Bucle liviano de animación vocal: solo actualiza el aura y disco cuando las cabinas están a la vista
let ultimoCuadro = 0;

function renderAudioMetrics(ahora = 0) {
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

  // 1. Aura vocal del usuario local
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

// Sincronización del botón de micrófono en la barra lateral
function syncMicUi(isMuted) {
  if (btnSidebarMic) {
    if (isMuted) {
      btnSidebarMic.className = 'sidebar-mic-btn muted';
      btnSidebarMic.title = 'Activar Micrófono';
    } else {
      btnSidebarMic.className = 'sidebar-mic-btn active';
      btnSidebarMic.title = 'Silenciar Micrófono';
    }
  }
}

// Silenciar / Activar micrófono local
function toggleMic() {
  const isMuted = audioManager.toggleMute();
  syncMicUi(isMuted);
  showToast(isMuted ? 'Micrófono silenciado' : 'Micrófono activo');

  peerManager.sendData({
    type: 'mute',
    muted: isMuted
  });
}

btnSidebarMic?.addEventListener('click', toggleMic);

// Silenciar / Activar audio remoto (amigo)
btnToggleRemoteAudio?.addEventListener('click', () => {
  isRemoteMuted = !isRemoteMuted;
  if (remoteAudioElement) remoteAudioElement.muted = isRemoteMuted;

  if (isRemoteMuted) {
    btnToggleRemoteAudio.className = 'btn-control muted';
    if (btnToggleRemoteAudioText) btnToggleRemoteAudioText.textContent = 'Activar audio';
    showToast('Audio de tu amigo silenciado');
  } else {
    btnToggleRemoteAudio.className = 'btn-control';
    if (btnToggleRemoteAudioText) btnToggleRemoteAudioText.textContent = 'Silenciar';
    showToast('Audio de tu amigo activo');
  }
});

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
    hangup: () => leaveCall(true)
  });
  // Buscar actualizaciones al abrir (opcional) + popover en el tag de versión del header.
  initUpdater({ toast: showToast });
  // El enlace del mail abre la app (esquema llamadita://).
  initDeepLink({ toast: showToast });
});
