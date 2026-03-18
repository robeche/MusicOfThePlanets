/**
 * planets.js — Planet astronomical data and orbital mechanics
 * Uses simplified Keplerian elements (J2000 epoch) for realistic orbital positions.
 */

// J2000 epoch: January 1.5, 2000 TT
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DEG2RAD = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

// Display scaling: compress huge AU distances into a viewable range
const SCALE_POWER = 0.45;
const SCALE_FACTOR = 8;

/**
 * Planet data — Keplerian orbital elements at J2000.
 *   semiMajorAxis  : AU
 *   eccentricity   : dimensionless
 *   inclination    : degrees (to ecliptic)
 *   longAscNode    : Ω, degrees
 *   longPerihelion  : ϖ = Ω + ω, degrees
 *   meanLongJ2000  : L₀, degrees
 *   orbitalPeriod  : days
 *   mass           : Earth masses
 *   rotationPeriod : days (sidereal)
 *   harmonicProfile: amplitude of harmonics 1‑N for audio timbre
 */
export const PLANETS = [
  {
    name: 'Mercury',
    color: 0xb0b0b0,
    emissive: 0x222222,
    displayRadius: 0.35,
    semiMajorAxis: 0.38710,
    eccentricity: 0.20563,
    inclination: 7.005,
    longAscNode: 48.331,
    longPerihelion: 77.456,
    meanLongJ2000: 252.251,
    orbitalPeriod: 87.969,
    mass: 0.055,
    rotationPeriod: 58.646,
    harmonicProfile: [1.0, 0.3, 0.55, 0.1, 0.25, 0.05],
    description: 'Swift messenger, scorched and cratered',
  },
  {
    name: 'Venus',
    color: 0xffd085,
    emissive: 0x332200,
    displayRadius: 0.50,
    semiMajorAxis: 0.72333,
    eccentricity: 0.00677,
    inclination: 3.395,
    longAscNode: 76.680,
    longPerihelion: 131.564,
    meanLongJ2000: 181.980,
    orbitalPeriod: 224.701,
    mass: 0.815,
    rotationPeriod: 243.025,
    harmonicProfile: [1.0, 0.6, 0.35, 0.15, 0.08, 0.03],
    description: 'Veiled world of crushing atmosphere',
  },
  {
    name: 'Earth',
    color: 0x4499ff,
    emissive: 0x112244,
    displayRadius: 0.50,
    semiMajorAxis: 1.00000,
    eccentricity: 0.01671,
    inclination: 0.000,
    longAscNode: 0.0,
    longPerihelion: 102.937,
    meanLongJ2000: 100.464,
    orbitalPeriod: 365.256,
    mass: 1.000,
    rotationPeriod: 0.997,
    harmonicProfile: [1.0, 0.5, 0.4, 0.3, 0.2, 0.12, 0.06],
    description: 'Our pale blue dot',
  },
  {
    name: 'Mars',
    color: 0xff4422,
    emissive: 0x331100,
    displayRadius: 0.40,
    semiMajorAxis: 1.52368,
    eccentricity: 0.09341,
    inclination: 1.850,
    longAscNode: 49.558,
    longPerihelion: 336.060,
    meanLongJ2000: 355.453,
    orbitalPeriod: 686.980,
    mass: 0.107,
    rotationPeriod: 1.026,
    harmonicProfile: [1.0, 0.1, 0.7, 0.05, 0.5, 0.02, 0.35],
    description: 'The red planet, rusty and cold',
  },
  {
    name: 'Jupiter',
    color: 0xffaa66,
    emissive: 0x332200,
    displayRadius: 1.40,
    semiMajorAxis: 5.20260,
    eccentricity: 0.04849,
    inclination: 1.303,
    longAscNode: 100.464,
    longPerihelion: 14.331,
    meanLongJ2000: 34.351,
    orbitalPeriod: 4332.59,
    mass: 317.8,
    rotationPeriod: 0.414,
    harmonicProfile: [1.0, 0.8, 0.65, 0.5, 0.4, 0.32, 0.25, 0.18, 0.12],
    description: 'King of the planets, a gas giant',
  },
  {
    name: 'Saturn',
    color: 0xffdd88,
    emissive: 0x332200,
    displayRadius: 1.20,
    hasRings: true,
    semiMajorAxis: 9.55491,
    eccentricity: 0.05551,
    inclination: 2.489,
    longAscNode: 113.666,
    longPerihelion: 93.057,
    meanLongJ2000: 49.945,
    orbitalPeriod: 10759.22,
    mass: 95.16,
    rotationPeriod: 0.444,
    harmonicProfile: [1.0, 0.15, 0.1, 0.05, 0.75, 0.03, 0.01, 0.55, 0.02],
    description: 'The ringed wonder',
  },
  {
    name: 'Uranus',
    color: 0x88ddff,
    emissive: 0x112233,
    displayRadius: 0.85,
    semiMajorAxis: 19.18171,
    eccentricity: 0.04716,
    inclination: 0.773,
    longAscNode: 74.006,
    longPerihelion: 171.005,
    meanLongJ2000: 313.232,
    orbitalPeriod: 30685.4,
    mass: 14.54,
    rotationPeriod: 0.718,
    harmonicProfile: [1.0, 0.05, 0.6, 0.03, 0.02, 0.45, 0.01],
    description: 'Ice giant tilted on its side',
  },
  {
    name: 'Neptune',
    color: 0x4466ff,
    emissive: 0x111144,
    displayRadius: 0.85,
    semiMajorAxis: 30.06896,
    eccentricity: 0.00858,
    inclination: 1.770,
    longAscNode: 131.784,
    longPerihelion: 44.124,
    meanLongJ2000: 304.880,
    orbitalPeriod: 60189.0,
    mass: 17.15,
    rotationPeriod: 0.671,
    harmonicProfile: [1.0, 0.3, 0.12, 0.05, 0.03, 0.015, 0.008],
    description: 'Deep blue ice giant at the edge',
  },
];

// ─── Coordinate helpers ───────────────────────────────────────────────

/** Convert AU to display units (compressed for visualisation) */
export function auToDisplay(au) {
  return SCALE_FACTOR * Math.pow(Math.abs(au), SCALE_POWER) * Math.sign(au);
}

// ─── Kepler equation solver ───────────────────────────────────────────

/** Newton‑Raphson solver for E − e sin E = M */
function solveKepler(M, e, tol = 1e-8, maxIter = 50) {
  let E = M + e * Math.sin(M); // better initial guess than E = M
  for (let i = 0; i < maxIter; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// ─── Position calculator ──────────────────────────────────────────────

/**
 * Calculate heliocentric ecliptic position at a given JS timestamp (ms).
 * Returns real AU coords + compressed display coords (Three.js Y-up).
 */
export function calculatePosition(planet, timeMs) {
  const daysSinceJ2000 = (timeMs - J2000_MS) / 86400000;

  const a = planet.semiMajorAxis;
  const e = planet.eccentricity;
  const i = planet.inclination * DEG2RAD;
  const Omega = planet.longAscNode * DEG2RAD;       // longitude of ascending node
  const omega = (planet.longPerihelion - planet.longAscNode) * DEG2RAD; // argument of perihelion
  const T = planet.orbitalPeriod; // days

  // Mean anomaly at epoch
  const M0 = (planet.meanLongJ2000 - planet.longPerihelion) * DEG2RAD;
  const n = TWO_PI / T;
  let M = (M0 + n * daysSinceJ2000) % TWO_PI;
  if (M < 0) M += TWO_PI;

  // Eccentric anomaly
  const E = solveKepler(M, e);

  // True anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );

  // Heliocentric distance
  const r = a * (1 - e * Math.cos(E));

  // Position in orbital plane
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // Rotation matrices → ecliptic frame
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const ci = Math.cos(i),     si = Math.sin(i);

  const xEcl = (cO * cw - sO * sw * ci) * xOrb + (-cO * sw - sO * cw * ci) * yOrb;
  const yEcl = (sO * cw + cO * sw * ci) * xOrb + (-sO * sw + cO * cw * ci) * yOrb;
  const zEcl = (sw * si) * xOrb + (cw * si) * yOrb;

  // Display coordinates — ecliptic plane → XZ, height → Y
  const flatR = Math.sqrt(xEcl * xEcl + yEcl * yEcl);
  const angle = Math.atan2(yEcl, xEcl);
  const dispR = auToDisplay(flatR);

  // Use LINEAR scaling for the vertical axis so small orbital
  // inclinations are shown proportionally (the power-law compression
  // amplifies tiny z values and produces visible stair-steps).
  return {
    au: { x: xEcl, y: yEcl, z: zEcl },
    display: {
      x: dispR * Math.cos(angle),
      y: zEcl * SCALE_FACTOR,
      z: dispR * Math.sin(angle),
    },
    distanceAU: r,
  };
}

// ─── Orbit path for visualisation ─────────────────────────────────────

/** Return array of {x,y,z} display coords tracing one full orbit. */
export function getOrbitPath(planet, numPoints = 360) {
  const T = planet.orbitalPeriod;
  const step = T / numPoints;
  const pts = [];
  for (let j = 0; j <= numPoints; j++) {
    const t = J2000_MS + j * step * 86400000;
    const p = calculatePosition(planet, t);
    pts.push(p.display);
  }
  return pts;
}

// ─── Audio frequency mapping ──────────────────────────────────────────

/**
 * Map orbital period → audible frequency.
 * Faster orbits ⇒ higher pitch.  Log‑scaled between 110 Hz and 660 Hz.
 */
export function getBaseFrequency(planet) {
  const minP = 87.969;   // Mercury (days)
  const maxP = 60189.0;  // Neptune (days)
  const minF = 110;      // Hz (A2)
  const maxF = 660;      // Hz (E5)

  const t = (Math.log(planet.orbitalPeriod) - Math.log(minP))
          / (Math.log(maxP) - Math.log(minP));
  return maxF * Math.pow(minF / maxF, t);
}
