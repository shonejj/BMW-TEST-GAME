import * as THREE from 'three';

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
  const torso = joint(hips, 0, 0.02, 0);
  torso.add(mesh(new THREE.CapsuleGeometry(0.21, 0.28, 3, 7).translate(0, 0.3, 0), mats.fur));
  torso.add(mesh(new THREE.BoxGeometry(0.46, 0.3, 0.3).translate(0, 0.38, 0.02), mats.armor));
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
  // Fur tuft
  head.add(mesh(new THREE.ConeGeometry(0.12, 0.2, 5).rotateX(-0.6), mats.fur, 0, 0.3, -0.05));

  // Arms (pivot at shoulder)
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.45, 3, 6).translate(0, -0.3, 0);
  const handGeo = new THREE.SphereGeometry(0.08, 5, 4).translate(0, -0.62, 0);
  const bracerGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 6).translate(0, -0.45, 0);
  const armL = joint(torso, -0.3, 0.5, 0);
  const armR = joint(torso, 0.3, 0.5, 0);
  for (const arm of [armL, armR]) {
    arm.add(mesh(armGeo, mats.fur));
    arm.add(mesh(handGeo, mats.face));
    arm.add(mesh(bracerGeo, mats.gold));
  }

  // Cape hanging from the shoulders
  const cape = joint(torso, 0, 0.56, -0.16);
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.05, 1, 3).translate(0, -0.52, 0);
  const capeMat = new THREE.MeshLambertMaterial({ color: 0x9a2f2f, side: THREE.DoubleSide, flatShading: true });
  cape.add(mesh(capeGeo, capeMat));
  cape.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 4, 10, Math.PI).rotateZ(Math.PI), capeMat, 0, 0.02, 0.06));

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

  root.traverse((o) => {
    o.frustumCulled = true;
  });
  return { root, body, hips, torso, head, armL, armR, legL, legR, staff, staffTip, cape, tail, mats };
}

// ---------------------------------------------------------------------------
// Spiders
// ---------------------------------------------------------------------------

export type SpiderKind = 'spiderling' | 'armored' | 'weaver';

export interface SpiderRig {
  root: THREE.Group;
  body: THREE.Group;
  legs: { hip: THREE.Group; knee: THREE.Group; side: number; index: number }[];
  torso?: THREE.Group;
  armL?: THREE.Group;
  armR?: THREE.Group;
  flashMats: THREE.MeshLambertMaterial[];
  glowMat: THREE.MeshLambertMaterial;
}

export function buildSpider(kind: SpiderKind): SpiderRig {
  const shell = lambert(kind === 'armored' ? 0x4a4c52 : 0x2a2626);
  const leg = lambert(kind === 'armored' ? 0x3b3c40 : 0x221e1e);
  const bone = lambert(0xcfc6b4);
  const glowMat = lambert(0x550808, 0xff1a1a, kind === 'armored' ? 1.2 : 0.8);
  const flashMats = [shell, leg, bone, glowMat];

  const root = new THREE.Group();
  const body = joint(root, 0, 0.42, 0);
  // Abdomen
  const abd = mesh(new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.75, 1.2), shell, 0, 0.1, -0.55);
  body.add(abd);
  body.add(mesh(new THREE.SphereGeometry(0.32, 6, 4).scale(1, 0.4, 1.2), glowMat, 0, 0.42, -0.6));
  if (kind === 'armored') {
    for (let i = 0; i < 3; i++) body.add(mesh(new THREE.BoxGeometry(0.9 - i * 0.15, 0.12, 0.25), shell, 0, 0.42 + i * 0.03, -0.25 - i * 0.3));
    body.add(mesh(new THREE.ConeGeometry(0.08, 0.35, 4), bone, -0.2, 0.55, -0.4));
    body.add(mesh(new THREE.ConeGeometry(0.08, 0.35, 4), bone, 0.2, 0.55, -0.4));
  }
  // Cephalothorax + skull head
  body.add(mesh(new THREE.SphereGeometry(0.3, 7, 5).scale(1, 0.7, 1), shell, 0, 0, 0.15));
  if (kind !== 'weaver') {
    body.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), bone, 0, 0.05, 0.45));
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    body.add(mesh(new THREE.SphereGeometry(0.035, 4, 3), eye, -0.07, 0.1, 0.6));
    body.add(mesh(new THREE.SphereGeometry(0.035, 4, 3), eye, 0.07, 0.1, 0.6));
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.2, 4).rotateX(Math.PI * 0.6), bone, -0.08, -0.08, 0.6));
    body.add(mesh(new THREE.ConeGeometry(0.04, 0.2, 4).rotateX(Math.PI * 0.6), bone, 0.08, -0.08, 0.6));
  }

  // Legs: hip pivots on the thorax, knee joint at end of upper segment.
  const upper = new THREE.CylinderGeometry(0.05, 0.06, 0.7, 4).translate(0, 0.35, 0);
  const lower = new THREE.CylinderGeometry(0.05, 0.015, 0.9, 4).translate(0, -0.45, 0);
  const legs: SpiderRig['legs'] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const hip = joint(body, side * 0.2, 0, 0.3 - i * 0.18);
      hip.rotation.y = side * (Math.PI / 2) + (i - 1.5) * 0.45 * side;
      const seg1 = joint(hip);
      seg1.rotation.x = 0.9; // upper leg rises outward
      seg1.add(mesh(upper, leg));
      const knee = joint(seg1, 0, 0.7, 0);
      knee.rotation.x = -1.3; // lower leg reaches down and outward
      knee.add(mesh(lower, leg));
      legs.push({ hip, knee, side, index: i });
    }
  }

  let torso: THREE.Group | undefined, armL: THREE.Group | undefined, armR: THREE.Group | undefined;
  if (kind === 'weaver') {
    // Pale humanoid torso fused on the spider body.
    const skin = lambert(0xd8d0c8);
    flashMats.push(skin);
    torso = joint(body, 0, 0.2, 0.3);
    torso.add(mesh(new THREE.CapsuleGeometry(0.17, 0.4, 3, 6).translate(0, 0.35, 0), skin));
    torso.add(mesh(new THREE.SphereGeometry(0.15, 6, 5), skin, 0, 0.8, 0.02));
    torso.add(mesh(new THREE.ConeGeometry(0.2, 0.5, 6).rotateX(Math.PI), lambert(0x181414), 0, 0.88, -0.05));
    const eye = new THREE.MeshBasicMaterial({ color: 0xb05cff });
    torso.add(mesh(new THREE.SphereGeometry(0.03, 4, 3), eye, -0.05, 0.82, 0.13));
    torso.add(mesh(new THREE.SphereGeometry(0.03, 4, 3), eye, 0.05, 0.82, 0.13));
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.45, 2, 4).translate(0, -0.3, 0);
    armL = joint(torso, -0.22, 0.6, 0);
    armR = joint(torso, 0.22, 0.6, 0);
    armL.add(mesh(armGeo, skin));
    armR.add(mesh(armGeo, skin));
  }

  const scale = kind === 'spiderling' ? 0.55 : kind === 'armored' ? 1.35 : 0.85;
  root.scale.setScalar(scale);
  return { root, body, legs, torso, armL, armR, flashMats, glowMat };
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
  return { root, body, torso, head, wingL, wingR, armL, armR, spear, flashMats: [robe, armor, skin, gold], eyeMat };
}
