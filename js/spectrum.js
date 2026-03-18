/**
 * spectrum.js — Real‑time spectrum + waveform visualiser.
 * Draws frequency bars (bottom) and time‑domain waveform (top).
 */

export class SpectrumVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ name: string, color: number }[]} planets — for colouring reference
   */
  constructor(canvas, planets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.planets = planets;

    // Build a gradient palette based on planet colours
    this.barGradient = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    // Recreate gradient
    if (this.canvas.width > 0) {
      this.barGradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
      const colours = ['#4466ff', '#4499ff', '#44ddaa', '#ffdd44', '#ffaa44', '#ff6644', '#ff4488', '#aa44ff'];
      colours.forEach((c, i) => this.barGradient.addColorStop(i / (colours.length - 1), c));
    }
  }

  /**
   * Draw one frame.
   * @param {Uint8Array | null} freqData — from AnalyserNode.getByteFrequencyData
   * @param {Uint8Array | null} timeData — from AnalyserNode.getByteTimeDomainData
   */
  draw(freqData, timeData) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!freqData || !timeData) {
      this._drawIdle(W, H);
      return;
    }

    // ── Frequency bars (lower 70 %) ────────────────────────────────
    const barSection = H * 0.72;
    const barY0 = H;
    // Only show lower half of spectrum (most musical content)
    const useBins = Math.floor(freqData.length * 0.35);
    const barW = W / useBins;

    ctx.save();
    for (let i = 0; i < useBins; i++) {
      const v = freqData[i] / 255;
      const bh = v * barSection;
      const x = i * barW;

      ctx.fillStyle = this.barGradient || '#4488ff';
      ctx.globalAlpha = 0.6 + v * 0.4;
      ctx.fillRect(x, barY0 - bh, Math.max(barW - 1, 1), bh);
    }
    ctx.restore();

    // ── Waveform (upper 35 %, overlapping slightly) ────────────────
    const waveH = H * 0.38;
    const waveY = H * 0.12;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.5)';
    ctx.lineWidth = 1.5 * window.devicePixelRatio;
    const step = W / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 255;
      const y = waveY + v * waveH;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();
  }

  _drawIdle(W, H) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(68, 136, 255, 0.15)';
    ctx.font = `${14 * window.devicePixelRatio}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Click "Start Audio" to hear the planets', W / 2, H / 2);
  }
}
