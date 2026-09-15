import { audioManager } from './audio/audioManager.js';
import { PeerManager } from './network/peerManager.js';
import { AudioVisualizer } from './components/visualizer.js';
import { initSocial } from './social/panel.js';
import { initUpdater } from './updater.js';

// DOM Elements
const audioPermissionBanner = document.getElementById('audioPermissionBanner');
const btnActivateAudio = document.getElementById('btnActivateAudio');

const onAirBadge = document.getElementById('onAirBadge');
const onAirText = document.getElementById('onAirText');
const roomPill = document.getElementById('roomPill');
const btnCopyInvite = document.getElementById('btnCopyInvite');
const btnShareInviteSecondary = document.getElementById('btnShareInviteSecondary');

// Local Booth DOM
const hostBooth = document.getElementById('hostBooth');
const hostRoleBadge = document.getElementById('hostRoleBadge');
const hostNameInput = document.getElementById('hostNameInput');
const hostSpeakingIndicator = document.getElementById('hostSpeakingIndicator');
const hostSpeakingText = document.getElementById('hostSpeakingText');
const hostVocalAura = document.getElementById('hostVocalAura');
const hostAvatarDisc = document.getElementById('hostAvatarDisc');
const hostStatusPill = document.getElementById('hostStatusPill');
const hostMeterReadout = document.getElementById('hostMeterReadout');
const hostVuFill = document.getElementById('hostVuFill');
const hostVuPeak = document.getElementById('hostVuPeak');
const hostCanvas = document.getElementById('hostCanvas');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleMicText = document.getElementById('btnToggleMicText');
const btnLoopback = document.getElementById('btnLoopback');
const btnLoopbackText = document.getElementById('btnLoopbackText');
const micSensitivityRange = document.getElementById('micSensitivityRange');
const sensitivityVal = document.getElementById('sensitivityVal');
const micDeviceSelect = document.getElementById('micDeviceSelect');

// Remote Booth DOM
const guestBooth = document.getElementById('guestBooth');
const guestRoleBadge = document.getElementById('guestRoleBadge');
const guestNameInput = document.getElementById('guestNameInput');
const guestSpeakingIndicator = document.getElementById('guestSpeakingIndicator');
const guestSpeakingText = document.getElementById('guestSpeakingText');
const guestVocalAura = document.getElementById('guestVocalAura');
const guestAvatarDisc = document.getElementById('guestAvatarDisc');
const guestStatusPill = document.getElementById('guestStatusPill');
const guestMeterReadout = document.getElementById('guestMeterReadout');
const guestVuFill = document.getElementById('guestVuFill');
const guestVuPeak = document.getElementById('guestVuPeak');
const guestCanvas = document.getElementById('guestCanvas');
const btnToggleRemoteAudio = document.getElementById('btnToggleRemoteAudio');
const btnToggleRemoteAudioText = document.getElementById('btnToggleRemoteAudioText');
const remoteAudioElement = document.getElementById('remoteAudioElement');
const toastContainer = document.getElementById('toastContainer');

// Layout Views & Sidebar Mic
const channelChatView = document.getElementById('channelChatView');
const studioBoothsView = document.getElementById('studioBoothsView');
const standbyView = document.getElementById('standbyView');
const btnSidebarMic = document.getElementById('btnSidebarMic');
let currentActiveChannel = null;

function updateMainViews() {
  if (currentActiveChannel) {
    if (channelChatView) channelChatView.style.display = 'flex';
    if (studioBoothsView) studioBoothsView.style.display = 'none';
    if (standbyView) standbyView.style.display = 'none';
  } else if (isConnected) {
    if (channelChatView) channelChatView.style.display = 'none';
    if (studioBoothsView) studioBoothsView.style.display = 'grid';
    if (standbyView) standbyView.style.display = 'none';
  } else {
    if (channelChatView) channelChatView.style.display = 'none';
    if (studioBoothsView) studioBoothsView.style.display = 'none';
    if (standbyView) standbyView.style.display = 'flex';
  }
}

// Visualizer Instances
const hostVisualizer = new AudioVisualizer(hostCanvas, { theme: 'host' });
const guestVisualizer = new AudioVisualizer(guestCanvas, { theme: 'guest' });

// State
let localStream = null;
let remoteStream = null;
let remoteAudioProcessor = null;
let isRemoteMuted = false;
let isConnected = false;
let peerManager = new PeerManager();

// Peak hold values
let hostPeakHold = 0;
let hostPeakTimer = 0;
let guestPeakHold = 0;
let guestPeakTimer = 0;

// Toast helper
function showToast(message, duration = 3000) {
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
    hostStatusPill.innerHTML = '<span>Inicializando dispositivo...</span>';
    localStream = await audioManager.initLocalStream(deviceId);
    
    const track = localStream.getAudioTracks()[0];
    const trackLabel = track && track.label ? track.label : 'Dispositivo activo';
    hostStatusPill.innerHTML = `<span>🎤 ${trackLabel.substring(0, 24)}</span>`;
    
    peerManager.updateLocalStream(localStream);
    await loadAudioDevices();
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'none';
    }
    return true;
  } catch (err) {
    console.error('Error de acceso a micrófono:', err);
    hostStatusPill.innerHTML = '<span style="color:#ef4444">Permiso de micrófono requerido</span>';
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'flex';
    }
    showToast('Permiso de micrófono no concedido', 4000);
    return false;
  }
}

// Initialize Application
async function init() {
  const { roomId } = peerManager.detectRoom();
  roomPill.textContent = `Sala: ${roomId}`;

  hostNameInput.value = 'Usuario Local';
  guestNameInput.value = 'Participante';
  hostRoleBadge.textContent = 'Local';
  guestRoleBadge.textContent = 'Remoto';

  await startMicrophone();
  setupNetworking();
  updateMainViews();
  requestAnimationFrame(renderAudioMetrics);
}

// Load audio devices into selector
async function loadAudioDevices() {
  try {
    const devices = await audioManager.getAudioInputDevices();
    micDeviceSelect.innerHTML = '';

    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'Dispositivo predeterminado';
      opt.value = '';
      micDeviceSelect.appendChild(opt);
      return;
    }

    devices.forEach((device, index) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.text = device.label || `Dispositivo ${index + 1}`;
      if (device.deviceId === audioManager.currentDeviceId) {
        opt.selected = true;
      }
      micDeviceSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn('Error al enumerar dispositivos:', err);
  }
}

// Handle device switch
micDeviceSelect.addEventListener('change', async (e) => {
  const deviceId = e.target.value;
  if (!deviceId) return;
  const ok = await startMicrophone(deviceId);
  if (ok) {
    showToast('Dispositivo de audio actualizado');
  }
});

// Microphone sensitivity range slider
micSensitivityRange.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  sensitivityVal.textContent = `${val}%`;
  audioManager.setMicSensitivity(val / 100);
});

// Monitor toggle
btnLoopback.addEventListener('click', () => {
  const isEnabled = audioManager.toggleLoopback();
  if (isEnabled) {
    btnLoopback.className = 'btn-control btn-secondary active';
    btnLoopbackText.textContent = 'Detener monitoreo';
    showToast('Monitoreo local activo');
  } else {
    btnLoopback.className = 'btn-control btn-secondary';
    btnLoopbackText.textContent = 'Monitorear';
    showToast('Monitoreo local desactivado');
  }
});

// Setup WebRTC and Event Listeners
function setupNetworking() {
  peerManager.onConnectionStatusChange = (status, msg) => {
    if (status === 'connected') {
      isConnected = true;
      onAirBadge.classList.add('live');
      onAirText.textContent = 'CONECTADO';
      guestStatusPill.innerHTML = '<span style="color:#34d399">Conectado</span>';
      guestSpeakingIndicator.className = 'speaking-indicator';
      guestSpeakingText.textContent = 'Activo';
      showToast('Participante conectado a la sala');

      peerManager.sendData({
        type: 'profile',
        name: hostNameInput.value
      });
    } else if (status === 'waiting') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'ESPERANDO';
      guestStatusPill.innerHTML = `<span>${msg || 'Esperando participante...'}</span>`;
    } else if (status === 'connecting') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'CONECTANDO';
      guestStatusPill.innerHTML = `<span>${msg || 'Conectando...'}</span>`;
    } else if (status === 'disconnected') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'STANDBY';
      guestStatusPill.innerHTML = '<span style="color:#f87171">Desconectado</span>';
      guestSpeakingIndicator.classList.remove('active');
      guestSpeakingText.textContent = 'Desconectado';
      showToast('Participante desconectado');
    } else if (status === 'error') {
      guestStatusPill.innerHTML = `<span style="color:#f87171">${msg}</span>`;
    }
    updateMainViews();
  };

  peerManager.onRemoteStream = (stream) => {
    remoteStream = stream;
    remoteAudioElement.srcObject = stream;
    
    remoteAudioElement.play().catch(() => {
      if (audioPermissionBanner) {
        audioPermissionBanner.style.display = 'flex';
      }
    });

    if (remoteAudioProcessor) {
      remoteAudioProcessor.destroy();
    }
    remoteAudioProcessor = audioManager.createRemoteStreamProcessor(stream);
  };

  peerManager.onRemoteData = (data) => {
    if (data.type === 'profile' && data.name) {
      guestNameInput.value = data.name;
    } else if (data.type === 'mute') {
      if (data.muted) {
        guestSpeakingIndicator.className = 'speaking-indicator muted';
        guestSpeakingText.textContent = 'Silenciado';
      } else {
        guestSpeakingIndicator.className = 'speaking-indicator';
        guestSpeakingText.textContent = 'Activo';
      }
    }
  };

  peerManager.onError = (err) => {
    console.error('Error de conexión:', err);
  };

  peerManager.initPeer(localStream);
}

// 60 FPS Render Loop
function renderAudioMetrics() {
  const isSuspended = audioManager.audioCtx && audioManager.audioCtx.state === 'suspended';

  // 1. Local Microphone Metrics
  if (isSuspended) {
    hostMeterReadout.textContent = 'INICIAR AUDIO';
    if (audioPermissionBanner) audioPermissionBanner.style.display = 'flex';
  } else if (audioManager.isMuted) {
    hostVuFill.style.width = '0%';
    hostVuPeak.style.left = '0%';
    hostMeterReadout.textContent = 'SILENCIADO · 0%';
    hostSpeakingIndicator.className = 'speaking-indicator muted';
    hostSpeakingText.textContent = 'Silenciado';
    hostAvatarDisc.classList.remove('active');
    hostVocalAura.style.transform = 'scale(1)';
    hostVocalAura.style.opacity = '0.08';
    hostVisualizer.draw(null, false);
  } else {
    const { volume, db, isSpeaking } = audioManager.localMetrics;

    hostVuFill.style.width = `${volume}%`;

    if (volume > hostPeakHold) {
      hostPeakHold = volume;
      hostPeakTimer = 25;
    } else if (hostPeakTimer > 0) {
      hostPeakTimer--;
    } else {
      hostPeakHold = Math.max(0, hostPeakHold - 2.5);
    }
    hostVuPeak.style.left = `${hostPeakHold}%`;

    hostMeterReadout.textContent = `${db} dB · ${volume}%`;

    if (isSpeaking) {
      hostSpeakingIndicator.className = 'speaking-indicator active';
      hostSpeakingText.textContent = 'Hablando';
      hostAvatarDisc.classList.add('active');
      const scale = 1 + (volume / 100) * 0.9;
      hostVocalAura.style.transform = `scale(${scale})`;
      hostVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.65}`;
    } else {
      hostSpeakingIndicator.className = 'speaking-indicator';
      hostSpeakingText.textContent = 'Silencio';
      hostAvatarDisc.classList.remove('active');
      hostVocalAura.style.transform = 'scale(1)';
      hostVocalAura.style.opacity = '0.12';
    }

    const freqData = audioManager.getFrequencyData(audioManager.localAnalyser);
    const timeData = audioManager.getTimeDomainData(audioManager.localAnalyser);
    hostVisualizer.draw({ volume, db, freqData, timeData }, true);
  }

  // 2. Remote Audio Metrics
  if (remoteAudioProcessor && isConnected) {
    if (isRemoteMuted) {
      guestVuFill.style.width = '0%';
      guestVuPeak.style.left = '0%';
      guestMeterReadout.textContent = 'MUTED · 0%';
      guestSpeakingIndicator.className = 'speaking-indicator muted';
      guestSpeakingText.textContent = 'Silenciado';
      guestVisualizer.draw(null, false);
    } else {
      const { volume, db, isSpeaking } = audioManager.remoteMetrics;
      guestVuFill.style.width = `${volume}%`;

      if (volume > guestPeakHold) {
        guestPeakHold = volume;
        guestPeakTimer = 25;
      } else if (guestPeakTimer > 0) {
        guestPeakTimer--;
      } else {
        guestPeakHold = Math.max(0, guestPeakHold - 2.5);
      }
      guestVuPeak.style.left = `${guestPeakHold}%`;

      guestMeterReadout.textContent = `${db} dB · ${volume}%`;

      if (isSpeaking) {
        guestSpeakingIndicator.className = 'speaking-indicator active';
        guestSpeakingText.textContent = 'Hablando';
        guestAvatarDisc.classList.add('active');
        const scale = 1 + (volume / 100) * 0.9;
        guestVocalAura.style.transform = `scale(${scale})`;
        guestVocalAura.style.opacity = `${0.35 + (volume / 100) * 0.65}`;
      } else {
        guestSpeakingIndicator.className = 'speaking-indicator';
        guestSpeakingText.textContent = 'Silencio';
        guestAvatarDisc.classList.remove('active');
        guestVocalAura.style.transform = 'scale(1)';
        guestVocalAura.style.opacity = '0.12';
      }

      const freqData = audioManager.getFrequencyData(remoteAudioProcessor.analyser);
      const timeData = audioManager.getTimeDomainData(remoteAudioProcessor.analyser);
      guestVisualizer.draw({ volume, db, freqData, timeData }, true);
    }
  } else {
    guestVuFill.style.width = '0%';
    guestVuPeak.style.left = '0%';
    guestMeterReadout.textContent = '-∞ dB · 0%';
    guestVisualizer.draw(null, false);
    guestAvatarDisc.classList.remove('active');
    guestVocalAura.style.transform = 'scale(1)';
    guestVocalAura.style.opacity = '0.05';
  }

  requestAnimationFrame(renderAudioMetrics);
}

// Mute UI synchronization
function syncMicUi(isMuted) {
  if (isMuted) {
    btnToggleMic.className = 'btn-control muted';
    btnToggleMicText.textContent = 'Activar Mic';
    if (btnSidebarMic) {
      btnSidebarMic.className = 'sidebar-mic-btn muted';
      btnSidebarMic.title = 'Activar Micrófono';
    }
  } else {
    btnToggleMic.className = 'btn-control active';
    btnToggleMicText.textContent = 'Silenciar';
    if (btnSidebarMic) {
      btnSidebarMic.className = 'sidebar-mic-btn active';
      btnSidebarMic.title = 'Silenciar Micrófono';
    }
  }
}

// Mute Local Microphone Toggle
btnToggleMic.addEventListener('click', () => {
  const isMuted = audioManager.toggleMute();
  syncMicUi(isMuted);
  showToast(isMuted ? 'Micrófono silenciado' : 'Micrófono activo');

  peerManager.sendData({
    type: 'mute',
    muted: isMuted
  });
});

btnSidebarMic?.addEventListener('click', () => {
  btnToggleMic.click();
});

// Mute Remote Toggle
btnToggleRemoteAudio.addEventListener('click', () => {
  isRemoteMuted = !isRemoteMuted;
  remoteAudioElement.muted = isRemoteMuted;

  if (isRemoteMuted) {
    btnToggleRemoteAudio.className = 'btn-control muted';
    btnToggleRemoteAudioText.textContent = 'Activar audio remoto';
    showToast('Audio remoto silenciado');
  } else {
    btnToggleRemoteAudio.className = 'btn-control';
    btnToggleRemoteAudioText.textContent = 'Silenciar audio remoto';
    showToast('Audio remoto activo');
  }
});

// Copy Invite Link to Clipboard
function copyInviteLink() {
  const code = peerManager.roomId;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Código copiado: ${code}`);
  }).catch(() => {
    window.prompt('Copia este código de sala:', code);
  });
}

btnCopyInvite?.addEventListener('click', copyInviteLink);
btnShareInviteSecondary?.addEventListener('click', copyInviteLink);

// Sync editable name changes
hostNameInput.addEventListener('change', () => {
  peerManager.sendData({
    type: 'profile',
    name: hostNameInput.value
  });
});

// Start the app on load
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Cuenta, amigos, canales y llamadas directas (Supabase). Aditivo a la sala P2P.
  // No espera al micrófono: la cuenta tiene que estar disponible aunque el permiso demore o falle.
  initSocial({
    joinRoom: (code) => {
      if (peerManager.setRoom(code)) {
        roomPill.textContent = `Sala: ${peerManager.roomId}`;
      }
    },
    getRoom: () => peerManager.roomId,
    setLocalName: (name) => {
      hostNameInput.value = name;
      peerManager.sendData({ type: 'profile', name });
    },
    toast: showToast,
    onChannelChange: (channel) => {
      currentActiveChannel = channel;
      updateMainViews();
    }
  });
  // Buscar actualizaciones al abrir (opcional) + popover en el tag de versión del header.
  initUpdater({ toast: showToast });
});
// Room Join Controls
const inputJoinRoom = document.getElementById('inputJoinRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');

function handleJoinRoom() {
  const code = inputJoinRoom.value.trim();
  if (!code) {
    showToast('Ingresa un código de sala válido');
    return;
  }

  const success = peerManager.setRoom(code);
  if (success) {
    roomPill.textContent = `Sala: ${peerManager.roomId}`;
    showToast(`Conectando a la sala ${peerManager.roomId}...`);
    inputJoinRoom.value = '';
  } else {
    showToast('Código de sala no válido');
  }
}

btnJoinRoom?.addEventListener('click', handleJoinRoom);
inputJoinRoom?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleJoinRoom();
  }
});