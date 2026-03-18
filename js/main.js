/**
 * main.js — Application entry point.
 * Wires together scene, audio, spectrum, and UI controls.
 */
import * as THREE from 'three';
import { PLANETS, calculatePosition, getOrbitPath, getBaseFrequency } from './planets.js';
import { AudioEngine } from './audio.js';
import { SceneManager } from './scene.js';
import { SpectrumVisualizer } from './spectrum.js';

/* ═══════════════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════════════ */
let audioReady = false;
let frozen = false;
let realTime = false;

// Listener attached to a planet (null or planet name)
let attachedPlanet = null;

// Simulation time (ms since Unix epoch, starts at "now")
let simTime = Date.now();

// Time speed: days of simulation per real second
let daysPerSec = 10;

// Per‑planet runtime data: { planet, freq, lastDist }
const planetState = [];

/* ═══════════════════════════════════════════════════════════════════════
   Modules
   ═══════════════════════════════════════════════════════════════════════ */
const sceneContainer = document.getElementById('scene-container');
const spectrumCanvas = document.getElementById('spectrum-canvas');

const scene = new SceneManager(sceneContainer);
const audio = new AudioEngine();
const spectrum = new SpectrumVisualizer(spectrumCanvas, PLANETS);

/* ═══════════════════════════════════════════════════════════════════════
   Initialisation
   ═══════════════════════════════════════════════════════════════════════ */
function init() {
  scene.init();

  // Add planets to 3D scene
  for (const planet of PLANETS) {
    const freq = getBaseFrequency(planet);
    const orbit = getOrbitPath(planet);
    scene.addPlanet(planet, orbit);
    planetState.push({ planet, freq, lastDist: Infinity });
  }

  // Position listener at Earth's current location
  const earthPos = calculatePosition(PLANETS[2], simTime);
  scene.setListenerTarget(earthPos.display.x, 0, earthPos.display.z);
  scene.listenerPos.set(earthPos.display.x, 0, earthPos.display.z);

  // Build planet info panel
  buildPlanetPanel();

  // Wire UI controls
  wireUI();

  // Start loop
  lastFrameTime = performance.now();
  requestAnimationFrame(loop);
}

/* ═══════════════════════════════════════════════════════════════════════
   Animation loop
   ═══════════════════════════════════════════════════════════════════════ */
let lastFrameTime = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // seconds, capped
  lastFrameTime = now;

  // Advance simulation time
  if (!frozen) {
    if (realTime) {
      simTime = Date.now();
    } else {
      simTime += dt * daysPerSec * 86400000; // ms
    }
  }

  // Update date display
  updateDateDisplay();

  // Update each planet
  for (const ps of planetState) {
    const pos = calculatePosition(ps.planet, simTime);
    scene.updatePlanetPosition(ps.planet.name, pos.display.x, pos.display.y, pos.display.z);

    // If listener is attached to this planet, follow it
    if (attachedPlanet === ps.planet.name) {
      scene.setListenerTarget(pos.display.x, 0, pos.display.z);
      scene.listenerPos.set(pos.display.x, 0, pos.display.z);
    }
  }

  // Recompute distances after possible listener move
  const updatedListenerPos = scene.getListenerPosition();
  for (const ps of planetState) {
    const entry = scene.planetMeshes.get(ps.planet.name);
    if (!entry) continue;
    const gp = entry.group.position;
    const dx = gp.x - updatedListenerPos.x;
    const dy = gp.y - updatedListenerPos.y;
    const dz = gp.z - updatedListenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    ps.lastDist = dist;

    if (audioReady) {
      audio.updateDistance(ps.planet.name, dist);
    }
  }

  // Update planet panel volumes
  updatePlanetPanel();

  // Spectrum
  spectrum.draw(audio.getFrequencyData(), audio.getTimeDomainData());

  // Render 3D scene
  scene.render();
}

/* ═══════════════════════════════════════════════════════════════════════
   UI wiring
   ═══════════════════════════════════════════════════════════════════════ */
function wireUI() {
  // ── Play / Pause ──
  const btnPlay = document.getElementById('btn-play');
  btnPlay.addEventListener('click', async () => {
    if (!audioReady) {
      await audio.init();
      // Create oscillators + beat state for each planet
      for (const ps of planetState) {
        audio.createPlanetSound(ps.planet, ps.freq);
        audio.createPlanetBeat(ps.planet, ps.freq);
      }
      audioReady = true;
    }

    if (audio.isPlaying) {
      audio.pause();
      btnPlay.innerHTML = '<span class="icon">▶</span> Start Audio';
      btnPlay.classList.remove('playing');
    } else {
      await audio.play();
      btnPlay.innerHTML = '<span class="icon">⏹</span> Stop Audio';
      btnPlay.classList.add('playing');
    }
  });

  // ── Audio mode toggle (Harmonic / Beat) ──
  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      audio.setMode(btn.dataset.mode);
    });
  });

  // ── Master volume ──
  const volSlider = document.getElementById('master-volume');
  volSlider.addEventListener('input', () => {
    const v = volSlider.value / 100;
    audio.setMasterVolume(v * 0.5); // 0 – 0.5 range
  });

  // ── Time speed ──
  const speedSlider = document.getElementById('time-speed');
  const speedDisplay = document.getElementById('speed-display');
  const updateSpeed = () => {
    if (realTime) {
      speedDisplay.textContent = '1:1';
      return;
    }
    // Exponential mapping: 0 → 0.5 d/s, 100 → 500 d/s
    const t = speedSlider.value / 100;
    daysPerSec = 0.5 * Math.pow(1000, t);
    if (daysPerSec < 1) {
      speedDisplay.textContent = daysPerSec.toFixed(1) + ' d/s';
    } else if (daysPerSec < 365) {
      speedDisplay.textContent = Math.round(daysPerSec) + ' d/s';
    } else {
      speedDisplay.textContent = (daysPerSec / 365.25).toFixed(1) + ' y/s';
    }
  };
  speedSlider.addEventListener('input', () => {
    // Touching the speed slider exits real-time mode
    if (realTime) {
      realTime = false;
      btnRealtime.classList.remove('active');
      btnRealtime.innerHTML = '<span class="icon">🕐</span> Real Time';
    }
    updateSpeed();
  });
  updateSpeed();

  // ── Freeze time ──
  const btnFreeze = document.getElementById('btn-freeze');
  btnFreeze.addEventListener('click', () => {
    frozen = !frozen;
    btnFreeze.classList.toggle('active', frozen);
    btnFreeze.innerHTML = frozen
      ? '<span class="icon">▶</span> Resume Time'
      : '<span class="icon">⏸</span> Freeze Time';
    // Unfreeze exits real-time if it was on
    if (!frozen && realTime) {
      // keep real-time active, just resume
    }
  });

  // ── Real time ──
  const btnRealtime = document.getElementById('btn-realtime');
  btnRealtime.addEventListener('click', () => {
    realTime = !realTime;
    btnRealtime.classList.toggle('active', realTime);
    btnRealtime.innerHTML = realTime
      ? '<span class="icon">🕐</span> Real Time ON'
      : '<span class="icon">🕐</span> Real Time';

    if (realTime) {
      // Snap simulation to current wall clock
      simTime = Date.now();
      // Unfreeze if frozen
      if (frozen) {
        frozen = false;
        btnFreeze.classList.remove('active');
        btnFreeze.innerHTML = '<span class="icon">⏸</span> Freeze Time';
      }
      speedDisplay.textContent = '1:1';
      speedSlider.disabled = true;
    } else {
      speedSlider.disabled = false;
      updateSpeed();
    }
  });

  // ── Frequency scale slider ──
  const freqSlider = document.getElementById('freq-scale');
  const freqDisplay = document.getElementById('freq-scale-display');
  let freqFactor = 1.0;

  const updateFreqScale = () => {
    // Map -100..100 → 0.25..4.0 exponentially
    const t = freqSlider.value / 100; // -1..1
    freqFactor = Math.pow(2, t * 2);  // 0.25 … 1.0 … 4.0
    freqDisplay.textContent = '×' + freqFactor.toFixed(2);
    audio.setFrequencyScale(freqFactor);

    // Update displayed Hz in planet list
    for (const ps of planetState) {
      const el = document.querySelector(`[data-freq="${ps.planet.name}"]`);
      if (el) el.textContent = Math.round(ps.freq * freqFactor) + ' Hz';
    }
  };
  freqSlider.addEventListener('input', updateFreqScale);
  updateFreqScale();

  // ── Mobile panel toggles ──
  const btnToggleControls = document.getElementById('btn-toggle-controls');
  const btnTogglePlanets = document.getElementById('btn-toggle-planets');
  const controlsPanel = document.getElementById('controls-panel');
  const planetPanel = document.getElementById('planet-panel');

  if (btnToggleControls) {
    btnToggleControls.addEventListener('click', () => {
      const open = controlsPanel.classList.toggle('panel-visible');
      btnToggleControls.classList.toggle('panel-open', open);
      // Close the other panel
      if (open) {
        planetPanel.classList.remove('panel-visible');
        btnTogglePlanets.classList.remove('panel-open');
      }
    });
  }

  if (btnTogglePlanets) {
    btnTogglePlanets.addEventListener('click', () => {
      const open = planetPanel.classList.toggle('panel-visible');
      btnTogglePlanets.classList.toggle('panel-open', open);
      // Close the other panel
      if (open) {
        controlsPanel.classList.remove('panel-visible');
        btnToggleControls.classList.remove('panel-open');
      }
    });
  }

  // ── Planet right-click context menu (attach listener) ──
  const ctxMenu = document.getElementById('planet-ctx-menu');
  const ctxAttachBtn = document.getElementById('ctx-attach');
  const attachedBadge = document.getElementById('attached-badge');
  const attachedName = document.getElementById('attached-name');
  const btnDetach = document.getElementById('btn-detach');
  let ctxPlanetName = null;

  // Close context menu on any click/tap
  const closeCtx = () => ctxMenu.classList.add('hidden');
  document.addEventListener('pointerdown', closeCtx);

  scene.onRightClickPlanet((name, sx, sy) => {
    ctxPlanetName = name;
    // Label changes depending on whether already attached
    ctxAttachBtn.textContent = (attachedPlanet === name)
      ? '🎙️ Detach listener'
      : '🎙️ Attach listener to ' + name;
    // Position the menu near the click
    ctxMenu.style.left = sx + 'px';
    ctxMenu.style.top = sy + 'px';
    ctxMenu.classList.remove('hidden');
  });

  ctxAttachBtn.addEventListener('click', () => {
    closeCtx();
    if (attachedPlanet === ctxPlanetName) {
      // Detach
      attachedPlanet = null;
      attachedBadge.classList.add('hidden');
    } else {
      // Attach
      attachedPlanet = ctxPlanetName;
      attachedName.textContent = '🎙️ Listener → ' + ctxPlanetName;
      attachedBadge.classList.remove('hidden');
    }
  });

  btnDetach.addEventListener('click', () => {
    attachedPlanet = null;
    attachedBadge.classList.add('hidden');
  });

  // Detach when user manually moves the listener (click-to-move or drag)
  scene.onListenerMove(() => {
    if (attachedPlanet) {
      attachedPlanet = null;
      attachedBadge.classList.add('hidden');
    }
  });

  // ── Frequency info popup ──
  const modal = document.getElementById('freq-info-modal');
  document.getElementById('btn-freq-info').addEventListener('click', () => {
    modal.classList.remove('hidden');
  });
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Planet info panel
   ═══════════════════════════════════════════════════════════════════════ */
function buildPlanetPanel() {
  const list = document.getElementById('planet-list');
  for (const ps of planetState) {
    const el = document.createElement('div');
    el.className = 'planet-item';
    el.dataset.name = ps.planet.name;

    const colorHex = '#' + ps.planet.color.toString(16).padStart(6, '0');
    el.innerHTML = `
      <span class="planet-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}"></span>
      <span class="planet-name">${ps.planet.name}</span>
      <span class="planet-freq" data-freq="${ps.planet.name}">${Math.round(ps.freq)} Hz</span>
      <span class="planet-vol" data-vol="${ps.planet.name}">—</span>
    `;
    list.appendChild(el);
  }
}

function updatePlanetPanel() {
  for (const ps of planetState) {
    const el = document.querySelector(`[data-vol="${ps.planet.name}"]`);
    if (!el) continue;
    const ref2 = audio.refDist * audio.refDist;
    const d2 = ps.lastDist * ps.lastDist;
    const vol = ref2 / (ref2 + d2);
    const pct = Math.round(vol * 100);
    el.textContent = pct + '%';
    el.style.color = pct > 50 ? '#00ffcc' : pct > 20 ? '#4488ff' : '#556688';
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Date display
   ═══════════════════════════════════════════════════════════════════════ */
function updateDateDisplay() {
  const el = document.getElementById('date-display');
  const d = new Date(simTime);
  el.textContent = d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Boot
   ═══════════════════════════════════════════════════════════════════════ */
init();
