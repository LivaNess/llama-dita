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
    this.channel = null;

    // Multi-peer mesh map: peerId -> peerSession
    this.peers = new Map();

    this.localStream = null;
    this.localVideoStream = null;
    this.localName = null;
    this.localAvatarKey = null;

    // Callbacks
    this.onRemoteStream = null; // (stream, peerId, profile)
    this.onRemoteVideoStream = null; // (videoStream, track, peerId)
    this.onRemoteVideoStateChange = null; // (enabled, peerId)
    this.onConnectionStatusChange = null; // (status, text)
    this.onRemoteData = null; // (data, peerId)
    this.onPeersUpdate = null; // (peersList)
    this.onPeerLeave = null; // (peerId)
    this.onError = null;
  }

  // Getters para compatibilidad hacia atrás
  get remotePeerId() {
    return this.peers.keys().next().value || null;
  }

  get pc() {
    return this.peers.values().next().value?.pc || null;
  }

  get dataChannel() {
    return this.peers.values().next().value?.dataChannel || null;
  }

  get connectedPeers() {
    return Array.from(this.peers.values());
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

  leaveRoom() {
    // Enviar hangup a todos los peers activos
    for (const peerId of this.peers.keys()) {
      try {
        this.sendSignal({
          from: this.myPeerId,
          to: peerId,
          type: 'hangup'
        });
      } catch (_) {}
    }

    this.destroy();
    this.roomId = `llamadita-${Math.random().toString(36).substring(2, 8)}`;

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('room', this.roomId);
      window.history.replaceState({}, '', newUrl);
    } catch (e) {}

    this.joinRoomChannel();
    return this.roomId;
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

    // Escuchar señales WebRTC P2P
    this.channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (!payload || payload.to !== this.myPeerId) return;
      await this.handleSignal(payload);
    });

    // Escuchar presencia en la sala
    this.channel.on('presence', { event: 'sync' }, () => {
      this.handlePresenceSync();
    });

    this.channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (this.peers.has(key)) {
        console.log('Participante desconectado vía presencia:', key);
        this.closePeerSession(key);
      }
    });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Conectado al canal ${channelName} como ${this.myPeerId}`);
        await this.trackPresence();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.onConnectionStatusChange?.('error', 'Error en canal de señalización. Reintentando...');
      }
    });
  }

  async trackPresence() {
    if (!this.channel) return;
    try {
      await this.channel.track({
        peerId: this.myPeerId,
        name: this.localName,
        avatarKey: this.localAvatarKey,
        isVideoOn: !!(this.localVideoStream && this.localVideoStream.getVideoTracks()[0]?.enabled),
        joinedAt: Date.now()
      });
    } catch (e) {
      console.warn('Error al trackear presencia:', e);
    }
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

    // Si no hay participantes remotos
    if (remotePeers.length === 0) {
      for (const pId of Array.from(this.peers.keys())) {
        this.closePeerSession(pId);
      }
      this.onConnectionStatusChange?.('waiting', 'Esperando participantes...');
      this.notifyPeersUpdate();
      return;
    }

    // Límite de capacidad a 5 participantes en total (4 remotos)
    if (remotePeers.length > 4) {
      this.onConnectionStatusChange?.('error', 'Sala completa (máximo 5 participantes).');
    }

    // 1. Cerrar peers que ya no están en presencia
    const remotePeerIds = new Set(remotePeers.map(r => r.peerId));
    for (const pId of Array.from(this.peers.keys())) {
      if (!remotePeerIds.has(pId)) {
        this.closePeerSession(pId);
      }
    }

    // 2. Conectar con peers nuevos (hasta 4 remotos)
    const allowedRemotes = remotePeers.slice(0, 4);
    for (const remote of allowedRemotes) {
      let peer = this.peers.get(remote.peerId);
      if (!peer) {
        peer = this.createPeerSession(remote.peerId, {
          name: remote.name,
          avatarKey: remote.avatarKey
        });

        // Regla determinística: el peerId alfabéticamente mayor crea la oferta
        const isCaller = this.myPeerId > remote.peerId;
        if (isCaller) {
          setTimeout(() => {
            this.initiateCallTo(peer);
          }, 200 + Math.random() * 200);
        }
      } else {
        if (remote.name && (!peer.profile.name || peer.profile.name === 'Participante')) {
          peer.profile.name = remote.name;
        }
        if (remote.avatarKey) peer.profile.avatarKey = remote.avatarKey;
      }
    }

    const connectedCount = Array.from(this.peers.values()).filter(p => p.pc && p.pc.connectionState === 'connected').length;
    if (connectedCount > 0) {
      const statusText = connectedCount === 1 ? 'Conectado con 1 participante' : `Conectado con ${connectedCount} participantes`;
      this.onConnectionStatusChange?.('connected', statusText);
    } else {
      this.onConnectionStatusChange?.('connecting', `Conectando con ${allowedRemotes.length} participantes...`);
    }

    this.notifyPeersUpdate();
  }

  createPeerSession(remotePeerId, initialProfile = null) {
    if (this.peers.has(remotePeerId)) {
      return this.peers.get(remotePeerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    const peer = {
      peerId: remotePeerId,
      pc,
      dataChannel: null,
      stream: null,
      videoStream: null,
      isVideoOn: false,
      profile: initialProfile || { name: 'Participante', avatarKey: null },
      iceCandidateQueue: [],
      heartbeatTimer: null,
      isInitiatingCall: false
    };

    this.peers.set(remotePeerId, peer);

    // Añadir tracks de audio local
    const activeStream = this.localStream || this.createSilentStream();
    if (activeStream) {
      activeStream.getAudioTracks().forEach(track => {
        try {
          pc.addTrack(track, activeStream);
        } catch (e) {
          console.warn('Error al añadir track de audio a peer:', remotePeerId, e);
        }
      });
    }

    // Video: pre-negociar transceiver para permitir conmutar cámara instantáneamente
    try {
      const initialVideoTrack = this.localVideoStream ? this.localVideoStream.getVideoTracks()[0] : null;
      if (initialVideoTrack) {
        const sender = pc.addTrack(initialVideoTrack, this.localVideoStream);
        if (sender) this.applyVideoBitrateLimits(sender);
      } else {
        const transceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
        if (transceiver?.sender) {
          this.applyVideoBitrateLimits(transceiver.sender);
        }
      }
    } catch (e) {
      console.warn('Error al configurar transceiver de video para peer:', remotePeerId, e);
    }

    // Manejo de candidatos ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          from: this.myPeerId,
          to: remotePeerId,
          type: 'candidate',
          data: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
        });
      }
    };

    // Recepción de pistas remotas
    pc.ontrack = (event) => {
      const track = event.track;
      console.log(`[P2P Mesh] Pista remota recibida de ${remotePeerId}:`, track.kind, track.id);

      if (track.kind === 'audio') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        peer.stream = stream;
        this.onRemoteStream?.(stream, remotePeerId, peer.profile);
        this.notifyPeersUpdate();
      } else if (track.kind === 'video') {
        const videoStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        peer.videoStream = videoStream;
        peer.isVideoOn = true;
        this.onRemoteVideoStream?.(videoStream, track, remotePeerId);

        track.onmute = () => {
          peer.isVideoOn = false;
          this.onRemoteVideoStateChange?.(false, remotePeerId);
          this.notifyPeersUpdate();
        };
        track.onunmute = () => {
          peer.isVideoOn = true;
          this.onRemoteVideoStateChange?.(true, remotePeerId);
          this.notifyPeersUpdate();
        };
        track.onended = () => {
          peer.isVideoOn = false;
          this.onRemoteVideoStateChange?.(false, remotePeerId);
          this.notifyPeersUpdate();
        };
        this.notifyPeersUpdate();
      }
    };

    // Canal de datos entrante
    pc.ondatachannel = (event) => {
      this.setupDataChannelForPeer(peer, event.channel);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[P2P Mesh] Estado conexión con ${remotePeerId}:`, state);

      if (state === 'connected') {
        const senders = pc.getSenders ? pc.getSenders() : [];
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) this.applyVideoBitrateLimits(videoSender);
        this.notifyPeersUpdate();
      } else if (state === 'disconnected' || state === 'failed') {
        console.warn(`[P2P Mesh] Conexión degradada con ${remotePeerId}`);
      }
    };

    return peer;
  }

  async initiateCallTo(peer) {
    if (!peer || !peer.pc || peer.isInitiatingCall) return;
    peer.isInitiatingCall = true;

    try {
      peer.dataChannel = peer.pc.createDataChannel('llamaData', { reliable: true });
      this.setupDataChannelForPeer(peer, peer.dataChannel);
    } catch (e) {
      console.warn('Error al crear DataChannel con peer:', peer.peerId, e);
    }

    try {
      const offer = await peer.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: true
      });
      await peer.pc.setLocalDescription(offer);

      this.sendSignal({
        from: this.myPeerId,
        to: peer.peerId,
        type: 'offer',
        data: {
          type: offer.type,
          sdp: offer.sdp
        }
      });
    } catch (err) {
      console.error(`Error al crear oferta para ${peer.peerId}:`, err);
      this.onError?.(err);
    } finally {
      peer.isInitiatingCall = false;
    }
  }

  async handleSignal(payload) {
    const { from, type, data } = payload;
    let peer = this.peers.get(from);

    if (type === 'offer') {
      if (!peer) {
        peer = this.createPeerSession(from);
      }

      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data));
        await this.drainIceCandidatesForPeer(peer);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);

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
        console.error(`Error al procesar oferta de ${from}:`, err);
        this.onError?.(err);
      }
    } else if (type === 'answer') {
      if (!peer || !peer.pc) return;
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data));
        await this.drainIceCandidatesForPeer(peer);
      } catch (err) {
        console.error(`Error al procesar respuesta de ${from}:`, err);
        this.onError?.(err);
      }
    } else if (type === 'candidate') {
      if (peer && peer.pc && peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (err) {
          console.warn('Error al añadir candidato ICE:', err);
        }
      } else if (peer) {
        peer.iceCandidateQueue.push(data);
      }
    } else if (type === 'direct-data') {
      this.handleRemoteDataForPeer(peer, data, from);
    } else if (type === 'hangup') {
      console.log(`Señal de corte recibida de ${from}`);
      this.closePeerSession(from);
    }
  }

  async drainIceCandidatesForPeer(peer) {
    if (!peer || !peer.pc) return;
    while (peer.iceCandidateQueue.length > 0) {
      const candidate = peer.iceCandidateQueue.shift();
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
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
    });
  }

  setupDataChannelForPeer(peer, channel) {
    if (!channel) return;
    peer.dataChannel = channel;

    channel.onopen = () => {
      console.log(`Canal de datos P2P abierto con ${peer.peerId}`);
      this.sendProfileToPeer(peer);

      if (peer.heartbeatTimer) clearInterval(peer.heartbeatTimer);
      peer.heartbeatTimer = setInterval(() => {
        if (channel.readyState === 'open') {
          channel.send(JSON.stringify({ type: 'ping' }));
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
        this.handleRemoteDataForPeer(peer, data, peer.peerId);
      } catch (err) {
        console.warn('Error al parsear mensaje en DataChannel:', err);
      }
    };

    channel.onclose = () => {
      console.log(`Canal de datos cerrado con ${peer.peerId}`);
      this.closePeerSession(peer.peerId);
    };

    channel.onerror = (err) => {
      console.warn(`Error en DataChannel con ${peer.peerId}:`, err);
    };
  }

  setLocalProfile(name, avatarKey = null) {
    this.localName = name || null;
    if (avatarKey !== undefined) this.localAvatarKey = avatarKey;
    this.trackPresence();
    this.sendProfileToAll();
  }

  sendProfileToPeer(peer, wantsReply = true) {
    if (!this.localName || !peer) return;
    this.sendDataToPeer(peer, {
      type: 'profile',
      name: this.localName,
      avatarKey: this.localAvatarKey || null,
      wantsReply
    });
  }

  sendProfileToAll(wantsReply = true) {
    if (!this.localName) return;
    for (const peer of this.peers.values()) {
      this.sendProfileToPeer(peer, wantsReply);
    }
  }

  handleRemoteDataForPeer(peer, data, fromPeerId) {
    if (!data) return;
    if (peer) {
      if (data.type === 'profile') {
        if (data.name) peer.profile.name = data.name;
        if (data.avatarKey) peer.profile.avatarKey = data.avatarKey;
        if (data.wantsReply) this.sendProfileToPeer(peer, false);
        this.notifyPeersUpdate();
      }
      if (data.type === 'video-state') {
        peer.isVideoOn = !!data.enabled;
        this.onRemoteVideoStateChange?.(!!data.enabled, fromPeerId);
        this.notifyPeersUpdate();
      }
    }
    this.onRemoteData?.(data, fromPeerId);
  }

  sendData(data, targetPeerId = null) {
    if (targetPeerId) {
      const peer = this.peers.get(targetPeerId);
      if (peer) this.sendDataToPeer(peer, data);
      return;
    }
    for (const peer of this.peers.values()) {
      this.sendDataToPeer(peer, data);
    }
  }

  sendDataToPeer(peer, data) {
    if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
      try {
        peer.dataChannel.send(JSON.stringify(data));
        return;
      } catch (e) {}
    }

    if (this.channel) {
      this.sendSignal({
        from: this.myPeerId,
        to: peer.peerId,
        type: 'direct-data',
        data
      });
    }
  }

  updateLocalStream(newStream) {
    this.localStream = newStream;
    const newAudioTrack = newStream ? newStream.getAudioTracks()[0] : null;
    if (!newAudioTrack) return;

    for (const peer of this.peers.values()) {
      if (!peer.pc) continue;
      const senders = peer.pc.getSenders ? peer.pc.getSenders() : [];
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

      if (audioSender) {
        audioSender.replaceTrack(newAudioTrack).catch(err => {
          console.warn('Error reemplazando pista de audio en peer:', peer.peerId, err);
        });
      } else {
        try {
          peer.pc.addTrack(newAudioTrack, newStream);
        } catch (err) {
          console.warn('Error añadiendo pista de audio en peer:', peer.peerId, err);
        }
      }
    }
  }

  async applyVideoBitrateLimits(videoSender) {
    if (!videoSender || !videoSender.getParameters) return;
    try {
      const params = videoSender.getParameters();
      if (!params) return;
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 2500000;
      params.encodings[0].maxFramerate = 30;
      await videoSender.setParameters(params);
    } catch (_) {}
  }

  setLocalVideoStream(newVideoStream) {
    this.localVideoStream = newVideoStream;
    const newVideoTrack = newVideoStream ? newVideoStream.getVideoTracks()[0] : null;

    for (const peer of this.peers.values()) {
      if (!peer.pc) continue;
      const senders = peer.pc.getSenders ? peer.pc.getSenders() : [];
      let videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (!videoSender) {
        const transceivers = peer.pc.getTransceivers ? peer.pc.getTransceivers() : [];
        const videoTransceiver = transceivers.find(t => (t.receiver?.track?.kind === 'video') || (t.sender?.track?.kind === 'video') || (t.mid && !t.sender?.track));
        if (videoTransceiver) {
          videoSender = videoTransceiver.sender;
        }
      }

      if (videoSender) {
        videoSender.replaceTrack(newVideoTrack).then(() => {
          if (newVideoTrack) {
            this.applyVideoBitrateLimits(videoSender);
          }
        }).catch(err => {
          console.warn('Error reemplazando pista de video en peer:', peer.peerId, err);
        });
      } else if (newVideoTrack) {
        try {
          const addedSender = peer.pc.addTrack(newVideoTrack, newVideoStream);
          if (addedSender) {
            this.applyVideoBitrateLimits(addedSender);
          }
        } catch (err) {
          console.warn('Error añadiendo pista de video a peer:', peer.peerId, err);
        }
      }
    }

    this.sendData({
      type: 'video-state',
      enabled: !!newVideoTrack
    });
    this.trackPresence();
  }

  notifyPeersUpdate() {
    const peersList = Array.from(this.peers.values()).map(p => ({
      peerId: p.peerId,
      name: p.profile.name || 'Participante',
      avatarKey: p.profile.avatarKey || null,
      stream: p.stream,
      videoStream: p.videoStream,
      isVideoOn: p.isVideoOn,
      isConnected: p.pc && p.pc.connectionState === 'connected'
    }));

    this.onPeersUpdate?.(peersList);
  }

  closePeerSession(remotePeerId) {
    const peer = this.peers.get(remotePeerId);
    if (!peer) return;

    if (peer.heartbeatTimer) clearInterval(peer.heartbeatTimer);
    if (peer.dataChannel) {
      try { peer.dataChannel.close(); } catch (_) {}
    }
    if (peer.pc) {
      try { peer.pc.close(); } catch (_) {}
    }

    this.peers.delete(remotePeerId);
    this.onPeerLeave?.(remotePeerId);
    this.notifyPeersUpdate();

    const remainingCount = this.peers.size;
    if (remainingCount === 0) {
      this.onConnectionStatusChange?.('waiting', 'Esperando participantes...');
    } else {
      const statusText = remainingCount === 1 ? 'Conectado con 1 participante' : `Conectado con ${remainingCount} participantes`;
      this.onConnectionStatusChange?.('connected', statusText);
    }
  }

  destroy() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeerSession(peerId);
    }
    this.peers.clear();

    if (this.channel) {
      try {
        this.channel.unsubscribe();
        this.supabase.removeChannel(this.channel);
      } catch (e) {}
      this.channel = null;
    }
  }
}
