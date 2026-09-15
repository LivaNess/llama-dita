// Robust Audio manager for Toki Podcast with ScriptProcessor raw PCM engine

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.localStream = null;
    this.localSource = null;
    this.localGain = null;
    this.localAnalyser = null;
    this.localProcessor = null;
    this.monitorGain = null;
    this.currentDeviceId = null;
    this.isMuted = false;
    this.micSensitivity = 1.8;
    this.isLoopbackEnabled = false;

    // Real-time metrics updated via direct PCM audio frames
    this.localMetrics = {
      rms: 0,
      peak: 0,
      db: -60,
      volume: 0,
      isSpeaking: false,
      rawLevel: 0
    };

    this.remoteMetrics = {
      rms: 0,
      peak: 0,
      db: -60,
      volume: 0,
      isSpeaking: false,
      rawLevel: 0
    };
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
      // MediaStreamSource -> GainNode -> AnalyserNode -> ScriptProcessorNode -> destination (silent)
      this.localSource = ctx.createMediaStreamSource(this.localStream);
      
      this.localGain = ctx.createGain();
      this.localGain.gain.value = this.micSensitivity;

      this.localAnalyser = ctx.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAnalyser.smoothingTimeConstant = 0.4;

      // ScriptProcessor processes raw PCM float samples directly from audio driver
      // bufferSize 1024 = ~21ms at 48kHz (smooth 45fps updates)
      this.localProcessor = ctx.createScriptProcessor(1024, 1, 1);
      
      this.localProcessor.onaudioprocess = (e) => {
        if (this.isMuted) {
          this.localMetrics.rms = 0;
          this.localMetrics.peak = 0;
          this.localMetrics.db = -60;
          this.localMetrics.volume = 0;
          this.localMetrics.isSpeaking = false;
          return;
        }

        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const sample = input[i];
          const abs = Math.abs(sample);
          if (abs > peak) peak = abs;
          sum += sample * sample;
          // Zero out output to prevent feedback through default speakers
          output[i] = 0;
        }

        const rms = Math.sqrt(sum / input.length);
        this.localMetrics.rms = rms;
        this.localMetrics.peak = peak;
        this.localMetrics.rawLevel = Math.round(peak * 100);

        // Convert to dB (-60 dB to 0 dB)
        let db = -60;
        if (rms > 0.00005) {
          db = Math.round(20 * Math.log10(rms));
        }
        db = Math.max(-60, Math.min(0, db));
        this.localMetrics.db = db;

        // Map dB to responsive 0-100% volume
        // -55dB = 0%, -40dB = 25%, -25dB = 60%, -10dB = 85%, 0dB = 100%
        let vol = 0;
        if (db > -55) {
          vol = Math.round(((db + 55) / 52) * 100);
          vol = Math.max(0, Math.min(100, vol));
        }
        this.localMetrics.volume = vol;
        this.localMetrics.isSpeaking = vol > 8 || peak > 0.05;
      };

      // Connect graph
      this.localSource.connect(this.localGain);
      this.localGain.connect(this.localAnalyser);
      this.localAnalyser.connect(this.localProcessor);
      this.localProcessor.connect(ctx.destination);

      return this.localStream;
    } catch (err) {
      console.error('Error al inicializar micrófono:', err);
      throw err;
    }
  }

  cleanupLocalNodes() {
    try {
      if (this.localProcessor) {
        this.localProcessor.onaudioprocess = null;
        this.localProcessor.disconnect();
      }
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
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
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

    const processor = ctx.createScriptProcessor(1024, 1, 1);
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      let sum = 0;
      let peak = 0;
      for (let i = 0; i < input.length; i++) {
        const s = input[i];
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
        sum += s * s;
        // Output zero so audio element handles sound playback
        output[i] = 0;
      }

      const rms = Math.sqrt(sum / input.length);
      this.remoteMetrics.rms = rms;
      this.remoteMetrics.peak = peak;
      this.remoteMetrics.rawLevel = Math.round(peak * 100);

      let db = -60;
      if (rms > 0.00005) {
        db = Math.round(20 * Math.log10(rms));
      }
      db = Math.max(-60, Math.min(0, db));
      this.remoteMetrics.db = db;

      let vol = 0;
      if (db > -55) {
        vol = Math.round(((db + 55) / 52) * 100);
        vol = Math.max(0, Math.min(100, vol));
      }
      this.remoteMetrics.volume = vol;
      this.remoteMetrics.isSpeaking = vol > 8 || peak > 0.05;
    };

    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(ctx.destination);

    return {
      source,
      analyser,
      processor,
      destroy: () => {
        try {
          processor.onaudioprocess = null;
          processor.disconnect();
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