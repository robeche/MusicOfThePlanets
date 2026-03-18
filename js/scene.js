/**
 * scene.js — Three.js 3D scene manager.
 * Sun, planets, orbit paths, starfield, listener sphere, labels.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { auToDisplay } from './planets.js';
import { generateSaturnRingTexture } from './textureGen.js';

// Local texture paths (served alongside index.html)
const TEXTURE_PATH = 'textures/';
const PLANET_TEXTURES = {
  Mercury:  TEXTURE_PATH + 'mercury.jpg',
  Venus:    TEXTURE_PATH + 'venus.jpg',
  Earth:    TEXTURE_PATH + 'earth.jpg',
  Mars:     TEXTURE_PATH + 'mars.jpg',
  Jupiter:  TEXTURE_PATH + 'jupiter.jpg',
  Saturn:   TEXTURE_PATH + 'saturn.jpg',
  Uranus:   TEXTURE_PATH + 'uranus.jpg',
  Neptune:  TEXTURE_PATH + 'neptune.jpg',
};

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.planetMeshes = new Map();   // name → { group, body, label }
    this.orbitLines = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.listenerPos = new THREE.Vector3(8, 0, 0); // start near Earth
    this.listenerTarget = this.listenerPos.clone();
    this._onListenerMove = null;

    // Drag state
    this._dragging = false;
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._dragHit = new THREE.Vector3();

    // Camera focus target (smooth pan to planet)
    this._focusTarget = null; // THREE.Vector3 or null
    this._focusLerp = 0;
  }

  /* ── Initialise renderer, camera, controls, lights ─────────────── */
  init() {
    const w = window.innerWidth, h = window.innerHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    this.camera.position.set(10, 30, 40);

    // Controls (orbit / zoom)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 300;
    this.controls.maxPolarAngle = Math.PI * 0.48; // don't go fully below horizon

    // Lights
    this.scene.add(new THREE.AmbientLight(0x667799, 1.2));

    // Starfield
    this._createStarfield();

    // Sun
    this._createSun();

    // Ecliptic grid
    this._createGrid();

    // Listener sphere
    this._createListener();

    // Pointer events for drag-to-move listener
    this.renderer.domElement.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.renderer.domElement.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.renderer.domElement.addEventListener('pointerup', (e) => this._onPointerUp(e));

    // Right-click handler (context menu on planets)
    this.renderer.domElement.addEventListener('contextmenu', (e) => this._onContextMenu(e));

    // Resize handler
    window.addEventListener('resize', () => this.resize());
  }

  /* ── Starfield ──────────────────────────────────────────────────── */
  _createStarfield() {
    const count = 6000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const brightness = 0.5 + Math.random() * 0.5;
      const tint = Math.random();
      colors[i * 3]     = brightness * (0.8 + tint * 0.2);
      colors[i * 3 + 1] = brightness * (0.85 + tint * 0.15);
      colors[i * 3 + 2] = brightness;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  /* ── Sun ────────────────────────────────────────────────────────── */
  _createSun() {
    // Glowing sphere with real texture
    const sunGeo = new THREE.SphereGeometry(2.2, 48, 48);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.scene.add(this.sunMesh);

    // Load sun texture from local file
    this.textureLoader.load(TEXTURE_PATH + 'sun.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      sunMat.map = tex;
      sunMat.color.set(0xffffff);
      sunMat.needsUpdate = true;
    });

    // Point light at sun (no distance cutoff so all planets get lit)
    this.sunLight = new THREE.PointLight(0xffeedd, 4.0, 0, 1.2);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    // Glow sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,220,80,1)');
    grad.addColorStop(0.15, 'rgba(255,180,50,0.6)');
    grad.addColorStop(0.4, 'rgba(255,120,20,0.15)');
    grad.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(14, 14, 1);
    this.scene.add(sprite);
  }

  /* ── Ecliptic reference grid ────────────────────────────────────── */
  _createGrid() {
    const grid = new THREE.GridHelper(120, 40, 0x112244, 0x0a1133);
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    this.scene.add(grid);
  }

  /* ── Listener (microphone) sphere ───────────────────────────────── */
  _createListener() {
    const geo = new THREE.SphereGeometry(0.5, 24, 24);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    this.listenerMesh = new THREE.Mesh(geo, mat);
    this.listenerMesh.position.copy(this.listenerPos);
    this.scene.add(this.listenerMesh);

    // Glow sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,255,200,0.8)');
    grad.addColorStop(0.3, 'rgba(0,200,180,0.3)');
    grad.addColorStop(1, 'rgba(0,100,120,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.listenerGlow = new THREE.Sprite(spriteMat);
    this.listenerGlow.scale.set(4, 4, 1);
    this.listenerMesh.add(this.listenerGlow);

    // Label
    this.listenerMesh.add(this._makeLabel('🎙️ Listener', '#00ffcc'));
  }

  /* ── Add a planet to the scene ──────────────────────────────────── */
  addPlanet(planet, orbitPoints) {
    const group = new THREE.Group();

    // Body — load real texture from local file
    const geo = new THREE.SphereGeometry(planet.displayRadius, 48, 48);
    const mat = new THREE.MeshPhongMaterial({
      color: planet.color,
      emissive: planet.emissive,
      emissiveIntensity: 0.3,
      shininess: 20,
    });
    const body = new THREE.Mesh(geo, mat);
    group.add(body);

    // Load planet texture from local file
    const texPath = PLANET_TEXTURES[planet.name];
    if (texPath) {
      this.textureLoader.load(texPath, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.emissive.set(0x222222);
        mat.emissiveIntensity = 0.35;
        mat.needsUpdate = true;
      });
    }

    // Rings for Saturn
    if (planet.hasRings) {
      const ringGeo = new THREE.RingGeometry(
        planet.displayRadius * 1.4,
        planet.displayRadius * 2.4,
        64,
      );
      const ringMat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      });

      // Saturn ring: procedural (the only texture we couldn't download)
      const ringTex = generateSaturnRingTexture();
      if (ringTex) {
        ringMat.map = ringTex;
        ringMat.color = new THREE.Color(0xffffff);
      } else {
        ringMat.color = new THREE.Color(0xddcc88);
      }

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI * 0.45;
      group.add(ring);
    }

    // Label
    const label = this._makeLabel(planet.name, '#' + planet.color.toString(16).padStart(6, '0'));
    group.add(label);

    this.scene.add(group);
    this.planetMeshes.set(planet.name, { group, body, label });

    // Orbit path
    if (orbitPoints && orbitPoints.length > 0) {
      const linePoints = orbitPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: planet.color,
        transparent: true,
        opacity: 0.18,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
      this.orbitLines.set(planet.name, line);
    }
  }

  /* ── Update planet 3D position ──────────────────────────────────── */
  updatePlanetPosition(name, x, y, z) {
    const entry = this.planetMeshes.get(name);
    if (!entry) return;
    entry.group.position.set(x, y, z);
  }

  /* ── Listener position ──────────────────────────────────────────── */
  getListenerPosition() {
    return this.listenerPos;
  }

  /** Set where the listener should glide toward (constrained to Y=0 orbital plane). */
  setListenerTarget(x, _y, z) {
    this.listenerTarget.set(x, 0, z);
  }

  /** Register callback for when listener moves. */
  onListenerMove(fn) {
    this._onListenerMove = fn;
  }

  /* ── Animate listener toward target ─────────────────────────────── */
  updateListener() {
    // While dragging, snap immediately; otherwise glide smoothly
    if (this._dragging) {
      this.listenerPos.copy(this.listenerTarget);
    } else {
      this.listenerPos.lerp(this.listenerTarget, 0.07);
    }
    this.listenerPos.y = 0; // stay on orbital plane
    this.listenerMesh.position.copy(this.listenerPos);

    // Pulsate glow
    const t = performance.now() * 0.003;
    const s = 3.5 + Math.sin(t) * 0.8;
    this.listenerGlow.scale.set(s, s, 1);
  }

  /* ── Pointer → normalised device coords helper ─────────────────── */
  _updateMouse(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /* ── Raycast to ecliptic (Y = 0) plane ──────────────────────────── */
  _rayToPlane() {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    if (this._raycaster.ray.intersectPlane(this._dragPlane, this._dragHit)) {
      this._dragHit.y = 0;
      return true;
    }
    return false;
  }

  /* ── Drag‑to‑move detection ─────────────────────────────────────── */
  _onPointerDown(e) {
    this._updateMouse(e);

    // Check if pointer hits the listener sphere (use generous threshold)
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const hits = this._raycaster.intersectObject(this.listenerMesh);
    if (hits.length > 0) {
      // Start dragging
      this._dragging = true;
      this.controls.enabled = false; // disable orbit while dragging
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    // Check if pointer hits a planet → focus camera on it
    const planetBodies = [];
    for (const [name, entry] of this.planetMeshes) {
      entry.body.userData._planetName = name;
      planetBodies.push(entry.body);
    }
    const planetHits = this._raycaster.intersectObjects(planetBodies);
    if (planetHits.length > 0) {
      const hitObj = planetHits[0].object;
      const name = hitObj.userData._planetName;
      const entry = this.planetMeshes.get(name);
      if (entry) {
        this._focusTarget = entry.group.position.clone();
        this._focusLerp = 0;
      }
      return;
    }

    // Also check the sun
    const sunHits = this._raycaster.intersectObject(this.sunMesh);
    if (sunHits.length > 0) {
      this._focusTarget = new THREE.Vector3(0, 0, 0);
      this._focusLerp = 0;
      return;
    }

    // Otherwise: click‑to‑move (will resolve on pointerup if not a camera drag)
    this._clickStart = { x: e.clientX, y: e.clientY };
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._updateMouse(e);
    if (this._rayToPlane()) {
      this.listenerTarget.copy(this._dragHit);
      if (this._onListenerMove) this._onListenerMove();
    }
  }

  _onPointerUp(e) {
    if (this._dragging) {
      this._dragging = false;
      this.controls.enabled = true;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      return;
    }

    // Click‑to‑move fallback (only if pointer barely moved → not a camera orbit)
    if (this._clickStart) {
      const dx = e.clientX - this._clickStart.x;
      const dy = e.clientY - this._clickStart.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) {
        this._updateMouse(e);
        if (this._rayToPlane()) {
          this.listenerTarget.copy(this._dragHit);
          if (this._onListenerMove) this._onListenerMove();
        }
      }
      this._clickStart = null;
    }
  }

  /* ── Right-click: detect planet under cursor ────────────────────── */
  _onContextMenu(e) {
    e.preventDefault(); // suppress browser context menu

    this._updateMouse(e);
    this._raycaster.setFromCamera(this._mouse, this.camera);

    const planetBodies = [];
    for (const [name, entry] of this.planetMeshes) {
      entry.body.userData._planetName = name;
      planetBodies.push(entry.body);
    }

    const hits = this._raycaster.intersectObjects(planetBodies);
    if (hits.length > 0) {
      const name = hits[0].object.userData._planetName;
      if (this._onRightClickPlanet) {
        this._onRightClickPlanet(name, e.clientX, e.clientY);
      }
    }
  }

  /** Register callback: (planetName, screenX, screenY) => void */
  onRightClickPlanet(fn) {
    this._onRightClickPlanet = fn;
  }

  /* ── Render one frame ───────────────────────────────────────────── */
  render() {    // Smooth camera focus on a planet
    if (this._focusTarget) {
      this._focusLerp = Math.min(1, this._focusLerp + 0.025);
      const t = this._focusLerp;
      const ease = t * t * (3 - 2 * t); // smoothstep
      this.controls.target.lerp(this._focusTarget, ease * 0.12);
      if (t >= 1) {
        this._focusTarget = null;
      }
    }
    this.controls.update();
    this.updateListener();

    // Slowly rotate sun for visual interest
    this.sunMesh.rotation.y += 0.002;

    // Rotate planet bodies so textures are visible
    for (const [, entry] of this.planetMeshes) {
      entry.body.rotation.y += 0.004;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ── Resize ─────────────────────────────────────────────────────── */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ── Utility: sprite text label ─────────────────────────────────── */
  _makeLabel(text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5, 1.25, 1);
    sprite.position.y = 2.2;
    sprite.renderOrder = 999;
    return sprite;
  }
}
