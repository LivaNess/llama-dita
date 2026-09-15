import Peer from 'peerjs';

export class PeerManager {
  constructor() {
    this.peer = null;
    this.currentCall = null;
    this.dataConnection = null;
    this.roomId = null;
    this.slot = null; // 'a' or 'b'
    this.localStream = null;
    this.heartbeatTimer = null;

    // Callbacks
    this.onRemoteStream = null;
    this.onConnectionStatusChange = null;
    this.onRemoteData = null;
    this.onError = null;
  }

  detectRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    if (!room && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      room = hashParams.get('room');
    }

    if (room) {
      this.roomId = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    } else {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      this.roomId = `toki-${randomSuffix}`;
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('room', this.roomId);
      window.history.replaceState({}, '', newUrl);
    }

    return { roomId: this.roomId };
  }

  getInviteUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  // Create silent stream fallback so call never fails if mic is temporarily waiting
  createSilentStream() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const dst = osc.connect(ctx.createMediaStreamDestination());
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return dst.stream;
  }

  // Start Peer with auto-slot assignment ('a' or 'b')
  initPeer(stream, onStatusUpdate) {
    this.localStream = stream;
    if (onStatusUpdate) this.onConnectionStatusChange = onStatusUpdate;

    this.onConnectionStatusChange?.('connecting', 'Conectando con la sala de podcast...');
    this.tryConnectSlot('a');
  }

  tryConnectSlot(targetSlot) {
    this.slot = targetSlot;
    const peerId = `${this.roomId}-${targetSlot}`;
    console.log(`Intentando conectar en slot [${targetSlot}] con ID: ${peerId}`);

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    this.peer = new Peer(peerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:openrelay.metered.ca:80' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log(`✓ Conectado exitosamente como: ${id} (Slot ${this.slot.toUpperCase()})`);

      if (this.slot === 'a') {
        this.onConnectionStatusChange?.('waiting', 'Esperando a que tu amigo entre al enlace...');
      } else {
        // Slot B connects to Slot A
        this.onConnectionStatusChange?.('connecting', 'Conectando con tu amigo...');
        const partnerId = `${this.roomId}-a`;
        this.connectToPartner(partnerId);
      }
    });

    // Handle incoming calls (Slot A receiving from Slot B, or vice-versa)
    this.peer.on('call', (call) => {
      console.log('Llamada entrante recibida de:', call.peer);
      this.currentCall = call;

      const activeStream = this.localStream || this.createSilentStream();
      call.answer(activeStream);

      call.on('stream', (remoteStream) => {
        console.log('Stream de audio remoto recibido!');
        this.onConnectionStatusChange?.('connected', '¡En vivo con tu amigo!');
        this.onRemoteStream?.(remoteStream);
      });

      call.on('close', () => {
        console.log('Llamada cerrada por el par');
        this.handleDisconnect();
      });

      call.on('error', (err) => {
        console.error('Error en llamada entrante:', err);
      });
    });

    // Handle incoming data connections
    this.peer.on('connection', (conn) => {
      console.log('Conexión de datos entrante de:', conn.peer);
      this.setupDataConnection(conn);
    });

    // Error handling
    this.peer.on('error', (err) => {
      console.warn(`Error en PeerJS (Slot ${this.slot}):`, err.type, err.message);

      if (err.type === 'unavailable-id') {
        if (this.slot === 'a') {
          // Slot A is already occupied by friend! We take Slot B
          console.log('Slot A ya está ocupado. Conectando como Slot B...');
          this.tryConnectSlot('b');
          return;
        } else {
          this.onConnectionStatusChange?.('error', 'La sala está completa (máximo 2 participantes).');
        }
      } else if (err.type === 'peer-unavailable') {
        // Partner not ready yet
        this.onConnectionStatusChange?.('waiting', 'Esperando a que tu amigo se una...');
      } else {
        this.onError?.(err);
      }
    });

    this.peer.on('disconnected', () => {
      console.warn('Peer desconectado, intentando reconectar...');
      try { this.peer.reconnect(); } catch (e) {}
    });
  }

  // Connect Slot B to Slot A
  connectToPartner(partnerId) {
    console.log('Llamando a par:', partnerId);

    // 1. Data Connection
    const conn = this.peer.connect(partnerId, { reliable: true });
    this.setupDataConnection(conn);

    // 2. Audio Call
    const activeStream = this.localStream || this.createSilentStream();
    const call = this.peer.call(partnerId, activeStream);
    this.currentCall = call;

    if (call) {
      call.on('stream', (remoteStream) => {
        console.log('Stream de audio de par recibido!');
        this.onConnectionStatusChange?.('connected', '¡En vivo con tu amigo!');
        this.onRemoteStream?.(remoteStream);
      });

      call.on('close', () => {
        this.handleDisconnect();
      });

      call.on('error', (err) => {
        console.error('Error en llamada a par:', err);
      });
    }
  }

  setupDataConnection(conn) {
    this.dataConnection = conn;

    conn.on('open', () => {
      console.log('✓ Canal de datos abierto con:', conn.peer);
      this.onConnectionStatusChange?.('connected', '¡En vivo con tu amigo!');

      // Start heartbeat
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (conn.open) conn.send({ type: 'ping' });
      }, 3000);
    });

    conn.on('data', (data) => {
      if (data.type === 'ping') {
        conn.send({ type: 'pong' });
        return;
      }
      this.onRemoteData?.(data);
    });

    conn.on('close', () => {
      console.log('Canal de datos cerrado');
      this.handleDisconnect();
    });

    conn.on('error', (err) => {
      console.warn('Error en canal de datos:', err);
    });
  }

  sendData(data) {
    if (this.dataConnection && this.dataConnection.open) {
      this.dataConnection.send(data);
    }
  }

  updateLocalStream(newStream) {
    this.localStream = newStream;
    if (this.currentCall && this.currentCall.peerConnection) {
      const senders = this.currentCall.peerConnection.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (audioSender && newAudioTrack) {
        audioSender.replaceTrack(newAudioTrack).then(() => {
          console.log('Pista de audio actualizada en llamada WebRTC');
        }).catch(err => console.warn('Error al reemplazar pista:', err));
      }
    }
  }

  handleDisconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.currentCall = null;
    this.dataConnection = null;
    this.onConnectionStatusChange?.('disconnected', 'Tu amigo se ha desconectado.');
  }

  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.currentCall) this.currentCall.close();
    if (this.dataConnection) this.dataConnection.close();
    if (this.peer) this.peer.destroy();
  }
}