// Audio visualizer engine for Toki Podcast
// Handles Canvas rendering (spectrum bars, VU meter, waveforms) at 60fps

export class AudioVisualizer {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.theme = options.theme || 'host'; // 'host' (violet/fuchsia) or 'guest' (cyan/sky)
    this.peakHold = 0;
    this.peakHoldTimer = 0;
    this.smoothedVolume = 0;

    // Handle high DPI displays
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 340) * dpr;
    this.canvas.height = (rect.height || 140) * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width || 340;
    this.height = rect.height || 140;
  }

  // Draw one frame of audio analysis
  draw(analysis, isConnected = true) {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    ctx.clearRect(0, 0, width, height);

    if (!isConnected || !analysis) {
      // Idle pulse line when not connected
      this.drawIdleState(ctx, width, height);
      return;
    }

    const { volume, freqData } = analysis;

    // Smooth volume transition
    this.smoothedVolume += (volume - this.smoothedVolume) * 0.25;

    // Peak hold calculation
    if (this.smoothedVolume > this.peakHold) {
      this.peakHold = this.smoothedVolume;
      this.peakHoldTimer = 25; // Hold peak for ~25 frames
    } else if (this.peakHoldTimer > 0) {
      this.peakHoldTimer--;
    } else {
      this.peakHold = Math.max(0, this.peakHold - 1.2);
    }

    // Draw spectrum equalizer bars
    this.drawEqualizer(ctx, width, height, freqData);

    // Draw audio wave contour
    this.drawWaveform(ctx, width, height, analysis.timeData);
  }

  drawIdleState(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(10, height / 2);
    ctx.lineTo(width - 10, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  drawEqualizer(ctx, width, height, freqData) {
    if (!freqData || freqData.length === 0) return;

    const numBars = 32;
    const barSpacing = 3;
    const totalSpacing = barSpacing * (numBars - 1);
    const barWidth = Math.max(3, (width - totalSpacing) / numBars);

    // Color gradient based on theme
    const isHost = this.theme === 'host';
    const primaryColor = isHost ? '#a855f7' : '#06b6d4';   // Purple vs Cyan
    const highlightColor = isHost ? '#ec4899' : '#3b82f6'; // Pink vs Blue

    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(0.7, highlightColor);
    gradient.addColorStop(1, '#ffffff');

    // Step through frequency bins logarithmically
    const binStep = Math.max(1, Math.floor((freqData.length * 0.6) / numBars));

    for (let i = 0; i < numBars; i++) {
      const binIndex = Math.min(freqData.length - 1, i * binStep + 1);
      const rawValue = freqData[binIndex] || 0;
      
      // Normalized height (0.0 to 1.0)
      const normalizedHeight = Math.min(1, Math.pow(rawValue / 255, 1.2));
      const barHeight = Math.max(4, normalizedHeight * (height - 10));

      const x = i * (barWidth + barSpacing);
      const y = height - barHeight;

      // Draw rounded bar
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = normalizedHeight > 0.4 ? 8 : 0;

      ctx.beginPath();
      const radius = Math.min(barWidth / 2, 3);
      ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
      ctx.fill();
      ctx.restore();
    }
  }

  drawWaveform(ctx, width, height, timeData) {
    if (!timeData || timeData.length === 0) return;

    ctx.save();
    ctx.beginPath();
    const isHost = this.theme === 'host';
    ctx.strokeStyle = isHost ? 'rgba(236, 72, 153, 0.4)' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;

    const sliceWidth = width / (timeData.length - 1);
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128; // -1 to 1
      const y = (height / 2) + (v * (height * 0.4));

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.restore();
  }
}