import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloneSkeleton, getAssets, type BodyAsset, type BodyKind } from './assets';

/**
 * Characters are real skinned models: a Quaternius Universal Base Character body (male or female) dressed in
 * pieces of the Modular Character Outfits, hair styles, or a retargeted KayKit skeleton, all bound to the
 * Universal Animation Library rig so every mocap clip drives every character.
 *
 * A design ("look") picks the pieces and colours them:
 * - `tint` multiplies a piece's texture (keeps its shading and pattern);
 * - `dye` recolours it: each vertex gets the colour that turns the texel under it into the dye colour, so the
 *   piece takes the new colour exactly while the texture still adds its folds, seams and wear; `only: 'green'`
 *   dyes just the cloth of the Ranger set and leaves its leather and buckles alone;
 * - the base body is dyed per vertex by a painter (fur, stripes, rot, bone-white), so the skin texture's
 *   muscles and face survive under any colour.
 * Body skin hidden under clothing is cut away (no poke-through). Bespoke accessories (crowns, muzzles, horns,
 * wings) are modelled in the rest pose and baked as rigid pieces riding on a bone. Every piece is merged into
 * one skinned mesh per material, so a character costs a handful of draw calls, and copies of a design share
 * their geometry.
 */

export type BodyPainter = (bone: string, p: THREE.Vector3, out: THREE.Color) => void;
export type Finish = 'matte' | 'cloth' | 'metal' | 'armor' | 'glow';
const FINISHES: Finish[] = ['matte', 'cloth', 'metal', 'armor', 'glow'];

/** One modular piece of a look (an outfit piece, a hair style or a skeleton part), by its node name. */
export interface PartSpec {
  name: string;
  /** Multiplies the texture (or the flat colour of untextured pieces such as hair). */
  tint?: number;
  /** Recolours the piece (see the file comment). */
  dye?: number;
  /** Which texels the dye applies to: everything, or only the green cloth of the Ranger set. */
  only?: 'all' | 'green';
}

export interface Look {
  body: BodyKind;
  /** Base body: false hides it entirely (skeletons); otherwise its skin is dyed by `painter` or tinted by `skin`. */
  showBody?: boolean;
  skin?: number;
  painter?: BodyPainter;
  /** Eyes (texture colour or a tint) and eyebrows of the base face. */
  eyes?: number | false;
  brows?: number | false;
  parts: PartSpec[];
}

/** Rest-pose measurements of one base body. */
export interface Rest {
  /** Box of the body vertices each bone dominates. */
  boxes: Map<string, THREE.Box3>;
  boneIndex: Map<string, number>;
  /** Rest-pose world position of a bone (a fresh vector). */
  pos(bone: string): THREE.Vector3;
  /** Rest-pose world space -> body mesh space (the space every baked piece lives in). */
  bindFix: THREE.Matrix4;
  vertices: { pts: THREE.Vector3[]; bones: string[] };
  body: BodyKind;
}

const rests = new Map<BodyKind, Rest>();

/** Dominant bone of every vertex of a skinned mesh. */
function dominantBones(m: THREE.SkinnedMesh) {
  const si = m.geometry.getAttribute('skinIndex');
  const sw = m.geometry.getAttribute('skinWeight');
  const names: string[] = [];
  for (let i = 0; i < si.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
    names.push(m.skeleton.bones[si.getComponent(i, best)].name);
  }
  return names;
}

/** Rest-pose world positions of a skinned mesh's vertices. */
function restPoints(m: THREE.SkinnedMesh) {
  const pos = m.geometry.getAttribute('position');
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    m.applyBoneTransform(i, v);
    pts.push(v.applyMatrix4(m.matrixWorld));
  }
  return pts;
}

export function getRest(kind: BodyKind = 'male'): Rest {
  let r = rests.get(kind);
  if (r) return r;
  const a = getAssets().bodies[kind];
  const body = a.body;
  const pts = restPoints(body);
  const names = dominantBones(body);
  const boxes = new Map<string, THREE.Box3>();
  pts.forEach((p, i) => {
    let b = boxes.get(names[i]);
    if (!b) boxes.set(names[i], (b = new THREE.Box3()));
    b.expandByPoint(p);
  });
  const boneIndex = new Map(body.skeleton.bones.map((b, i) => [b.name, i]));
  r = {
    boxes, boneIndex, body: kind,
    bindFix: new THREE.Matrix4(),
    vertices: { pts, bones: names },
    pos: (b) => body.skeleton.getBoneByName(b)!.getWorldPosition(new THREE.Vector3()),
  };
  rests.set(kind, r);
  return r;
}

interface Piece { bone: string; geo: THREE.BufferGeometry; finish: Finish; color: number | null; matrix: THREE.Matrix4 }

/** Collects bespoke accessory pieces for a design. */
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

// ---------------------------------------------------------------------------
// Texture sampling (for dyes)
// ---------------------------------------------------------------------------

const pixels = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number } | null>();

function pixelsOf(tex: THREE.Texture) {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img) return null;
  let p = pixels.get(img);
  if (p !== undefined) return p;
  try {
    const w = Math.min(256, img.width), h = Math.min(256, img.height);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, w, h);
    p = { data: g.getImageData(0, 0, w, h).data, w, h };
  } catch {
    p = null;
  }
  pixels.set(img, p);
  return p;
}

/** Linear colour of the texture around (u, v) (a 3x3 average), or white if it can't be read. */
function texel(tex: THREE.Texture | null, u: number, v: number, out: THREE.Color) {
  const p = tex ? pixelsOf(tex) : null;
  if (!p) return out.setRGB(1, 1, 1);
  const x0 = Math.floor((u - Math.floor(u)) * p.w), y0 = Math.floor((v - Math.floor(v)) * p.h);
  let r = 0, g = 0, b = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.min(p.w - 1, Math.max(0, x0 + dx)), y = Math.min(p.h - 1, Math.max(0, y0 + dy));
    const i = (y * p.w + x) * 4;
    r += p.data[i];
    g += p.data[i + 1];
    b += p.data[i + 2];
  }
  return out.setRGB(r / 2295, g / 2295, b / 2295, THREE.SRGBColorSpace);
}

const isGreen = (c: THREE.Color) => c.g > c.r * 1.15 && c.g > c.b * 1.1;

/** Vertex colour that turns `tex` into `target` under multiplication. */
function dyeColor(tex: THREE.Color, target: THREE.Color, out: THREE.Color) {
  return out.setRGB(
    Math.min(4, target.r / Math.max(0.02, tex.r)),
    Math.min(4, target.g / Math.max(0.02, tex.g)),
    Math.min(4, target.b / Math.max(0.02, tex.b)),
  );
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

/** Body bones each outfit piece covers: body skin dominated by these bones is cut away under it. */
const COVERS: Record<string, string[]> = {
  Body: ['spine_01', 'spine_02', 'spine_03'],
  Arms: ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'FINGERS'],
  Legs: ['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'],
  Feet: ['foot_l', 'foot_r', 'ball_l', 'ball_r'],
  Skel: ['ALL'],
};
const FINGER = /thumb|index|middle|ring|pinky/;

function coveredBones(parts: PartSpec[]) {
  const s = new Set<string>();
  for (const p of parts) {
    for (const [k, bones] of Object.entries(COVERS)) {
      if (k === 'Skel' ? p.name.startsWith('Skel') : p.name.endsWith('_' + k)) for (const b of bones) s.add(b);
    }
  }
  return s;
}

/** Baked geometry per material key: a texture uuid (textured pieces), 'flat' (hair), 'glow', or a finish. */
interface Baked { groups: Map<string, { geo: THREE.BufferGeometry; map: THREE.Texture | null; glow: boolean }> }
const baked = new Map<string, Baked>();

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color(), _t = new THREE.Color(), _d = new THREE.Color();
const _nm = new THREE.Matrix3();

/** Moves a source piece into body mesh space and colours it. Returns null if nothing of it is left. */
function bakePiece(a: BodyAsset, m: THREE.SkinnedMesh, colorAt: (i: number, tex: THREE.Color, out: THREE.Color) => void, keepTri?: (i0: number, i1: number, i2: number) => boolean) {
  const src = m.geometry;
  const n = src.getAttribute('position').count;
  const toBody = m.matrixWorld.clone();
  _nm.getNormalMatrix(toBody);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const uvAttr = src.getAttribute('uv');
  const uv = uvAttr ? new Float32Array(n * 2) : null;
  const P = src.getAttribute('position'), N = src.getAttribute('normal'), SI = src.getAttribute('skinIndex'), SW = src.getAttribute('skinWeight');
  const remap = m.skeleton.bones.map((b) => a.body.skeleton.bones.findIndex((x) => x.name === b.name));
  const material = m.material as THREE.MeshStandardMaterial;
  const map = material.map ?? null;
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(P, i);
    m.applyBoneTransform(i, _v);
    _v.applyMatrix4(toBody);
    pos.set([_v.x, _v.y, _v.z], i * 3);
    _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
    nor.set([_n.x, _n.y, _n.z], i * 3);
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = Math.max(0, remap[SI.getComponent(i, k)]);
      sw[i * 4 + k] = SW.getComponent(i, k);
    }
    if (uv && uvAttr) {
      uv[i * 2] = uvAttr.getX(i);
      uv[i * 2 + 1] = uvAttr.getY(i);
      texel(map, uv[i * 2], uv[i * 2 + 1], _t);
    } else _t.setRGB(1, 1, 1);
    colorAt(i, _t, _c);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  // Untextured pieces still get a uv so they merge with anything.
  g.setAttribute('uv', new THREE.BufferAttribute(uv ?? new Float32Array(n * 2), 2));
  const idx = src.index!;
  const out: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    if (!keepTri || keepTri(i0, i1, i2)) out.push(i0, i1, i2);
  }
  if (!out.length) return null;
  g.setIndex(out);
  return { geo: g, map, glow: /glow/i.test(material.name) };
}

function bakeAccessories(a: BodyAsset, r: Rest, o: Outfit) {
  const groups = new Map<Finish, THREE.BufferGeometry[]>();
  const c = new THREE.Color();
  const toBody = new THREE.Matrix4();
  for (const p of o.pieces) {
    const g = p.geo.clone().applyMatrix4(p.matrix).applyMatrix4(toBody);
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
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
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
  return groups;
}

function bake(look: Look, design?: (o: Outfit, r: Rest) => void): Baked {
  const a = getAssets().bodies[look.body];
  const r = getRest(look.body);
  const lists = new Map<string, { geos: THREE.BufferGeometry[]; map: THREE.Texture | null; glow: boolean }>();
  const add = (key: string, b: { geo: THREE.BufferGeometry; map: THREE.Texture | null; glow: boolean } | null) => {
    if (!b) return;
    const k = b.glow ? 'glow' : b.map ? b.map.uuid : 'flat';
    let l = lists.get(k);
    if (!l) lists.set(k, (l = { geos: [], map: b.map, glow: b.glow }));
    l.geos.push(b.geo);
    void key;
  };
  // Base body: skin under clothing is cut away; the rest is dyed by the painter or tinted.
  if (look.showBody !== false) {
    const covered = coveredBones(look.parts);
    const bones = r.vertices.bones;
    const hidden = (i: number) => {
      const b = bones[i];
      return covered.has('ALL') || covered.has(b) || (FINGER.test(b) && covered.has('FINGERS'));
    };
    const skin = new THREE.Color(look.skin ?? 0xffffff);
    add('Body', bakePiece(a, a.body, (i, tex, out) => {
      if (look.painter) {
        look.painter(bones[i], r.vertices.pts[i], _d);
        dyeColor(tex, _d, out);
      } else out.copy(skin);
    }, (i0, i1, i2) => !(hidden(i0) && hidden(i1) && hidden(i2))));
    if (look.eyes !== false) {
      const e = new THREE.Color(look.eyes ?? 0xffffff);
      for (const m of a.pieces.get('Eyes')!) add('Eyes', bakePiece(a, m, (_i, _tex, out) => out.copy(e)));
    }
    if (look.brows !== false) {
      const b = new THREE.Color(look.brows ?? 0xffffff);
      for (const m of a.pieces.get('Brows')!) add('Brows', bakePiece(a, m, (_i, _tex, out) => out.copy(b)));
    }
  }
  for (const p of look.parts) {
    const list = a.pieces.get(p.name);
    if (!list) throw new Error(`No piece ${p.name} on the ${look.body} body`);
    const tint = new THREE.Color(p.tint ?? 0xffffff);
    const dye = p.dye !== undefined ? new THREE.Color(p.dye) : null;
    for (const m of list) {
      // Bare skin inside a sleeve piece keeps the body's look (the painter, or the skin tint).
      const skinPart = /Regular_/.test((m.material as THREE.Material).name);
      add(p.name, bakePiece(a, m, (i, tex, out) => {
        if (skinPart) {
          if (look.painter) { look.painter('lowerarm_l', _v.set(0, 1.4, 0), _d); dyeColor(tex, _d, out); } else out.set(look.skin ?? 0xffffff);
        } else if (dye && (p.only !== 'green' || isGreen(tex))) dyeColor(tex, dye, out).multiply(tint);
        else out.copy(tint);
        void i;
      }));
    }
  }
  const groups: Baked['groups'] = new Map();
  for (const [k, l] of lists) groups.set(k, { geo: mergeGeometries(l.geos)!, map: l.map, glow: l.glow });
  if (design) {
    const o = new Outfit();
    design(o, r);
    for (const [f, list] of bakeAccessories(a, r, o)) groups.set(f, { geo: mergeGeometries(list)!, map: null, glow: f === 'glow' });
  }
  return { groups };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface CharacterMats {
  matte: THREE.MeshToonMaterial;
  cloth: THREE.MeshToonMaterial;
  metal: THREE.MeshPhongMaterial;
  /** Recolourable armour plates (their vertex colour is white; the material colour is the paint). */
  armor: THREE.MeshPhongMaterial;
  glow: THREE.MeshBasicMaterial;
  /** Textured skin and outfit materials, one per texture (created as looks need them). */
  tex: Map<string, THREE.MeshToonMaterial>;
}

/** Three-band light ramp for cel shading: deep shadow, half-tone, lit. */
let ramp: THREE.DataTexture | null = null;
export function toonRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/** Shared moonlit rim colour: silhouettes read against the dark ground, the way stylised action games light characters. */
export const rimUniform = { value: new THREE.Color(0xa8c4ff).multiplyScalar(0.32) };

/** Adds a view-dependent rim light (a few ALU ops, no texture or extra light). */
export function withRim<T extends THREE.Material>(m: T, strength = 1): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rimUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += uRim * ${strength.toFixed(2)} * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'rim' + strength;
  return m;
}

/**
 * Cel-shaded character materials: toon ramp + rim light for cloth, fur and skin; Phong for metal so armour
 * still catches a highlight. Both are much cheaper per pixel than PBR, which matters for phone heat.
 */
export function makeMats(): CharacterMats {
  return {
    matte: withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })),
    cloth: withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide })),
    metal: withRim(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x8a7a5a }), 0.5),
    armor: withRim(new THREE.MeshPhongMaterial({ vertexColors: true, color: 0x4a2218, shininess: 60, specular: 0x6a5a4a }), 0.5),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new Map(),
  };
}

function texMat(mats: CharacterMats, key: string, map: THREE.Texture | null) {
  let m = mats.tex.get(key);
  if (!m) {
    // Outfit cloth is single-sided in the source; DoubleSide keeps hoods and sleeves solid from inside.
    m = withRim(new THREE.MeshToonMaterial({ map, vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide }));
    mats.tex.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export interface Character {
  /** The armature's scene root; the skeleton animates inside it. */
  model: THREE.Group;
  bones: Map<string, THREE.Bone>;
  meshes: THREE.SkinnedMesh[];
  mats: CharacterMats;
  /** Every material that should flash on a hit. */
  flashMats: (THREE.Material & { emissive: THREE.Color; emissiveIntensity: number })[];
  rest: Rest;
  /** Parents an object modelled in rest-pose world space to a bone (for pieces animated in code). */
  attach(bone: string, o: THREE.Object3D): THREE.Object3D;
  /** Re-dresses the character (equipment changes); `key` names the look so its bake is shared and cached. */
  dress(key: string, look: Look, design?: (o: Outfit, r: Rest) => void): void;
}

/**
 * A dressed, animatable character. `design` adds bespoke accessories; it and the look's bake run once per
 * key, and later copies reuse the geometry.
 */
export function buildCharacter(key: string, look: Look, design?: (o: Outfit, r: Rest) => void, mats = makeMats()): Character {
  const { root, bones, skeleton, asset } = cloneSkeleton(look.body);
  const r = getRest(look.body);
  const armature = root.children[0];
  // Clips set the pelvis height of the animation library's mannequin; lift the armature so feet stay on the ground.
  armature.position.y += asset.lift;
  const meshes: THREE.SkinnedMesh[] = [];
  const ch: Character = {
    model: root, bones, meshes, mats, rest: r, flashMats: [],
    attach: (bone, o) => {
      // Accessories are modelled at rest with the feet on the ground; the lift moves them with the armature.
      root.updateMatrixWorld(true);
      o.position.y += asset.lift;
      bones.get(bone)!.attach(o);
      return o;
    },
    dress: (k, lk, ds) => {
      let b = baked.get(k);
      if (!b) baked.set(k, (b = bake(lk, ds)));
      for (const m of meshes) m.removeFromParent();
      meshes.length = 0;
      for (const [gk, g] of b.groups) {
        const finish = FINISHES.includes(gk as Finish) ? (gk as Finish) : null;
        const mat = finish ? mats[finish] : g.glow ? mats.glow : texMat(mats, gk, g.map);
        const m = new THREE.SkinnedMesh(g.geo, mat);
        // Baked pieces live in rest-pose world space: identity under the root (the armature carries the lift).
        root.add(m);
        m.bind(skeleton, new THREE.Matrix4());
        m.castShadow = true;
        // Animated bounds move away from the bind-pose sphere; a handful of characters is cheap to draw.
        m.frustumCulled = false;
        meshes.push(m);
      }
      ch.flashMats = [mats.matte, mats.cloth, mats.metal, ...mats.tex.values()];
      root.updateMatrixWorld(true);
    },
  };
  ch.dress(key, look, design);
  return ch;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Cheap deterministic per-position noise in [-1, 1] for colour and fur variation. */
export function hashNoise(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Smooth value noise in [-1, 1] (trilinear blend of hashNoise on a unit lattice). */
export function smoothNoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const fx = f(x - xi), fy = f(y - yi), fz = f(z - zi);
  let s = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    s += w * hashNoise(xi + dx, yi + dy, zi + dz);
  }
  return s;
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
