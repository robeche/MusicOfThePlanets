/**
 * textureGen.js — Procedural planet texture generator using Canvas.
 * Produces unique, visually appealing textures for each planet with zero
 * external network dependencies (no CORS issues).
 */
import * as THREE from 'three';

const SIZE = 512; // texture resolution

/* ── Noise helpers ────────────────────────────────────────────────── */

/** Simple seeded pseudo-random (mulberry32) */
function makeRng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** 2D value noise (smooth random) */
function makeNoise(seed) {
  const rng = makeRng(seed);
  const perm = Array.from({ length: 512 }, () => Math.floor(rng() * 256));
  function hash(x, y) { return perm[(perm[x & 255] + y) & 255]; }
  function lerp(a, b, t) { return a + t * (b - a); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    return lerp(
      lerp(hash(ix, iy), hash(ix + 1, iy), fx),
      lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
      fy,
    ) / 255;
  };
}

/** Fractal Brownian Motion (layered noise) */
function fbm(noise, x, y, octaves = 5) {
  let val = 0, amp = 0.5, freq = 1, totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise(x * freq, y * freq);
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return val / totalAmp;
}

/* ── Color helpers ────────────────────────────────────────────────── */

function hexToRgb(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function lerpColor(c1, c2, t) {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
}

/* ── Planet-specific generators ───────────────────────────────────── */

const generators = {
  Sun(ctx, W, H) {
    const noise = makeNoise(42);
    const data = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W * 8, v = y / H * 4;
        const n = fbm(noise, u, v, 6);
        const hot = [255, 220, 60];
        const flare = [255, 80, 10];
        const c = lerpColor(flare, hot, n);
        const bright = 0.8 + n * 0.4;
        const i = (y * W + x) * 4;
        data.data[i] = Math.min(255, c[0] * bright);
        data.data[i + 1] = Math.min(255, c[1] * bright);
        data.data[i + 2] = Math.min(255, c[2] * bright);
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Mercury(ctx, W, H) {
    _rockyPlanet(ctx, W, H, 101, [160, 155, 150], [110, 105, 100], [85, 80, 78], 0.06);
  },

  Venus(ctx, W, H) {
    const noise = makeNoise(200);
    const noise2 = makeNoise(201);
    const data = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W * 6, v = y / H * 3;
        const n1 = fbm(noise, u, v + fbm(noise2, u * 2, v * 2, 3) * 0.8, 5);
        const base = [230, 190, 110];
        const cloud = [255, 225, 170];
        const dark = [180, 140, 70];
        let c = n1 > 0.55 ? lerpColor(base, cloud, (n1 - 0.55) * 4) : lerpColor(dark, base, n1 / 0.55);
        const i = (y * W + x) * 4;
        data.data[i] = c[0]; data.data[i + 1] = c[1]; data.data[i + 2] = c[2]; data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Earth(ctx, W, H) {
    const noise = makeNoise(300);
    const noise2 = makeNoise(301);
    const data = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const lat = (y / H - 0.5) * Math.PI;
      for (let x = 0; x < W; x++) {
        const u = x / W * 8, v = y / H * 4;
        const terrain = fbm(noise, u, v, 6);
        const cloud = fbm(noise2, u * 1.5 + 0.3, v * 1.5, 4);
        const isIce = Math.abs(lat) > 1.15;
        let c;
        if (isIce) {
          c = [230, 235, 245];
        } else if (terrain < 0.42) {
          c = lerpColor([20, 50, 140], [30, 80, 180], terrain / 0.42); // ocean
        } else if (terrain < 0.48) {
          c = [160, 150, 100]; // coast
        } else {
          c = lerpColor([40, 120, 50], [100, 85, 50], (terrain - 0.48) * 3); // land
        }
        // clouds overlay
        if (cloud > 0.52) {
          const ca = Math.min(1, (cloud - 0.52) * 4);
          c = lerpColor(c, [240, 242, 250], ca * 0.6);
        }
        const i = (y * W + x) * 4;
        data.data[i] = c[0]; data.data[i + 1] = c[1]; data.data[i + 2] = c[2]; data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Mars(ctx, W, H) {
    _rockyPlanet(ctx, W, H, 400, [190, 100, 60], [160, 80, 40], [120, 55, 30], 0.04);
    // Polar ice caps
    const data = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const lat = Math.abs(y / H - 0.5) * 2;
      if (lat > 0.88) {
        const t = (lat - 0.88) / 0.12;
        const i4 = y * W * 4;
        for (let x = 0; x < W; x++) {
          const i = i4 + x * 4;
          data.data[i] = data.data[i] + (230 - data.data[i]) * t;
          data.data[i + 1] = data.data[i + 1] + (225 - data.data[i + 1]) * t;
          data.data[i + 2] = data.data[i + 2] + (220 - data.data[i + 2]) * t;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Jupiter(ctx, W, H) {
    _bandedGas(ctx, W, H, 500, [
      [210, 175, 130], // light band
      [170, 120, 70],  // dark band
      [220, 190, 150], // cream
      [150, 95, 55],   // dark brown
      [200, 165, 120], // tan
      [180, 130, 80],  // medium
    ], 22, 0.7);
    // Great Red Spot (approximate)
    const data = ctx.getImageData(0, 0, W, H);
    const cx = W * 0.35, cy = H * 0.58, rx = W * 0.07, ry = H * 0.035;
    for (let y = Math.floor(cy - ry * 2); y < Math.ceil(cy + ry * 2); y++) {
      for (let x = Math.floor(cx - rx * 2); x < Math.ceil(cx + rx * 2); x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.2) {
          const t = Math.max(0, 1 - d / 1.2);
          const i = (y * W + x) * 4;
          data.data[i] = data.data[i] + (200 - data.data[i]) * t * 0.65;
          data.data[i + 1] = data.data[i + 1] + (80 - data.data[i + 1]) * t * 0.5;
          data.data[i + 2] = data.data[i + 2] + (50 - data.data[i + 2]) * t * 0.5;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Saturn(ctx, W, H) {
    _bandedGas(ctx, W, H, 600, [
      [220, 200, 160],
      [200, 180, 140],
      [235, 215, 175],
      [195, 170, 125],
      [225, 210, 170],
      [210, 190, 150],
    ], 18, 0.4);
  },

  SaturnRing(ctx, W, H) {
    const noise = makeNoise(650);
    const data = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const t = y / H; // 0 = inner, 1 = outer
      for (let x = 0; x < W; x++) {
        const n = fbm(noise, x / W * 20, t * 4, 3);
        // Ring bands: varying opacity and color
        const band = Math.sin(t * Math.PI * 12) * 0.3 + 0.5 + n * 0.2;
        const brightness = 0.6 + band * 0.4;
        const alpha = Math.max(0, Math.min(255,
          (band > 0.3 ? 180 * band : 20) * (t > 0.05 && t < 0.95 ? 1 : 0)
        ));
        const i = (y * W + x) * 4;
        data.data[i] = 210 * brightness;
        data.data[i + 1] = 195 * brightness;
        data.data[i + 2] = 160 * brightness;
        data.data[i + 3] = alpha;
      }
    }
    ctx.putImageData(data, 0, 0);
  },

  Uranus(ctx, W, H) {
    _bandedGas(ctx, W, H, 700, [
      [150, 210, 230],
      [130, 195, 215],
      [160, 220, 240],
      [140, 200, 220],
      [155, 215, 235],
    ], 10, 0.2);
  },

  Neptune(ctx, W, H) {
    _bandedGas(ctx, W, H, 800, [
      [50, 80, 200],
      [40, 60, 170],
      [65, 100, 220],
      [45, 70, 185],
      [55, 90, 210],
    ], 12, 0.35);
  },
};

/* ── Reusable generators ──────────────────────────────────────────── */

function _rockyPlanet(ctx, W, H, seed, col1, col2, col3, craterChance) {
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 1);
  const rng = makeRng(seed + 2);
  const data = ctx.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W * 10, v = y / H * 5;
      const n = fbm(noise, u, v, 5);
      const n2 = fbm(noise2, u * 2, v * 2, 3);
      let c;
      if (n < 0.4) c = lerpColor(col3, col2, n / 0.4);
      else if (n < 0.6) c = lerpColor(col2, col1, (n - 0.4) / 0.2);
      else c = lerpColor(col1, col2, (n - 0.6) * 2);
      // cratering effect
      const crater = n2 * n2;
      if (crater > 0.45) {
        const shadow = 1 - (crater - 0.45) * 1.5;
        c = [c[0] * shadow, c[1] * shadow, c[2] * shadow];
      }
      const i = (y * W + x) * 4;
      data.data[i] = c[0]; data.data[i + 1] = c[1]; data.data[i + 2] = c[2]; data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
}

function _bandedGas(ctx, W, H, seed, palette, numBands, turbulence) {
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 1);
  const data = ctx.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const bandBase = (y / H) * numBands;
    for (let x = 0; x < W; x++) {
      const u = x / W * 8, v = y / H * 4;
      const turb = fbm(noise, u, v, 4) * turbulence;
      const band = (bandBase + turb * numBands * 0.2) % palette.length;
      const idx = Math.floor(band);
      const frac = band - idx;
      const c1 = palette[idx % palette.length];
      const c2 = palette[(idx + 1) % palette.length];
      let c = lerpColor(c1, c2, frac);
      // small-scale detail
      const detail = fbm(noise2, u * 3, v * 6, 3);
      const bright = 0.85 + detail * 0.3;
      c = [c[0] * bright, c[1] * bright, c[2] * bright];
      const i = (y * W + x) * 4;
      data.data[i] = Math.min(255, c[0]);
      data.data[i + 1] = Math.min(255, c[1]);
      data.data[i + 2] = Math.min(255, c[2]);
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
}

/* ── Public API ───────────────────────────────────────────────────── */

function _generate(name) {
  const gen = generators[name];
  if (!gen) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  gen(ctx, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Generate texture for a planet (by name). */
export function generatePlanetTexture(name) {
  return _generate(name);
}

/** Generate Sun texture. */
export function generateSunTexture() {
  return _generate('Sun');
}

/** Generate Saturn ring texture. */
export function generateSaturnRingTexture() {
  return _generate('SaturnRing');
}
