import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colored } from '../world/props';

/**
 * Procedural low-poly character models. Everything is built from primitives
 * at load time, so there are no model files to download, and every joint is
 * a Group we can animate in code.
 */

const lambert = (color: number, emissive = 0x000000, emissiveIntensity = 1) =>
  new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function joint(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Monkey warrior
// ---------------------------------------------------------------------------

export interface MonkeyRig {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  staff: THREE.Group;
  staffTip: THREE.Object3D;
  staffMid: THREE.Object3D;
  /** Gourd on the belt, and the copy shown in the hand while drinking. */
  gourdHip: THREE.Object3D;
  gourdHand: THREE.Object3D;
  cape: THREE.Group;
  tail: THREE.Group;
  mats: {
    fur: THREE.MeshLambertMaterial;
    face: THREE.MeshLambertMaterial;
    cloth: THREE.MeshLambertMaterial;
    armor: THREE.MeshLambertMaterial;
    staff: THREE.MeshLambertMaterial;
    gold: THREE.MeshLambertMaterial;
  };
}

/** Curved cloth strip around the back, flaring towards a ragged hem. Origin at the shoulders. */
function capeGeometry() {
  const cols = 8, rows = 6;
  const g = new THREE.PlaneGeometry(1, 1, cols, rows);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0..1 across
    const v = 0.5 - pos.getY(i); // 0 top .. 1 bottom
    const arc = (u - 0.5) * (1.9 + v * 0.6); // wraps round the back, flaring out
    const r = 0.26 + v * 0.12;
    const ragged = v > 0.95 ? (Math.sin(u * 37) * 0.5 + 0.5) * 0.12 : 0;
    pos.setXYZ(i, Math.sin(arc) * r, -v * (1.1 - ragged), -Math.cos(arc) * r * 0.75 - v * 0.08);
  }
  g.computeVertexNormals();
  return g;
}

export function buildMonkey(): MonkeyRig {
  const mats = {
    fur: lambert(0x5b3a24),
    face: lambert(0xc99a72),
    cloth: lambert(0x8e2b2b),
    armor: lambert(0x4a3b32),
    staff: lambert(0x2a1d16),
    gold: lambert(0xd8a032, 0x6a4008, 0.6),
  };
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5530 });

  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, 0.92, 0);

  // Legs (pivot at hip, hang down)
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 3, 6).translate(0, -0.38, 0);
  const footGeo = new THREE.BoxGeometry(0.16, 0.08, 0.26).translate(0, -0.84, 0.05);
  const legL = joint(hips, -0.14, 0, 0);
  const legR = joint(hips, 0.14, 0, 0);
  for (const leg of [legL, legR]) {
    leg.add(mesh(legGeo, mats.cloth));
    leg.add(mesh(footGeo, mats.armor));
  }
  // Loin cloth / skirt
  hips.add(mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.4, 7).translate(0, -0.18, 0), mats.cloth));
  hips.add(mesh(new THREE.TorusGeometry(0.21, 0.04, 4, 10).rotateX(Math.PI / 2), mats.gold, 0, 0.02, 0));

  // Torso
  const hipsTabs: THREE.Mesh[] = [];
  const torso = joint(hips, 0, 0.02, 0);
  torso.add(mesh(new THREE.CapsuleGeometry(0.21, 0.28, 3, 7).translate(0, 0.3, 0), mats.fur));
  torso.add(mesh(new THREE.BoxGeometry(0.46, 0.3, 0.3).translate(0, 0.38, 0.02), mats.armor));
  // Chest plate with gold trim, belt and hanging tabards
  torso.add(mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.26, 6, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.38, 0.06), mats.gold));
  torso.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04).translate(0, 0.38, 0.2), mats.armor));
  torso.add(mesh(new THREE.TorusGeometry(0.23, 0.035, 4, 12).rotateX(Math.PI / 2), mats.armor, 0, 0.1, 0));
  for (const z of [0.2, -0.2]) {
    const tab = mesh(new THREE.BoxGeometry(0.2, 0.42, 0.025).translate(0, -0.2, 0), mats.cloth, 0, 0.08, z);
    tab.rotation.x = z > 0 ? -0.08 : 0.08;
    hipsTabs.push(tab);
  }
  // Shoulder pads
  const padGeo = new THREE.SphereGeometry(0.13, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  torso.add(mesh(padGeo, mats.gold, -0.27, 0.53, 0));
  torso.add(mesh(padGeo, mats.gold, 0.27, 0.53, 0));

  // Head
  const head = joint(torso, 0, 0.66, 0.02);
  head.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mats.fur, 0, 0.1, 0));
  head.add(mesh(new THREE.SphereGeometry(0.13, 7, 5).scale(1.1, 0.85, 0.8), mats.face, 0, 0.05, 0.12));
  head.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mats.face, -0.2, 0.12, 0));
  head.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mats.face, 0.2, 0.12, 0));
  head.add(mesh(new THREE.SphereGeometry(0.025, 4, 3), eyeMat, -0.07, 0.13, 0.17));
  head.add(mesh(new THREE.SphereGeometry(0.025, 4, 3), eyeMat, 0.07, 0.13, 0.17));
  head.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 12).rotateX(Math.PI / 2 - 0.15), mats.gold, 0, 0.2, 0));
  // Fur tuft, brow ridge, nose, sideburns
  head.add(mesh(new THREE.ConeGeometry(0.12, 0.2, 5).rotateX(-0.6), mats.fur, 0, 0.3, -0.05));
  head.add(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.06).translate(0, 0.17, 0.16), mats.fur));
  head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4).scale(1, 0.7, 1), mats.fur, 0, 0.08, 0.235));
  for (const sx of [-1, 1]) {
    const burn = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mats.fur, sx * 0.17, 0.02, 0.06);
    burn.rotation.set(0.3, 0, sx * 2.2);
    head.add(burn);
  }

  // Arms (pivot at shoulder)
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.45, 3, 6).translate(0, -0.3, 0);
  const handGeo = new THREE.SphereGeometry(0.08, 5, 4).translate(0, -0.62, 0);
  const bracerGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 6).translate(0, -0.45, 0);
  const armL = joint(torso, -0.3, 0.5, 0);
  const armR = joint(torso, 0.3, 0.5, 0);
  const wrapMat = lambert(0xd8ccb0);
  for (const arm of [armL, armR]) {
    arm.add(mesh(armGeo, mats.fur));
    arm.add(mesh(handGeo, mats.face));
    arm.add(mesh(bracerGeo, mats.gold));
    arm.add(mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.12, 6).translate(0, -0.25, 0), wrapMat));
  }
  for (const t of hipsTabs) hips.add(t);

  // Cape: a curved, flaring cloth wrapped round the back with a tattered hem.
  const cape = joint(torso, 0, 0.56, -0.12);
  const capeMat = new THREE.MeshLambertMaterial({ color: 0x9a2f2f, side: THREE.DoubleSide, flatShading: true });
  cape.add(mesh(capeGeometry(), capeMat));
  cape.add(mesh(new THREE.TorusGeometry(0.22, 0.07, 4, 12, Math.PI).rotateZ(Math.PI).rotateX(-0.3), mats.fur, 0, 0.03, 0.05));
  // Fur mantle round the shoulders
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.3;
    const tuft = mesh(new THREE.ConeGeometry(0.07, 0.22, 4), mats.fur, Math.sin(a) * 0.26, 0.6, -Math.cos(a) * 0.1 + 0.02);
    tuft.rotation.set(Math.PI * 0.8, 0, -a * 0.6);
    torso.add(tuft);
  }

  // Tail
  const tail = joint(hips, 0, -0.05, -0.2);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.2, -0.3), new THREE.Vector3(0.05, 0.1, -0.6), new THREE.Vector3(0.1, 0.45, -0.65),
  ]);
  tail.add(mesh(new THREE.TubeGeometry(tailCurve, 8, 0.04, 4), mats.fur));

  // Staff: pivot at the right hand area; the rod lies along local +Z.
  const staff = joint(body, 0.32, 1.15, 0.15);
  staff.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6).rotateX(Math.PI / 2).translate(0, 0, 0.55), mats.staff));
  staff.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6).rotateX(Math.PI / 2).translate(0, 0, 1.7), mats.gold));
  staff.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6).rotateX(Math.PI / 2).translate(0, 0, -0.6), mats.gold));
  const staffTip = new THREE.Object3D();
  staffTip.position.set(0, 0, 1.8);
  staff.add(staffTip);
  const staffMid = new THREE.Object3D();
  staffMid.position.set(0, 0, 0.55);
  staff.add(staffMid);

  // Healing gourd (two bulbs + cord)
  const gourdGeo = mergeGeometries([
    colored(new THREE.SphereGeometry(0.11, 7, 5).translate(0, 0, 0), 0xb07a2e, 0.05),
    colored(new THREE.SphereGeometry(0.075, 6, 4).translate(0, 0.14, 0), 0xb07a2e, 0.05),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 5).translate(0, 0.23, 0), 0x6a1e1e, 0.05),
  ])!;
  const gourdMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const gourdHip = mesh(gourdGeo, gourdMat, -0.24, -0.12, 0.05);
  gourdHip.rotation.z = 0.3;
  hips.add(gourdHip);
  const gourdHand = mesh(gourdGeo, gourdMat, 0, -0.66, 0.06);
  gourdHand.visible = false;
  armL.add(gourdHand);

  root.traverse((o) => {
    o.frustumCulled = true;
  });
  return { root, body, hips, torso, head, armL, armR, legL, legR, staff, staffTip, staffMid, gourdHip, gourdHand, cape, tail, mats };
}

// ---------------------------------------------------------------------------
// Spiders
// ---------------------------------------------------------------------------

export type SpiderKind = 'spiderling' | 'armored' | 'weaver';

export interface SpiderRig {
  root: THREE.Group;
  body: THREE.Group;
  /** Leg animation runs in the vertex shader; drive it through these uniforms. */
  legs: { uPhase: { value: number }; uAmp: { value: number }; uCurl: { value: number } };
  torso?: THREE.Group;
  armL?: THREE.Group;
  armR?: THREE.Group;
  flashMats: THREE.MeshLambertMaterial[];
  glowMat: THREE.MeshLambertMaterial;
}

interface SpiderGeometry {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  torso?: THREE.BufferGeometry;
  arm?: THREE.BufferGeometry;
}

/** Bakes a part into rig-local space with a flat vertex colour, ready to merge. */
function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  return colored(geo.translate(x, y, z), color, 0.04);
}

/** Adds the per-vertex leg attributes (0 = not a leg) used by the leg vertex shader. */
function legAttrs(geo: THREE.BufferGeometry, leg: number, pivot: THREE.Vector3) {
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aLeg', new THREE.BufferAttribute(new Float32Array(n).fill(leg), 1));
  const pv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pv.set([pivot.x, pivot.y, pivot.z], i * 3);
  geo.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
  return geo;
}

const spiderGeoCache = new Map<SpiderKind, SpiderGeometry>();

/**
 * Each spider kind is one merged, vertex-coloured mesh with all 8 legs baked
 * in (animated on the GPU) plus one emissive "glow" mesh: 2 draw calls per
 * spider instead of ~30. Geometry is shared between all instances.
 */
function spiderGeometry(kind: SpiderKind): SpiderGeometry {
  const cached = spiderGeoCache.get(kind);
  if (cached) return cached;
  const shellC = kind === 'armored' ? 0x4a4c52 : 0x2a2626;
  const legC = kind === 'armored' ? 0x3b3c40 : 0x221e1e;
  const bone = 0xcfc6b4;
  const zero = new THREE.Vector3();

  const body = [
    part(new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.75, 1.2), shellC, 0, 0.1, -0.55),
    part(new THREE.SphereGeometry(0.3, 7, 5).scale(1, 0.7, 1), shellC, 0, 0, 0.15),
  ];
  const glow = [part(new THREE.SphereGeometry(0.32, 6, 4).scale(1, 0.4, 1.2), 0xffffff, 0, 0.42, -0.6)];
  if (kind === 'armored') {
    for (let i = 0; i < 3; i++) body.push(part(new THREE.BoxGeometry(0.9 - i * 0.15, 0.12, 0.25), shellC, 0, 0.42 + i * 0.03, -0.25 - i * 0.3));
    body.push(part(new THREE.ConeGeometry(0.08, 0.35, 4), bone, -0.2, 0.55, -0.4));
    body.push(part(new THREE.ConeGeometry(0.08, 0.35, 4), bone, 0.2, 0.55, -0.4));
  }
  if (kind !== 'weaver') {
    body.push(part(new THREE.SphereGeometry(0.18, 6, 5), bone, 0, 0.05, 0.45));
    body.push(part(new THREE.ConeGeometry(0.04, 0.2, 4).rotateX(Math.PI * 0.6), bone, -0.08, -0.08, 0.6));
    body.push(part(new THREE.ConeGeometry(0.04, 0.2, 4).rotateX(Math.PI * 0.6), bone, 0.08, -0.08, 0.6));
    glow.push(part(new THREE.SphereGeometry(0.035, 4, 3), 0xffffff, -0.07, 0.1, 0.6));
    glow.push(part(new THREE.SphereGeometry(0.035, 4, 3), 0xffffff, 0.07, 0.1, 0.6));
  }
  for (const g of body) legAttrs(g, 0, zero);

  // One bent leg (upper rises outward, lower reaches down/out) along +Z, then placed per hip.
  const upperM = new THREE.Matrix4().makeRotationX(0.9);
  const lowerM = new THREE.Matrix4().makeRotationX(0.9).multiply(new THREE.Matrix4().makeTranslation(0, 0.7, 0)).multiply(new THREE.Matrix4().makeRotationX(-1.3));
  const legBase = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 4).translate(0, 0.35, 0).applyMatrix4(upperM), legC, 0.04),
    colored(new THREE.CylinderGeometry(0.05, 0.015, 0.9, 4).translate(0, -0.45, 0).applyMatrix4(lowerM), legC, 0.04),
  ])!;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Vector3(side * 0.2, 0, 0.3 - i * 0.18);
      const m = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new THREE.Matrix4().makeRotationY(side * (Math.PI / 2) + (i - 1.5) * 0.45 * side));
      body.push(legAttrs(legBase.clone().applyMatrix4(m), 1 + i + (side > 0 ? 4 : 0), pivot));
    }
  }

  const g: SpiderGeometry = { body: mergeGeometries(body)!, glow: mergeGeometries(glow)! };
  if (kind === 'weaver') {
    const skin = 0xd8d0c8;
    g.torso = mergeGeometries([
      part(new THREE.CapsuleGeometry(0.17, 0.4, 3, 6), skin, 0, 0.35, 0),
      part(new THREE.SphereGeometry(0.15, 6, 5), skin, 0, 0.8, 0.02),
      part(new THREE.ConeGeometry(0.2, 0.5, 6).rotateX(Math.PI), 0x181414, 0, 0.88, -0.05),
      part(new THREE.SphereGeometry(0.03, 4, 3), 0xb05cff, -0.05, 0.82, 0.13),
      part(new THREE.SphereGeometry(0.03, 4, 3), 0xb05cff, 0.05, 0.82, 0.13),
    ])!;
    g.arm = colored(new THREE.CapsuleGeometry(0.05, 0.45, 2, 4).translate(0, -0.3, 0), skin, 0.04);
  }
  for (const geo of Object.values(g)) geo?.computeBoundingSphere();
  // Legs swing outside the static bounds; pad so frustum culling doesn't clip them.
  g.body.boundingSphere!.radius *= 1.3;
  spiderGeoCache.set(kind, g);
  return g;
}

const LEG_VERTEX = /* glsl */ `
#include <begin_vertex>
if (aLeg > 0.5) {
  float li = aLeg - 1.0;
  float side = li >= 4.0 ? 1.0 : -1.0;
  float ph = uPhase + mod(li, 4.0) * 1.5708 + (side > 0.0 ? 3.14159 : 0.0);
  vec3 d = transformed - aPivot;
  float sw = sin(ph) * 0.35 * uAmp * side;
  float c = cos(sw), s = sin(sw);
  d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  float r = length(d.xz);
  d.y += max(0.0, cos(ph)) * 0.45 * uAmp * r;
  d = mix(d, vec3(d.x * 0.35, abs(d.y) + r * 0.7, d.z * 0.35), uCurl);
  transformed = aPivot + d;
}`;

function spiderMaterial() {
  const legs = { uPhase: { value: 0 }, uAmp: { value: 0 }, uCurl: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, legs);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLeg;\nattribute vec3 aPivot;\nuniform float uPhase;\nuniform float uAmp;\nuniform float uCurl;')
      .replace('#include <begin_vertex>', LEG_VERTEX);
  };
  mat.customProgramCacheKey = () => 'spider-legs';
  mat.userData.unique = true;
  return { mat, legs };
}

export function buildSpider(kind: SpiderKind): SpiderRig {
  const geo = spiderGeometry(kind);
  const { mat, legs } = spiderMaterial();
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  plain.userData.unique = true;
  const glowMat = lambert(0x550808, 0xff1a1a, kind === 'armored' ? 1.2 : 0.8);
  glowMat.vertexColors = true;
  glowMat.userData.unique = true;

  const root = new THREE.Group();
  const body = joint(root, 0, 0.42, 0);
  body.add(new THREE.Mesh(geo.body, mat), new THREE.Mesh(geo.glow, glowMat));

  let torso: THREE.Group | undefined, armL: THREE.Group | undefined, armR: THREE.Group | undefined;
  if (geo.torso && geo.arm) {
    torso = joint(body, 0, 0.2, 0.3);
    torso.add(new THREE.Mesh(geo.torso, plain));
    armL = joint(torso, -0.22, 0.6, 0);
    armR = joint(torso, 0.22, 0.6, 0);
    armL.add(new THREE.Mesh(geo.arm, plain));
    armR.add(new THREE.Mesh(geo.arm, plain));
  }

  const scale = kind === 'spiderling' ? 0.55 : kind === 'armored' ? 1.35 : 0.85;
  root.scale.setScalar(scale);
  return { root, body, legs, torso, armL, armR, flashMats: [mat, plain, glowMat], glowMat };
}

// ---------------------------------------------------------------------------
// Boss: Blackfeather Lord, a winged yaoguai with a golden spear
// ---------------------------------------------------------------------------

export interface BossRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  spear: THREE.Group;
  flashMats: THREE.MeshLambertMaterial[];
  eyeMat: THREE.MeshBasicMaterial;
}

export function buildBoss(): BossRig {
  const robe = lambert(0x16151a);
  const armor = lambert(0x2c2a30);
  const skin = lambert(0x8f8a85);
  const feather = new THREE.MeshLambertMaterial({ color: 0x111014, side: THREE.DoubleSide, flatShading: true });
  const gold = lambert(0xc9952e, 0x5a3a08, 0.7);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5dff8a });

  const root = new THREE.Group();
  const body = joint(root);
  body.add(mesh(new THREE.ConeGeometry(0.9, 2.0, 8).translate(0, 1.0, 0), robe));
  body.add(mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.2, 8).translate(0, 0.1, 0), armor));
  // Layered robe: split front panels with gold hems, a glowing jade rune belt, a feather cloak.
  const runeMat = lambert(0x0c2a16, 0x3dff7a, 1.4);
  for (const sx of [-1, 1]) {
    const panel = mesh(new THREE.BoxGeometry(0.55, 1.7, 0.08).translate(0, -0.85, 0), robe, sx * 0.3, 1.85, 0.55);
    panel.rotation.set(-0.28, sx * 0.25, sx * 0.08);
    body.add(panel);
    const hem = mesh(new THREE.BoxGeometry(0.57, 0.08, 0.1).translate(0, -1.68, 0), gold, sx * 0.3, 1.85, 0.55);
    hem.rotation.copy(panel.rotation);
    body.add(hem);
  }
  body.add(mesh(new THREE.TorusGeometry(0.55, 0.06, 4, 16).rotateX(Math.PI / 2), runeMat, 0, 1.75, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 11 - 0.5) * Math.PI * 1.4 + Math.PI;
    const f = mesh(new THREE.PlaneGeometry(0.32, 1.9).translate(0, -0.95, 0), feather, Math.sin(a) * 0.75, 2.75, Math.cos(a) * 0.55);
    f.rotation.set(0.12, a, (Math.random() - 0.5) * 0.15);
    body.add(f);
  }

  const torso = joint(body, 0, 1.9, 0);
  torso.add(mesh(new THREE.CapsuleGeometry(0.42, 0.7, 3, 8).translate(0, 0.45, 0), armor));
  torso.add(mesh(new THREE.BoxGeometry(1.2, 0.25, 0.6).translate(0, 0.95, 0), gold));
  for (const s of [-1, 1]) torso.add(mesh(new THREE.ConeGeometry(0.22, 0.6, 5).rotateZ(-s * 0.9), armor, s * 0.65, 1.15, 0));

  const head = joint(torso, 0, 1.25, 0.05);
  head.add(mesh(new THREE.SphereGeometry(0.28, 7, 6), skin, 0, 0.15, 0));
  head.add(mesh(new THREE.ConeGeometry(0.12, 0.45, 4).rotateX(Math.PI / 2 + 0.4), lambert(0x2a2620), 0, 0.05, 0.35));
  head.add(mesh(new THREE.SphereGeometry(0.05, 4, 3), eyeMat, -0.1, 0.22, 0.23));
  head.add(mesh(new THREE.SphereGeometry(0.05, 4, 3), eyeMat, 0.1, 0.22, 0.23));
  for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.06, 0.6, 4).rotateZ(-s * 0.5).rotateX(-0.5), gold, s * 0.18, 0.5, -0.05));
  // Feather mane
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.4;
    const f = mesh(new THREE.ConeGeometry(0.08, 0.7, 3), feather, Math.sin(a) * 0.3, 0.1, -0.15 - Math.cos(a) * 0.05);
    f.rotation.set(-1.1, 0, -a * 0.6);
    head.add(f);
  }

  const makeWing = (side: number) => {
    const w = joint(torso, side * 0.35, 0.9, -0.35);
    const featherGeo = new THREE.PlaneGeometry(0.45, 2.6).translate(0, 1.3, 0);
    for (let i = 0; i < 9; i++) {
      const f = mesh(featherGeo, feather);
      f.rotation.set(-0.25, 0, -side * (0.25 + i * 0.17));
      f.scale.y = 1 - i * 0.06;
      f.position.x = side * i * 0.08;
      w.add(f);
    }
    return w;
  };
  const wingL = makeWing(-1);
  const wingR = makeWing(1);

  const armGeo = new THREE.CapsuleGeometry(0.14, 0.8, 3, 6).translate(0, -0.5, 0);
  const armL = joint(torso, -0.65, 0.85, 0);
  const armR = joint(torso, 0.65, 0.85, 0);
  armL.add(mesh(armGeo, armor));
  armR.add(mesh(armGeo, armor));
  armL.add(mesh(new THREE.SphereGeometry(0.14, 5, 4), skin, 0, -1.05, 0));
  armR.add(mesh(new THREE.SphereGeometry(0.14, 5, 4), skin, 0, -1.05, 0));

  // Spear held in right hand, along local +Z
  const spear = joint(armR, 0, -1.05, 0);
  spear.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6).rotateX(Math.PI / 2).translate(0, 0, 0.9), gold));
  spear.add(mesh(new THREE.ConeGeometry(0.16, 0.8, 4).rotateX(Math.PI / 2).translate(0, 0, 3.5), lambert(0xe8d8a0, 0x806020, 0.6)));
  spear.add(mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 8), gold, 0, 0, 2.9));
  spear.add(mesh(new THREE.SphereGeometry(0.14, 6, 4), gold, 0, 0, -1.3));

  root.scale.setScalar(1.35);
  return { root, body, torso, head, wingL, wingR, armL, armR, spear, flashMats: [robe, armor, skin, gold, runeMat], eyeMat };
}
