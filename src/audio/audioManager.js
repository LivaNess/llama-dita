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
    this.isMuted = false;
    this.micSensitivity = 1.8;
    this.isLoopbackEnabled = false;

  }

  // El nivel se calcula en el momento en que se lee, no todo el tiempo.
  get localMetrics() {
    if (this.isMuted) return SILENCIO;
    return medirNivel(this.localAnalyser);
  }

  get remoteMetrics() {
    return medirNivel(this.remoteAnalyser);
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

    // Constraints
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentDeviceId = deviceId;
      this.isMuted = false;

      // Clean previous nodes
      this.cleanupLocalNodes();

      // Audio Graph:
      // Micrófono -> volumen -> analizador -> tapón mudo -> salida
      this.localSource = ctx.createMediaStreamSource(this.localStream);
      
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
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    }
    return this.isMuted;
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