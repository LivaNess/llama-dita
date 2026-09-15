import { audioManager } from './audio/audioManager.js';
import { PeerManager } from './network/peerManager.js';
import { AudioVisualizer } from './components/visualizer.js';

// DOM Elements
const audioPermissionBanner = document.getElementById('audioPermissionBanner');
const btnActivateAudio = document.getElementById('btnActivateAudio');

const onAirBadge = document.getElementById('onAirBadge');
const onAirText = document.getElementById('onAirText');
const roomPill = document.getElementById('roomPill');
const btnCopyInvite = document.getElementById('btnCopyInvite');
const btnShareInviteSecondary = document.getElementById('btnShareInviteSecondary');

// Local (Left Booth) DOM
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

// Remote (Right Booth) DOM
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

// Peak hold values for VU meters
let hostPeakHold = 0;
let hostPeakTimer = 0;
let guestPeakHold = 0;
let guestPeakTimer = 0;

// Toast helper
function showToast(message, duration = 3500) {
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
    hostStatusPill.innerHTML = '<span>⏳ Conectando micrófono...</span>';
    localStream = await audioManager.initLocalStream(deviceId);
    
    // Get track info
    const track = localStream.getAudioTracks()[0];
    const trackLabel = track && track.label ? track.label : 'Micrófono activo';
    hostStatusPill.innerHTML = `<span>🎤 ${trackLabel.substring(0, 24)}</span>`;
    
    // Update peer if already in a call
    peerManager.updateLocalStream(localStream);
    
    // Reload device dropdown
    await loadAudioDevices();
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'none';
    }
    return true;
  } catch (err) {
    console.error('Error micrófono:', err);
    hostStatusPill.innerHTML = '<span style="color:#ef4444">⚠️ Clic en "Activar Estudio" para dar permiso</span>';
    if (audioPermissionBanner) {
      audioPermissionBanner.style.display = 'flex';
    }
    showToast('Por favor permite el acceso al micrófono en el navegador', 5000);
    return false;
  }
}

// Initialize Application
async function init() {
  const { roomId } = peerManager.detectRoom();
  roomPill.textContent = `Sala: ${roomId}`;

  hostNameInput.value = 'Mi Cabina (Tú)';
  guestNameInput.value = 'Amigo (Invitado)';
  hostRoleBadge.textContent = 'Tú';
  guestRoleBadge.textContent = 'Amigo';

  // 1. Attempt initial microphone access
  await startMicrophone();

  // 2. Setup PeerJS connection
  setupNetworking();

  // 3. Start 60fps Visualizer Animation Loop
  requestAnimationFrame(renderAudioMetrics);
}

// Load audio devices into selector
async function loadAudioDevices() {
  try {
    const devices = await audioManager.getAudioInputDevices();
    micDeviceSelect.innerHTML = '';

    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'Micrófono predeterminado';
      opt.value = '';
      micDeviceSelect.appendChild(opt);
      return;
    }

    devices.forEach((device, index) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.text = device.label || `Micrófono ${index + 1}`;
      if (device.deviceId === audioManager.currentDeviceId) {
        opt.selected = true;
      }
      micDeviceSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn('No se pudieron listar dispositivos:', err);
  }
}

// Handle device switch
micDeviceSelect.addEventListener('change', async (e) => {
  const deviceId = e.target.value;
  if (!deviceId) return;
  const ok = await startMicrophone(deviceId);
  if (ok) {
    showToast('Micrófono cambiado exitosamente');
  }
});

// Microphone sensitivity range slider
micSensitivityRange.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  sensitivityVal.textContent = `${val}%`;
  audioManager.setMicSensitivity(val / 100);
});

// Test / Loopback toggle (self-monitoring)
btnLoopback.addEventListener('click', () => {
  const isEnabled = audioManager.toggleLoopback();
  if (isEnabled) {
    btnLoopback.className = 'btn-control btn-secondary active';
    btnLoopbackText.textContent = 'Detener prueba';
    showToast('🔊 Modo prueba activo: Habla para comprobar cómo te escuchas');
  } else {
    btnLoopback.className = 'btn-control btn-secondary';
    btnLoopbackText.textContent = 'Probar audio';
    showToast('Modo prueba detenido');
  }
});

// Setup WebRTC and Event Listeners
function setupNetworking() {
  peerManager.onConnectionStatusChange = (status, msg) => {
    console.log('Status update:', status, msg);
    if (status === 'connected') {
      isConnected = true;
      onAirBadge.classList.add('live');
      onAirText.textContent = 'ON AIR';
      guestStatusPill.innerHTML = '<span style="color:#34d399">🟢 En Vivo</span>';
      guestSpeakingIndicator.className = 'speaking-indicator';
      guestSpeakingText.textContent = 'Conectado';
      showToast('¡Tu amigo se ha conectado a la cabina!');

      // Send local name
      peerManager.sendData({
        type: 'profile',
        name: hostNameInput.value
      });
    } else if (status === 'waiting') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'ESPERANDO';
      guestStatusPill.innerHTML = '<span>⏳ Esperando a que tu amigo se una...</span>';
    } else if (status === 'connecting') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'CONECTANDO';
      guestStatusPill.innerHTML = '<span>🔄 Conectando con tu amigo...</span>';
    } else if (status === 'disconnected') {
      isConnected = false;
      onAirBadge.classList.remove('live');
      onAirText.textContent = 'STANDBY';
      guestStatusPill.innerHTML = '<span style="color:#f87171">🔴 Desconectado</span>';
      guestSpeakingIndicator.classList.remove('active');
      guestSpeakingText.textContent = 'Desconectado';
      showToast('Tu amigo se ha desconectado');
    } else if (status === 'error') {
      guestStatusPill.innerHTML = `<span style="color:#f87171">⚠️ ${msg}</span>`;
    }
  };

  peerManager.onRemoteStream = (stream) => {
    console.log('Audio remoto recibido con pistas:', stream.getAudioTracks().length);
    remoteStream = stream;
    remoteAudioElement.srcObject = stream;
    
    // Play remote audio safely
    remoteAudioElement.play().catch(e => {
      console.warn('Autoplay bloqueado por navegador, clic requerido', e);
      if (audioPermissionBanner) {
        audioPermissionBanner.style.display = 'flex';
      }
    });

    // Create raw PCM processor for remote audio
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
    console.error('Peer error:', err);
  };

  peerManager.initPeer(localStream);
}

// 60 FPS Render Loop using Direct PCM Audio Metrics
function renderAudioMetrics() {
  const isSuspended = audioManager.audioCtx && audioManager.audioCtx.state === 'suspended';

  // 1. Local Microphone Metrics
  if (isSuspended) {
    hostMeterReadout.textContent = 'HAZ CLIC EN LA PÁGINA';
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

    // Update Local VU Meter Fill
    hostVuFill.style.width = `${volume}%`;

    // Peak Hold
    if (volume > hostPeakHold) {
      hostPeakHold = volume;
      hostPeakTimer = 25;
    } else if (hostPeakTimer > 0) {
      hostPeakTimer--;
    } else {
      hostPeakHold = Math.max(0, hostPeakHold - 2.5);
    }
    hostVuPeak.style.left = `${hostPeakHold}%`;

    // Readout
    hostMeterReadout.textContent = `${db} dB · ${volume}%`;

    // Speaking Indicator & Vocal Aura
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

    // Canvas spectrum
    const freqData = audioManager.getFrequencyData(audioManager.localAnalyser);
    const timeData = audioManager.getTimeDomainData(audioManager.localAnalyser);
    hostVisualizer.draw({ volume, db, freqData, timeData }, true);
  }

  // 2. Remote Friend Audio Metrics
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

// Mute Local Microphone Toggle
btnToggleMic.addEventListener('click', () => {
  const isMuted = audioManager.toggleMute();
  if (isMuted) {
    btnToggleMic.className = 'btn-control muted';
    btnToggleMicText.textContent = 'Activar Mic';
    showToast('Micrófono silenciado');
  } else {
    btnToggleMic.className = 'btn-control active';
    btnToggleMicText.textContent = 'Silenciar';
    showToast('Micrófono activado');
  }

  peerManager.sendData({
    type: 'mute',
    muted: isMuted
  });
});

// Mute Remote Friend Toggle
btnToggleRemoteAudio.addEventListener('click', () => {
  isRemoteMuted = !isRemoteMuted;
  remoteAudioElement.muted = isRemoteMuted;

  if (isRemoteMuted) {
    btnToggleRemoteAudio.className = 'btn-control muted';
    btnToggleRemoteAudioText.textContent = 'Reactivar audio de mi amigo';
    showToast('Has silenciado el audio de tu amigo');
  } else {
    btnToggleRemoteAudio.className = 'btn-control';
    btnToggleRemoteAudioText.textContent = 'Silenciar a mi amigo';
    showToast('Audio de tu amigo reactivado');
  }
});

// Copy Invite Link to Clipboard
function copyInviteLink() {
  const inviteUrl = peerManager.getInviteUrl();
  navigator.clipboard.writeText(inviteUrl).then(() => {
    showToast('¡Enlace copiado! Pásaselo a tu amigo para que entre a la cabina.');
  }).catch(() => {
    window.prompt('Copia este enlace de invitación:', inviteUrl);
  });
}

btnCopyInvite.addEventListener('click', copyInviteLink);
btnShareInviteSecondary.addEventListener('click', copyInviteLink);

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
});