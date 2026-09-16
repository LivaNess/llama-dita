// La señalización usa el MISMO cliente que el resto de la app: cada cliente nuevo
// abre una conexión en vivo más por usuario y el plan gratis permite 200 en total.
import { supabase } from '../supabase/client.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export class PeerManager {
  constructor() {
    this.supabase = supabase;

    this.myPeerId = 'p_' + Math.random().toString(36).substring(2, 10);
    this.roomId = null;
    this.remotePeerId = null;
    this.channel = null;
    this.pc = null;
    this.dataChannel = null;
    this.localStream = null;
    this.iceCandidateQueue = [];
    this.heartbeatTimer = null;
    this.isInitiatingCall = false;

    // Callbacks
    this.onRemoteStream = null;
    this.onConnectionStatusChange = null;
    this.onRemoteData = null;
    this.onError = null;
  }

  static normalizeRoomId(rawInput) {
    if (!rawInput) return null;
    let input = rawInput.trim();

    try {
      if (input.includes('?') || input.includes('#')) {
        const urlObj = new URL(input.startsWith('http') ? input : `http://dummy.com/${input}`);
        const param = urlObj.searchParams.get('room') || new URLSearchParams(urlObj.hash.substring(1)).get('room');
        if (param) input = param;
      }
    } catch (e) {}

    let cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleaned) return null;

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
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const dst = osc.connect(ctx.createMediaStreamDestination());
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) track.enabled = false;
      return dst.stream;
    } catch (e) {
      return new MediaStream();
    }
  }

  initPeer(stream, onStatusUpdate) {
    this.localStream = stream;
    if (onStatusUpdate) this.onConnectionStatusChange = onStatusUpdate;

    this.onConnectionStatusChange?.('connecting', 'Conectando a sala de señalización...');
    this.joinRoomChannel();
  }

  setRoom(targetRoomId) {
    const normalized = PeerManager.normalizeRoomId(targetRoomId);
    if (!normalized) return false;

    this.destroy();
    this.roomId = normalized;

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('room', this.roomId);
      window.history.replaceState({}, '', newUrl);
    } catch (e) {}

    this.initPeer(this.localStream, this.onConnectionStatusChange);
    return true;
  }

  joinRoomChannel() {
    if (!this.roomId) return;

    if (this.channel) {
      try {
        this.channel.unsubscribe();
        this.supabase.removeChannel(this.channel);
      } catch (e) {}
    }

    const channelName = `room_${this.roomId}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: this.myPeerId }
      }
    });

    // Listen to WebRTC signals
    this.channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (!payload || payload.to !== this.myPeerId) return;
      await this.handleSignal(payload);
    });

    // Listen to Presence
    this.channel.on('presence', { event: 'sync' }, () => {
      this.handlePresenceSync();
    });

    this.channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === this.remotePeerId) {
        console.log('Participante desconectado:', key);
        this.handleDisconnect();
      }
    });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Conectado al canal ${channelName} como ${this.myPeerId}`);
        await this.channel.track({
          peerId: this.myPeerId,
          joinedAt: Date.now()
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.onConnectionStatusChange?.('error', 'Error en canal de señalización. Reintentando...');
      }
    });
  }

  handlePresenceSync() {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState();
    const activePeers = [];

    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key];
      if (presences && presences.length > 0) {
        activePeers.push(presences[0]);
      }
    }

    const remotePeers = activePeers.filter(p => p.peerId !== this.myPeerId);

    if (remotePeers.length === 0) {
      if (this.remotePeerId) {
        this.handleDisconnect();
      } else {
        this.onConnectionStatusChange?.('waiting', 'Esperando conexión remota...');
      }
      return;
    }

    if (remotePeers.length > 1) {
      this.onConnectionStatusChange?.('error', 'Sala completa (máximo 2 participantes).');
      return;
    }

    const targetRemotePeer = remotePeers[0];
    this.remotePeerId = targetRemotePeer.peerId;

    // Determine caller deterministically: highest peerId initiates the call
    const isCaller = this.myPeerId > this.remotePeerId;
    if (isCaller && (!this.pc || this.pc.connectionState === 'closed' || this.pc.connectionState === 'disconnected')) {
      if (!this.isInitiatingCall) {
        this.isInitiatingCall = true;
        this.onConnectionStatusChange?.('connecting', 'Participante encontrado. Iniciando llamada...');
        setTimeout(() => {
          this.initiateCall();
          this.isInitiatingCall = false;
        }, 300);
      }
    } else if (!isCaller && !this.pc) {
      this.onConnectionStatusChange?.('connecting', 'Participante encontrado. Esperando oferta...');
    }
  }

  setupPeerConnection() {
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }

    this.iceCandidateQueue = [];
    this.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    // Add audio tracks
    const activeStream = this.localStream || this.createSilentStream();
    if (activeStream) {
      activeStream.getAudioTracks().forEach(track => {
        try {
          this.pc.addTrack(track, activeStream);
        } catch (e) {
          console.warn('Error al añadir track de audio:', e);
        }
      });
    }

    // ICE Candidate generation
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.remotePeerId) {
        this.sendSignal({
          from: this.myPeerId,
          to: this.remotePeerId,
          type: 'candidate',
          data: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
        });
      }
    };

    // Receive remote stream
    this.pc.ontrack = (event) => {
      console.log('Pista de audio remota recibida:', event.track);
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      this.onConnectionStatusChange?.('connected', 'Conexión activa');
      this.onRemoteStream?.(stream);
    };

    // Connection state listeners
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log('RTCPeerConnection state:', state);

      if (state === 'connected') {
        this.onConnectionStatusChange?.('connected', 'Conexión activa');
      } else if (state === 'connecting') {
        this.onConnectionStatusChange?.('connecting', 'Estableciendo enlace de audio...');
      } else if (state === 'disconnected') {
        this.onConnectionStatusChange?.('disconnected', 'Participante desconectado');
      } else if (state === 'failed') {
        console.warn('Conexión P2P fallida. Reintentando reinicio ICE...');
        this.onConnectionStatusChange?.('connecting', 'Reconectando vía relay...');
        this.restartIceConnection();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc.iceConnectionState;
      console.log('ICE connection state:', iceState);

      if (iceState === 'connected' || iceState === 'completed') {
        this.onConnectionStatusChange?.('connected', 'Conexión activa');
      } else if (iceState === 'checking') {
        this.onConnectionStatusChange?.('connecting', 'Negociando candidatos de red...');
      } else if (iceState === 'failed') {
        this.restartIceConnection();
      }
    };

    // Data channel handling
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  async initiateCall() {
    if (!this.remotePeerId) return;

    this.setupPeerConnection();

    // Create Data Channel as initiator
    try {
      this.dataChannel = this.pc.createDataChannel('llamaData', { reliable: true });
      this.setupDataChannel(this.dataChannel);
    } catch (e) {
      console.warn('Error al crear DataChannel:', e);
    }

    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        voiceActivityDetection: true
      });
      await this.pc.setLocalDescription(offer);

      this.sendSignal({
        from: this.myPeerId,
        to: this.remotePeerId,
        type: 'offer',
        data: {
          type: offer.type,
          sdp: offer.sdp
        }
      });
    } catch (err) {
      console.error('Error al crear oferta WebRTC:', err);
      this.onError?.(err);
    }
  }

  async handleSignal(payload) {
    const { from, type, data } = payload;

    if (type === 'offer') {
      this.remotePeerId = from;
      this.setupPeerConnection();

      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data));
        await this.drainIceCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.sendSignal({
          from: this.myPeerId,
          to: from,
          type: 'answer',
          data: {
            type: answer.type,
            sdp: answer.sdp
          }
        });
      } catch (err) {
        console.error('Error al procesar oferta:', err);
        this.onError?.(err);
      }
    } else if (type === 'answer') {
      if (!this.pc) return;
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data));
        await this.drainIceCandidates();
      } catch (err) {
        console.error('Error al procesar respuesta:', err);
        this.onError?.(err);
      }
    } else if (type === 'candidate') {
      if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (err) {
          console.warn('Error al añadir candidato ICE:', err);
        }
      } else {
        this.iceCandidateQueue.push(data);
      }
    } else if (type === 'direct-data') {
      this.onRemoteData?.(data);
    }
  }

  async drainIceCandidates() {
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Error drenando candidato ICE:', e);
      }
    }
  }

  sendSignal(signalPayload) {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: signalPayload
    }).catch(err => {
      console.warn('Error al enviar señalización broadcast:', err);
    });
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;

    channel.onopen = () => {
      console.log('Canal de datos abierto');
      this.onConnectionStatusChange?.('connected', 'Conexión activa');

      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(JSON.stringify({ type: 'ping' }));
        }
      }, 3000);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          if (channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }
        if (data.type === 'pong') return;
        this.onRemoteData?.(data);
      } catch (err) {
        console.warn('Error al parsear mensaje en DataChannel:', err);
      }
    };

    channel.onclose = () => {
      console.log('Canal de datos cerrado');
    };

    channel.onerror = (err) => {
      console.warn('Error en DataChannel:', err);
    };
  }

  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(data));
        return;
      } catch (e) {}
    }

    // Fallback through Supabase broadcast if P2P data channel is not yet established
    if (this.channel && this.remotePeerId) {
      this.sendSignal({
        from: this.myPeerId,
        to: this.remotePeerId,
        type: 'direct-data',
        data: data
      });
    }
  }

  updateLocalStream(newStream) {
    this.localStream = newStream;
    if (!this.pc) return;

    const newAudioTrack = newStream ? newStream.getAudioTracks()[0] : null;
    if (!newAudioTrack) return;

    const senders = this.pc.getSenders();
    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

    if (audioSender) {
      audioSender.replaceTrack(newAudioTrack).catch(err => {
        console.warn('Error reemplazando pista de audio:', err);
      });
    } else {
      try {
        this.pc.addTrack(newAudioTrack, newStream);
      } catch (err) {
        console.warn('Error añadiendo pista de audio:', err);
      }
    }
  }

  restartIceConnection() {
    if (!this.pc) return;
    try {
      if (typeof this.pc.restartIce === 'function') {
        this.pc.restartIce();
      }
      if (this.myPeerId > this.remotePeerId) {
        this.initiateCall();
      }
    } catch (e) {
      console.warn('Error al reiniciar ICE:', e);
    }
  }

  handleDisconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.remotePeerId = null;

    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    this.iceCandidateQueue = [];
    this.onConnectionStatusChange?.('disconnected', 'Participante desconectado');
  }

  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    if (this.channel) {
      try {
        this.channel.unsubscribe();
        this.supabase.removeChannel(this.channel);
      } catch (e) {}
      this.channel = null;
    }

    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }

    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }

    this.remotePeerId = null;
    this.iceCandidateQueue = [];
  }
}
