// Manejo del audio de Llamadita.
//
// El nivel del micrófono (lo que mueve las barritas y decide si estás hablando) se mide
// SOLO cuando alguien lo pregunta, o sea cuando hay una cabina en pantalla dibujándose.
//
// Antes lo calculaba un nodo que corría unas 47 veces por segundo en el mismo hilo que la
// interfaz, y seguía corriendo con el micrófono silenciado, con los visualizadores apagados y
// con la ventana minimizada: la app medía un micrófono que nadie estaba mirando, siempre. Para
// mover unas barritas no hace falta esa precisión.

const SILENCIO = { rms: 0, peak: 0, db: -60, volume: 0, isSpeaking: false, rawLevel: 0 };

// Lee el nivel actual del analizador. Cuesta solo cuando se la llama.
function medirNivel(analyser) {
  if (!analyser) return SILENCIO;

  const datos = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(datos);

  let suma = 0;
  let pico = 0;
  for (let i = 0; i < datos.length; i++) {
    const muestra = (datos[i] - 128) / 128;
    const abs = Math.abs(muestra);
    if (abs > pico) pico = abs;
    suma += muestra * muestra;
  }
  const rms = Math.sqrt(suma / datos.length);

  let db = -60;
  if (rms > 0.00005) db = Math.round(20 * Math.log10(rms));
  db = Math.max(-60, Math.min(0, db));

  // Misma escala de siempre: -55 dB es 0% y 0 dB es 100%.
  let vol = 0;
  if (db > -55) vol = Math.max(0, Math.min(100, Math.round(((db + 55) / 52) * 100)));

  return {
    rms,
    peak: pico,
    db,
    volume: vol,
    isSpeaking: vol > 8 || pico > 0.05,
    rawLevel: Math.round(pico * 100)
  };
}

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.localStream = null;
    this.localSource = null;
    this.localGain = null;
    this.localAnalyser = null;
    this.localSink = null;
    this.remoteAnalyser = null;
    this.monitorGain = null;
    this.currentDeviceId = null;
    try {
      this.currentDeviceId = localStorage.getItem('llamadita_audio_input_device') || null;
    } catch (_) {}

    const savedThreshold = typeof localStorage !== 'undefined' ? localStorage.getItem('llamadita_voice_threshold_db') : null;
    this.voiceThresholdDb = (savedThreshold !== null && !isNaN(Number(savedThreshold))) ? Number(savedThreshold) : -34;

    this.isMuted = false;
    this.micSensitivity = 1.8;
    this.isLoopbackEnabled = false;
    this.lastVoiceDetectedAt = Date.now();
    this.isGateOpen = true;

    // Sonidos de la aplicación
    this.ringtoneAudio = null;
    this.messageSoundType = 'bubble';
    this.notificationsEnabled = true;
    this.ringtoneVolume = 0.85;
    this.messageVolume = 0.85;
    try {
      this.messageSoundType = localStorage.getItem('llamadita_msg_sound') || 'bubble';
      const savedNotify = localStorage.getItem('llamadita_notifications_enabled');
      if (savedNotify !== null) this.notificationsEnabled = savedNotify !== 'false';
      const savedRingVol = localStorage.getItem('llamadita_ringtone_vol');
      if (savedRingVol !== null && !isNaN(Number(savedRingVol))) this.ringtoneVolume = Number(savedRingVol);
      const savedMsgVol = localStorage.getItem('llamadita_msg_vol');
      if (savedMsgVol !== null && !isNaN(Number(savedMsgVol))) this.messageVolume = Number(savedMsgVol);
    } catch (_) {}
  }

  // El nivel se calcula en el momento en que se lee, no todo el tiempo.
  get localMetrics() {
    if (this.isMuted) return SILENCIO;
    const m = medirNivel(this.localAnalyser);
    return {
      ...m,
      isSpeaking: this.isVoiceDetected(m)
    };
  }

  // Métricas reales del micrófono (incluso si está silenciado), para avisar si habla con mic off
  get rawLocalMetrics() {
    return medirNivel(this.localAnalyser);
  }

  get remoteMetrics() {
    return medirNivel(this.remoteAnalyser);
  }

  measureAnalyser(analyser) {
    return medirNivel(analyser);
  }


  setVoiceThreshold(db) {
    this.voiceThresholdDb = Number(db);
    try {
      localStorage.setItem('llamadita_voice_threshold_db', String(this.voiceThresholdDb));
    } catch (_) {}
  }

  isVoiceDetected(rawMetrics) {
    if (!rawMetrics) return false;
    return rawMetrics.db >= this.voiceThresholdDb;
  }

  // --- Manejo de Sonidos (Ringtone y Mensajes) ---
  setNotificationsEnabled(enabled) {
    this.notificationsEnabled = !!enabled;
    try {
      localStorage.setItem('llamadita_notifications_enabled', String(this.notificationsEnabled));
    } catch (_) {}
  }

  setRingtoneVolume(vol) {
    this.ringtoneVolume = Math.max(0, Math.min(1, Number(vol)));
    if (this.ringtoneAudio) {
      this.ringtoneAudio.volume = this.ringtoneVolume;
    }
    try {
      localStorage.setItem('llamadita_ringtone_vol', String(this.ringtoneVolume));
    } catch (_) {}
  }

  setMessageVolume(vol) {
    this.messageVolume = Math.max(0, Math.min(1, Number(vol)));
    try {
      localStorage.setItem('llamadita_msg_vol', String(this.messageVolume));
    } catch (_) {}
  }

  startRingtone() {
    try {
      if (!this.ringtoneAudio) {
        this.ringtoneAudio = new Audio('/sounds/ringtone.wav');
        this.ringtoneAudio.loop = true;
      }
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.volume = this.ringtoneVolume;
      const playPromise = this.ringtoneAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[AudioManager] No se pudo reproducir ringtone automáticamente:', err);
        });
      }
    } catch (err) {
      console.warn('[AudioManager] Error iniciando ringtone:', err);
    }
  }

  stopRingtone() {
    try {
      if (this.ringtoneAudio) {
        this.ringtoneAudio.pause();
        this.ringtoneAudio.currentTime = 0;
      }
    } catch (err) {
      console.warn('[AudioManager] Error deteniendo ringtone:', err);
    }
  }

  setMessageSoundType(type) {
    this.messageSoundType = type;
    try {
      localStorage.setItem('llamadita_msg_sound', type);
    } catch (_) {}
  }

  playMessageSound(type = this.messageSoundType) {
    if (!this.notificationsEnabled || type === 'none' || !type) return;
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime + 0.01;
      const out = ctx.createGain();
      out.gain.value = this.messageVolume;
      out.connect(ctx.destination);

      if (type === 'bubble') {
        // Pop suave y burbujeante estilo app moderna (130ms)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const baseFreq = 480;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * 1.8, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.06);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.13);

      } else if (type === 'mini_dna') {
        // Mini ADN: Do#5 (554Hz) -> Re#5 (622Hz)
        const playNote = (f, t, d, v) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(v, t + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.001, t + d);
          osc.connect(gain);
          gain.connect(out);
          osc.start(t);
          osc.stop(t + d);
        };
        playNote(554.37, now, 0.09, 0.6);
        playNote(622.25, now + 0.08, 0.16, 0.7);

      } else if (type === 'wood') {
        // Toque cálido percusivo de marimba / madera (110ms)
        const f = 740;
        const osc = ctx.createOscillator();
        const oscHarm = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        oscHarm.type = 'sine';
        oscHarm.frequency.setValueAtTime(f * 2.8, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.85, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

        osc.connect(gain);
        oscHarm.connect(gain);
        gain.connect(out);

        osc.start(now);
        oscHarm.start(now);
        osc.stop(now + 0.12);
        oscHarm.stop(now + 0.12);

      } else if (type === 'droplet') {
        // Gota de agua (160ms)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const f = 620;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * 0.7, now);
        osc.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.04);
        osc.frequency.exponentialRampToValueAtTime(f * 1.1, now + 0.15);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.75, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(out);

        osc.start(now);
        osc.stop(now + 0.17);

      } else if (type === 'chime') {
        // Doble campana cristalina: Mi5 (659Hz) -> Sol#5 (830Hz)
        const playBell = (f, t, d) => {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(f, t);
          osc2.frequency.setValueAtTime(f * 2.01, t);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.5, t + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.001, t + d);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(out);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + d);
          osc2.stop(t + d);
        };
        playBell(659.25, now, 0.14);
        playBell(830.61, now + 0.09, 0.22);

      } else if (type === 'coin') {
        // Moneda retro 8-bit
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.51, now + 0.05);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(out);

        osc.start(now);
        osc.stop(now + 0.19);
      }
    } catch (err) {
      console.warn('[AudioManager] Error reproduciendo sonido de mensaje:', err);
    }
  }

  // Get or initialize AudioContext
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    return this.audioCtx;
  }

  async resumeContext() {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        console.log('AudioContext resumed successfully. State:', ctx.state);
      } catch (e) {
        console.warn('Could not resume AudioContext:', e);
      }
    }
    return ctx.state;
  }

  // Initialize microphone stream with direct PCM processor
  async initLocalStream(deviceId = null) {
    // 1. Resume / create AudioContext upon user action
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }

    // Preservar el estado de silencio si ya estaba silenciado
    const wasMuted = this.isMuted;

    // Constraints optimizados para micrófonos de calidad:
    // Activamos cancelación de eco y supresión de ruido por hardware/C++ nativo (0% JS CPU)
    // Desactivamos autoGainControl para que el sistema operativo no suba la ganancia en silencio.
    const audioConstraints = {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: false
    };

    const targetDeviceId = deviceId || this.currentDeviceId;
    if (targetDeviceId) {
      audioConstraints.deviceId = { exact: targetDeviceId };
    }

    const constraints = {
      audio: audioConstraints,
      video: false
    };

    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.currentDeviceId = targetDeviceId;
      } catch (devErr) {
        if (targetDeviceId) {
          console.warn('Dispositivo guardado no disponible, usando micrófono por defecto:', devErr);
          delete audioConstraints.deviceId;
          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
          this.currentDeviceId = null;
          try { localStorage.removeItem('llamadita_audio_input_device'); } catch (_) {}
        } else {
          throw devErr;
        }
      }

      this.isMuted = wasMuted;
      if (wasMuted) {
        this.localStream.getAudioTracks().forEach(t => t.enabled = false);
      }
      this.lastVoiceDetectedAt = Date.now();
      this.isGateOpen = !wasMuted;

      // Clean previous nodes
      this.cleanupLocalNodes();

      // Audio Graph:
      // Clonamos el track para el analizador local de modo que podamos seguir midiendo y
      // detectando si el usuario habla incluso cuando silencia las pistas de salida hacia WebRTC.
      const monitorTracks = this.localStream.getAudioTracks().map(t => t.clone());
      this.monitorStream = new MediaStream(monitorTracks);
      this.localSource = ctx.createMediaStreamSource(this.monitorStream);
      
      this.localGain = ctx.createGain();
      this.localGain.gain.value = this.micSensitivity;

      this.localAnalyser = ctx.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAnalyser.smoothingTimeConstant = 0.4;

      // Tapón: el grafo necesita terminar en la salida para que el analizador reciba audio,
      // pero con volumen en cero, así el micrófono no sale por los parlantes.
      this.localSink = ctx.createGain();
      this.localSink.gain.value = 0;

      // Connect graph
      this.localSource.connect(this.localGain);
      this.localGain.connect(this.localAnalyser);
      this.localAnalyser.connect(this.localSink);
      this.localSink.connect(ctx.destination);

      return this.localStream;
    } catch (err) {
      console.error('Error al inicializar micrófono:', err);
      throw err;
    }
  }

  cleanupLocalNodes() {
    try {
      if (this.monitorStream) {
        this.monitorStream.getTracks().forEach(t => t.stop());
        this.monitorStream = null;
      }
      if (this.localSink) this.localSink.disconnect();
      if (this.localAnalyser) this.localAnalyser.disconnect();
      if (this.localGain) this.localGain.disconnect();
      if (this.localSource) this.localSource.disconnect();
    } catch (e) {}
  }

  setMicSensitivity(multiplier) {
    this.micSensitivity = multiplier;
    if (this.localGain && this.audioCtx) {
      this.localGain.gain.setTargetAtTime(multiplier, this.audioCtx.currentTime, 0.05);
    }
  }

  toggleMute() {
    if (!this.localStream) return false;
    return this.setMute(!this.isMuted);
  }

  setMute(mute) {
    this.isMuted = !!mute;
    // Silenciamos la pista que se transmite a los demás
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    }
    return this.isMuted;
  }

  // Puerta de ruido inteligente (Noise Gate):
  // Si el usuario no está muteado manualmente, detecta si hay voz real usando el umbral calibrado.
  // Cuando deja de hablar, mantiene la transmisión abierta 450ms (hold time)
  // para que nunca se coman los finales de frases ni respiraciones, y luego
  // silencia digitalmente la salida para evitar estática en el receptor.
  processNoiseGate(rawMetrics) {
    if (this.isMuted || !this.localStream) return;

    const ahora = Date.now();
    const voiceDetected = this.isVoiceDetected(rawMetrics);

    if (voiceDetected) {
      this.lastVoiceDetectedAt = ahora;
      if (!this.isGateOpen) {
        this.isGateOpen = true;
        this.localStream.getAudioTracks().forEach(t => t.enabled = true);
      }
    } else {
      // Hold time de 450ms tras dejar de hablar
      if (this.isGateOpen && ahora - this.lastVoiceDetectedAt > 450) {
        this.isGateOpen = false;
        this.localStream.getAudioTracks().forEach(t => t.enabled = false);
      }
    }
  }

  toggleLoopback() {
    if (!this.audioCtx || !this.localGain) return false;
    this.isLoopbackEnabled = !this.isLoopbackEnabled;

    if (this.isLoopbackEnabled) {
      if (!this.monitorGain) {
        this.monitorGain = this.audioCtx.createGain();
      }
      this.monitorGain.gain.value = 0.8;
      this.localGain.connect(this.monitorGain);
      this.monitorGain.connect(this.audioCtx.destination);
    } else {
      if (this.monitorGain) {
        try {
          this.monitorGain.gain.value = 0;
          this.localGain.disconnect(this.monitorGain);
          this.monitorGain.disconnect(this.audioCtx.destination);
        } catch (e) {}
      }
    }
    return this.isLoopbackEnabled;
  }

  // Create stream analyser and PCM processor for remote audio
  createRemoteStreamProcessor(stream) {
    const ctx = this.getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    // Mismo tapón que en el micrófono: termina el grafo sin sacar sonido por los parlantes
    // (el sonido del otro lo reproduce el elemento de audio, no este grafo).
    const sink = ctx.createGain();
    sink.gain.value = 0;

    source.connect(analyser);
    analyser.connect(sink);
    sink.connect(ctx.destination);

    this.remoteAnalyser = analyser;

    return {
      source,
      analyser,
      destroy: () => {
        try {
          if (this.remoteAnalyser === analyser) this.remoteAnalyser = null;
          sink.disconnect();
          analyser.disconnect();
          source.disconnect();
        } catch (e) {}
      }
    };
  }

  // Get frequency spectrum from analyser for canvas visualizer
  getFrequencyData(analyser) {
    if (!analyser) return new Uint8Array(32);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  getTimeDomainData(analyser) {
    if (!analyser) return new Uint8Array(64);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    return data;
  }

  async getAudioInputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }
}

export const audioManager = new AudioManager();