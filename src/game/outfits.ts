import * as THREE from 'three';
import { ARMOR_DEFAULT, BOOT_LOOK, CHEST_LOOK, GLOVE_LOOK, WEAPON_LOOK } from './gearlook';
import { baseIndex, RARITY_HEX, type Item, type Slot } from './loot';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildCharacter, getRest, hashNoise, kilt, mottle, smoothNoise, taperedTube, tint, withRim,
  type BodyPainter, type Character, type Look, type Outfit, type PartSpec, type Rest,
} from './characters';

/**
 * Character designs. Each one is a real skinned body (Quaternius Universal Base Characters) dressed in
 * modular outfit pieces and hair, recoloured per design, plus a few bespoke sculpted accessories (muzzles,
 * crowns, beaks, wings) where the source packs have nothing that fits.
 */

const isHand = (b: string) => /hand|thumb|index|middle|ring|pinky/.test(b);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Head measurements from the rest pose: centre, half width (x), half depth (z), half height. */
function headFrame(r: Rest) {
  const hb = r.boxes.get('Head')!;
  const c = hb.getCenter(new THREE.Vector3());
  return { c, hx: (hb.max.x - hb.min.x) / 2, hz: (hb.max.z - hb.min.z) / 2, hy: (hb.max.y - hb.min.y) / 2, top: hb.max.y, front: hb.max.z };
}

function pelvisFrame(r: Rest) {
  const pb = r.boxes.get('pelvis')!;
  return { pw: (pb.max.x - pb.min.x) / 2, pd: (pb.max.z - pb.min.z) / 2, waist: pb.max.y - 0.02, back: pb.min.z, cz: pb.getCenter(new THREE.Vector3()).z };
}

/** Elliptical band round the body (belts, rims, sashes): radii rx/rz, tube thickness t. */
function band(rx: number, rz: number, t: number, seg = 32) {
  return new THREE.TorusGeometry(1, t / rx, 8, seg).rotateX(Math.PI / 2).scale(rx, rx, rz);
}

/** Smooth ellipsoid, optionally lumpy (organic shapes: muzzles, brows, fur). */
function blob(rx: number, ry: number, rz: number, lump = 0, freq = 8, w = 24, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  if (lump) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 1 + lump * smoothNoise(x * freq + 11, y * freq + 3, z * freq + 7);
      pos.setXYZ(i, x * k, y * k, z * k);
    }
  }
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
}

/** Furry shell: a lumpy ellipsoid with tufts pulled out along the surface (manes, ruffs, caps). */
function furMass(rx: number, ry: number, rz: number, tufts = 0.25, base: number, dark: number) {
  return tint(blob(rx, ry, rz, tufts, 6, 32, 20), (p, c) => {
    const n = smoothNoise(p.x * 60, p.y * 60, p.z * 60);
    c.setHex(base).lerp(new THREE.Color(dark), 0.35 + 0.35 * n);
  });
}

/** Fur painter with smooth mottling (dye target colours; the skin texture adds the muscle shading). */
function furPaint(base: number, dark: number, amount = 0.35, freq = 25) {
  const d = new THREE.Color(dark);
  return (p: THREE.Vector3, c: THREE.Color) => c.setHex(base).lerp(d, amount * (0.5 + 0.5 * smoothNoise(p.x * freq, p.y * freq, p.z * freq)));
}

// ---------------------------------------------------------------------------
// The Destined One
// ---------------------------------------------------------------------------

const FUR = 0x5e3c22;
const FUR_DARK = 0x2e1c10;
const FACE = 0xc8946a;
const GOLD = 0xd29a36;

function heroPainter(r: Rest): BodyPainter {
  const { c: hc, hx, hz, hy } = headFrame(r);
  const fur = furPaint(FUR, FUR_DARK, 0.45, 22);
  return (bone, p, c) => {
    if (bone === 'Head' || bone === 'neck_01') {
      // Bare heart-shaped face mask around the eyes and mouth; fur everywhere else.
      const dx = (p.x - hc.x) / hx, dy = (p.y - hc.y) / hy;
      const front = p.z > hc.z + hz * 0.3;
      if (front && Math.abs(dx) < 0.78 - Math.max(0, dy) * 0.5 && dy < 0.32 && dy > -0.95) c.setHex(FACE);
      else fur(p, c);
    } else if (isHand(bone)) {
      c.setHex(0x3a2a20);
    } else if (bone.startsWith('foot') || bone.startsWith('ball')) {
      c.setHex(0x3a2a20);
    } else if (bone.startsWith('spine') && p.z > 0.06 && Math.abs(p.x) < 0.11) {
      // Paler chest fur.
      fur(p, c);
      c.lerp(new THREE.Color(0x9a7450), 0.45);
    } else fur(p, c);
  };
}

function heroDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy, front } = headFrame(r);
  const furCol = (p: THREE.Vector3, c: THREE.Color) => c.setHex(FUR).lerp(new THREE.Color(FUR_DARK), 0.35 + 0.3 * smoothNoise(p.x * 70, p.y * 70, p.z * 70));
  // Muzzle: a broad, protruding snout over the mouth, with nostrils and a mouth line.
  const mz = front - hz * 0.12;
  o.put('Head', tint(blob(hx * 0.6, hy * 0.32, hz * 0.42), (p, c) => c.setHex(0xd9a67c).lerp(new THREE.Color(0xb07a58), Math.max(0, -p.y / (hy * 0.32)) * 0.4)), 'matte', null, hc.x, hc.y - hy * 0.42, mz);
  for (const sx of [-1, 1]) o.put('Head', blob(hx * 0.07, hy * 0.035, hz * 0.05, 0, 8, 10, 8), 'matte', 0x24140c, hc.x + sx * hx * 0.12, hc.y - hy * 0.3, mz + hz * 0.39);
  o.put('Head', new THREE.CapsuleGeometry(hy * 0.022, hx * 0.62, 4, 10).rotateZ(Math.PI / 2), 'matte', 0x4a2418, hc.x, hc.y - hy * 0.56, mz + hz * 0.36);
  // Heavy brow ridge and furrowed brow.
  o.put('Head', tint(blob(hx * 0.78, hy * 0.11, hz * 0.2, 0.08, 6), furCol), 'matte', null, hc.x, hc.y + hy * 0.24, front - hz * 0.2);
  // Ears set wide, with pale insides.
  for (const sx of [-1, 1]) {
    o.put('Head', tint(blob(hx * 0.14, hy * 0.26, hz * 0.26), (p, c) => c.setHex(sx * p.x > 0.0 ? FUR : 0xd8a07a)), 'matte', null, hc.x + sx * hx * 1.04, hc.y + hy * 0.02, hc.z - hz * 0.05, 0, sx * 0.5, 0);
  }
  // Fur cap and cheek ruff framing the face (the iconic mane).
  o.put('Head', furMass(hx * 1.08, hy * 0.62, hz * 1.02, 0.22, FUR, FUR_DARK), 'matte', null, hc.x, hc.y + hy * 0.52, hc.z - hz * 0.12);
  o.put('Head', furMass(hx * 1.1, hy * 0.85, hz * 0.7, 0.25, FUR, FUR_DARK), 'matte', null, hc.x, hc.y - hy * 0.05, hc.z - hz * 0.42);
  for (const sx of [-1, 1]) {
    o.put('Head', furMass(hx * 0.32, hy * 0.5, hz * 0.4, 0.35, 0x8a6440, FUR_DARK), 'matte', null, hc.x + sx * hx * 0.82, hc.y - hy * 0.42, hc.z + hz * 0.25, 0, 0, sx * 0.35);
  }
  // Golden circlet (the headband) with a jewel at the brow.
  o.put('Head', new THREE.TorusGeometry(1, 0.06, 10, 40).rotateX(Math.PI / 2 - 0.12).scale(hx * 1.1, hx * 1.1, hz * 1.05), 'metal', GOLD, hc.x, hc.y + hy * 0.42, hc.z - hz * 0.02);
  o.put('Head', new THREE.OctahedronGeometry(hy * 0.09, 0).scale(0.8, 1.2, 0.5), 'glow', 0xff4a2a, hc.x, hc.y + hy * 0.5, front + hz * 0.0);

  // Tiger-skin kilt over the trousers, and a red sash belt.
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  kilt(o, {
    top: waist - 0.02, hem: 0.6, radius: Math.max(pw, pd) * 1.2, flare: 0.08, z: pz * 0.5, panels: 12, ragged: 0.035,
    color: (p, c) => {
      const stripe = Math.sin(p.y * 48 + Math.sin(p.x * 26 + p.z * 20) * 2.2) > 0.45;
      c.setHex(stripe ? 0x2a1a10 : 0xc27a30);
      if (p.y < 0.66) c.setHex(0xd8c8a8);
      c.multiplyScalar(0.9 + 0.1 * hashNoise(p.x * 50, p.y * 50, p.z * 50));
    },
  });
  const sashTint = (p: THREE.Vector3, c: THREE.Color) => c.setHex(0x8e2a1e).multiplyScalar(0.85 + 0.15 * Math.sin(p.x * 80 + p.y * 40));
  o.put('pelvis', tint(new THREE.TorusGeometry(1, 0.3, 10, 32).rotateX(Math.PI / 2).scale(pw * 1.2, 0.12, pd * 1.38), sashTint), 'cloth', null, 0, waist + 0.02, pz);
  o.put('pelvis', band(pw * 1.26, pd * 1.45, 0.016), 'metal', GOLD, 0, waist - 0.025, pz);
}

/** Visible gear: outfit pieces per equipped item design (index = base design in loot.ts). */
const CHEST_PARTS: ((c: number) => PartSpec[])[] = [
  // Leather Vest: the ranger tunic with its cloth turned to leather.
  (c) => [{ name: 'Ranger_Body', dye: c, only: 'green' }, { name: 'Ranger_Body_Belt_1' }],
  // Scale Chestplate: steel tunic and pauldron.
  (c) => [{ name: 'Ranger_Body', dye: c }, { name: 'Ranger_Acc_Pauldron', dye: 0x9aa4b0 }, { name: 'Ranger_Body_Belt_1' }],
  // Doom Chestplate: black plate, blood-red trim, both belts.
  (c) => [{ name: 'Ranger_Body', dye: c }, { name: 'Ranger_Acc_Pauldron', dye: 0x5a1010 }, { name: 'Ranger_Body_Belt_1', dye: 0x3a2a2a }, { name: 'Ranger_Body_Belt_2', dye: 0x3a2a2a }],
  // Monk Robe: saffron shirt with sleeves.
  (c) => [{ name: 'Peasant_Body', dye: c }, { name: 'Peasant_Arms', dye: c }],
];
const GLOVE_PARTS = (c: number): PartSpec[] => [{ name: 'Ranger_Arms_Bracer', dye: c }];
const BOOT_PARTS = (i: number, c: number): PartSpec[] => i === 0 ? [{ name: 'Peasant_Feet', dye: c }] : [{ name: 'Ranger_Feet', dye: c }];

export interface HeroRig {
  character: Character;
  root: THREE.Group;
  /** Holds the character; spun or offset for whole-body effects (whirlwind). */
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
  staffMat: THREE.MeshPhongMaterial;
  /** Staff caps; pulses with Focus and charge. */
  goldMat: THREE.MeshPhongMaterial;
  /** Shows the equipped gear on the hero: outfit pieces per slot, staff design, relic charm. */
  applyGear(equipped: Partial<Record<Slot, Item>>): void;
}

function heroLook(r: Rest, eq: Partial<Record<Slot, Item>>): { key: string; look: Look } {
  const parts: PartSpec[] = [];
  const c = eq.chest, g = eq.gloves, b = eq.boots;
  const ci = c ? baseIndex(c) % CHEST_LOOK.length : -1;
  const gi = g ? baseIndex(g) % GLOVE_LOOK.length : -1;
  const bi = b ? baseIndex(b) % BOOT_LOOK.length : -1;
  // Dark red trousers always; the rest comes from the equipment.
  parts.push({ name: 'Peasant_Legs', dye: 0x4a1d18 });
  if (ci >= 0) parts.push(...CHEST_PARTS[ci](CHEST_LOOK[ci]));
  if (gi >= 0) parts.push(...GLOVE_PARTS(GLOVE_LOOK[gi]));
  if (bi >= 0) parts.push(...BOOT_PARTS(bi, BOOT_LOOK[bi]));
  return {
    key: `hero|${ci}|${gi}|${bi}`,
    look: { body: 'male', painter: heroPainter(r), eyes: 0xffc850, brows: false, parts },
  };
}

export function buildHero(): HeroRig {
  const start = heroLook(getRest('male'), {});
  const ch = buildCharacter(start.key, start.look, heroDesign);
  const r = ch.rest;
  const { c: hc, hx, hz, hy } = headFrame(r);
  const { pw, waist, back, cz: pz, pd } = pelvisFrame(r);
  const mats = ch.mats;

  // Pheasant plumes rising from the circlet (sway in code).
  const feathers = new THREE.Group();
  feathers.position.set(hc.x, hc.y + hy * 0.5, hc.z + hz * 0.7);
  for (const sx of [-1, 1]) {
    const pts = [V(sx * hx * 0.4, 0, 0), V(sx * 0.07, 0.28, 0.06), V(sx * 0.2, 0.62, -0.18), V(sx * 0.36, 0.82, -0.55), V(sx * 0.48, 0.84, -0.86)];
    const geo = tint(taperedTube(pts, 0.016, 0.003, 26, 6), (p, c) => c.setHex(Math.sin(p.y * 46 - p.z * 30) > 0.25 ? 0x2a120c : 0xb8442a));
    feathers.add(new THREE.Mesh(geo, mats.matte));
  }
  ch.attach('Head', feathers);

  // Tail and sash tails trail behind movement.
  const tail = new THREE.Group();
  tail.position.set(0, waist - 0.11, back + 0.02);
  const tailGeo = taperedTube([V(0, 0, 0), V(0, -0.16, -0.14), V(0.04, -0.24, -0.42), V(0.1, -0.05, -0.68), V(0.14, 0.25, -0.76), V(0.12, 0.38, -0.66)], 0.04, 0.014, 34, 10);
  const tp = tailGeo.getAttribute('position'), tn = tailGeo.getAttribute('normal');
  for (let i = 0; i < tp.count; i++) {
    const k = 0.006 * smoothNoise(tp.getX(i) * 90, tp.getY(i) * 90, tp.getZ(i) * 90);
    tp.setXYZ(i, tp.getX(i) + tn.getX(i) * k, tp.getY(i) + tn.getY(i) * k, tp.getZ(i) + tn.getZ(i) * k);
  }
  tailGeo.computeVertexNormals();
  tail.add(new THREE.Mesh(tint(tailGeo, mottle(FUR, FUR_DARK, 0.2, 40)), mats.matte));
  ch.attach('pelvis', tail);
  const sashes: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * pw * 0.7, waist, back - 0.03);
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
  gourdHip.position.set(pw * 1.3, waist - 0.28, pz + 0.03);
  gourdHip.rotation.z = 0.25;
  ch.attach('pelvis', gourdHip);
  const hp = r.pos('hand_r');
  const gourdHand = new THREE.Mesh(gourdGeo, mats.matte);
  gourdHand.position.set(hp.x - 0.08, hp.y - 0.1, hp.z + 0.04);
  gourdHand.visible = false;
  ch.attach('hand_r', gourdHand);

  // Ruyi Jingu Bang, built along +Z (the fist's grip axis at rest).
  const staffMat = withRim(new THREE.MeshPhongMaterial({ color: 0x2a1410, shininess: 50, specular: 0x5a3a2a }), 0.3);
  const goldMat = withRim(new THREE.MeshPhongMaterial({ color: GOLD, shininess: 90, specular: 0xffe0a0, emissive: 0x5a3200, emissiveIntensity: 0.25 }), 0.4);
  const makeStaff = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 2.1, 12).rotateX(Math.PI / 2).translate(0, 0, 0.5), staffMat));
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
  staffBack.position.set(0.25, (s3.min.y + s3.max.y) / 2 - 0.15, s3.min.z - 0.08);
  staffBack.rotation.set(-Math.PI / 2, 0, 0);
  staffBack.rotateY(0.85);
  staffBack.visible = false;
  ch.attach('spine_03', staffBack);
  for (const s of [staff, staffBack, gourdHip, gourdHand]) s.traverse((m) => (m.castShadow = true));

  const model = new THREE.Group();
  model.add(ch.model);
  const root = new THREE.Group();
  root.add(model);

  // Relic charm on the belt.
  const relicMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const relic = new THREE.Group();
  relic.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), relicMat));
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 5).translate(0, 0.06, 0), new THREE.MeshBasicMaterial({ color: 0xc82a2a }));
  relic.add(cord);
  relic.position.set(-0.13, waist - 0.09, pd + pz + 0.06);
  ch.attach('pelvis', relic);

  let lastKey = start.key;
  const applyGear = (eq: Partial<Record<Slot, Item>>) => {
    const w = eq.weapon, rl = eq.relic;
    // Staff: shaft and cap colours follow the weapon design; rarity makes the caps glow.
    const wl = w ? WEAPON_LOOK[baseIndex(w) % WEAPON_LOOK.length] : { shaft: 0x2a1410, cap: GOLD, r: 0.026 };
    staffMat.color.setHex(wl.shaft);
    goldMat.color.setHex(wl.cap);
    goldMat.emissive.setHex(w ? RARITY_HEX[w.rarity] : 0x5a3200);
    goldMat.emissiveIntensity = w ? 0.25 + w.rarity * 0.18 : 0.25;
    for (const s of [staff, staffBack]) s.scale.set(wl.r / 0.026 > 1.6 ? 1.6 : Math.max(1, wl.r / 0.04), Math.max(1, wl.r / 0.04), 1);
    // Armour pieces: re-dress only when the visible set changes.
    const { key, look } = heroLook(r, eq);
    if (key !== lastKey) {
      ch.dress(key, look, heroDesign);
      lastKey = key;
    }
    // Rare chests and gloves shimmer in their rarity colour.
    const best = Math.max(eq.chest?.rarity ?? 0, eq.gloves?.rarity ?? 0, eq.boots?.rarity ?? 0);
    for (const m of ch.mats.tex.values()) {
      m.emissive.setHex(best >= 3 ? RARITY_HEX[best] : 0x000000);
      m.emissiveIntensity = best >= 3 ? 0.05 : 0;
    }
    ch.mats.armor.color.setHex(ARMOR_DEFAULT);
    relic.visible = !!rl;
    if (rl) relicMat.color.setHex(RARITY_HEX[rl.rarity]);
  };
  applyGear({});
  return { character: ch, root, model, staff, staffBack, staffTip, staffMid, gourdHip, gourdHand, tail, sashes, feathers, staffMat, goldMat, applyGear };
}

// ---------------------------------------------------------------------------
// Shared bits for the enemy designs
// ---------------------------------------------------------------------------

const phong = (color: number, shin = 40, spec = 0x555555) => withRim(new THREE.MeshPhongMaterial({ color, shininess: shin, specular: spec }), 0.4);

/** A weapon built along +Z in the fist (like the hero's staff), parented to hand_r or hand_l. */
function heldItem(ch: Character, bone: 'hand_r' | 'hand_l', build: (g: THREE.Group) => void) {
  const g = new THREE.Group();
  build(g);
  const hp = ch.rest.pos(bone);
  g.position.copy(hp).add(V(bone === 'hand_r' ? -0.08 : 0.08, 0, 0));
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  ch.attach(bone, g);
  return g;
}

/** Glowing eyes over the base eyes (undead and demons). */
function glowEyes(o: Outfit, r: Rest, color: number, size = 0.11) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  for (const sx of [-1, 1]) o.put('Head', new THREE.SphereGeometry(hz * size, 10, 8), 'glow', color, hc.x + sx * hx * 0.34, hc.y + hy * 0.12, hc.z + hz * 0.86);
}

// ---------------------------------------------------------------------------
// Undead monk (melee): rotting skin, tattered saffron robe, prayer beads
// ---------------------------------------------------------------------------

const monkPainter = (skin: number): BodyPainter => (bone, p, c) => {
  const n = smoothNoise(p.x * 30, p.y * 30, p.z * 30);
  c.setHex(skin).multiplyScalar(0.85 + 0.2 * n);
  if (n > 0.45) c.lerp(new THREE.Color(0x3a3a24), 0.5); // rot blotches
  if (isHand(bone)) c.multiplyScalar(0.8);
};

function monkDesign(hat: boolean) {
  return (o: Outfit, r: Rest) => {
    const { c: hc, hz, hy, top } = headFrame(r);
    const { pw, pd, waist, cz: pz } = pelvisFrame(r);
    glowEyes(o, r, 0x9dff6a, 0.09);
    if (hat) {
      // Woven straw hat (douli), weathered and torn.
      const hatGeo = new THREE.ConeGeometry(0.36, 0.16, 32, 3, true);
      tint(hatGeo, (p, c) => c.setHex(0x9a7a48).multiplyScalar(0.75 + 0.25 * Math.abs(Math.sin(Math.atan2(p.x, p.z) * 18))));
      o.put('Head', hatGeo, 'cloth', null, hc.x, top + 0.03, hc.z);
    } else {
      // Bald pate with a corrupted third eye.
      o.put('Head', new THREE.SphereGeometry(hz * 0.08, 10, 8), 'glow', 0xff4030, hc.x, hc.y + hy * 0.45, hc.z + hz * 0.97);
    }
    // Prayer beads.
    const neck = r.pos('neck_01');
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      o.put('spine_03', new THREE.SphereGeometry(0.022, 8, 6), 'matte', 0x3a2414, neck.x + Math.sin(a) * 0.16, neck.y - 0.09 - Math.max(0, Math.cos(a)) * 0.12, neck.z + Math.cos(a) * 0.14);
    }
    o.put('pelvis', band(pw * 1.22, pd * 1.4, 0.03), 'cloth', 0x3a2a1a, 0, waist, pz);
    // Long, ragged robe skirt with grime rising from the hem.
    kilt(o, {
      top: waist - 0.02, hem: 0.22, radius: Math.max(pw, pd) * 1.25, flare: 0.12, z: pz * 0.5, panels: 12, ragged: 0.09,
      color: (p, c) => {
        c.setHex(0xa0581e).lerp(new THREE.Color(0x2a1c10), THREE.MathUtils.clamp(1 - (p.y - 0.15) / 0.6, 0, 1) * 0.8);
        c.multiplyScalar(0.85 + 0.15 * hashNoise(p.x * 40, p.y * 40, p.z * 40));
      },
    });
  };
}

export function buildMonk(variant: number): Character {
  const hat = variant % 2 === 0;
  return buildCharacter(hat ? 'monkHat' : 'monkBald', {
    body: 'male', painter: monkPainter(hat ? 0x8a9070 : 0x9a9a80), eyes: 0x506040, brows: 0x403a30,
    parts: [
      { name: 'Peasant_Body', dye: 0x9a4a16 }, { name: 'Peasant_Arms', dye: 0x8a4214 },
      { name: 'Peasant_Legs', dye: 0x3a2a1a }, ...(hat ? [] : [{ name: 'Hair_Beard', tint: 0x4a4436 }]),
    ],
  }, monkDesign(hat));
}

// ---------------------------------------------------------------------------
// Web Weaver: spider witch with six legs sprouting from her back
// ---------------------------------------------------------------------------

function weaverDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  // Four red spider eyes, gold hairpin.
  for (const [ex, ey, s] of [[-0.34, 0.12, 0.09], [0.34, 0.12, 0.09], [-0.18, 0.36, 0.06], [0.18, 0.36, 0.06]] as const) {
    o.put('Head', new THREE.SphereGeometry(hz * s, 10, 8), 'glow', 0xff3040, hc.x + ex * hx, hc.y + ey * hy, hc.z + hz * 0.88);
  }
  o.put('Head', new THREE.CylinderGeometry(0.007, 0.007, 0.36, 6).rotateZ(Math.PI / 2 - 0.3), 'metal', 0xd29a36, hc.x, hc.y + hy * 0.75, hc.z - hz * 0.7);
  // Spiked collar and a long web-patterned gown.
  const neck = r.pos('neck_01');
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.4;
    o.put('spine_03', new THREE.ConeGeometry(0.025, 0.2, 6), 'matte', 0x1a1016, neck.x + Math.sin(a) * 0.14, neck.y + 0.02, neck.z - Math.cos(a) * 0.1, -Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6);
  }
  o.put('pelvis', band(pw * 1.15, pd * 1.3, 0.022), 'metal', 0x8a6a2a, 0, waist, pz);
  kilt(o, {
    top: waist - 0.02, hem: 0.04, radius: Math.max(pw, pd) * 1.15, flare: 0.22, z: pz * 0.5, panels: 14, ragged: 0.05,
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
  const ch = buildCharacter('weaver', {
    body: 'female', skin: 0xd8c8c0, eyes: 0xff4050, brows: 0x141016,
    parts: [
      { name: 'Peasant_Body', dye: 0x3a2048 }, { name: 'Peasant_Arms', dye: 0x2a1836 },
      { name: 'Hair_Buns', tint: 0x1a141c }, { name: 'Peasant_Feet', dye: 0x1a1016 },
    ],
  }, weaverDesign);
  const s2 = ch.rest.boxes.get('spine_02')!;
  const legGeo = tint(taperedTube([V(0, 0, 0), V(0, 0.25, -0.15), V(0, 0.4, -0.45), V(0, 0.1, -0.85)], 0.03, 0.008, 20, 8),
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
  const n = smoothNoise(p.x * 40, p.y * 40, p.z * 40);
  if (isHand(bone)) c.setHex(0x5a5a50);
  else c.setHex(0x22222c).multiplyScalar(0.8 + 0.3 * n);
};

function crowDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  const feather = mottle(0x1a1a24, 0x0a0a10, 0.3, 40);
  // Crow head: feathered skull, long hooked beak, jade eyes, swept crest.
  o.put('Head', tint(blob(hx * 1.12, hy * 0.95, hz * 1.08, 0.12, 7), feather), 'matte', null, hc.x, hc.y + hy * 0.05, hc.z);
  const beak = new THREE.ConeGeometry(hx * 0.42, hz * 2.0, 16).rotateX(Math.PI / 2).scale(1, 0.72, 1);
  const bp = beak.getAttribute('position');
  for (let i = 0; i < bp.count; i++) { const z = bp.getZ(i); bp.setY(i, bp.getY(i) - Math.max(0, z) * Math.max(0, z) * 1.6); }
  beak.computeVertexNormals();
  o.put('Head', beak, 'metal', 0x8a7a48, hc.x, hc.y - hy * 0.12, hc.z + hz * 1.8);
  for (const sx of [-1, 1]) o.put('Head', new THREE.SphereGeometry(hz * 0.12, 10, 8), 'glow', 0x5dff8a, hc.x + sx * hx * 0.55, hc.y + hy * 0.12, hc.z + hz * 0.78);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * hx * 0.25;
    o.put('Head', taperedTube([V(x, 0, 0), V(x * 1.2, 0.12, -0.12), V(x * 1.4, 0.2, -0.42)], 0.016, 0.003, 12, 6), 'matte', 0x2a2a3a, hc.x, hc.y + hy * 0.7, hc.z - hz * 0.2);
  }
  // Feather mantle: three rings of hanging feather cards.
  const neck = r.pos('neck_01');
  const card = new THREE.PlaneGeometry(0.07, 0.24, 1, 3).translate(0, -0.12, 0);
  for (let ring = 0; ring < 3; ring++) {
    const n = 16 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.17 + ring * 0.05;
      o.put('spine_03', tint(card.clone(), feather), 'cloth', null, neck.x + Math.sin(a) * rr * 1.25, neck.y - ring * 0.07, neck.z + Math.cos(a) * rr, 0.35 + ring * 0.15, a, 0);
    }
  }
  o.put('pelvis', band(pw * 1.2, pd * 1.4, 0.03), 'metal', 0xc89a3a, 0, waist, pz);
  // Long robe to the ankles with a gold hem stripe.
  kilt(o, {
    top: waist - 0.02, hem: 0.1, radius: Math.max(pw, pd) * 1.22, flare: 0.16, z: pz * 0.5, panels: 14, ragged: 0.06,
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

function featherWing(ch: Character, sx: number, s3: THREE.Box3) {
  const g = new THREE.Group();
  g.position.set(sx * 0.08, s3.max.y - 0.08, s3.min.z - 0.03);
  const feathers: THREE.BufferGeometry[] = [];
  const wingCard = new THREE.PlaneGeometry(0.16, 1, 2, 6);
  for (let i = 0; i < 11; i++) {
    const a = 0.12 + i * 0.14;
    const len = 1.3 - Math.abs(i - 3) * 0.07;
    // Each feather tapers to a point and curls slightly.
    const f = wingCard.clone();
    const fp = f.getAttribute('position');
    for (let k = 0; k < fp.count; k++) {
      const y = fp.getY(k) + 0.5;
      fp.setX(k, fp.getX(k) * (1 - y * 0.75));
      fp.setZ(k, -y * y * 0.12);
    }
    f.scale(1, len, 1).translate(0, len / 2, 0).rotateZ(-sx * a).translate(sx * i * 0.035, 0, -i * 0.012);
    feathers.push(tint(f, mottle(0x1a1a26, 0x05050a, 0.3, 30)));
  }
  const m = new THREE.Mesh(mergeGeometries(feathers)!, ch.mats.cloth);
  m.castShadow = true;
  m.rotation.x = -0.35;
  g.add(m);
  ch.attach('spine_03', g);
  return g;
}

export function buildCrowLord(): CrowRig {
  const ch = buildCharacter('crow', {
    body: 'male', painter: crowPainter, eyes: false, brows: false,
    parts: [
      { name: 'Ranger_Body', dye: 0x2a1824 }, { name: 'Ranger_Acc_Pauldron', dye: 0xa8823a }, { name: 'Ranger_Arms_Bracer', dye: 0x3a3a30 },
      { name: 'Ranger_Body_Belt_1', dye: 0x8a6a2a }, { name: 'Ranger_Legs', dye: 0x1a1018 }, { name: 'Ranger_Feet', dye: 0x24201c },
    ],
  }, crowDesign);
  const s3 = ch.rest.boxes.get('spine_03')!;
  return { character: ch, wingL: featherWing(ch, 1, s3), wingR: featherWing(ch, -1, s3) };
}

// ---------------------------------------------------------------------------
// Chapter 2 and 3 enemies
// ---------------------------------------------------------------------------

// --- Wolf Guai: fast, feral, grey-furred ------------------------------------------------------

function wolfPainter(r: Rest): BodyPainter {
  const { c: hc, hz } = headFrame(r);
  const fur = furPaint(0x6a6258, 0x2a2622, 0.5, 26);
  return (bone, p, c) => {
    if (isHand(bone)) c.setHex(0x2a2220);
    else if (bone === 'Head' && p.z > hc.z + hz * 0.5) c.setHex(0x8a8478);
    else if (bone.startsWith('spine') && p.z > 0.06) { fur(p, c); c.lerp(new THREE.Color(0xb0a898), 0.5); }
    else fur(p, c);
  };
}

function wolfDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy, top } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  const fur = (p: THREE.Vector3, c: THREE.Color) => c.setHex(0x6a6258).lerp(new THREE.Color(0x2a2622), 0.2 + 0.35 * smoothNoise(p.x * 60, p.y * 60, p.z * 60));
  // Wolf head over the face: shaggy skull, long tapering snout, black nose, fangs, tall ears.
  o.put('Head', tint(blob(hx * 1.18, hy * 0.98, hz * 1.12, 0.18, 7), fur), 'matte', null, hc.x, hc.y + hy * 0.06, hc.z - hz * 0.04);
  const snout = new THREE.CylinderGeometry(hx * 0.36, hx * 0.62, hz * 1.5, 14, 4).rotateX(Math.PI / 2).scale(1, 0.8, 1);
  o.put('Head', tint(snout, (p, c) => c.setHex(0x8a8478).lerp(new THREE.Color(0x3a362e), Math.max(0, p.y) * 8)), 'matte', null, hc.x, hc.y - hy * 0.3, hc.z + hz * 1.45);
  o.put('Head', blob(hx * 0.22, hy * 0.13, hz * 0.18), 'matte', 0x120e0c, hc.x, hc.y - hy * 0.16, hc.z + hz * 2.2);
  o.put('Head', tint(blob(hx * 0.5, hy * 0.12, hz * 0.7), () => {}), 'matte', 0x3a1814, hc.x, hc.y - hy * 0.55, hc.z + hz * 1.4);
  for (const sx of [-1, 1]) {
    o.put('Head', new THREE.ConeGeometry(hx * 0.07, hy * 0.3, 6).rotateX(Math.PI), 'matte', 0xf0ead8, hc.x + sx * hx * 0.28, hc.y - hy * 0.55, hc.z + hz * 1.9);
    const ear = tint(new THREE.ConeGeometry(hx * 0.32, hy * 0.85, 8).scale(1, 1, 0.45), fur);
    o.put('Head', ear, 'matte', null, hc.x + sx * hx * 0.6, top + hy * 0.2, hc.z - hz * 0.25, -0.15, 0, -sx * 0.3);
    o.put('Head', new THREE.SphereGeometry(hz * 0.11, 10, 8), 'glow', 0xffd23a, hc.x + sx * hx * 0.46, hc.y + hy * 0.18, hc.z + hz * 0.92);
  }
  // Shaggy mane round the neck and shoulders.
  const neck = r.pos('neck_01');
  o.put('spine_03', furMass(0.25, 0.14, 0.2, 0.35, 0x8a8478, 0x2a2622), 'matte', null, neck.x, neck.y - 0.08, neck.z - 0.02);
  // Claws.
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    const hp = r.pos(`hand_${side}`);
    for (let k = 0; k < 3; k++) o.put(`hand_${side}`, new THREE.ConeGeometry(0.01, 0.09, 6).rotateZ(-sx * Math.PI / 2), 'matte', 0xe8e0c8, hp.x + sx * 0.17, hp.y - 0.02 + k * 0.022, hp.z + 0.02);
  }
  o.put('pelvis', band(pw * 1.2, pd * 1.38, 0.025), 'cloth', 0x4a3020, 0, waist, pz);
  kilt(o, { top: waist - 0.02, hem: 0.52, radius: Math.max(pw, pd) * 1.2, flare: 0.06, z: pz * 0.5, panels: 10, ragged: 0.07, color: (p, c) => c.setHex(0x5a3a22).multiplyScalar(0.8 + 0.2 * hashNoise(p.x * 40, p.y * 40, p.z * 40)) });
}

export interface TailedRig { character: Character; tail: THREE.Group }

export function buildWolf(): TailedRig {
  const ch = buildCharacter('wolf', {
    body: 'male', painter: wolfPainter(getRest('male')), eyes: false, brows: false,
    parts: [{ name: 'Ranger_Legs', dye: 0x4a3a2a }, { name: 'Ranger_Arms_Bracer', dye: 0x5a4632 }, { name: 'Ranger_Body_Belt_1', dye: 0x3a2a1c }],
  }, wolfDesign);
  const { waist, back } = pelvisFrame(ch.rest);
  const tail = new THREE.Group();
  tail.position.set(0, waist - 0.1, back + 0.02);
  const tg = taperedTube([V(0, 0, 0), V(0, -0.1, -0.2), V(0, -0.2, -0.5), V(0, -0.15, -0.75)], 0.07, 0.025, 16, 10);
  tail.add(new THREE.Mesh(tint(tg, mottle(0x6a6258, 0x2a2622, 0.3, 40)), ch.mats.matte));
  ch.attach('pelvis', tail);
  return { character: ch, tail };
}

// --- Bone Soldier: a retargeted KayKit skeleton warrior ---------------------------------------

export function buildBoneSoldier(): TailedRig {
  const ch = buildCharacter('bone', {
    body: 'male', showBody: false,
    parts: ['Body', 'Head', 'Jaw', 'ArmLeft', 'ArmRight', 'LegLeft', 'LegRight', 'Helmet', 'Eyes'].map((n) => ({ name: 'Skel_' + n, tint: n === 'Helmet' ? 0xc8a890 : 0xf0e8d8 }))
      .concat([{ name: 'Skel_Cloak', tint: 0x6a8a6a }]),
  });
  // Rusted longsword in the right hand, round shield on the left.
  const blade = phong(0xa8a8a0, 90, 0xcccccc), guard = phong(0x6a4a2a);
  heldItem(ch, 'hand_r', (g) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.035, 0); shape.lineTo(0.035, 0); shape.lineTo(0.03, 0.85); shape.lineTo(0, 0.95); shape.lineTo(-0.03, 0.85); shape.lineTo(-0.035, 0);
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }).rotateX(Math.PI / 2).scale(1, 1, -1).translate(0, 0.006, 0.14), blade));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8).rotateZ(Math.PI / 2).translate(0, 0, 0.13), guard));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8).rotateX(Math.PI / 2), guard));
  });
  heldItem(ch, 'hand_l', (g) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20).rotateZ(Math.PI / 2), phong(0x5a3a22));
    s.position.set(0.12, -0.02, 0.05);
    g.add(s);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 24).rotateY(Math.PI / 2), phong(0x8a8a90, 80));
    rim.position.copy(s.position);
    g.add(rim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI).rotateY(Math.PI / 2), phong(0x8a8a90, 80));
    boss.position.set(0.145, -0.02, 0.05);
    g.add(boss);
  });
  return { character: ch, tail: new THREE.Group() };
}

// --- Wind Archer: hooded desert bandit ----------------------------------------------------------

function archerDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy } = headFrame(r);
  // Face scarf under the hood, glowing eyes in the shadow.
  o.put('Head', new THREE.CylinderGeometry(hx * 1.0, hx * 1.08, hy * 0.62, 18, 1, true).scale(1, 1, 1.15), 'cloth', 0x5a3a1e, hc.x, hc.y - hy * 0.5, hc.z + hz * 0.05);
  for (const sx of [-1, 1]) o.put('Head', new THREE.SphereGeometry(hz * 0.08, 8, 6), 'glow', 0xffe060, hc.x + sx * hx * 0.34, hc.y + hy * 0.12, hc.z + hz * 0.9);
  // Quiver across the back.
  const s3 = r.boxes.get('spine_03')!;
  o.put('spine_03', new THREE.CylinderGeometry(0.05, 0.045, 0.5, 12), 'matte', 0x4a2a14, 0.06, (s3.min.y + s3.max.y) / 2, s3.min.z - 0.07, 0.2, 0, 0.25);
  for (let i = 0; i < 4; i++) o.put('spine_03', new THREE.ConeGeometry(0.014, 0.1, 5), 'matte', 0xe8e0c8, 0.03 + i * 0.016, (s3.min.y + s3.max.y) / 2 + 0.3, s3.min.z - 0.09 + (i % 2) * 0.01, 0, 0, 0.25);
}

export function buildArcher(): TailedRig {
  const ch = buildCharacter('archer', {
    body: 'male', skin: 0xb88a6a, eyes: 0x806040, brows: 0x2a1a10,
    parts: [
      { name: 'Ranger_Body', dye: 0xb88a3a, only: 'green' }, { name: 'Ranger_Arms', dye: 0x9a7030, only: 'green' },
      { name: 'Ranger_Legs', dye: 0x7a4a1c, only: 'green' }, { name: 'Ranger_Feet', tint: 0xc0a080 },
      { name: 'Ranger_Head_Hood', dye: 0x8a5a22, only: 'green' }, { name: 'Ranger_Arms_Bracer' }, { name: 'Ranger_Body_Belt_2' },
    ],
  }, archerDesign);
  // A recurve bow in the left hand: curved limb tube and bowstring.
  heldItem(ch, 'hand_l', (g) => {
    const limb = taperedTube([V(0, 0, 0.55), V(0.12, 0, 0.3), V(0.16, 0, 0), V(0.12, 0, -0.3), V(0, 0, -0.55)], 0.022, 0.016, 24, 8);
    g.add(new THREE.Mesh(limb, phong(0x6a3a1a, 20)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.1, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e0c8 })));
  });
  return { character: ch, tail: new THREE.Group() };
}

// --- Frost Witch: pale caster with an ice crown ------------------------------------------------

function frostDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy, top } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  // Crown of ice spikes.
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * Math.PI * 0.95;
    o.put('Head', new THREE.ConeGeometry(0.02, 0.16 + (i === 3 ? 0.12 : 0), 5), 'glow', 0x9af0ff, hc.x + Math.sin(a) * hx * 1.05, top - hy * 0.05, hc.z + Math.cos(a) * hz * 0.45, 0, 0, -a * 0.3);
  }
  glowEyes(o, r, 0x9af0ff, 0.08);
  // Frost-lace collar and flowing icy gown.
  const neck = r.pos('neck_01');
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.5;
    o.put('spine_03', new THREE.ConeGeometry(0.022, 0.14, 5), 'matte', 0xdcecff, neck.x + Math.sin(a) * 0.15, neck.y, neck.z - Math.cos(a) * 0.1, -Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6);
  }
  o.put('pelvis', band(pw * 1.15, pd * 1.3, 0.025), 'metal', 0x9ac8f0, 0, waist, pz);
  kilt(o, { top: waist - 0.02, hem: 0.02, radius: Math.max(pw, pd) * 1.15, flare: 0.24, z: pz * 0.5, panels: 14, ragged: 0.06, color: (p, c) => c.setHex(0x2a4a8a).lerp(new THREE.Color(0xdcecff), THREE.MathUtils.clamp(1 - p.y / 0.9, 0, 1) * 0.85) });
}

export function buildFrostWitch(): TailedRig {
  const ch = buildCharacter('frost', {
    body: 'female', skin: 0xc8dcf0, eyes: 0x9af0ff, brows: 0xdce8f8,
    parts: [
      { name: 'Peasant_Body', dye: 0x2a4a8a }, { name: 'Peasant_Arms', dye: 0x3a5a9a },
      { name: 'Hair_Long', tint: 0xeef4ff }, { name: 'Peasant_Feet', dye: 0x8aa8d0 },
    ],
  }, frostDesign);
  heldItem(ch, 'hand_r', (g) => {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.6, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5), phong(0xdcecff, 70, 0xffffff)));
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0).scale(0.7, 0.7, 1.5).translate(0, 0, 1.4), new THREE.MeshBasicMaterial({ color: 0x9af0ff })));
  });
  return { character: ch, tail: new THREE.Group() };
}

// --- Chapter bosses -----------------------------------------------------------------------------

function tigerPainter(r: Rest): BodyPainter {
  const { c: hc, hz } = headFrame(r);
  return (bone, p, c) => {
    const n = smoothNoise(p.x * 30, p.y * 30, p.z * 30);
    if (isHand(bone)) { c.setHex(0xd8902a); return; }
    const stripe = Math.sin(p.y * 42 + Math.sin(p.x * 18 + p.z * 9) * 2.2) > 0.55;
    if ((bone.startsWith('spine') && p.z > 0.06) || (bone === 'Head' && p.z > hc.z + hz * 0.55)) c.setHex(0xf0e4c8);
    else c.setHex(stripe ? 0x2a1608 : 0xd8822a).multiplyScalar(0.9 + 0.12 * n);
  };
}

function tigerDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy, top } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  const fur = (p: THREE.Vector3, c: THREE.Color) => c.setHex(Math.sin(p.y * 50 + p.x * 20) > 0.5 ? 0x2a1608 : 0xd8822a).multiplyScalar(0.9 + 0.12 * smoothNoise(p.x * 40, p.y * 40, p.z * 40));
  // Tiger head: broad skull, white muzzle and cheeks, round ears, fangs.
  o.put('Head', tint(blob(hx * 1.25, hy * 1.0, hz * 1.12, 0.12, 6), fur), 'matte', null, hc.x, hc.y + hy * 0.05, hc.z - hz * 0.04);
  o.put('Head', blob(hx * 0.62, hy * 0.34, hz * 0.5), 'matte', 0xf0e4c8, hc.x, hc.y - hy * 0.38, hc.z + hz * 0.95);
  for (const sx of [-1, 1]) o.put('Head', furMass(hx * 0.45, hy * 0.4, hz * 0.4, 0.3, 0xf0e4c8, 0xc8b898), 'matte', null, hc.x + sx * hx * 0.75, hc.y - hy * 0.35, hc.z + hz * 0.45);
  o.put('Head', blob(hx * 0.2, hy * 0.1, hz * 0.12), 'matte', 0x3a1410, hc.x, hc.y - hy * 0.18, hc.z + hz * 1.42);
  for (const sx of [-1, 1]) {
    o.put('Head', tint(blob(hx * 0.32, hy * 0.3, hz * 0.14), (p, c) => c.setHex(p.z > 0 ? 0xf0e4c8 : 0x2a1608)), 'matte', null, hc.x + sx * hx * 0.78, top + hy * 0.05, hc.z - hz * 0.1);
    o.put('Head', new THREE.ConeGeometry(hx * 0.08, hy * 0.35, 6).rotateX(Math.PI), 'matte', 0xfff4d8, hc.x + sx * hx * 0.3, hc.y - hy * 0.72, hc.z + hz * 1.3);
    o.put('Head', new THREE.SphereGeometry(hz * 0.12, 10, 8), 'glow', 0xffe040, hc.x + sx * hx * 0.48, hc.y + hy * 0.18, hc.z + hz * 0.95);
  }
  o.put('pelvis', band(pw * 1.2, pd * 1.4, 0.035), 'metal', 0xe0b040, 0, waist, pz);
  kilt(o, { top: waist - 0.02, hem: 0.14, radius: Math.max(pw, pd) * 1.22, flare: 0.16, z: pz * 0.5, panels: 14, ragged: 0.05, color: (p, c) => c.setHex(p.y < 0.22 ? 0xe0b040 : 0x7a1a14).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 70)) });
}

export interface BossRig { character: Character; wingL: THREE.Group | null; wingR: THREE.Group | null; accent: number; accentHot: number; summon: SpawnKindName }
type SpawnKindName = 'spiderling' | 'wolf' | 'bone';

export function buildTiger(): BossRig {
  const ch = buildCharacter('tiger', {
    body: 'male', painter: tigerPainter(getRest('male')), eyes: false, brows: false,
    parts: [
      { name: 'Ranger_Body', dye: 0x5a1a12 }, { name: 'Ranger_Acc_Pauldron', dye: 0xe0b040 }, { name: 'Ranger_Arms_Bracer', dye: 0xc8962e },
      { name: 'Ranger_Body_Belt_1', dye: 0x3a2a1a }, { name: 'Ranger_Body_Belt_2', dye: 0x3a2a1a }, { name: 'Ranger_Legs', dye: 0x3a1410 }, { name: 'Ranger_Feet', dye: 0x2a1e18 },
    ],
  }, tigerDesign);
  // Guandao: long pole and a broad curved blade.
  heldItem(ch, 'hand_r', (g) => {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.6), phong(0x3a2414, 25)));
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0); bladeShape.quadraticCurveTo(0.34, 0.2, 0.18, 0.95); bladeShape.lineTo(0.02, 0.8); bladeShape.lineTo(0, 0);
    const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.025, bevelEnabled: false, curveSegments: 16 }).rotateY(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, 1.62);
    g.add(new THREE.Mesh(bg, phong(0xc8ccd4, 110, 0xffffff)));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 18), phong(0xe0b040, 90, 0xffe0a0)).translateZ(1.6));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), phong(0xe0b040, 90)).translateZ(-0.5));
  });
  return { character: ch, wingL: null, wingR: null, accent: 0xff9a30, accentHot: 0xffe090, summon: 'wolf' };
}

function ladyDesign(o: Outfit, r: Rest) {
  const { c: hc, hx, hz, hy, top } = headFrame(r);
  const { pw, pd, waist, cz: pz } = pelvisFrame(r);
  // Hollow eyes and a tall antler crown.
  for (const sx of [-1, 1]) {
    o.put('Head', new THREE.SphereGeometry(hz * 0.16, 12, 8).scale(1, 1.1, 0.4), 'matte', 0x0a1020, hc.x + sx * hx * 0.34, hc.y + hy * 0.12, hc.z + hz * 0.88);
    o.put('Head', new THREE.SphereGeometry(hz * 0.07, 8, 6), 'glow', 0x9af0ff, hc.x + sx * hx * 0.34, hc.y + hy * 0.12, hc.z + hz * 0.95);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6;
    o.put('Head', taperedTube([V(0, 0, 0), V(Math.sin(a) * 0.12, 0.22, -0.02), V(Math.sin(a) * 0.3, 0.42, -0.04), V(Math.sin(a) * 0.46, 0.5 + (i % 2) * 0.1, -0.04)], 0.022, 0.005, 16, 6), 'matte', 0xe8e0c8, hc.x + Math.sin(a) * hx * 0.5, top - hy * 0.1, hc.z - hz * 0.1);
  }
  // Rib-cage bodice, bone shoulder spikes, frozen gown.
  const s2 = r.boxes.get('spine_02')!, s3 = r.boxes.get('spine_03')!;
  const cy = (s2.min.y + s3.max.y) / 2 - 0.05;
  for (let i = 0; i < 5; i++) o.put('spine_03', new THREE.TorusGeometry(0.15 - Math.abs(i - 1) * 0.012, 0.012, 6, 18, Math.PI * 1.3).rotateZ(Math.PI * 0.35), 'matte', 0xf0ecdc, 0, cy + 0.14 - i * 0.065, 0.045);
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    const sp = r.pos(`upperarm_${side}`);
    for (let k = 0; k < 3; k++) o.put(`upperarm_${side}`, new THREE.ConeGeometry(0.03, 0.26 - k * 0.04, 6), 'matte', 0xe8e0c8, sp.x + sx * (0.04 + k * 0.06), sp.y + 0.1, sp.z, 0, 0, -sx * (0.5 + k * 0.3));
  }
  o.put('pelvis', band(pw * 1.15, pd * 1.35, 0.03), 'metal', 0x9ac8f0, 0, waist, pz);
  kilt(o, { top: waist - 0.02, hem: 0.02, radius: Math.max(pw, pd) * 1.15, flare: 0.28, z: pz * 0.5, panels: 16, ragged: 0.09, color: (p, c) => c.setHex(0x1a2a4a).lerp(new THREE.Color(0xdcecff), THREE.MathUtils.clamp(1 - p.y / 0.9, 0, 1) * 0.9).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 70)) });
}

export function buildBoneLady(): BossRig {
  const ch = buildCharacter('lady', {
    body: 'female', painter: (bone, p, c) => c.setHex(0xe8e4d4).multiplyScalar(0.85 + 0.15 * smoothNoise(p.x * 30, p.y * 30, p.z * 30)), eyes: false, brows: false,
    parts: [{ name: 'Peasant_Body', dye: 0x22324e }, { name: 'Peasant_Arms', dye: 0x2a3a5a }, { name: 'Hair_Long', tint: 0xb8c0d0 }],
  }, ladyDesign);
  const s3 = ch.rest.boxes.get('spine_03')!;
  // Wings of curved rib bones.
  const wing = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.08, s3.max.y - 0.08, s3.min.z - 0.03);
    const bones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = 0.1 + i * 0.2;
      const len = 1.4 - Math.abs(i - 2) * 0.1;
      bones.push(tint(taperedTube([V(0, 0, 0), V(sx * Math.sin(a) * len * 0.5, Math.cos(a) * len * 0.5, -0.08), V(sx * Math.sin(a) * len, Math.cos(a) * len * 0.95, -0.18 - i * 0.02)], 0.03, 0.006, 14, 6), (_p, c) => c.setHex(0xe8e0c8)));
    }
    const m = new THREE.Mesh(mergeGeometries(bones)!, ch.mats.matte);
    m.castShadow = true;
    m.rotation.x = -0.3;
    g.add(m);
    ch.attach('spine_03', g);
    return g;
  };
  heldItem(ch, 'hand_r', (g) => {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 2.0, 10).rotateX(Math.PI / 2).translate(0, 0, 0.55), phong(0xe8e0c8, 40)));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24, Math.PI * 1.35).translate(0, 0, 1.58), phong(0xe8e0c8, 40)));
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0).translate(0, 0, 1.58), new THREE.MeshBasicMaterial({ color: 0x9af0ff })));
  });
  return { character: ch, wingL: wing(1), wingR: wing(-1), accent: 0x7ac8ff, accentHot: 0xe0f4ff, summon: 'bone' };
}
