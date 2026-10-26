import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloneCharacter } from './assets';

/**
 * Dressing for the motion-captured mannequin.
 *
 * The body is painted with vertex colours chosen per bone and height (fur, wraps, robes...), so that layer
 * bends with the skin. Armour, heads, kilts and robes are modelled in the mannequin's rest pose (T-pose,
 * facing +Z, metres) and baked into skinned meshes, rigidly weighted to the bone each piece rides on. A
 * character therefore costs one draw call per finish (matte, cloth, metal, glow) however detailed it is,
 * and every copy of a design shares the same geometry.
 */

export type BodyPainter = (bone: string, p: THREE.Vector3, out: THREE.Color) => void;
export type Finish = 'matte' | 'cloth' | 'metal' | 'glow';
const FINISHES: Finish[] = ['matte', 'cloth', 'metal', 'glow'];

/** Rest-pose measurements shared by every copy of the mannequin. */
export interface Rest {
  /** Box of the vertices each bone dominates. */
  boxes: Map<string, THREE.Box3>;
  boneIndex: Map<string, number>;
  /** Rest-pose world position of a bone (a fresh vector). */
  pos(bone: string): THREE.Vector3;
  /** Bind matrix for geometry authored in rest-pose world space. */
  bindFix: THREE.Matrix4;
  vertices: { pts: THREE.Vector3[]; bones: string[] }[];
}

let rest: Rest | null = null;

export function getRest(): Rest {
  if (rest) return rest;
  const { root, bones, skinned } = cloneCharacter();
  root.updateMatrixWorld(true);
  const vertices = skinned.map((m) => {
    m.skeleton.update();
    const pos = m.geometry.getAttribute('position');
    const si = m.geometry.getAttribute('skinIndex');
    const sw = m.geometry.getAttribute('skinWeight');
    const pts: THREE.Vector3[] = [];
    const names: string[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      m.applyBoneTransform(i, v);
      pts.push(v.applyMatrix4(m.matrixWorld));
      let best = 0;
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      names.push(m.skeleton.bones[si.getComponent(i, best)].name);
    }
    return { pts, bones: names };
  });
  const boxes = new Map<string, THREE.Box3>();
  for (const { pts, bones: names } of vertices) {
    pts.forEach((p, i) => {
      let b = boxes.get(names[i]);
      if (!b) boxes.set(names[i], (b = new THREE.Box3()));
      b.expandByPoint(p);
    });
  }
  const skeleton = skinned[0].skeleton;
  const boneIndex = new Map(skeleton.bones.map((b, i) => [b.name, i]));
  // Skinning maps bind space through boneWorld * boneInverse; at rest that product is the same matrix for
  // every bone (bind space -> world). Its inverse lets world-space geometry use the same skeleton.
  const pelvis = boneIndex.get('pelvis')!;
  const bindFix = skeleton.bones[pelvis].matrixWorld.clone().multiply(skeleton.boneInverses[pelvis]).invert();
  rest = {
    boxes, boneIndex, bindFix, vertices,
    pos: (b) => bones.get(b)!.getWorldPosition(new THREE.Vector3()),
  };
  return rest;
}

interface Piece { bone: string; geo: THREE.BufferGeometry; finish: Finish; color: number | null; matrix: THREE.Matrix4 }

/** Collects costume pieces for a design. */
export class Outfit {
  readonly pieces: Piece[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  /**
   * Adds geometry riding on `bone`, placed at (x, y, z) with Euler rotation (rx, ry, rz) in rest-pose world
   * space. `color` null keeps the geometry's own vertex colours.
   */
  put(bone: string, geo: THREE.BufferGeometry, finish: Finish, color: number | null, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
    this.pieces.push({ bone, geo, finish, color, matrix: this.m.clone() });
  }

  /** Same as put() but takes the transform from an Object3D (for lookAt-style placement). */
  putObject(bone: string, o: THREE.Mesh, finish: Finish, color: number | null) {
    o.updateMatrix();
    this.pieces.push({ bone, geo: o.geometry, finish, color, matrix: o.matrix.clone() });
  }
}

interface Baked { body: THREE.BufferGeometry; parts: Map<Finish, THREE.BufferGeometry> }
const baked = new Map<string, Baked>();

function paintedBody(painter: BodyPainter, skinned: THREE.SkinnedMesh[]) {
  const r = getRest();
  const c = new THREE.Color();
  const geos = skinned.map((m, mi) => {
    const src = m.geometry;
    const n = src.getAttribute('position').count;
    const g = new THREE.BufferGeometry();
    const copy = (name: string, size: number) => {
      const a = src.getAttribute(name);
      const out = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(out, size));
    };
    copy('position', 3);
    copy('normal', 3);
    copy('skinIndex', 4);
    copy('skinWeight', 4);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      painter(r.vertices[mi].bones[i], r.vertices[mi].pts[i], c);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(src.index!.clone());
    return g;
  });
  return mergeGeometries(geos)!;
}

function bake(o: Outfit) {
  const r = getRest();
  const groups = new Map<Finish, THREE.BufferGeometry[]>();
  const c = new THREE.Color();
  for (const p of o.pieces) {
    const g = p.geo.clone().applyMatrix4(p.matrix);
    const n = g.getAttribute('position').count;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    let col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!col || p.color !== null) {
      c.setHex(p.color ?? 0xffffff);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      col = new THREE.BufferAttribute(arr, 3);
    }
    out.setAttribute('color', col);
    const idx = r.boneIndex.get(p.bone);
    if (idx === undefined) throw new Error(`No bone ${p.bone}`);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = idx; sw[i * 4] = 1; }
    out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (g.index) out.setIndex(g.index);
    else out.setIndex([...Array(n).keys()]);
    if (!groups.has(p.finish)) groups.set(p.finish, []);
    groups.get(p.finish)!.push(out);
  }
  const parts = new Map<Finish, THREE.BufferGeometry>();
  for (const [f, list] of groups) parts.set(f, mergeGeometries(list)!);
  return parts;
}

export interface CharacterMats {
  matte: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
}

export function makeMats(): CharacterMats {
  return {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}

export interface Character {
  /** The mannequin's scene root; the skeleton animates inside it. */
  model: THREE.Group;
  bones: Map<string, THREE.Bone>;
  meshes: THREE.SkinnedMesh[];
  mats: CharacterMats;
  rest: Rest;
  /** Parents an object modelled in rest-pose world space to a bone (for pieces animated in code). */
  attach(bone: string, o: THREE.Object3D): THREE.Object3D;
}

/** A dressed, animatable copy of the mannequin. `design` runs once per key; later copies reuse the bake. */
export function buildCharacter(key: string, painter: BodyPainter, design: (o: Outfit, r: Rest) => void, mats = makeMats()): Character {
  const r = getRest();
  const { root, bones, skinned } = cloneCharacter();
  let b = baked.get(key);
  if (!b) {
    const o = new Outfit();
    design(o, r);
    b = { body: paintedBody(painter, skinned), parts: bake(o) };
    baked.set(key, b);
  }
  const skeleton = skinned[0].skeleton;
  const parent = skinned[0].parent!;
  const body = new THREE.SkinnedMesh(b.body, mats.matte);
  body.position.copy(skinned[0].position);
  body.quaternion.copy(skinned[0].quaternion);
  body.scale.copy(skinned[0].scale);
  parent.add(body);
  body.bind(skeleton, skinned[0].bindMatrix);
  for (const m of skinned) m.removeFromParent();
  const meshes: THREE.SkinnedMesh[] = [body];
  for (const f of FINISHES) {
    const g = b.parts.get(f);
    if (!g) continue;
    const m = new THREE.SkinnedMesh(g, mats[f]);
    parent.add(m);
    m.bind(skeleton, r.bindFix);
    meshes.push(m);
  }
  for (const m of meshes) {
    m.castShadow = true;
    // Animated bounds move away from the bind-pose sphere; a handful of characters is cheap to draw.
    m.frustumCulled = false;
  }
  root.updateMatrixWorld(true);
  return {
    model: root, bones, meshes, mats, rest: r,
    attach: (bone, o) => {
      bones.get(bone)!.attach(o);
      return o;
    },
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Cheap deterministic per-position noise in [-1, 1] for colour and fur variation. */
export function hashNoise(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Tube along a curve whose radius tapers from r0 to r1. */
export function taperedTube(points: THREE.Vector3[], r0: number, r1: number, segments = 16, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const pos = g.getAttribute('position');
  const p = new THREE.Vector3();
  for (let s = 0; s <= segments; s++) {
    const r = r0 + (r1 - r0) * (s / segments);
    const c = curve.getPointAt(s / segments);
    for (let k = 0; k <= radial; k++) {
      const i = s * (radial + 1) + k;
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Pushes vertices in and out along their normals for a shaggy, hand-sculpted look. */
export function roughen(g: THREE.BufferGeometry, amount: number, freq = 40) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = (hashNoise(Math.round(x * freq), Math.round(y * freq), Math.round(z * freq)) * 0.6 + Math.sin(y * freq * 0.7 + x * 9) * 0.4) * amount;
    pos.setXYZ(i, x + nor.getX(i) * n, y + nor.getY(i) * n, z + nor.getZ(i) * n);
  }
  g.computeVertexNormals();
  return g;
}

/** Bakes per-vertex colours from a function of position. */
export function tint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, out: THREE.Color) => void) {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(p.fromBufferAttribute(pos, i), c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Colour function: `base` mottled towards `dark` (fur, feathers, grime). */
export const mottle = (base: number, dark: number, amount = 0.25, freq = 60) => {
  const d = new THREE.Color(dark);
  return (p: THREE.Vector3, c: THREE.Color) => {
    c.setHex(base).lerp(d, amount + amount * hashNoise(p.x * freq, p.y * freq, p.z * freq));
  };
};

/**
 * Skirt of panels hanging from the hips; each panel rides the nearer thigh so it swings with the leg.
 * Positions are absolute rest-pose world coordinates.
 */
export function kilt(o: Outfit, opts: { top: number; hem: number; radius: number; flare: number; z: number; panels: number; color: (p: THREE.Vector3, c: THREE.Color) => void; ragged?: number }) {
  const { top, hem, radius, flare, z, panels } = opts;
  for (let i = 0; i < panels; i++) {
    const a = ((i + 0.5) / panels) * Math.PI * 2;
    const span = ((Math.PI * 2) / panels) * 1.25;
    const g = new THREE.PlaneGeometry(1, top - hem, 6, Math.round((top - hem) * 60));
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const u = pos.getX(k);
      const v = (pos.getY(k) + (top - hem) / 2) / (top - hem); // 0 hem .. 1 top
      const r = radius + (1 - v) * flare;
      const aa = a + u * span;
      const rag = v < 0.1 && opts.ragged ? Math.abs(Math.sin(u * 40 + i * 3)) * opts.ragged : 0;
      pos.setXYZ(k, Math.sin(aa) * r, hem + rag + v * (top - hem), Math.cos(aa) * r * 0.95 + z);
    }
    g.computeVertexNormals();
    tint(g, opts.color);
    o.put(Math.sin(a) > 0 ? 'thigh_l' : 'thigh_r', g, 'cloth', null);
  }
}
