import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildCharacter, hashNoise, kilt, mottle, roughen, taperedTube, tint,
  type BodyPainter, type Character, type Outfit, type Rest,
} from './characters';

const isHand = (b: string) => /hand|thumb|index|middle|ring|pinky/.test(b);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Head measurements from the rest pose: centre, half width (x), half depth (z), half height. */
function headFrame(r: Rest) {
  const hb = r.boxes.get('Head')!;
  const c = hb.getCenter(new THREE.Vector3());
  return { c, hx: (hb.max.x - hb.min.x) / 2, hz: (hb.max.z - hb.min.z) / 2, hy: (hb.max.y - hb.min.y) / 2 };
}

function pelvisFrame(r: Rest) {
  const pb = r.boxes.get('pelvis')!;
  return { pw: (pb.max.x - pb.min.x) / 2, pd: (pb.max.z - pb.min.z) / 2, waist: pb.max.y - 0.02, back: pb.min.z, cz: pb.getCenter(new THREE.Vector3()).z };
}

/** Elliptical band round the body (belts, rims, sashes): radii rx/rz, tube thickness t. */
function band(rx: number, rz: number, t: number, seg = 32) {
  return new THREE.TorusGeometry(1, t / rx, 6, seg).rotateX(Math.PI / 2).scale(rx, rx, rz);
}

// ---------------------------------------------------------------------------
// The Destined One
// ---------------------------------------------------------------------------

const FUR = 0x5a3820;
const FUR_DARK = 0x3e2a1a;

const heroPainter: BodyPainter = (bone, p, c) => {
  const n = hashNoise(p.x * 40, p.y * 40, p.z * 40) * 0.06;
  if (bone === 'Head' || bone === 'neck_01' || bone.startsWith('upperarm') || bone.startsWith('clavicle') || bone === 'spine_03') {
    c.setHex(FUR);
  } else if (bone.startsWith('lowerarm')) {
    c.setHex(0xcbb790);
    if (Math.sin(Math.abs(p.x) * 95) > 0.55) c.multiplyScalar(0.62);
  } else if (isHand(bone)) {
    c.setHex(0x3a2a20);
  } else if (bone === 'spine_01' || bone === 'spine_02') {
    c.setHex(0x2c2420);
  } else if (bone === 'pelvis' || bone.startsWith('thigh')) {
    c.setHex(0x4a1d18);
  } else if (bone.startsWith('calf')) {
    c.setHex(0xb8a27a);
    if (Math.sin(p.y * 70 + p.x * 20) > 0.5) c.multiplyScalar(0.6);
  } else {
    c.setHex(0x221c18);
  }
  c.multiplyScalar(1 + n);
};

const GOLD = 0xd29a36;
const LACQUER = 0x4a2218;

function heroDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz } = headFrame(r);
  const hr = hz;
  const fur = mottle(FUR, FUR_DARK);
  // Fur dome tilted back so the brow and face stay bare; a second mass covers the back of the skull.
  o.put('Head', tint(roughen(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56).rotateX(-0.55).scale(hx * 1.22, hr * 1.02, hz * 1.12), 0.008, 70), fur), 'matte', null, hc.x, hc.y + hr * 0.18, hc.z - hr * 0.04);
  o.put('Head', tint(roughen(new THREE.SphereGeometry(1, 18, 12).scale(hx * 1.12, hr * 0.95, hz * 0.8), 0.008, 70), fur), 'matte', null, hc.x, hc.y - hr * 0.1, hc.z - hz * 0.3);
  // Bare face, muzzle, nose, brow ridge, glowing eyes, ears.
  const faceZ = hc.z + hz * 0.55, front = faceZ + hz * 0.5;
  o.put('Head', new THREE.SphereGeometry(1, 20, 14).scale(hx * 0.92, hr * 0.78, hz * 0.5), 'matte', 0xd6a07c, hc.x, hc.y - hr * 0.08, faceZ);
  o.put('Head', new THREE.SphereGeometry(1, 16, 12).scale(hx * 0.62, hr * 0.36, hz * 0.4), 'matte', 0xe6bc98, hc.x, hc.y - hr * 0.5, front - hz * 0.08);
  o.put('Head', new THREE.SphereGeometry(1, 10, 8).scale(hx * 0.2, hr * 0.1, hz * 0.12), 'matte', 0x1a1210, hc.x, hc.y - hr * 0.36, front + hz * 0.28);
  o.put('Head', new THREE.CapsuleGeometry(hr * 0.1, hx * 1.2, 4, 10).rotateZ(Math.PI / 2), 'matte', FUR_DARK, hc.x, hc.y + hr * 0.2, front - hz * 0.06);
  for (const sx of [-1, 1]) {
    o.put('Head', new THREE.SphereGeometry(hr * 0.12, 12, 10), 'glow', 0xffc040, hc.x + sx * hx * 0.38, hc.y + hr * 0.04, front - hz * 0.1);
    o.put('Head', new THREE.SphereGeometry(1, 10, 8).scale(hx * 0.16, hr * 0.3, hz * 0.22), 'matte', 0xd6a07c, hc.x + sx * hx * 1.12, hc.y + hr * 0.02, hc.z - hz * 0.05);
  }
  // Mane framing the face.
  const tuft = roughen(new THREE.ConeGeometry(hr * 0.22, hr * 0.75, 7, 3), hr * 0.03, 80);
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 1.9;
    const m = new THREE.Mesh(tint(tuft.clone(), mottle(0x8a6a44, FUR_DARK)));
    m.position.set(hc.x + Math.sin(a) * hx, hc.y - Math.cos(a) * hr * 0.85 + hr * 0.05, hc.z + hz * 0.4);
    m.lookAt(m.position.clone().add(V(Math.sin(a), -Math.cos(a), -0.4)));
    m.rotateX(Math.PI / 2);
    o.putObject('Head', m, 'matte', null);
  }
  // Golden circlet with a jewel.
  o.put('Head', new THREE.TorusGeometry(1, 0.07, 8, 32).rotateX(Math.PI / 2 - 0.2).scale(hx * 1.2, hx * 1.2, hz * 1.15), 'metal', GOLD, hc.x, hc.y + hr * 0.38, hc.z + hz * 0.04);
  o.put('Head', new THREE.OctahedronGeometry(hr * 0.16, 0).scale(0.8, 1.2, 0.5), 'glow', 0xff4a2a, hc.x, hc.y + hr * 0.5, hc.z + hz * 1.18);

  // Torso: fur mantle, lacquered cuirass with gold rims and a mirror, sash and belt.
  const neck = r.pos('neck_01');
  o.put('spine_03', tint(roughen(new THREE.TorusGeometry(0.115, 0.055, 12, 28).rotateX(Math.PI / 2).scale(1.3, 0.8, 1.05), 0.012, 60), mottle(0x7e5c3a, FUR_DARK)), 'matte', null, neck.x, neck.y - 0.03, neck.z - 0.01);
  const drape = roughen(new THREE.ConeGeometry(0.045, 0.15, 7, 3), 0.006, 90);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    o.put('spine_03', tint(drape.clone(), mottle(0x7e5c3a, FUR_DARK)), 'matte', null,
      neck.x + Math.sin(a) * 0.19, neck.y - 0.07, neck.z - 0.01 + Math.cos(a) * 0.14, Math.PI + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
  }
  const s2 = r.boxes.get('spine_02')!, s3 = r.boxes.get('spine_03')!;
  const cw = (s2.max.x - s2.min.x) / 2, cd = 0.13;
  const cy = (s2.min.y + s3.max.y) / 2 - 0.05, cz = -0.02;
  const cuirass = new THREE.CylinderGeometry(1, 0.94, 0.3, 28, 6, true);
  const cp = cuirass.getAttribute('position');
  for (let i = 0; i < cp.count; i++) {
    const ridge = 1 + 0.035 * Math.max(0, Math.sin(cp.getY(i) * 70));
    cp.setXYZ(i, cp.getX(i) * ridge, cp.getY(i), cp.getZ(i) * ridge);
  }
  cuirass.scale(cw * 1.12, 1, cd * 1.25).computeVertexNormals();
  o.put('spine_03', cuirass, 'metal', LACQUER, 0, cy, cz);
  o.put('spine_03', band(cw * 1.13, cd * 1.27, 0.012), 'metal', GOLD, 0, cy + 0.15, cz);
  o.put('spine_03', band(cw * 1.08, cd * 1.2, 0.012), 'metal', GOLD, 0, cy - 0.15, cz);
  o.put('spine_03', new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24).rotateX(Math.PI / 2), 'metal', GOLD, 0, cy + 0.05, cz + cd * 1.25 + 0.012);
  o.put('spine_03', new THREE.CylinderGeometry(0.03, 0.03, 0.022, 16).rotateX(Math.PI / 2), 'glow', 0xff4a2a, 0, cy + 0.05, cz + cd * 1.25 + 0.022);

  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  const sashTint = (p: THREE.Vector3, c: THREE.Color) => c.setHex(0x8e2a1e).multiplyScalar(0.85 + 0.15 * Math.sin(p.x * 80 + p.y * 40));
  o.put('pelvis', tint(new THREE.TorusGeometry(1, 0.32, 10, 28).rotateX(Math.PI / 2).scale(pw * 1.05, 0.13, pd * 1.2), sashTint), 'cloth', null, 0, waist + 0.04, pz);
  o.put('pelvis', band(pw * 1.12, pd * 1.3, 0.02), 'metal', GOLD, 0, waist - 0.02, pz);
  o.put('pelvis', new THREE.BoxGeometry(0.09, 0.07, 0.02), 'metal', GOLD, 0, waist - 0.02, pz + pd * 1.3);

  // Layered pauldrons and bracers.
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    const sp = r.pos(`upperarm_${side}`);
    for (let k = 0; k < 3; k++) {
      const rad = 0.12 - k * 0.012;
      o.put(`upperarm_${side}`, new THREE.SphereGeometry(rad, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.75, 1.05),
        'metal', k === 1 ? GOLD : LACQUER, sp.x + sx * (0.02 + k * 0.05), sp.y + 0.05 - k * 0.028, sp.z, 0, 0, -sx * (0.45 + k * 0.12));
    }
    const lp = r.pos(`lowerarm_${side}`);
    const len = r.pos(`hand_${side}`).distanceTo(lp);
    o.put(`lowerarm_${side}`, new THREE.CylinderGeometry(0.052, 0.044, len * 0.55, 18).rotateZ(Math.PI / 2), 'metal', LACQUER, lp.x + sx * len * 0.6, lp.y, lp.z);
    for (const f of [0.33, 0.87]) {
      o.put(`lowerarm_${side}`, new THREE.TorusGeometry(0.05 - f * 0.006, 0.008, 6, 18).rotateY(Math.PI / 2), 'metal', GOLD, lp.x + sx * len * f, lp.y, lp.z);
    }
  }

  // Tiger-skin kilt.
  kilt(o, {
    top: waist - 0.03, hem: 0.56, radius: Math.max(pw, pd) * 1.15, flare: 0.07, z: pz * 0.5, panels: 10, ragged: 0.04,
    color: (p, c) => {
      const stripe = Math.sin(p.y * 48 + Math.sin(p.x * 26 + p.z * 20) * 2.2) > 0.45;
      c.setHex(stripe ? 0x2a1a10 : 0xc27a30);
      if (p.y < 0.62) c.setHex(0xd8c8a8);
      c.multiplyScalar(0.9 + 0.1 * hashNoise(p.x * 50, p.y * 50, p.z * 50));
    },
  });
}

export interface HeroRig {
  character: Character;
  root: THREE.Group;
  /** Holds the mannequin; spun or offset for whole-body effects (whirlwind). */
  model: THREE.Group;
  staff: THREE.Group;
  staffBack: THREE.Group;
  staffTip: THREE.Object3D;
  staffMid: THREE.Object3D;
  gourdHip: THREE.Object3D;
  gourdHand: THREE.Object3D;
  tail: THREE.Group;
  sashes: THREE.Object3D[];
  feathers: THREE.Group;
  staffMat: THREE.MeshStandardMaterial;
  /** Staff caps; pulses with Focus and charge. */
  goldMat: THREE.MeshStandardMaterial;
}

export function buildHero(): HeroRig {
  const ch = buildCharacter('hero', heroPainter, heroDesign);
  const r = ch.rest;
  const { c: hc, hx, hz } = headFrame(r);
  const { pw, waist, back, cz: pz } = pelvisFrame(r);
  const mats = ch.mats;

  // Pheasant plumes (sway in code).
  const feathers = new THREE.Group();
  feathers.position.set(hc.x, hc.y + hz * 0.45, hc.z + hz * 0.75);
  for (const sx of [-1, 1]) {
    const pts = [V(sx * hx * 0.4, 0, 0), V(sx * 0.07, 0.28, 0.06), V(sx * 0.2, 0.62, -0.18), V(sx * 0.36, 0.82, -0.55), V(sx * 0.48, 0.84, -0.86)];
    const g = tint(taperedTube(pts, 0.016, 0.003, 26, 6), (p, c) => c.setHex(Math.sin(p.y * 46 - p.z * 30) > 0.25 ? 0x2a120c : 0xb8442a));
    feathers.add(new THREE.Mesh(g, mats.matte));
  }
  ch.attach('Head', feathers);

  // Tail and sash tails trail behind movement.
  const tail = new THREE.Group();
  tail.position.set(0, waist - 0.11, back + 0.02);
  const tailGeo = taperedTube([V(0, 0, 0), V(0, -0.16, -0.14), V(0.04, -0.24, -0.42), V(0.1, -0.05, -0.68), V(0.14, 0.25, -0.76), V(0.12, 0.38, -0.66)], 0.038, 0.012, 30, 8);
  tail.add(new THREE.Mesh(tint(roughen(tailGeo, 0.006, 90), mottle(FUR, FUR_DARK)), mats.matte));
  ch.attach('pelvis', tail);
  const sashes: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * pw * 0.6, waist, back - 0.02);
    pivot.add(new THREE.Mesh(tint(new THREE.PlaneGeometry(0.07, 0.5, 1, 6).translate(0, -0.25, 0), (p, c) => c.setHex(0x8e2a1e).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 40))), mats.cloth));
    ch.attach('pelvis', pivot);
    sashes.push(pivot);
  }

  // Gourd on the hip, and the one shown in the hand while drinking.
  const gourdGeo = tint(
    (() => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const rr = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 0.075 + 0.005 : Math.sin(((t - 0.55) / 0.45) * Math.PI) * 0.05 + 0.012;
        pts.push(new THREE.Vector2(Math.max(0.005, rr), t * 0.26));
      }
      return new THREE.LatheGeometry(pts, 16);
    })(),
    (p, c) => c.setHex(p.y > 0.24 ? 0x6a1e1e : 0xb07a2e),
  );
  const gourdHip = new THREE.Mesh(gourdGeo, mats.matte);
  gourdHip.position.set(pw * 1.15, waist - 0.28, pz + 0.03);
  gourdHip.rotation.z = 0.25;
  ch.attach('pelvis', gourdHip);
  const hp = r.pos('hand_r');
  const gourdHand = new THREE.Mesh(gourdGeo, mats.matte);
  gourdHand.position.set(hp.x - 0.08, hp.y - 0.1, hp.z + 0.04);
  gourdHand.visible = false;
  ch.attach('hand_r', gourdHand);

  // Ruyi Jingu Bang, built along +Z (the fist's grip axis at rest).
  const staffMat = new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.4, metalness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.32, metalness: 0.85, emissive: 0x5a3200, emissiveIntensity: 0.25 });
  const makeStaff = () => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 2.1, 12).rotateX(Math.PI / 2).translate(0, 0, 0.5), staffMat);
    g.add(shaft);
    const caps = [1.47, -0.47].flatMap((z) => [
      new THREE.CylinderGeometry(0.036, 0.036, 0.2, 14).rotateX(Math.PI / 2).translate(0, 0, z),
      new THREE.TorusGeometry(0.036, 0.008, 6, 14).translate(0, 0, z + (z > 0 ? -0.1 : 0.1)),
    ]);
    g.add(new THREE.Mesh(mergeGeometries(caps)!, goldMat));
    return g;
  };
  const staff = makeStaff();
  staff.position.copy(hp).add(V(-0.08, 0, 0));
  ch.attach('hand_r', staff);
  const staffTip = new THREE.Object3D();
  staffTip.position.set(0, 0, 1.55);
  staff.add(staffTip);
  const staffMid = new THREE.Object3D();
  staffMid.position.set(0, 0, 0.45);
  staff.add(staffMid);
  // Copy slung across the back while the hand is busy (drinking).
  const staffBack = makeStaff();
  const s3 = r.boxes.get('spine_03')!;
  staffBack.position.set(0.25, (s3.min.y + s3.max.y) / 2 - 0.15, s3.min.z - 0.06);
  staffBack.rotation.set(-Math.PI / 2, 0, 0);
  staffBack.rotateY(0.85);
  staffBack.visible = false;
  ch.attach('spine_03', staffBack);
  for (const s of [staff, staffBack, gourdHip, gourdHand]) s.traverse((m) => (m.castShadow = true));

  const model = new THREE.Group();
  model.add(ch.model);
  const root = new THREE.Group();
  root.add(model);
  return { character: ch, root, model, staff, staffBack, staffTip, staffMid, gourdHip, gourdHand, tail, sashes, feathers, staffMat, goldMat };
}

// ---------------------------------------------------------------------------
// Undead monk (melee): rotting skin, tattered saffron robe, prayer beads
// ---------------------------------------------------------------------------

const monkPainter = (skin: number, robe: number): BodyPainter => (bone, p, c) => {
  const n = hashNoise(p.x * 30, p.y * 30, p.z * 30);
  if (bone === 'Head' || bone === 'neck_01' || bone.startsWith('lowerarm') || isHand(bone) || bone.startsWith('calf') || bone.startsWith('foot') || bone.startsWith('ball')) {
    c.setHex(skin).multiplyScalar(0.85 + 0.15 * n);
    if (n > 0.7) c.multiplyScalar(0.6); // rot blotches
  } else {
    c.setHex(robe).multiplyScalar(0.8 + 0.2 * n);
  }
};

function monkDesign(hat: boolean) {
  return (o: Outfit, r: Rest) => {
    const { c: hc, hx, hz, hy } = headFrame(r);
    const { pw, pd, waist, cz: pz } = pelvisFrame(r);
    // Sunken glowing eyes and a gaunt jaw.
    for (const sx of [-1, 1]) o.put('Head', new THREE.SphereGeometry(hz * 0.11, 10, 8), 'glow', 0x9dff6a, hc.x + sx * hx * 0.36, hc.y + hy * 0.05, hc.z + hz * 0.92);
    o.put('Head', new THREE.CapsuleGeometry(hz * 0.09, hx * 1.0, 4, 8).rotateZ(Math.PI / 2), 'matte', 0x2a2a22, hc.x, hc.y + hy * 0.2, hc.z + hz * 0.88);
    if (hat) {
      // Woven straw hat (douli), weathered and torn.
      const hatGeo = new THREE.ConeGeometry(0.34, 0.15, 28, 3, true);
      tint(hatGeo, (p, c) => c.setHex(0x9a7a48).multiplyScalar(0.75 + 0.25 * Math.abs(Math.sin(Math.atan2(p.x, p.z) * 18))));
      o.put('Head', hatGeo, 'cloth', null, hc.x, hc.y + hy * 0.95, hc.z);
    } else {
      // Bald pate with a corrupted third eye.
      o.put('Head', new THREE.SphereGeometry(hz * 0.09, 10, 8), 'glow', 0xff4030, hc.x, hc.y + hy * 0.42, hc.z + hz * 0.95);
    }
    // Prayer beads.
    const neck = r.pos('neck_01');
    const beads: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      beads.push(new THREE.SphereGeometry(0.022, 8, 6).translate(neck.x + Math.sin(a) * 0.15, neck.y - 0.08 - Math.max(0, Math.cos(a)) * 0.1, neck.z + Math.cos(a) * 0.13));
    }
    for (const b of beads) o.put('spine_03', b, 'matte', 0x3a2414);
    // Diagonal kasaya over one shoulder.
    const s3 = r.boxes.get('spine_03')!;
    o.put('spine_03', new THREE.TorusGeometry(1, 0.09, 8, 28).scale(0.19, 0.3, 0.15), 'cloth', 0x6a1a12, 0, (s3.min.y + s3.max.y) / 2 - 0.05, -0.02, 0, 0, 0.6);
    o.put('pelvis', band(pw * 1.1, pd * 1.25, 0.03), 'cloth', 0x3a2a1a, 0, waist, pz);
    // Long, ragged robe skirt with grime rising from the hem.
    kilt(o, {
      top: waist - 0.02, hem: 0.2, radius: Math.max(pw, pd) * 1.12, flare: 0.12, z: pz * 0.5, panels: 10, ragged: 0.09,
      color: (p, c) => {
        c.setHex(0xa0581e).lerp(new THREE.Color(0x2a1c10), THREE.MathUtils.clamp(1 - (p.y - 0.15) / 0.6, 0, 1) * 0.8);
        c.multiplyScalar(0.85 + 0.15 * hashNoise(p.x * 40, p.y * 40, p.z * 40));
      },
    });
  };
}

export function buildMonk(variant: number): Character {
  const hat = variant % 2 === 0;
  return buildCharacter(hat ? 'monkHat' : 'monkBald', monkPainter(hat ? 0x7c8468 : 0x8a8a74, 0x8a4a1c), monkDesign(hat));
}

// ---------------------------------------------------------------------------
// Web Weaver: spider witch with six legs sprouting from her back
// ---------------------------------------------------------------------------

const weaverPainter: BodyPainter = (bone, p, c) => {
  if (bone === 'Head' || bone === 'neck_01' || bone.startsWith('lowerarm') || isHand(bone)) c.setHex(0xcfc0b4);
  else c.setHex(0x3a2340).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 60));
};

function weaverDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  // Four red spider eyes, black hair with a gold pin.
  for (const [ex, ey, s] of [[-0.36, 0.05, 0.11], [0.36, 0.05, 0.11], [-0.2, 0.28, 0.07], [0.2, 0.28, 0.07]] as const) {
    o.put('Head', new THREE.SphereGeometry(hz * s, 10, 8), 'glow', 0xff3040, hc.x + ex * hx, hc.y + ey * hy, hc.z + hz * 0.93);
  }
  o.put('Head', roughen(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(-0.5).scale(hx * 1.15, hy * 0.95, hz * 1.12), 0.006, 60), 'matte', 0x141016, hc.x, hc.y + hy * 0.15, hc.z - hz * 0.05);
  o.put('Head', new THREE.SphereGeometry(hz * 0.5, 14, 10), 'matte', 0x141016, hc.x, hc.y + hy * 0.6, hc.z - hz * 0.9);
  o.put('Head', new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).rotateZ(Math.PI / 2 - 0.3), 'metal', 0xd29a36, hc.x, hc.y + hy * 0.62, hc.z - hz * 0.9);
  // Spiked collar and a long web-patterned gown.
  const neck = r.pos('neck_01');
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.4;
    o.put('spine_03', new THREE.ConeGeometry(0.03, 0.2, 5), 'matte', 0x1a1016, neck.x + Math.sin(a) * 0.15, neck.y + 0.03, neck.z - Math.cos(a) * 0.12, -Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6);
  }
  o.put('pelvis', band(pw * 1.1, pd * 1.25, 0.025), 'metal', 0x8a6a2a, 0, waist, pz);
  kilt(o, {
    top: waist - 0.02, hem: 0.04, radius: Math.max(pw, pd) * 1.1, flare: 0.2, z: pz * 0.5, panels: 12, ragged: 0.05,
    color: (p, c) => {
      const a = Math.atan2(p.x, p.z);
      const web = Math.abs(Math.sin(a * 9)) < 0.08 || Math.abs(Math.sin(p.y * 22 + Math.cos(a * 9) * 0.6)) < 0.06;
      c.setHex(web ? 0xb8a8c8 : 0x2e1c36);
    },
  });
}

export interface WeaverRig {
  character: Character;
  legs: THREE.Object3D[];
}

export function buildWeaver(): WeaverRig {
  const ch = buildCharacter('weaver', weaverPainter, weaverDesign);
  const s2 = ch.rest.boxes.get('spine_02')!;
  const legGeo = tint(taperedTube([V(0, 0, 0), V(0, 0.25, -0.15), V(0, 0.4, -0.45), V(0, 0.1, -0.85)], 0.03, 0.008, 20, 6),
    (p, c) => c.setHex(Math.sin(p.z * 30) > 0.6 ? 0x8a1010 : 0x181216));
  const legs: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, k = i % 3;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, (s2.min.y + s2.max.y) / 2 + 0.08 - k * 0.07, s2.min.z + 0.02);
    pivot.rotation.set(0, side * (0.7 + k * 0.45), 0);
    const leg = new THREE.Mesh(legGeo, ch.mats.matte);
    leg.castShadow = true;
    pivot.add(leg);
    ch.attach('spine_02', pivot);
    pivot.userData.base = pivot.rotation.clone();
    legs.push(pivot);
  }
  return { character: ch, legs };
}

// ---------------------------------------------------------------------------
// Blackfeather Lord: crow demon with a jade spear and great wings
// ---------------------------------------------------------------------------

const crowPainter: BodyPainter = (bone, p, c) => {
  const n = hashNoise(p.x * 50, p.y * 50, p.z * 50);
  if (isHand(bone)) c.setHex(0x5a5a50);
  else if (bone === 'pelvis' || bone.startsWith('thigh') || bone.startsWith('calf')) c.setHex(0x2a1a26);
  else c.setHex(0x1c1c24).multiplyScalar(0.8 + 0.3 * n);
};

function crowDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  const feather = mottle(0x1a1a24, 0x0a0a10, 0.3, 40);
  // Crow head: feathered skull, long beak, jade eyes, swept crest.
  o.put('Head', tint(roughen(new THREE.SphereGeometry(1, 20, 14).scale(hx * 1.15, hy * 0.95, hz * 1.05), 0.01, 50), feather), 'matte', null, hc.x, hc.y + hy * 0.05, hc.z);
  o.put('Head', new THREE.ConeGeometry(hx * 0.42, hz * 2.2, 12).rotateX(Math.PI / 2).scale(1, 0.75, 1), 'metal', 0x8a7a48, hc.x, hc.y - hy * 0.12, hc.z + hz * 1.9);
  for (const sx of [-1, 1]) o.put('Head', new THREE.SphereGeometry(hz * 0.13, 10, 8), 'glow', 0x5dff8a, hc.x + sx * hx * 0.55, hc.y + hy * 0.12, hc.z + hz * 0.72);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * hx * 0.25;
    o.put('Head', taperedTube([V(x, 0, 0), V(x * 1.2, 0.12, -0.12), V(x * 1.4, 0.18, -0.4)], 0.014, 0.003, 10, 5), 'matte', 0x2a2a3a, hc.x, hc.y + hy * 0.7, hc.z - hz * 0.2);
  }
  // Feather mantle: three rings of hanging feather cards.
  const neck = r.pos('neck_01');
  const card = new THREE.PlaneGeometry(0.07, 0.24, 1, 3).translate(0, -0.12, 0);
  for (let ring = 0; ring < 3; ring++) {
    const n = 16 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.16 + ring * 0.05;
      o.put('spine_03', tint(card.clone(), feather), 'cloth', null, neck.x + Math.sin(a) * rr * 1.25, neck.y - ring * 0.07, neck.z + Math.cos(a) * rr, 0.35 + ring * 0.15, a, 0);
    }
  }
  // Bronze breastplate with gold trim.
  const s2 = r.boxes.get('spine_02')!, s3 = r.boxes.get('spine_03')!;
  const cw = (s2.max.x - s2.min.x) / 2, cy = (s2.min.y + s3.max.y) / 2 - 0.06;
  o.put('spine_03', new THREE.CylinderGeometry(1, 0.92, 0.28, 24, 1, true).scale(cw * 1.14, 1, 0.16), 'metal', 0x3a3a30, 0, cy, -0.02);
  o.put('spine_03', band(cw * 1.15, 0.165, 0.014), 'metal', 0xc89a3a, 0, cy + 0.14, -0.02);
  o.put('pelvis', band(pw * 1.12, pd * 1.3, 0.03), 'metal', 0xc89a3a, 0, waist, pz);
  // Shoulder feather fans.
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    const sp = r.pos(`upperarm_${side}`);
    for (let i = 0; i < 6; i++) {
      o.put(`upperarm_${side}`, tint(card.clone().scale(1.3, 1.2, 1), feather), 'cloth', null, sp.x + sx * (0.04 + i * 0.03), sp.y + 0.06, sp.z - 0.06 + i * 0.025, 0.2, 0, -sx * (0.4 + i * 0.12));
    }
  }
  // Long robe to the ankles with a gold hem stripe.
  kilt(o, {
    top: waist - 0.02, hem: 0.1, radius: Math.max(pw, pd) * 1.15, flare: 0.16, z: pz * 0.5, panels: 12, ragged: 0.06,
    color: (p, c) => c.setHex(p.y < 0.2 ? 0xa88030 : 0x2a1824).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 70)),
  });
  // Jade-bladed spear, along the fist's +Z grip axis.
  const hp = r.pos('hand_r');
  const gx = hp.x - 0.08;
  o.put('hand_r', new THREE.CylinderGeometry(0.022, 0.022, 2.0, 10).rotateX(Math.PI / 2), 'matte', 0x24160e, gx, hp.y, hp.z + 0.35);
  o.put('hand_r', new THREE.ConeGeometry(0.06, 0.42, 4).rotateX(Math.PI / 2).scale(1, 0.35, 1), 'glow', 0x46e08a, gx, hp.y, hp.z + 1.55);
  o.put('hand_r', new THREE.TorusGeometry(0.045, 0.012, 6, 14), 'metal', 0xc89a3a, gx, hp.y, hp.z + 1.32);
}

export interface CrowRig {
  character: Character;
  wingL: THREE.Group;
  wingR: THREE.Group;
}

export function buildCrowLord(): CrowRig {
  const ch = buildCharacter('crow', crowPainter, crowDesign);
  const s3 = ch.rest.boxes.get('spine_03')!;
  const wingCard = new THREE.PlaneGeometry(0.16, 1, 1, 4);
  const wing = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.08, s3.max.y - 0.08, s3.min.z - 0.02);
    const feathers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = 0.15 + i * 0.17;
      const len = 1.25 - Math.abs(i - 3) * 0.08;
      const f = wingCard.clone().scale(1, len, 1).translate(0, len / 2, 0).rotateZ(-sx * a).translate(sx * i * 0.04, 0, -i * 0.012);
      feathers.push(tint(f, mottle(0x1a1a26, 0x05050a, 0.3, 30)));
    }
    const m = new THREE.Mesh(mergeGeometries(feathers)!, ch.mats.cloth);
    m.castShadow = true;
    m.rotation.x = -0.35;
    g.add(m);
    ch.attach('spine_03', g);
    return g;
  };
  return { character: ch, wingL: wing(1), wingR: wing(-1) };
}
