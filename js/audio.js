/**
 * audio.js — Web Audio API synthesis engine.
 * Supports two modes:
 *   • "harmonic" — continuous oscillators with PeriodicWave timbre
 *   • "beat"     — rhythmic percussive hits per planet
 * Volume follows the inverse‑square law relative to the listener position.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.planetNodes = new Map(); // name → harmonic nodes
    this.beatNodes = new Map();   // name → beat state
    this.isPlaying = false;
    this.mode = 'harmonic';       // 'harmonic' | 'beat'
    this.freqScale = 1.0;

    // Per‑planet current volume (set by updateDistance)
    this._volumes = new Map();

    // Reference distance (display units) at which volume = 50 %
    this.refDist = 4;

    // Beat scheduler state
    this._beatTimer = null;
    this._beatLookahead = 0.12; // seconds ahead to schedule
    this._beatInterval = 25;    // ms between scheduler ticks
  }

  /* ══════════════════════════════════════════════════════════════════
     Initialise AudioContext (call once, on user gesture)
     ══════════════════════════════════════════════════════════════════ */
  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master volume
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;

    // Compressor to tame peaks when many planets are loud
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.15;

    // Analyser for spectrum visualisation
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;

    // Routing: masterGain → compressor → analyser → destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /* ══════════════════════════════════════════════════════════════════
     MODE: Harmonic (continuous oscillators)
     ══════════════════════════════════════════════════════════════════ */

  createPlanetSound(planet, frequency) {
    if (!this.ctx) return;

    const harmonics = planet.harmonicProfile;

    // Build PeriodicWave from harmonic profile
    const len = harmonics.length + 1;
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    real[0] = 0;
    imag[0] = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const amp = harmonics[h];
      const phase = h * 0.618 * Math.PI; // golden‑angle phase spread
      real[h + 1] = amp * Math.cos(phase);
      imag[h + 1] = amp * Math.sin(phase);
    }
    const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    // Main oscillator
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = frequency;

    // LFO for vibrato — rate derived from rotation period
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    const vibratoRate = Math.min(8, 1.0 / Math.max(planet.rotationPeriod, 0.01));
    lfo.frequency.value = vibratoRate;

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = frequency * 0.006; // subtle vibrato depth

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Per‑planet gain (distance‑controlled)
    const gain = this.ctx.createGain();
    gain.gain.value = 0; // start silent

    // Optional per‑planet filter for extra character
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency * 2;
    filter.Q.value = 1.0 + planet.mass * 0.02;
    filter.gain.value = 3;

    // Routing: osc → filter → gain → master
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    lfo.start();

    this.planetNodes.set(planet.name, {
      osc, gain, lfo, lfoGain, filter, baseFreq: frequency,
    });
  }

  _muteHarmonic() {
    for (const [, node] of this.planetNodes) {
      node.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     MODE: Beat (rhythmic percussive hits)
     ══════════════════════════════════════════════════════════════════ */

  /**
   * Create beat state for a planet.
   * Beat interval derived from orbital period:
   *   faster orbit → faster beat
   * Mercury (~88 d) → 0.18 s, Neptune (~60189 d) → 2.5 s
   */
  createPlanetBeat(planet, frequency) {
    if (!this.ctx) return;

    const minP = 87.969, maxP = 60189.0;
    const minInterval = 0.18, maxInterval = 2.5;
    const t = (Math.log(planet.orbitalPeriod) - Math.log(minP))
            / (Math.log(maxP) - Math.log(minP));
    const beatInterval = minInterval + t * (maxInterval - minInterval);

    // Persistent gain node for this planet's beats
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain);

    this.beatNodes.set(planet.name, {
      baseFreq: frequency,
      beatInterval,
      nextBeatTime: 0,
      gain,
      planet,
    });
  }

  /** Scheduler tick: schedule upcoming beats for all planets */
  _schedulerTick() {
    if (!this.ctx || this.mode !== 'beat' || !this.isPlaying) return;

    const now = this.ctx.currentTime;
    const ahead = now + this._beatLookahead;

    for (const [name, beat] of this.beatNodes) {
      const vol = this._volumes.get(name) || 0;
      if (vol < 0.005) {
        if (beat.nextBeatTime < now) beat.nextBeatTime = now;
        continue;
      }

      while (beat.nextBeatTime < ahead) {
        this._fireHit(beat, beat.nextBeatTime, vol);
        beat.nextBeatTime += beat.beatInterval;
      }
    }
  }

  /** Fire a single percussive hit at a scheduled time */
  _fireHit(beat, time, vol) {
    const freq = beat.baseFreq * this.freqScale;

    // ── Tonal component (short sine ping with pitch drop) ──
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.15);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    // ── Sub bass thump (heavier for massive planets) ──
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 0.5, time);
    sub.frequency.exponentialRampToValueAtTime(freq * 0.15, time + 0.12);

    const subGain = this.ctx.createGain();
    const subLevel = Math.min(1, beat.planet.mass * 0.003) * vol;
    subGain.gain.setValueAtTime(subLevel, time);
    subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    // ── Noise burst (click / transient) ──
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = freq * 3;
    noiseFilter.Q.value = 1.5 + beat.planet.mass * 0.005;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.35, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    // ── Routing: all three → planet beat gain → master ──
    osc.connect(oscGain);
    oscGain.connect(beat.gain);

    sub.connect(subGain);
    subGain.connect(beat.gain);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(beat.gain);

    beat.gain.gain.setValueAtTime(1, time);

    // Start & stop
    const dur = 0.25;
    osc.start(time);
    osc.stop(time + dur);
    sub.start(time);
    sub.stop(time + dur);
    noise.start(time);
    noise.stop(time + 0.06);

    // Cleanup
    osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
    sub.onended = () => { sub.disconnect(); subGain.disconnect(); };
    noise.onended = () => { noise.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); };
  }

  _startBeatScheduler() {
    if (this._beatTimer) return;
    const now = this.ctx.currentTime;
    for (const [, beat] of this.beatNodes) beat.nextBeatTime = now;
    this._beatTimer = setInterval(() => this._schedulerTick(), this._beatInterval);
  }

  _stopBeatScheduler() {
    if (this._beatTimer) {
      clearInterval(this._beatTimer);
      this._beatTimer = null;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     Mode switching
     ══════════════════════════════════════════════════════════════════ */

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;

    if (mode === 'harmonic') {
      this._stopBeatScheduler();
      // Volumes will be re‑applied by updateDistance on next frame
    } else {
      this._muteHarmonic();
      if (this.isPlaying) this._startBeatScheduler();
    }
  }

  /* ── Update per‑planet volume based on listener distance ────────── */
  updateDistance(planetName, distance) {
    const ref2 = this.refDist * this.refDist;
    const d2 = distance * distance;
    const falloff = ref2 / (ref2 + d2);
    const target = Math.max(0, Math.min(1, falloff));

    // Store for beat‑mode scheduler
    this._volumes.set(planetName, target);

    // Apply to harmonic gain node
    const node = this.planetNodes.get(planetName);
    if (node && this.ctx && this.mode === 'harmonic') {
      node.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
    }
  }

  /* ── Master volume (0–1) ────────────────────────────────────────── */
  setMasterVolume(v) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  /* ── Scale all frequencies by a factor ──────────────────────────── */
  setFrequencyScale(factor) {
    this.freqScale = factor;
    if (!this.ctx) return;
    // Update harmonic oscillators in real time
    for (const [, node] of this.planetNodes) {
      const newFreq = node.baseFreq * factor;
      node.osc.frequency.setTargetAtTime(newFreq, this.ctx.currentTime, 0.08);
      node.filter.frequency.setTargetAtTime(newFreq * 2, this.ctx.currentTime, 0.08);
      node.lfoGain.gain.setTargetAtTime(newFreq * 0.006, this.ctx.currentTime, 0.08);
    }
    // Beat mode reads this.freqScale at hit‑fire time — no extra work needed
  }

  /* ── Play / Pause ───────────────────────────────────────────────── */
  async play() {
    if (!this.ctx) await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.isPlaying = true;
    if (this.mode === 'beat') this._startBeatScheduler();
  }

  pause() {
    if (this.ctx) this.ctx.suspend();
    this.isPlaying = false;
    this._stopBeatScheduler();
  }

  /* ── Spectrum data for visualiser ───────────────────────────────── */
  getFrequencyData() {
    if (!this.analyser) return null;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    return buf;
  }

  getTimeDomainData() {
    if (!this.analyser) return null;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    return buf;
  }
}
