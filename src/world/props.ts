import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../engine/util';

/**
 * Procedural low-poly environment kit: temple architecture, foliage, rocks
 * and breakable props. Static props are merged into single geometries with
 * vertex colours so they can be instanced cheaply.
 */

const rng = seeded(7);

export const vcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const vcMaterialDouble = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

/** Gives a geometry a flat vertex colour (with slight per-vertex jitter). */
export function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0.06) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rng() - 0.5) * jitter * 2;
    for (let k = 0; k < 3 && i + k < n; k++) {
      arr[(i + k) * 3] = c.r * j;
      arr[(i + k) * 3 + 1] = c.g * j;
      arr[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

// ---------------------------------------------------------------------------
// Foliage & rocks (instanced)
// ---------------------------------------------------------------------------

export function pineGeometry() {
  const parts = [colored(T(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5), 0, 0.8, 0), 0x2b1f17)];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const r = 1.9 - i * 0.38;
    const g = new THREE.ConeGeometry(r, 1.9, 7);
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      if (y < 0) {
        pos.setX(v, pos.getX(v) * (0.85 + rng() * 0.3));
        pos.setZ(v, pos.getZ(v) * (0.85 + rng() * 0.3));
        pos.setY(v, y - rng() * 0.25);
      }
    }
    parts.push(colored(T(g, 0, 1.9 + i * 1.05, 0), i % 2 ? 0x1c3324 : 0x16291d, 0.12));
  }
  return merge(parts);
}

export function bambooGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const h = 4 + rng() * 3;
    const x = (rng() - 0.5) * 1.2, z = (rng() - 0.5) * 1.2;
    const stalk = new THREE.CylinderGeometry(0.05, 0.06, h, 5);
    stalk.rotateZ((rng() - 0.5) * 0.15);
    parts.push(colored(T(stalk, x, h / 2, z), 0x4f6a35));
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.ConeGeometry(0.35, 1.0, 3);
      leaf.rotateZ(Math.PI / 2 + (rng() - 0.5));
      leaf.rotateY(rng() * Math.PI * 2);
      parts.push(colored(T(leaf, x, h * (0.6 + k * 0.15), z), 0x3d6a2e, 0.15));
    }
  }
  return merge(parts);
}

export function fernGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng() * 0.4;
    const len = 0.8 + rng() * 0.5;
    const g = new THREE.BufferGeometry();
    // A bent leaf: two triangles forming an arching blade.
    const verts = new Float32Array([
      0, 0, 0, 0.12, 0.35, len * 0.45, -0.12, 0.35, len * 0.45,
      0.12, 0.35, len * 0.45, 0, 0.15, len, -0.12, 0.35, len * 0.45,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.rotateY(a);
    parts.push(colored(g, rng() < 0.5 ? 0x2f5a2a : 0x3c6b30, 0.15));
  }
  return merge(parts);
}

export function grassGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.ConeGeometry(0.04, 0.5 + rng() * 0.3, 3);
    g.rotateX((rng() - 0.5) * 0.6);
    g.rotateZ((rng() - 0.5) * 0.6);
    parts.push(colored(T(g, (rng() - 0.5) * 0.4, 0.25, (rng() - 0.5) * 0.4), 0x3f6a2c, 0.2));
  }
  return merge(parts);
}

export function rockGeometry(seed: number, color = 0x5e5b55) {
  const r = seeded(seed);
  const g = new THREE.DodecahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  for (let v = 0; v < pos.count; v++) {
    const k = 0.75 + r() * 0.45;
    pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.7, pos.getZ(v) * k);
  }
  return merge([colored(T(g, 0, 0.3, 0), color, 0.1)]);
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

let roofTexture: THREE.CanvasTexture | null = null;
function getRoofTexture() {
  if (roofTexture) return roofTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3b4246';
  ctx.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) {
    ctx.fillStyle = '#2a3034';
    ctx.fillRect(x, 0, 3, 64);
    ctx.fillStyle = '#4b5458';
    ctx.fillRect(x + 4, 0, 2, 64);
  }
  roofTexture = new THREE.CanvasTexture(c);
  roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping;
  roofTexture.colorSpace = THREE.SRGBColorSpace;
  return roofTexture;
}

/** Concave hip roof with upturned corners, as a height field. */
export function roofGeometry(w: number, d: number, h: number, lift: number) {
  const seg = 10;
  const g = new THREE.PlaneGeometry(2, 2, seg, seg).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getZ(i);
    const t = Math.max(Math.abs(u), Math.abs(v));
    const y = h * Math.pow(1 - t, 1.7) + lift * Math.pow(Math.abs(u * v), 3) + 0.05;
    pos.setXYZ(i, (u * w) / 2, y, (v * d) / 2);
    uv.setXY(i, (u * w) / 2, (v * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}

const mats = {
  pillar: new THREE.MeshLambertMaterial({ color: 0x6e2219, flatShading: true }),
  stone: new THREE.MeshLambertMaterial({ color: 0x6b6760, flatShading: true }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x4a4743, flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ color: 0x4a3122, flatShading: true }),
  ridge: new THREE.MeshLambertMaterial({ color: 0x2c3236, flatShading: true }),
  lantern: new THREE.MeshLambertMaterial({ color: 0xffd27a, emissive: 0xffa040, emissiveIntensity: 1.4 }),
};
let roofMat: THREE.MeshLambertMaterial | null = null;
function getRoofMat() {
  if (!roofMat) {
    const tex = getRoofTexture();
    tex.repeat.set(0.5, 0.5);
    roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex, side: THREE.DoubleSide, flatShading: true });
  }
  return roofMat;
}

export interface PropResult {
  group: THREE.Group;
  colliders: { x: number; z: number; r: number }[];
  lights: { x: number; z: number; y: number; r: number }[];
}

/** Open temple pavilion: stone base, red pillars, one or two roof tiers. */
export function pavilion(w: number, d: number, tiers = 1, pillarH = 3.2): PropResult {
  const group = new THREE.Group();
  const colliders: PropResult['colliders'] = [];
  const lights: PropResult['lights'] = [];
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.4, d + 1), mats.stone);
  base.position.y = 0.2;
  group.add(base);
  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.25, pillarH, 8);
  const nx = Math.max(2, Math.round(w / 3.5) + 1), nz = Math.max(2, Math.round(d / 3.5) + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
      const x = -w / 2 + (w * i) / (nx - 1);
      const z = -d / 2 + (d * j) / (nz - 1);
      const p = new THREE.Mesh(pillarGeo, mats.pillar);
      p.position.set(x, 0.4 + pillarH / 2, z);
      group.add(p);
      colliders.push({ x, z, r: 0.45 });
    }
  }
  // Beams
  const beamY = 0.4 + pillarH;
  for (const z of [-d / 2, d / 2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, 0.3), mats.pillar);
    b.position.set(0, beamY - 0.1, z);
    group.add(b);
  }
  for (const x of [-w / 2, w / 2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, d + 0.4), mats.pillar);
    b.position.set(x, beamY - 0.1, 0);
    group.add(b);
  }
  let y = beamY;
  for (let t = 0; t < tiers; t++) {
    const s = 1 - t * 0.38;
    const rw = (w + 3.2) * s, rd = (d + 3.2) * s;
    const roof = new THREE.Mesh(roofGeometry(rw, rd, 2.2 * s, 1.4 * s), getRoofMat());
    roof.position.y = y;
    group.add(roof);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(rw * 0.25, 0.3, 0.3), mats.ridge);
    ridge.position.y = y + 2.2 * s + 0.1;
    group.add(ridge);
    if (t < tiers - 1) {
      const drum = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 1.3, d * 0.55), mats.pillar);
      drum.position.y = y + 1.6 * s;
      group.add(drum);
      y += 1.8 * s;
    }
  }
  // Hanging lanterns at the front corners
  const lanternGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8);
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    const l = new THREE.Mesh(lanternGeo, mats.lantern);
    l.position.set(x, beamY - 0.8, d / 2 + 0.25);
    group.add(l);
    lights.push({ x, z: d / 2 + 0.8, y: beamY - 0.8, r: 4.5 });
  }
  return { group, colliders, lights };
}

export function guardianStatue(): PropResult {
  const parts = [
    colored(T(new THREE.BoxGeometry(1.4, 0.8, 1.4), 0, 0.4, 0), 0x5d5a55),
    colored(T(new THREE.BoxGeometry(0.9, 1.0, 1.1), 0, 1.3, -0.1), 0x77746c),
    colored(T(new THREE.SphereGeometry(0.55, 7, 5), 0, 2.1, 0.2), 0x7d7a72),
    colored(T(new THREE.SphereGeometry(0.3, 6, 4), 0, 1.95, 0.6), 0x86837a),
    colored(T(new THREE.SphereGeometry(0.22, 5, 4), -0.35, 2.5, 0.1), 0x6f6c65),
    colored(T(new THREE.SphereGeometry(0.22, 5, 4), 0.35, 2.5, 0.1), 0x6f6c65),
    colored(T(new THREE.BoxGeometry(0.25, 0.7, 0.3), -0.3, 1.0, 0.45), 0x6f6c65),
    colored(T(new THREE.BoxGeometry(0.25, 0.7, 0.3), 0.3, 1.0, 0.45), 0x6f6c65),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 0.9 }], lights: [] };
}

export function stoneLantern(): PropResult {
  const parts = [
    colored(T(new THREE.BoxGeometry(0.9, 0.3, 0.9), 0, 0.15, 0), 0x5d5a55),
    colored(T(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 6), 0, 0.85, 0), 0x6b6760),
    colored(T(new THREE.BoxGeometry(0.75, 0.15, 0.75), 0, 1.45, 0), 0x5d5a55),
    colored(T(new THREE.ConeGeometry(0.7, 0.5, 4).rotateY(Math.PI / 4), 0, 2.2, 0), 0x55524d),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), mats.lantern);
  glow.position.y = 1.75;
  group.add(glow);
  return { group, colliders: [{ x: 0, z: 0, r: 0.55 }], lights: [{ x: 0, z: 0, y: 1.75, r: 5 }] };
}

export function brokenPillar(h: number): PropResult {
  const g = new THREE.CylinderGeometry(0.4, 0.45, h, 8);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + (rng() - 0.5) * 0.5);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge([colored(T(g, 0, h / 2, 0), 0x6e2219), colored(T(new THREE.BoxGeometry(1.1, 0.3, 1.1), 0, 0.15, 0), 0x5d5a55)]), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 0.6 }], lights: [] };
}

export function balustrade(len: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [colored(T(new THREE.BoxGeometry(0.3, 0.15, len), 0, 0.95, 0), 0x6b6760)];
  const n = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) parts.push(colored(T(new THREE.BoxGeometry(0.3, 1.0, 0.3), 0, 0.5, -len / 2 + (len * i) / n), 0x5d5a55));
  parts.push(colored(T(new THREE.BoxGeometry(0.15, 0.6, len), 0, 0.5, 0), 0x55524d));
  return new THREE.Mesh(merge(parts), vcMaterial);
}

export function templeHall(): PropResult {
  const p = pavilion(16, 8, 2, 4.2);
  // Walls between back pillars
  const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.2, 0.3), mats.wood);
  wall.position.set(0, 2.5, -3.6);
  p.group.add(wall);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.35), new THREE.MeshLambertMaterial({ color: 0x1a0d08, emissive: 0x401808, emissiveIntensity: 0.6 }));
  door.position.set(0, 1.9, -3.5);
  p.group.add(door);
  return p;
}

// ---------------------------------------------------------------------------
// Breakables
// ---------------------------------------------------------------------------

export type BreakableKind = 'barrel' | 'urn' | 'bell' | 'crate' | 'rock';

export interface BreakableDef {
  mesh: THREE.Object3D;
  radius: number;
  hp: number;
  color: number;
  chunks: number;
  chunkSize: number;
}

export function breakable(kind: BreakableKind): BreakableDef {
  const group = new THREE.Group();
  switch (kind) {
    case 'barrel': {
      const parts = [colored(T(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 9), 0, 0.5, 0), 0x6a4a2e)];
      for (const y of [0.2, 0.8]) parts.push(colored(T(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 9), 0, y, 0), 0x2b2620));
      group.add(new THREE.Mesh(merge(parts), vcMaterial));
      return { mesh: group, radius: 0.5, hp: 1, color: 0x6a4a2e, chunks: 8, chunkSize: 0.22 };
    }
    case 'crate': {
      group.add(new THREE.Mesh(merge([colored(T(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0, 0.45, 0), 0x5a4128)]), vcMaterial));
      return { mesh: group, radius: 0.6, hp: 1, color: 0x5a4128, chunks: 8, chunkSize: 0.25 };
    }
    case 'urn': {
      const pts = [0, 0.3, 0.42, 0.38, 0.22, 0.26].map((r, i) => new THREE.Vector2(r || 0.01, i * 0.18));
      group.add(new THREE.Mesh(merge([colored(new THREE.LatheGeometry(pts, 8), 0x3b4a44)]), vcMaterial));
      return { mesh: group, radius: 0.45, hp: 1, color: 0x3b4a44, chunks: 7, chunkSize: 0.2 };
    }
    case 'bell': {
      const pts = [0.01, 0.95, 0.9, 0.82, 0.7, 0.55, 0.2, 0.15].map((r, i) => new THREE.Vector2(r, Math.max(0, i - 1) * 0.28));
      const g = new THREE.LatheGeometry(pts, 10);
      group.add(new THREE.Mesh(merge([colored(g, 0x4c5a4a), colored(T(new THREE.TorusGeometry(0.92, 0.06, 4, 12).rotateX(Math.PI / 2), 0, 0.3, 0), 0x6d6a40)]), vcMaterial));
      group.rotation.z = 0.25;
      return { mesh: group, radius: 1.0, hp: 3, color: 0x4c5a4a, chunks: 14, chunkSize: 0.35 };
    }
    case 'rock': {
      group.add(new THREE.Mesh(rockGeometry(Math.floor(rng() * 1000), 0x67635c), vcMaterial));
      group.scale.setScalar(0.7);
      return { mesh: group, radius: 0.7, hp: 2, color: 0x67635c, chunks: 9, chunkSize: 0.3 };
    }
  }
}

/** Glowing red talisman seal that blocks a passage until an area is cleared. */
export function sealBarrier(width: number) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uAlpha; varying vec2 vUv;
      void main(){
        float glyph = step(0.5, fract(sin(floor(vUv.x * 40.0) * 12.9898 + floor(vUv.y * 8.0 - uTime) * 78.233) * 43758.5));
        float stripes = smoothstep(0.4, 0.5, fract(vUv.x * 40.0)) * (1.0 - smoothstep(0.5, 0.6, fract(vUv.x * 40.0)));
        float fade = (1.0 - vUv.y) * (0.6 + 0.4 * sin(uTime * 3.0 + vUv.x * 20.0));
        float a = (0.25 + stripes * glyph * 0.8) * fade * uAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.2, 0.1) * 1.5, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.5).translate(0, 1.75, 0), mat);
  m.renderOrder = 3;
  return { mesh: m, mat };
}
