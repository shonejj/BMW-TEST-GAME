import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../engine/util';
import { archMaterials, colored, dissolveBlockers, roofGeometry, vcMaterial, vcMaterialDouble, type PropResult } from './props';

/**
 * Chapter set dressing built in code: wind-carved rock arches and hoodoos (Yellow Wind Ridge), rib arches,
 * skulls and bone piles (Bone Sanctum), ice spires, banners, steles, tents, cave overhangs and a paifang gate.
 * Everything is vertex-coloured, flat-shaded and merged, so the level bakes it into a few draw calls.
 */

const rng = seeded(11);

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Craggy boulder: a noise-displaced icosahedron, optionally banded like layered sandstone. */
export function boulderGeometry(seed: number, color: number, band = 0, squash = 0.75) {
  const r = seeded(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const o = [r() * 10, r() * 10, r() * 10];
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const k = 0.82 + 0.3 * Math.sin(x * 2.1 + o[0]) * Math.sin(z * 1.7 + o[1]) + 0.12 * Math.sin(y * 3 + o[2]);
    pos.setXYZ(v, x * k, y * k * squash, z * k);
  }
  const geo = colored(g, color, 0.12);
  if (band) {
    const p = geo.getAttribute('position'), c = geo.getAttribute('color');
    for (let i = 0; i < p.count; i += 3) {
      const f = Math.sin((p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) * band) > 0 ? 1 : 0.82;
      for (let k = 0; k < 3; k++) c.setXYZ(i + k, c.getX(i + k) * f, c.getY(i + k) * f, c.getZ(i + k) * f);
    }
  }
  return geo;
}

/** Natural arch spanning `span` metres (its feet are colliders, the path runs under it). */
export function rockArch(span: number, color = 0xb07a48, seed = 3): PropResult {
  const parts: THREE.BufferGeometry[] = [];
  const h = span * 0.8;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    const foot = i === 0 || i === n;
    const thick = 1.4 + 1.0 * Math.abs(Math.cos(a)) + (foot ? 0.7 : 0);
    parts.push(T(boulderGeometry(seed * 31 + i, color, 2).scale(thick, thick * 0.85, thick * 0.8), -Math.cos(a) * span / 2, Math.sin(a) * h + (foot ? 0.6 : 0), 0));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: -span / 2, z: 0, r: 2.1 }, { x: span / 2, z: 0, r: 2.1 }], lights: [] };
}

/** Eroded sandstone pillar: stacked, narrowing boulders under a wider cap rock. */
export function hoodoo(height: number, color = 0xb88452, seed = 5): PropResult {
  const parts: THREE.BufferGeometry[] = [];
  const steps = Math.max(3, Math.round(height / 1.5));
  for (let i = 0; i < steps; i++) {
    const w = 1.6 - (i / steps) * 0.75 + Math.sin(i * 1.9 + seed) * 0.15;
    parts.push(T(boulderGeometry(seed * 17 + i, color, 2, 0.6).scale(w, 1.25, w), Math.sin(i + seed) * 0.15, 0.6 + i * (height / steps), Math.cos(i) * 0.15));
  }
  parts.push(T(boulderGeometry(seed + 99, 0x8a5a38, 0, 0.45).scale(1.9, 1, 1.9), 0, height + 0.5, 0));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 1.5 }], lights: [] };
}

/** Big standalone boulder. */
export function boulder(size: number, color: number, seed = 1, band = 1.5): PropResult {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge([T(boulderGeometry(seed, color, band).scale(size, size, size), 0, size * 0.45, 0)]), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: size * 0.85 }], lights: [] };
}

const BONE = 0xd8cfb8;
const BONE_DARK = 0xa89c82;

/** A pair of giant ribs curving up to meet overhead. */
export function ribArch(span: number): PropResult {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const n = 9;
    const pt = (t: number) => new THREE.Vector3(side * (span / 2) * Math.cos(t * Math.PI * 0.42), Math.sin(t * Math.PI * 0.5) * span * 0.8, 0);
    for (let i = 0; i < n; i++) {
      const p0 = pt(i / n), p1 = pt((i + 1) / n);
      const r = 0.34 - (i / n) * 0.2;
      const q = new THREE.Quaternion().setFromUnitVectors(up, p1.clone().sub(p0).normalize());
      const m = new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      parts.push(colored(new THREE.CylinderGeometry(r * 0.85, r, p0.distanceTo(p1) + 0.12, 6).applyMatrix4(m), i % 3 ? BONE : BONE_DARK, 0.08));
    }
    parts.push(colored(T(new THREE.SphereGeometry(0.55, 6, 4), side * span / 2, 0.2, 0), BONE_DARK));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: -span / 2, z: 0, r: 0.7 }, { x: span / 2, z: 0, r: 0.7 }], lights: [] };
}

/** Huge horned skull. */
export function bigSkull(size: number): PropResult {
  const parts: THREE.BufferGeometry[] = [
    colored(new THREE.SphereGeometry(1, 10, 8).scale(1.1, 0.9, 1.25).translate(0, 1.2, 0), BONE),
    colored(new THREE.BoxGeometry(1.4, 0.7, 1.2).translate(0, 0.45, 0.8), BONE_DARK),
  ];
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.SphereGeometry(0.3, 6, 5).translate(s * 0.45, 1.25, 1.05), 0x1a1612, 0));
    parts.push(colored(new THREE.ConeGeometry(0.28, 2.2, 6).rotateZ(-s * 1.0).translate(s * 1.5, 2.2, -0.1), BONE_DARK));
  }
  for (let i = 0; i < 6; i++) parts.push(colored(new THREE.ConeGeometry(0.09, 0.35, 4).rotateX(Math.PI).translate(-0.5 + i * 0.2, 0.2, 1.38), BONE));
  const g = merge(parts);
  g.scale(size, size, size);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 1.3 * size }], lights: [] };
}

/** A heap of bones and skulls. */
export function bonePile(seed = 1): PropResult {
  const r = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.9;
    const bone = new THREE.CylinderGeometry(0.05, 0.06, 0.7 + r() * 0.4, 5).rotateZ(Math.PI / 2 + (r() - 0.5) * 0.6).rotateY(r() * 3);
    parts.push(colored(bone.translate(Math.sin(a) * d, 0.08 + r() * 0.3, Math.cos(a) * d), i % 2 ? BONE : BONE_DARK));
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    parts.push(colored(new THREE.SphereGeometry(0.17, 6, 5).scale(1, 0.9, 1.2).translate(Math.sin(a) * 0.5, 0.25 + i * 0.1, Math.cos(a) * 0.5), BONE));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 0.7 }], lights: [] };
}

const iceMat = dissolveBlockers(new THREE.MeshLambertMaterial({ color: 0xb8e4ff, emissive: 0x3a7ab0, emissiveIntensity: 0.55, flatShading: true }));

/** A cluster of faintly glowing ice crystals. */
export function iceSpire(height: number, seed = 2): PropResult {
  const r = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const h = height * (i ? 0.35 + r() * 0.4 : 1);
    const c = new THREE.CylinderGeometry(0, 0.25 + h * 0.09, h, 5).translate(0, h / 2, 0);
    c.rotateZ((r() - 0.5) * (i ? 0.9 : 0.15));
    c.rotateY(r() * 6);
    parts.push(c.translate(i ? (r() - 0.5) * 1.2 : 0, 0, i ? (r() - 0.5) * 1.2 : 0));
  }
  const g = merge(parts);
  g.deleteAttribute('uv');
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, iceMat));
  return { group, colliders: [{ x: 0, z: 0, r: 0.6 + height * 0.06 }], lights: [] };
}

/** A tattered war banner on a pole. */
export function banner(color = 0x8a2a1a): PropResult {
  const parts = [
    colored(T(new THREE.CylinderGeometry(0.07, 0.09, 5, 6), 0, 2.5, 0), 0x3a2618),
    colored(T(new THREE.BoxGeometry(1.2, 0.08, 0.08), 0.5, 4.8, 0), 0x3a2618),
  ];
  const cloth = new THREE.PlaneGeometry(1.1, 2.6, 1, 6);
  const pos = cloth.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, Math.sin(y * 2.5) * 0.12);
    if (y < -1.1) pos.setX(i, pos.getX(i) * (0.6 + rng() * 0.5));
  }
  parts.push(colored(T(cloth, 0.55, 3.45, 0), color, 0.1));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterialDouble));
  return { group, colliders: [{ x: 0, z: 0, r: 0.3 }], lights: [] };
}

/** A carved stone tablet on a plinth. */
export function stele(): PropResult {
  const parts = [
    colored(T(new THREE.BoxGeometry(1.5, 0.5, 2.0), 0, 0.25, 0), 0x55524c),
    colored(T(new THREE.BoxGeometry(1.1, 2.4, 0.35), 0, 1.7, 0), 0x6a665e),
    colored(T(new THREE.BoxGeometry(1.3, 0.3, 0.45), 0, 3.0, 0), 0x5d5a55),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 0.9 }], lights: [] };
}

/** A bandit camp tent. */
export function tent(color = 0x7a5a3a): PropResult {
  const parts = [
    colored(new THREE.ConeGeometry(2.2, 2.6, 6).translate(0, 1.3, 0), color, 0.12),
    colored(T(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 4), 0, 1.6, 0), 0x3a2618),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [{ x: 0, z: 0, r: 2 }], lights: [] };
}

/** Rock overhang (a cave roof) across the back of a pocket; the camera side stays open. */
export function overhang(w: number, d: number, color: number): PropResult {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(w / 2.2));
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + (w * i) / n;
    parts.push(T(boulderGeometry(400 + i, color, 1.2, 0.55).scale(2.6, 2.0, d * 0.5), x, 5.4 + Math.sin(i * 1.7) * 0.4, -d * 0.3));
    parts.push(T(boulderGeometry(500 + i, color, 1.2).scale(2.2, 3.6, 2.4), x, 1.8, -d * 0.72));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  return { group, colliders: [], lights: [] };
}

/** Memorial archway (paifang) over a path. */
export function paifang(span: number): PropResult {
  const m = archMaterials();
  const group = new THREE.Group();
  const h = 4.6;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, h, 8), m.pillar);
    post.position.set((s * span) / 2, h / 2, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), m.stone);
    foot.position.set((s * span) / 2, 0.3, 0);
    group.add(post, foot);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.6, 0.4, 0.4), m.pillar);
  beam.position.y = h - 0.4;
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(span + 0.6, 0.3, 0.35), m.pillar);
  beam2.position.y = h - 1.3;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.1), m.lantern);
  plaque.position.set(0, h - 0.85, 0.22);
  const roof = new THREE.Mesh(roofGeometry(span + 3, 1.8, 0.9, 0.7), m.roof);
  roof.position.y = h - 0.2;
  group.add(beam, beam2, plaque, roof);
  return { group, colliders: [{ x: -span / 2, z: 0, r: 0.5 }, { x: span / 2, z: 0, r: 0.5 }], lights: [] };
}

/** Stand for a brazier (puzzle braziers are built by the explore layer; this is the unlit decor one). */
export function brazierStand(): PropResult {
  const parts = [
    colored(new THREE.CylinderGeometry(0.5, 0.65, 0.3, 8).translate(0, 0.15, 0), 0x4a4740),
    colored(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6).translate(0, 0.7, 0), 0x5a4628),
    colored(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 8).translate(0, 1.2, 0), 0x6a5030),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merge(parts), vcMaterial));
  const glow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6).translate(0, 1.7, 0), archMaterials().lantern);
  group.add(glow);
  return { group, colliders: [{ x: 0, z: 0, r: 0.6 }], lights: [{ x: 0, z: 0, y: 1.6, r: 4 }] };
}
