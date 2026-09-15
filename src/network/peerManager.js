import Peer from 'peerjs';

export class PeerManager {
  constructor() {
    this.peer = null;
    this.currentCall = null;
    this.dataConnection = null;
    this.roomId = null;
    this.slot = null;
    this.localStream = null;
    this.heartbeatTimer = null;

    // Callbacks
    this.onRemoteStream = null;
    this.onConnectionStatusChange = null;
    this.onRemoteData = null;
    this.onError = null;
  }

  // Parse raw input (clean room code, partial code, or full URL)
  static normalizeRoomId(rawInput) {
    if (!rawInput) return null;
    let input = rawInput.trim();

    // Check if it's a URL
    try {
      if (input.includes('?') || input.includes('#')) {
        const urlObj = new URL(input.startsWith('http') ? input : `http://dummy.com/${input}`);
        const param = urlObj.searchParams.get('room') || new URLSearchParams(urlObj.hash.substring(1)).get('room');
        if (param) input = param;
      }
    } catch (e) {}

    // Clean characters
    let cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleaned) return null;

    // Ensure llamadita- prefix
    if (!cleaned.startsWith('llamadita-')) {
      cleaned = `llamadita-${cleaned}`;
    }
    return cleaned;
  }

  detectRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    if (!room && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      room = hashParams.get('room');
    }

    if (room) {
      this.roomId = PeerManager.normalizeRoomId(room);
    } else {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      this.roomId = `llamadita-${randomSuffix}`;
    }

    return { roomId: this.roomId };
  }

  getInviteUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

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

  initPeer(stream, onStatusUpdate) {
    this.localStream = stream;
    if (onStatusUpdate) this.onConnectionStatusChange = onStatusUpdate;

    this.onConnectionStatusChange?.('connecting', 'Estableciendo conexión P2P...');
    this.tryConnectSlot('a');
  }

  // Join a different room manually
  setRoom(targetRoomId) {
    const normalized = PeerManager.normalizeRoomId(targetRoomId);
    if (!normalized) return false;

    this.destroy();
    this.roomId = normalized;

    // Update browser URL if in browser mode
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('room', this.roomId);
      window.history.replaceState({}, '', newUrl);
    } catch (e) {}

    this.initPeer(this.localStream, this.onConnectionStatusChange);
    return true;
  }

  tryConnectSlot(targetSlot) {
    this.slot = targetSlot;
    const peerId = `${this.roomId}-${targetSlot}`;

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    this.peer = new Peer(peerId, {
      debug: 0,
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
      if (this.slot === 'a') {
        this.onConnectionStatusChange?.('waiting', 'Esperando conexión remota...');
      } else {
        this.onConnectionStatusChange?.('connecting', 'Conectando con el participante...');
        const partnerId = `${this.roomId}-a`;
        this.connectToPartner(partnerId);
      }
    });

    this.peer.on('call', (call) => {
      this.currentCall = call;
      const activeStream = this.localStream || this.createSilentStream();
      call.answer(activeStream);

      call.on('stream', (remoteStream) => {
        this.onConnectionStatusChange?.('connected', 'Conexión activa');
        this.onRemoteStream?.(remoteStream);
      });

      call.on('close', () => {
        this.handleDisconnect();
      });

      call.on('error', (err) => {
        console.error('Error en llamada entrante:', err);
      });
    });

    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        if (this.slot === 'a') {
          this.tryConnectSlot('b');
          return;
        } else {
          this.onConnectionStatusChange?.('error', 'Sala completa (máximo 2 participantes).');
        }
      } else if (err.type === 'peer-unavailable') {
        this.onConnectionStatusChange?.('waiting', 'Esperando que el participante se conecte...');
      } else {
        this.onError?.(err);
      }
    });

    this.peer.on('disconnected', () => {
      try { this.peer.reconnect(); } catch (e) {}
    });
  }

  connectToPartner(partnerId) {
    const conn = this.peer.connect(partnerId, { reliable: true });
    this.setupDataConnection(conn);

    const activeStream = this.localStream || this.createSilentStream();
    const call = this.peer.call(partnerId, activeStream);
    this.currentCall = call;

    if (call) {
      call.on('stream', (remoteStream) => {
        this.onConnectionStatusChange?.('connected', 'Conexión activa');
        this.onRemoteStream?.(remoteStream);
      });

      call.on('close', () => {
        this.handleDisconnect();
      });

      call.on('error', (err) => {
        console.error('Error en llamada saliente:', err);
      });
    }
  }

  setupDataConnection(conn) {
    this.dataConnection = conn;

    conn.on('open', () => {
      this.onConnectionStatusChange?.('connected', 'Conexión activa');

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
        audioSender.replaceTrack(newAudioTrack).catch(err => {
          console.warn('Error al actualizar pista:', err);
        });
      }
    }
  }

  handleDisconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.currentCall = null;
    this.dataConnection = null;
    this.onConnectionStatusChange?.('disconnected', 'Participante desconectado');
  }

  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.currentCall) {
      try { this.currentCall.close(); } catch (e) {}
      this.currentCall = null;
    }
    if (this.dataConnection) {
      try { this.dataConnection.close(); } catch (e) {}
      this.dataConnection = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
  }
}