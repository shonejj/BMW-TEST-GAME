import * as THREE from 'three';
import { rand } from '../engine/util';

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const SLASH_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Crescent slash: sweeps across its arc with a bright leading edge. */
const SLASH_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uFade;
uniform float uArc;
uniform float uInner;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  float f = clamp(a / uArc, 0.0, 1.0);
  float lead = uProgress - f;
  if (lead < 0.0) discard;
  float trail = exp(-lead * 3.5);
  float radial = clamp((r - uInner) / (1.0 - uInner), 0.0, 1.0);
  float band = smoothstep(0.0, 0.25, radial) * smoothstep(1.0, 0.7, radial);
  float core = pow(band, 3.0);
  vec3 col = mix(uColorA, uColorB, core * trail);
  float alpha = band * trail * uFade;
  gl_FragColor = vec4(col * (1.0 + core * 1.5), alpha);
}`;

const GROUND_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Expanding shockwave / aura ring on the ground. */
const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uWidth;
uniform float uFill;
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float edge = smoothstep(uRadius - uWidth, uRadius, r) * (1.0 - smoothstep(uRadius, uRadius + 0.02, r));
  float fill = uFill * smoothstep(uRadius, 0.0, r) * 0.35 * step(r, uRadius);
  float ang = atan(vUv.y, vUv.x);
  float streak = 0.6 + 0.4 * sin(ang * 14.0 + uTime * 10.0 - r * 12.0);
  float a = (edge * 1.4 + fill * streak) * uAlpha;
  gl_FragColor = vec4(uColor * (1.0 + edge), a);
}`;

/** Red attack telegraph: filling circle (or sector) with a hard rim. */
const TELE_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uAlpha;
uniform float uHalfAngle;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = abs(atan(vUv.x, vUv.y));
  if (ang > uHalfAngle) discard;
  float rim = smoothstep(0.86, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float fill = step(r, uProgress) * 0.35 + 0.08;
  float front = smoothstep(uProgress - 0.06, uProgress, r) * step(r, uProgress) * 0.5;
  gl_FragColor = vec4(uColor, (rim + fill + front) * uAlpha);
}`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  float v = vUv.y;
  float side = sin(vUv.x * 3.14159);
  float flicker = 0.85 + 0.15 * sin(uTime * 8.0 + v * 20.0);
  float a = pow(1.0 - v, 1.5) * side * uAlpha * flicker;
  gl_FragColor = vec4(uColor * 1.6, a);
}`;

/** Soft radial blob, used for light pools, blob shadows and pickups. */
const BLOB_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = pow(max(0.0, 1.0 - r), 2.0) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}`;

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, (1.0 - r) * vAlpha);
}`;

// ---------------------------------------------------------------------------

export function makeGroundMaterial(frag: string, uniforms: Record<string, THREE.IUniform>, additive = true) {
  return new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

const groundPlane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

export function makeBlob(color: number, alpha: number, radius: number, additive: boolean) {
  const m = new THREE.Mesh(
    groundPlane,
    makeGroundMaterial(BLOB_FRAG, { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } }, additive),
  );
  m.scale.setScalar(radius);
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; r: number; g: number; b: number;
  gravity: number; drag: number;
}

export interface EmitOptions {
  count?: number;
  speed?: [number, number];
  up?: [number, number];
  life?: [number, number];
  size?: [number, number];
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
  spread?: number;
  dir?: { x: number; z: number };
  radius?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly list: Particle[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();
  max: number;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** `pxPerUnit`: drawing-buffer pixels per world unit at distance 1. */
  setScale(pxPerUnit: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pxPerUnit / 100;
  }

  emit(x: number, y: number, z: number, o: EmitOptions = {}) {
    const count = o.count ?? 10;
    this.tmpColor.set(o.color ?? 0xffc060);
    this.tmpColor2.set(o.color2 ?? o.color ?? 0xffc060);
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.max) this.list.shift();
      let ang = Math.random() * Math.PI * 2;
      if (o.dir) ang = Math.atan2(o.dir.z, o.dir.x) + (Math.random() - 0.5) * (o.spread ?? 1);
      const sp = rand(...(o.speed ?? [1, 4]));
      const rr = o.radius ? Math.random() * o.radius : 0;
      const ra = Math.random() * Math.PI * 2;
      const t = Math.random();
      const life = rand(...(o.life ?? [0.3, 0.8]));
      this.list.push({
        x: x + Math.cos(ra) * rr, y, z: z + Math.sin(ra) * rr,
        vx: Math.cos(ang) * sp, vy: rand(...(o.up ?? [1, 4])), vz: Math.sin(ang) * sp,
        life, maxLife: life,
        size: rand(...(o.size ?? [0.15, 0.35])),
        r: this.tmpColor.r + (this.tmpColor2.r - this.tmpColor.r) * t,
        g: this.tmpColor.g + (this.tmpColor2.g - this.tmpColor.g) * t,
        b: this.tmpColor.b + (this.tmpColor2.b - this.tmpColor.b) * t,
        gravity: o.gravity ?? 6, drag: o.drag ?? 1.5,
      });
    }
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b;
      this.size[n] = p.size * (0.4 + 0.6 * t) * 100;
      this.alpha[n] = Math.min(1, t * 2);
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Effect manager
// ---------------------------------------------------------------------------

interface Effect {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  update: (k: number, dt: number) => void;
  keep?: boolean;
}

export const COLORS = {
  gold: 0xffb43c,
  goldHot: 0xfff0b0,
  fire: 0xff5a14,
  fireHot: 0xffd27a,
  jade: 0x38ff7a,
  jadeHot: 0xd4ffd0,
  red: 0xff2a2a,
  white: 0xffffff,
};

export class Vfx {
  readonly sparks: Particles;
  readonly dust: Particles;
  private effects: Effect[] = [];
  private time = 0;
  private slashGeo = new Map<string, THREE.BufferGeometry>();
  private beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 12, 1, true).translate(0, 0.5, 0);

  constructor(private readonly scene: THREE.Scene, maxParticles: number) {
    this.sparks = new Particles(maxParticles, true);
    this.dust = new Particles(Math.floor(maxParticles / 2), false);
    scene.add(this.sparks.points, this.dust.points);
  }

  private add(e: Effect) {
    this.scene.add(e.obj);
    this.effects.push(e);
    return e;
  }

  private getSlashGeo(arc: number, inner: number) {
    const key = arc.toFixed(2) + inner.toFixed(2);
    let g = this.slashGeo.get(key);
    if (!g) {
      g = new THREE.RingGeometry(inner, 1, 40, 2, 0, arc);
      this.slashGeo.set(key, g);
    }
    return g;
  }

  /**
   * Crescent slash arc centred on the attacker. `yaw` is the facing direction;
   * the arc is centred on it. `tilt` rolls the arc plane for variety.
   */
  slash(pos: THREE.Vector3, yaw: number, opts: { radius?: number; arc?: number; dur?: number; tilt?: number; reverse?: boolean; colorA?: number; colorB?: number; height?: number } = {}) {
    const arc = opts.arc ?? Math.PI * 0.95;
    const inner = 0.45;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VERT,
      fragmentShader: SLASH_FRAG,
      uniforms: {
        uProgress: { value: 0 }, uFade: { value: 1 }, uArc: { value: arc }, uInner: { value: inner },
        uColorA: { value: new THREE.Color(opts.colorA ?? COLORS.gold) },
        uColorB: { value: new THREE.Color(opts.colorB ?? COLORS.goldHot) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.getSlashGeo(arc, inner), mat);
    const holder = new THREE.Group();
    holder.position.copy(pos);
    holder.position.y += opts.height ?? 1.0;
    holder.rotation.order = 'YXZ';
    holder.rotation.y = yaw;
    holder.rotation.z = opts.tilt ?? 0;
    // Ring lies in XY; lay it flat and rotate so the arc is centred on +Z (facing).
    // It sweeps from -X to +X; mirroring reverses the sweep direction.
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.PI / 2 - arc / 2;
    mesh.scale.setScalar(opts.radius ?? 3);
    const flip = new THREE.Group();
    if (opts.reverse) flip.scale.x = -1;
    flip.add(mesh);
    holder.add(flip);
    holder.renderOrder = 6;
    const dur = opts.dur ?? 0.28;
    this.add({
      obj: holder, t: 0, dur,
      update: (k) => {
        mat.uniforms.uProgress.value = Math.min(1.4, k * 2.6);
        mat.uniforms.uFade.value = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        const s = 1 + k * 0.15;
        holder.scale.set(s, s, s);
      },
    });
  }

  /** Expanding ground shockwave. */
  shockwave(pos: THREE.Vector3, radius: number, color = COLORS.gold, dur = 0.45, width = 0.12) {
    const mat = makeGroundMaterial(RING_FRAG, {
      uTime: { value: 0 }, uRadius: { value: 0.1 }, uWidth: { value: width }, uFill: { value: 0.6 },
      uAlpha: { value: 1 }, uColor: { value: new THREE.Color(color) },
    });
    const m = new THREE.Mesh(groundPlane, mat);
    m.position.set(pos.x, pos.y + 0.06, pos.z);
    m.scale.setScalar(radius);
    m.renderOrder = 2;
    this.add({
      obj: m, t: 0, dur,
      update: (k) => {
        mat.uniforms.uRadius.value = 0.15 + 0.83 * (1 - (1 - k) * (1 - k));
        mat.uniforms.uAlpha.value = 1 - k * k;
        mat.uniforms.uTime.value = this.time;
      },
    });
  }

  /** A persistent golden aura ring that follows a target until `stop()` is called. */
  aura(radius: number, color = COLORS.gold) {
    const mat = makeGroundMaterial(RING_FRAG, {
      uTime: { value: 0 }, uRadius: { value: 0.96 }, uWidth: { value: 0.08 }, uFill: { value: 0.55 },
      uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) },
    });
    const m = new THREE.Mesh(groundPlane, mat);
    m.scale.setScalar(radius);
    m.renderOrder = 2;
    let stopping = false;
    let alpha = 0;
    const e = this.add({
      obj: m, t: 0, dur: 999, keep: true,
      update: (_k, dt) => {
        alpha += (stopping ? -4 : 6) * dt;
        alpha = Math.max(0, Math.min(1, alpha));
        mat.uniforms.uAlpha.value = alpha;
        mat.uniforms.uTime.value = this.time;
        m.rotation.y += dt * 4;
        if (stopping && alpha <= 0) e.t = e.dur;
      },
    });
    return {
      mesh: m,
      stop: () => { stopping = true; },
    };
  }

  /** Red telegraph decal: a filling circle or sector. Returns a handle you can move/remove. */
  telegraph(pos: THREE.Vector3, radius: number, dur: number, opts: { yaw?: number; halfAngle?: number; color?: number } = {}) {
    const mat = makeGroundMaterial(TELE_FRAG, {
      uProgress: { value: 0 }, uAlpha: { value: 0.9 }, uHalfAngle: { value: opts.halfAngle ?? Math.PI },
      uColor: { value: new THREE.Color(opts.color ?? COLORS.red) },
    }, false);
    const m = new THREE.Mesh(groundPlane, mat);
    m.position.set(pos.x, pos.y + 0.05, pos.z);
    m.scale.setScalar(radius);
    // The sector shader points along -Z in mesh space; facing yaw is measured from +Z.
    m.rotation.y = (opts.yaw ?? 0) + Math.PI;
    m.renderOrder = 2;
    const e = this.add({
      obj: m, t: 0, dur,
      update: (k) => {
        mat.uniforms.uProgress.value = Math.min(1, k * 1.05);
        mat.uniforms.uAlpha.value = k > 0.92 ? (1 - k) * 10 : 0.9;
      },
    });
    return { mesh: m, cancel: () => { e.t = e.dur; } };
  }

  /** Vertical light pillar (loot beams, level up). */
  beam(pos: THREE.Vector3, color: number, height: number, dur: number, width = 1) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.beamGeo, mat);
    m.position.copy(pos);
    m.scale.set(width, height, width);
    m.renderOrder = 7;
    const e = this.add({
      obj: m, t: 0, dur,
      update: (k) => {
        mat.uniforms.uTime.value = this.time;
        mat.uniforms.uAlpha.value = dur > 100 ? 0.8 : Math.min(1, (1 - k) * 3) * Math.min(1, k * 10);
      },
    });
    return { mesh: m, remove: () => { e.t = e.dur; } };
  }

  /** Lingering poison pool. */
  pool(pos: THREE.Vector3, radius: number, dur: number, color = COLORS.jade) {
    const mat = makeGroundMaterial(RING_FRAG, {
      uTime: { value: 0 }, uRadius: { value: 0.95 }, uWidth: { value: 0.25 }, uFill: { value: 2.2 },
      uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) },
    });
    const m = new THREE.Mesh(groundPlane, mat);
    m.position.set(pos.x, pos.y + 0.07, pos.z);
    m.scale.setScalar(radius);
    m.renderOrder = 2;
    this.add({
      obj: m, t: 0, dur,
      update: (k) => {
        mat.uniforms.uTime.value = this.time * 0.3;
        mat.uniforms.uAlpha.value = Math.min(1, k * 8, (1 - k) * 4) * 0.8;
        if (Math.random() < 0.3) this.sparks.emit(m.position.x, m.position.y, m.position.z, { count: 1, radius: radius * 0.9, speed: [0, 0.3], up: [0.5, 1.5], gravity: -0.5, life: [0.6, 1.2], color, color2: COLORS.jadeHot, size: [0.2, 0.5] });
      },
    });
  }

  /** Hit sparks + optional dust at a point. */
  impact(pos: THREE.Vector3, color = COLORS.goldHot, count = 10) {
    this.sparks.emit(pos.x, pos.y + 1, pos.z, { count, speed: [3, 9], up: [1, 5], life: [0.15, 0.4], size: [0.1, 0.25], color, color2: COLORS.gold, gravity: 10, drag: 3 });
  }

  dustBurst(pos: THREE.Vector3, count = 12, radius = 1) {
    this.dust.emit(pos.x, pos.y + 0.2, pos.z, { count, radius, speed: [1, 3], up: [0.2, 1.5], life: [0.6, 1.4], size: [0.6, 1.2], color: 0x6c6458, color2: 0x8f877a, gravity: 0.5, drag: 2 });
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      e.update(k, dt);
      if (e.t >= e.dur) {
        this.scene.remove(e.obj);
        e.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.dispose();
        });
        this.effects.splice(i, 1);
      }
    }
    this.sparks.update(dt);
    this.dust.update(dt);
  }
}
