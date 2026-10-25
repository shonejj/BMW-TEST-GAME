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

/** Radial ground cracks left by heavy smashes (normal blending, glowing edges when hot). */
const CRACK_FRAG = /* glsl */ `
uniform float uAlpha;
uniform float uSeed;
uniform float uGlow;
varying vec2 vUv;
float h(float n) { return fract(sin(n * 91.7 + uSeed) * 43758.5453); }
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x) / 6.2832 + 0.5;
  float n = 9.0;
  float id = floor(a * n);
  float f = fract(a * n);
  float wob = (h(id) - 0.5) * 0.35 + sin(r * 14.0 + id * 3.1) * 0.05;
  float d = abs(f - 0.5 - wob);
  float line = smoothstep(0.07 * (1.0 - r * 0.7), 0.0, d) * step(r, 0.35 + 0.65 * h(id + 7.0));
  float center = smoothstep(0.28, 0.0, r) * 0.7;
  float alpha = max(line, center) * uAlpha * (1.0 - r * 0.5);
  vec3 col = mix(vec3(0.04, 0.035, 0.03), vec3(1.0, 0.55, 0.15) * 2.0, uGlow * line * (1.0 - r));
  gl_FragColor = vec4(col, alpha);
}`;

/** Camera-facing impact star: four sharp rays plus a soft core. */
const FLASH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  float rays = pow(max(0.0, 1.0 - abs(p.x * p.y) * 18.0), 6.0) * (1.0 - r);
  float core = pow(max(0.0, 1.0 - r), 3.0);
  gl_FragColor = vec4(uColor * (1.5 + core), (rays + core) * uAlpha);
}`;

const TRAIL_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aEdge;
varying float vAlpha;
varying float vEdge;
void main() {
  vAlpha = aAlpha;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TRAIL_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vEdge;
void main() {
  vec3 col = mix(uColorA, uColorB, vEdge * vAlpha);
  gl_FragColor = vec4(col * (1.0 + vEdge), vAlpha * (0.15 + 0.85 * vEdge));
}`;

/**
 * Ribbon that follows two points on the weapon (mid-shaft and tip) for a
 * fraction of a second, giving swings a readable motion arc.
 */
export class Trail {
  readonly mesh: THREE.Mesh;
  active = false;
  private readonly max = 28;
  private readonly life = 0.16;
  private readonly a: THREE.Vector3[] = [];
  private readonly b: THREE.Vector3[] = [];
  private readonly t: number[] = [];
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    const edge = new Float32Array(this.max * 2);
    for (let i = 0; i < this.max; i++) edge[i * 2 + 1] = 1;
    const index: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const v = i * 2;
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      uniforms: { uColorA: { value: new THREE.Color(COLORS.gold) }, uColorB: { value: new THREE.Color(COLORS.goldHot) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }

  setColors(a: number, b: number) {
    (this.mat.uniforms.uColorA.value as THREE.Color).set(a);
    (this.mat.uniforms.uColorB.value as THREE.Color).set(b);
  }

  push(mid: THREE.Vector3, tip: THREE.Vector3, time: number) {
    if (!this.active) return;
    // Insert a midpoint along the arc so low frame rates still read as a curve.
    const n = this.a.length;
    if (n > 0) {
      const pa = this.a[n - 1], pb = this.b[n - 1];
      this.addSample(pa.clone().lerp(mid, 0.5), pb.clone().lerp(tip, 0.5).lerp(mid, -0.08), time);
    }
    this.addSample(mid.clone(), tip.clone(), time);
  }

  private addSample(a: THREE.Vector3, b: THREE.Vector3, t: number) {
    this.a.push(a);
    this.b.push(b);
    this.t.push(t);
    if (this.a.length > this.max) {
      this.a.shift();
      this.b.shift();
      this.t.shift();
    }
  }

  update(time: number) {
    while (this.t.length && time - this.t[0] > this.life) {
      this.a.shift();
      this.b.shift();
      this.t.shift();
    }
    const n = this.a.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    for (let i = 0; i < this.max; i++) {
      const j = Math.min(i, n - 1);
      const k = 1 - (time - this.t[j]) / this.life;
      this.pos.set([this.a[j].x, this.a[j].y, this.a[j].z, this.b[j].x, this.b[j].y, this.b[j].z], i * 6);
      const al = i < n ? Math.max(0, k) * (j / (n - 1)) : 0;
      this.alpha[i * 2] = al;
      this.alpha[i * 2 + 1] = al;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

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
const flashPlane = new THREE.PlaneGeometry(2, 2);

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

type PoolKind = 'slash' | 'ring' | 'tele' | 'beam' | 'crack' | 'flash';
interface Pooled {
  obj: THREE.Object3D;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  flip?: THREE.Group;
}

/**
 * All effect meshes are pooled and their materials are never disposed. Disposing
 * a ShaderMaterial makes three.js release its compiled program, so the next
 * effect of that type recompiles the shader — a 100–600 ms freeze on phones.
 */
export class Vfx {
  readonly sparks: Particles;
  readonly dust: Particles;
  private effects: (Effect & { item: Pooled; kind: PoolKind })[] = [];
  private pools: Record<PoolKind, Pooled[]> = { slash: [], ring: [], tele: [], beam: [], crack: [], flash: [] };
  /** Set by the game; used to billboard impact flashes. */
  camera: THREE.Camera | null = null;
  private time = 0;
  private slashGeo = new Map<string, THREE.BufferGeometry>();
  private beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 12, 1, true).translate(0, 0.5, 0);

  constructor(private readonly scene: THREE.Scene, maxParticles: number) {
    this.sparks = new Particles(maxParticles, true);
    this.dust = new Particles(Math.floor(maxParticles / 2), false);
    scene.add(this.sparks.points, this.dust.points);
  }

  private create(kind: PoolKind): Pooled {
    switch (kind) {
      case 'slash': {
        const mat = new THREE.ShaderMaterial({
          vertexShader: SLASH_VERT, fragmentShader: SLASH_FRAG,
          uniforms: {
            uProgress: { value: 0 }, uFade: { value: 1 }, uArc: { value: 1 }, uInner: { value: 0.45 },
            uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() },
          },
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(this.getSlashGeo(Math.PI, 0.45), mat);
        mesh.rotation.x = -Math.PI / 2;
        const flip = new THREE.Group();
        flip.add(mesh);
        const holder = new THREE.Group();
        holder.rotation.order = 'YXZ';
        holder.add(flip);
        holder.renderOrder = 6;
        mesh.renderOrder = 6;
        return { obj: holder, mesh, mat, flip };
      }
      case 'ring': {
        const mat = makeGroundMaterial(RING_FRAG, {
          uTime: { value: 0 }, uRadius: { value: 0.5 }, uWidth: { value: 0.1 }, uFill: { value: 0.6 },
          uAlpha: { value: 1 }, uColor: { value: new THREE.Color() },
        });
        const mesh = new THREE.Mesh(groundPlane, mat);
        mesh.renderOrder = 2;
        return { obj: mesh, mesh, mat };
      }
      case 'tele': {
        const mat = makeGroundMaterial(TELE_FRAG, {
          uProgress: { value: 0 }, uAlpha: { value: 0.9 }, uHalfAngle: { value: Math.PI }, uColor: { value: new THREE.Color() },
        }, false);
        const mesh = new THREE.Mesh(groundPlane, mat);
        mesh.renderOrder = 2;
        return { obj: mesh, mesh, mat };
      }
      case 'crack': {
        const mat = makeGroundMaterial(CRACK_FRAG, { uAlpha: { value: 1 }, uSeed: { value: 0 }, uGlow: { value: 1 } }, false);
        const mesh = new THREE.Mesh(groundPlane, mat);
        mesh.renderOrder = 1;
        return { obj: mesh, mesh, mat };
      }
      case 'flash': {
        const mat = new THREE.ShaderMaterial({
          vertexShader: BEAM_VERT.replace('vUv = uv;', 'vUv = uv * 2.0 - 1.0;'), fragmentShader: FLASH_FRAG,
          uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
          transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(flashPlane, mat);
        mesh.renderOrder = 9;
        return { obj: mesh, mesh, mat };
      }
      case 'beam': {
        const mat = new THREE.ShaderMaterial({
          vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
          uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uTime: { value: 0 } },
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(this.beamGeo, mat);
        mesh.renderOrder = 7;
        return { obj: mesh, mesh, mat };
      }
    }
  }

  private take(kind: PoolKind): Pooled {
    const item = this.pools[kind].pop() ?? this.create(kind);
    item.obj.visible = true;
    item.obj.rotation.set(0, 0, 0);
    item.obj.scale.set(1, 1, 1);
    if (!item.obj.parent) this.scene.add(item.obj);
    return item;
  }

  private add(kind: PoolKind, item: Pooled, dur: number, update: Effect['update']) {
    const e = { obj: item.obj, t: 0, dur, update, item, kind };
    this.effects.push(e);
    return e;
  }

  /** Compiles every effect shader up front (call once after the scene is built). */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const all: PoolKind[] = ['slash', 'ring', 'tele', 'beam', 'crack', 'flash'];
    const items = all.flatMap((k) => [this.take(k), this.take(k)]);
    const kinds = all.flatMap((k) => [k, k]);
    for (const it of items) it.obj.position.set(0, -50, 0);
    renderer.compile(this.scene, camera);
    items.forEach((it, i) => {
      it.obj.visible = false;
      this.pools[kinds[i]].push(it);
    });
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
    const it = this.take('slash');
    const u = it.mat.uniforms;
    u.uArc.value = arc;
    u.uProgress.value = 0;
    u.uFade.value = 1;
    (u.uColorA.value as THREE.Color).set(opts.colorA ?? COLORS.gold);
    (u.uColorB.value as THREE.Color).set(opts.colorB ?? COLORS.goldHot);
    it.mesh.geometry = this.getSlashGeo(arc, 0.45);
    // Ring lies in XY; lay it flat and rotate so the arc is centred on +Z (facing).
    // It sweeps from -X to +X; mirroring reverses the sweep direction.
    it.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - arc / 2);
    it.mesh.scale.setScalar(opts.radius ?? 3);
    it.flip!.scale.x = opts.reverse ? -1 : 1;
    const holder = it.obj;
    holder.position.copy(pos);
    holder.position.y += opts.height ?? 1.0;
    holder.rotation.y = yaw;
    holder.rotation.z = opts.tilt ?? 0;
    this.add('slash', it, opts.dur ?? 0.28, (k) => {
      u.uProgress.value = Math.min(1.4, k * 2.6);
      u.uFade.value = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
      const s = 1 + k * 0.15;
      holder.scale.set(s, s, s);
    });
  }

  private ring(pos: THREE.Vector3 | null, radius: number, color: number, radiusU: number, width: number, fill: number, alpha: number, yOff = 0.06) {
    const it = this.take('ring');
    const u = it.mat.uniforms;
    u.uRadius.value = radiusU;
    u.uWidth.value = width;
    u.uFill.value = fill;
    u.uAlpha.value = alpha;
    (u.uColor.value as THREE.Color).set(color);
    if (pos) it.obj.position.set(pos.x, pos.y + yOff, pos.z);
    it.obj.scale.setScalar(radius);
    return it;
  }

  /** Expanding ground shockwave. */
  shockwave(pos: THREE.Vector3, radius: number, color = COLORS.gold, dur = 0.45, width = 0.12) {
    const it = this.ring(pos, radius, color, 0.1, width, 0.6, 1);
    const u = it.mat.uniforms;
    this.add('ring', it, dur, (k) => {
      u.uRadius.value = 0.15 + 0.83 * (1 - (1 - k) * (1 - k));
      u.uAlpha.value = 1 - k * k;
      u.uTime.value = this.time;
    });
  }

  /** A persistent aura ring that follows a target until `stop()` is called. */
  aura(radius: number, color = COLORS.gold) {
    const it = this.ring(null, radius, color, 0.96, 0.08, 0.55, 0);
    const u = it.mat.uniforms;
    let stopping = false;
    let alpha = 0;
    const e = this.add('ring', it, 1e9, (_k, dt) => {
      alpha = Math.max(0, Math.min(1, alpha + (stopping ? -4 : 6) * dt));
      u.uAlpha.value = alpha;
      u.uTime.value = this.time;
      it.obj.rotation.y += dt * 4;
      if (stopping && alpha <= 0) e.t = e.dur;
    });
    return { mesh: it.mesh, stop: () => { stopping = true; } };
  }

  /** Red telegraph decal: a filling circle or sector. */
  telegraph(pos: THREE.Vector3, radius: number, dur: number, opts: { yaw?: number; halfAngle?: number; color?: number } = {}) {
    const it = this.take('tele');
    const u = it.mat.uniforms;
    u.uProgress.value = 0;
    u.uAlpha.value = 0.9;
    u.uHalfAngle.value = opts.halfAngle ?? Math.PI;
    (u.uColor.value as THREE.Color).set(opts.color ?? COLORS.red);
    it.obj.position.set(pos.x, pos.y + 0.05, pos.z);
    it.obj.scale.setScalar(radius);
    // The sector shader points along -Z in mesh space; facing yaw is measured from +Z.
    it.obj.rotation.y = (opts.yaw ?? 0) + Math.PI;
    const e = this.add('tele', it, dur, (k) => {
      u.uProgress.value = Math.min(1, k * 1.05);
      u.uAlpha.value = k > 0.92 ? (1 - k) * 10 : 0.9;
    });
    return { mesh: it.mesh, cancel: () => { e.t = e.dur; } };
  }

  /** Vertical light pillar (loot beams, level up). */
  beam(pos: THREE.Vector3, color: number, height: number, dur: number, width = 1) {
    const it = this.take('beam');
    const u = it.mat.uniforms;
    (u.uColor.value as THREE.Color).set(color);
    u.uAlpha.value = 0;
    it.obj.position.copy(pos);
    it.obj.scale.set(width, height, width);
    const e = this.add('beam', it, dur, (k) => {
      u.uTime.value = this.time;
      u.uAlpha.value = dur > 100 ? 0.8 : Math.min(1, (1 - k) * 3) * Math.min(1, k * 10);
    });
    return { mesh: it.mesh, remove: () => { e.t = e.dur; } };
  }

  /** Lingering poison pool. */
  pool(pos: THREE.Vector3, radius: number, dur: number, color = COLORS.jade) {
    const it = this.ring(pos, radius, color, 0.95, 0.25, 2.2, 0, 0.07);
    const u = it.mat.uniforms;
    const p = it.obj.position;
    this.add('ring', it, dur, (k) => {
      u.uTime.value = this.time * 0.3;
      u.uAlpha.value = Math.min(1, k * 8, (1 - k) * 4) * 0.8;
      if (Math.random() < 0.3) this.sparks.emit(p.x, p.y, p.z, { count: 1, radius: radius * 0.9, speed: [0, 0.3], up: [0.5, 1.5], gravity: -0.5, life: [0.6, 1.2], color, color2: COLORS.jadeHot, size: [0.2, 0.5] });
    });
  }

  /** Radial cracks in the ground that cool from glowing orange to dark, then fade. */
  crack(pos: THREE.Vector3, radius: number, dur = 3, hot = true) {
    const it = this.take('crack');
    const u = it.mat.uniforms;
    u.uSeed.value = Math.random() * 100;
    u.uAlpha.value = 1;
    u.uGlow.value = hot ? 1 : 0;
    it.obj.position.set(pos.x, pos.y + 0.045, pos.z);
    it.obj.scale.setScalar(radius);
    it.obj.rotation.y = Math.random() * Math.PI * 2;
    this.add('crack', it, dur, (k) => {
      u.uGlow.value = hot ? Math.max(0, 1 - k * 4) : 0;
      u.uAlpha.value = k > 0.7 ? (1 - k) / 0.3 : 1;
    });
  }

  /** Bright camera-facing star at an impact point. */
  flash(pos: THREE.Vector3, size = 1.2, color = COLORS.goldHot, dur = 0.12) {
    const it = this.take('flash');
    const u = it.mat.uniforms;
    (u.uColor.value as THREE.Color).set(color);
    it.obj.position.copy(pos);
    if (this.camera) it.obj.quaternion.copy(this.camera.quaternion);
    it.obj.rotateZ(Math.random() * Math.PI);
    this.add('flash', it, dur, (k) => {
      u.uAlpha.value = 1 - k;
      it.obj.scale.setScalar(size * (0.6 + k * 0.8));
    });
  }

  /** Ring of flame on the ground with fire licking up along its edge. */
  fireRing(pos: THREE.Vector3, radius: number, dur: number) {
    const it = this.ring(pos, radius, COLORS.fire, 0.97, 0.12, 0.35, 0, 0.06);
    const u = it.mat.uniforms;
    const c = it.obj.position.clone();
    this.add('ring', it, dur, (k, dt) => {
      u.uAlpha.value = Math.min(1, k * 10, (1 - k) * 6);
      u.uTime.value = this.time;
      it.obj.rotation.y += dt;
      const n = Math.ceil(radius * 3 * Math.min(1, dt * 60));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.sparks.emit(c.x + Math.cos(a) * radius, c.y + 0.1, c.z + Math.sin(a) * radius, { count: 1, speed: [0, 0.4], up: [1.5, 3.5], gravity: -1.5, life: [0.25, 0.55], color: COLORS.fire, color2: COLORS.fireHot, size: [0.35, 0.7] });
      }
    });
  }

  /** Hit sparks at a point. */
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
      e.update(Math.min(1, e.t / e.dur), dt);
      if (e.t >= e.dur) {
        e.item.obj.visible = false;
        this.pools[e.kind].push(e.item);
        this.effects[i] = this.effects[this.effects.length - 1];
        this.effects.pop();
      }
    }
    this.sparks.update(dt);
    this.dust.update(dt);
  }
}
