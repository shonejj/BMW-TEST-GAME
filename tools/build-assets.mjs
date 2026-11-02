// Builds the compressed glTF assets in src/assets/models from the CC0 source packs (credits in README.md).
//
//   node tools/build-assets.mjs <quaternius-dir> [<ubc-dir> <kaykit-skeletons-dir>] [anims|bodies|nature|all]
//
// <quaternius-dir> holds universal-animation-library, universal-animation-library-2 and stylized-nature-megakit
// as downloaded from quaternius.com.
// <ubc-dir> holds the Quaternius Universal Base Characters (characters/Superhero_*.glb), Modular Character
// Outfits - Fantasy (outfits/{Male,Female}_{Peasant,Ranger}.glb) and hair (hair/Hair_*.glb), all on the
// Universal Animation Library rig (a CC0 mirror is github.com/Dallolz/moorfall-assets).
// <kaykit-skeletons-dir> is the KayKit Character Pack: Skeletons (Characters/gltf/Skeleton_*.glb).
// The outputs are committed, so this only needs to run when the selection changes.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, resample, weld, meshopt, textureCompress, flatten, join, simplify, mergeDocuments, simplifyPrimitive,
  weldPrimitive,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { join as pjoin } from 'node:path';

const args = process.argv.slice(2);
const which = ['anims', 'bodies', 'nature', 'all'].includes(args[args.length - 1]) ? args.pop() : 'all';
const [SRC, UBC, KAYKIT] = args;
if (!SRC) throw new Error('usage: node tools/build-assets.mjs <quaternius-dir> [<ubc-dir> <kaykit-skeletons-dir>] [anims|bodies|nature|all]');
const OUT = new URL('../src/assets/models/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const sharp = (await import('sharp')).default;

/** Clips kept from each library, renamed for the game. */
const UAL1 = {
  Idle_Loop: 'idle', Sword_Idle: 'swordIdle', Jog_Fwd_Loop: 'jog', Sprint_Loop: 'sprint', Walk_Loop: 'walk',
  Roll: 'roll', Dodge_Left: 'dodgeL', Dodge_Right: 'dodgeR', Hit_Chest: 'hit', Hit_Head: 'hit2',
  Death01: 'death', Death02: 'death2', Drink: 'drink', Spell_Simple_Shoot: 'cast', Spell_Double_Shoot_Loop: 'channel',
  Celebration: 'victory', Idle_LookAround_Loop: 'lookAround', Fixing_Kneeling: 'kneel', Kick: 'kick',
  Sword_Attack: 'swordAttack', Punch_Cross: 'punch',
};
const UAL2 = {
  Sword_Light_A: 'combo1', Sword_Light_B: 'combo2', Sword_Light_C: 'combo3', Sword_Light_D: 'combo4',
  Sword_Heavy_A: 'heavyA', Sword_Heavy_C: 'heavyC', Sword_GroundPound: 'groundPound', Sword_Dash: 'dash',
  Sword_UpperCut: 'uppercut', Sword_Regular_A: 'slashA', Sword_Regular_B: 'slashB', Sword_Regular_C: 'slashC',
  Hit_Knockback: 'knockback', Consume: 'consume', MonsterTransformation: 'transform', KipUp: 'kipUp',
  Sword_Block: 'block', OverhandThrow: 'throw', Idle_FoldArms_Loop: 'foldArms', Surprise: 'surprise',
  Zombie_Idle_Loop: 'zIdle', Zombie_Walk_Fwd_Loop: 'zWalk', Zombie_Run_Fwd_Loop: 'zRun', Zombie_Scratch: 'zScratch',
  Zombie_Bite: 'zBite', Zombie_Spawn: 'zSpawn', Bow_Shoot: 'bowShoot', Bow_Aim_Neutral: 'bowAim',
};
/** Only these bones keep translation keys; the rest of the skeleton only rotates. */
const MOVING = new Set(['root', 'pelvis']);

/** Disposed samplers keep their accessors alive (prune only follows root properties), so sweep them here. */
function dropOrphanAccessors(doc) {
  const used = new Set();
  const root = doc.getRoot();
  for (const a of root.listAnimations()) for (const s of a.listSamplers()) used.add(s.getInput()).add(s.getOutput());
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    used.add(p.getIndices());
    for (const sem of p.listSemantics()) used.add(p.getAttribute(sem));
  }
  for (const s of root.listSkins()) used.add(s.getInverseBindMatrices());
  for (const a of root.listAccessors()) if (!used.has(a)) a.dispose();
}

/** One buffer per document (merges leave one per source). */
function singleBuffer(doc) {
  const [buffer, ...rest] = doc.getRoot().listBuffers();
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
  for (const b of rest) b.dispose();
}

// ---------------------------------------------------------------------------
// Animation clips: the UAL skeleton (no mesh) with the selected mocap clips.
// ---------------------------------------------------------------------------

async function anims() {
  const doc = await io.read(pjoin(SRC, 'universal-animation-library/Unreal-Godot/UAL1.glb'));
  const lib2 = await io.read(pjoin(SRC, 'universal-animation-library-2/Unreal-Godot/UAL2.glb'));
  const root = doc.getRoot();
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const buffer = root.listBuffers()[0];

  // The bodies live in their own files; this one only carries the clips (bound to bones by name at runtime).
  for (const n of root.listNodes()) if (n.getMesh()) n.dispose();
  for (const anim of root.listAnimations()) {
    const name = UAL1[anim.getName()];
    if (name) anim.setName(name); else anim.dispose();
  }
  // Copy the selected UAL2 clips across; both libraries share one skeleton, so channels map by bone name.
  for (const src of lib2.getRoot().listAnimations()) {
    const name = UAL2[src.getName()];
    if (!name) continue;
    const anim = doc.createAnimation(name);
    for (const ch of src.listChannels()) {
      const target = nodes.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput()))
        .setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target)
        .setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath();
      if (path === 'scale' || (path === 'translation' && !MOVING.has(ch.getTargetNode().getName()))) {
        const s = ch.getSampler();
        ch.dispose();
        s.dispose();
      }
    }
  }
  dropOrphanAccessors(doc);
  await doc.transform(prune({ keepLeaves: true }), dedup(), resample({ tolerance: 2e-4 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pjoin(OUT, 'anims.glb'), doc);
}

// ---------------------------------------------------------------------------
// Bodies: a base character with every outfit piece and hair style bound to its skeleton.
// ---------------------------------------------------------------------------

/** Attributes the game's materials read; the rest (empty colour sets, lightmap UVs) is dropped. */
const KEEP_ATTR = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);

/**
 * Pieces per body: output node name -> source node name, with a simplification ratio. Seen from a high camera
 * through a pixelating post pass, roughly half the authored triangles is plenty, and every enemy pays for them.
 */
function partList(g) {
  const G = g === 'male' ? 'Male' : 'Female';
  const ratio = { Feet: 0.25, Arms_Bracer: 0.35, Arms: 0.5, Body: 0.55, Legs: 0.7, Head_Hood: 0.6, Acc_Pauldron: 0.6, Body_Belt_1: 0.5, Body_Belt_2: 0.5 };
  const parts = [];
  for (const set of ['Peasant', 'Ranger']) {
    const pieces = set === 'Peasant' ? ['Arms', 'Body', 'Feet', 'Legs'] : ['Acc_Pauldron', 'Arms', 'Arms_Bracer', 'Body', 'Body_Belt_1', 'Body_Belt_2', 'Feet', 'Head_Hood', 'Legs'];
    for (const p of pieces) {
      let src = `${G}_${set}_${p}`;
      if (p === 'Feet' && set === 'Ranger' && g === 'male') src += '_Boots';
      if (p === 'Acc_Pauldron' && g === 'female') src += 's';
      parts.push({ file: `outfits/${G}_${set}.glb`, src, name: `${set}_${p}`, ratio: ratio[p] ?? 0.5 });
    }
  }
  const hairs = g === 'male' ? ['Hair_Long', 'Hair_Beard', 'Hair_Buzzed', 'Hair_SimpleParted'] : ['Hair_Long', 'Hair_Buns', 'Hair_SimpleParted'];
  for (const h of hairs) parts.push({ file: `hair/${h}.glb`, src: h, name: h, ratio: 0.5 });
  return parts;
}

/** Re-skins a merged mesh node onto the base skeleton by bone name, keeping its own bind matrices. */
function rebind(doc, node, joints) {
  const src = node.getSkin();
  const skin = doc.createSkin(node.getName());
  for (const j of src.listJoints()) {
    const t = joints.get(j.getName());
    if (!t) throw new Error(`No bone ${j.getName()} for ${node.getName()}`);
    skin.addJoint(t);
  }
  skin.setInverseBindMatrices(src.getInverseBindMatrices()).setSkeleton(joints.get('root'));
  node.setSkin(skin);
}

function cleanPrims(mesh) {
  for (const p of mesh.listPrimitives()) for (const sem of p.listSemantics()) if (!KEEP_ATTR.has(sem)) p.setAttribute(sem, null);
}

async function body(g) {
  const base = g === 'male' ? 'Superhero_Male' : 'Superhero_Female';
  const doc = await io.read(pjoin(UBC, `characters/${base}.glb`));
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const armature = scene.listChildren()[0];
  const joints = new Map(root.listSkins()[0].listJoints().map((j) => [j.getName(), j]));
  const ratios = new Map();
  for (const n of armature.listChildren()) {
    if (!n.getMesh()) continue;
    const name = n.getName() === 'Eyebrows' ? 'Brows' : n.getName() === 'Eyes' ? 'Eyes' : 'Body';
    n.setName(name);
    n.getMesh().setName(name);
    ratios.set(name, name === 'Body' ? 0.6 : 0.5);
  }
  const files = new Map();
  for (const p of partList(g)) {
    if (!files.has(p.file)) files.set(p.file, await io.read(pjoin(UBC, p.file)));
  }
  for (const [file, src] of files) {
    const wanted = partList(g).filter((p) => p.file === file);
    const map = mergeDocuments(doc, src);
    for (const s of src.getRoot().listScenes()) {
      const merged = map.get(s);
      for (const top of merged.listChildren()) {
        for (const n of top.listChildren()) {
          const p = wanted.find((w) => w.src === n.getName());
          if (!p || !n.getMesh()) continue;
          rebind(doc, n, joints);
          n.setName(p.name);
          n.getMesh().setName(p.name);
          armature.addChild(n);
          ratios.set(p.name, p.ratio);
        }
      }
      merged.dispose();
    }
  }
  if (g === 'male' && KAYKIT) {
    for (const [file, prefix] of [['Skeleton_Warrior', 'Skel'], ['Skeleton_Mage', 'SkelMage']]) {
      const sk = await io.read(pjoin(KAYKIT, `Characters/gltf/${file}.glb`));
      for (const n of retargetKayKit(doc, sk, joints, prefix)) {
        armature.addChild(n);
        ratios.set(n.getName(), 1);
      }
    }
  }
  // Drop every merged leftover (other skeletons, unused pieces): only nodes under our armature survive.
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  const keep = new Set();
  armature.traverse((n) => keep.add(n));
  for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
  for (const s of root.listSkins()) if (!s.listParents().some((p) => p.propertyType === 'Node')) s.dispose();
  singleBuffer(doc);
  for (const m of root.listMeshes()) cleanPrims(m);
  // Simplify each piece to its own budget.
  for (const n of armature.listChildren()) {
    const m = n.getMesh();
    if (!m) continue;
    const ratio = ratios.get(n.getName()) ?? 0.5;
    for (const p of m.listPrimitives()) {
      weldPrimitive(p);
      if (ratio < 1) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: false });
    }
  }
  for (const mat of root.listMaterials()) mat.setMetallicFactor(0).setRoughnessFactor(1);
  await doc.transform(prune(), dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pjoin(OUT, `${g}.glb`), doc);
}

// --- KayKit retarget ----------------------------------------------------------------------------------

/** KayKit bone -> UAL bone, and the bone each segment points at (its "tail") in both rigs. */
const KK_MAP = {
  root: 'root', hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', head: 'Head',
  'upperarm.l': 'upperarm_l', 'lowerarm.l': 'lowerarm_l', 'wrist.l': 'hand_l', 'hand.l': 'hand_l', 'handslot.l': 'hand_l',
  'upperarm.r': 'upperarm_r', 'lowerarm.r': 'lowerarm_r', 'wrist.r': 'hand_r', 'hand.r': 'hand_r', 'handslot.r': 'hand_r',
  'upperleg.l': 'thigh_l', 'lowerleg.l': 'calf_l', 'foot.l': 'foot_l', 'toes.l': 'ball_l',
  'upperleg.r': 'thigh_r', 'lowerleg.r': 'calf_r', 'foot.r': 'foot_r', 'toes.r': 'ball_r',
};
const KK_TAIL = {
  hips: 'spine', spine: 'chest', chest: 'head', 'upperarm.l': 'lowerarm.l', 'lowerarm.l': 'wrist.l', 'wrist.l': 'handslot.l', 'hand.l': 'handslot.l',
  'upperarm.r': 'lowerarm.r', 'lowerarm.r': 'wrist.r', 'wrist.r': 'handslot.r', 'hand.r': 'handslot.r',
  'upperleg.l': 'lowerleg.l', 'lowerleg.l': 'foot.l', 'foot.l': 'toes.l', 'upperleg.r': 'lowerleg.r', 'lowerleg.r': 'foot.r', 'foot.r': 'toes.r',
};
const UAL_TAIL = {
  pelvis: 'spine_01', spine_01: 'spine_03', spine_03: 'Head', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_02_l',
  upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_02_r', thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l',
  thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
/** Inverse of a column-major affine 4x4 matrix's translation part: the bind-pose world position of a joint. */
function bindPos(ibm) {
  // world = inverse(ibm); for a rigid matrix, position = -R^T t.
  const r = [[ibm[0], ibm[4], ibm[8]], [ibm[1], ibm[5], ibm[9]], [ibm[2], ibm[6], ibm[10]]];
  const t = [ibm[12], ibm[13], ibm[14]];
  return [-(r[0][0] * t[0] + r[1][0] * t[1] + r[2][0] * t[2]), -(r[0][1] * t[0] + r[1][1] * t[1] + r[2][1] * t[2]), -(r[0][2] * t[0] + r[1][2] * t[1] + r[2][2] * t[2])];
}
/** Orthonormal frame along a bone segment: axis, then two perpendiculars built from a fixed world reference. */
function frame(head, tail) {
  const a = v3.norm(v3.sub(tail, head));
  const ref = Math.abs(a[1]) > 0.7 ? [0, 0, 1] : [0, 1, 0];
  const b = v3.norm(v3.cross(ref, a));
  const c = v3.cross(a, b);
  return { o: head, a, b, c, len: v3.len(v3.sub(tail, head)) };
}

/**
 * Moves a KayKit (chibi proportions, own rig) mesh onto the UAL skeleton: each vertex is expressed in the frame
 * of every bone segment that weighs it, stretched along the segment to the UAL bone length, and rebuilt on the
 * matching UAL segment. Limbs reach UAL proportions, the oversized skull shrinks, and the result is skinned to
 * the UAL bones so the shared clips drive it.
 */
function retargetKayKit(doc, src, joints, prefix) {
  const sroot = src.getRoot();
  const skin = sroot.listSkins()[0];
  const sj = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const kkPos = new Map(sj.map((j, i) => [j.getName(), bindPos(ibm.getElement(i, []))]));
  // UAL rest positions from the base skin's bind matrices.
  const baseSkin = doc.getRoot().listSkins()[0];
  const bj = baseSkin.listJoints();
  const bibm = baseSkin.getInverseBindMatrices();
  const ualPos = new Map(bj.map((j, i) => [j.getName(), bindPos(bibm.getElement(i, []))]));
  const ualIndex = new Map(bj.map((j, i) => [j.getName(), i]));
  const segs = new Map();
  for (const [kk, ual] of Object.entries(KK_MAP)) {
    if (!kkPos.has(kk)) continue;
    const kh = kkPos.get(kk), uh = ualPos.get(ual);
    let kt = KK_TAIL[kk] ? kkPos.get(KK_TAIL[kk]) : null;
    let ut = UAL_TAIL[ual] ? ualPos.get(UAL_TAIL[ual]) : null;
    if (kk === 'head') { kt = v3.add(kh, [0, 0.5, 0]); ut = v3.add(uh, [0, 0.31, 0]); }
    if (kk === 'toes.l' || kk === 'toes.r') { kt = v3.add(kh, [0, 0, 0.12]); ut = v3.add(uh, [0, 0, 0.12]); }
    if (kk.startsWith('handslot')) { const h = kkPos.get(kk.replace('handslot', 'hand')); kt = v3.add(kh, v3.sub(kh, h)); }
    if (kk === 'root') { kt = [0, 1, 0]; ut = [0, 1, 0]; }
    if (!kh || !kt || !uh || !ut) throw new Error(`retarget: missing segment for ${kk} -> ${ual}`);
    const kf = frame(kh, kt), uf = frame(uh, ut);
    // Thickness: limbs and torso keep a little of KayKit's chunkiness; the skull is scaled down to fit a human neck.
    const radial = kk === 'head' ? 0.62 : kk.startsWith('upperleg') || kk.startsWith('lowerleg') ? 0.95 : kk === 'chest' || kk === 'spine' || kk === 'hips' ? 0.8 : 0.9;
    const axial = kk === 'head' ? 0.62 : uf.len / kf.len;
    segs.set(kk, { kf, uf, radial, axial, ual: ualIndex.get(ual) });
  }
  const map = (kk, p, isNormal) => {
    const s = segs.get(kk);
    if (!s) throw new Error('unmapped KayKit bone ' + kk);
    const { kf, uf } = s;
    const d = isNormal ? p : v3.sub(p, kf.o);
    const t = v3.dot(d, kf.a), u = v3.dot(d, kf.b), w = v3.dot(d, kf.c);
    if (isNormal) return v3.add(v3.add(v3.mul(uf.a, t), v3.mul(uf.b, u)), v3.mul(uf.c, w));
    return v3.add(uf.o, v3.add(v3.add(v3.mul(uf.a, t * s.axial), v3.mul(uf.b, u * s.radial)), v3.mul(uf.c, w * s.radial)));
  };
  const out = [];
  const buffer = doc.getRoot().listBuffers()[0];
  // Copy each mesh by hand (positions change, joints are remapped, materials copied once).
  const matCache = new Map();
  const copyMaterial = (m) => {
    if (!m) return null;
    if (matCache.has(m)) return matCache.get(m);
    const nm = doc.createMaterial(prefix + '_' + m.getName()).setBaseColorFactor(m.getBaseColorFactor());
    const tex = m.getBaseColorTexture();
    if (tex) nm.setBaseColorTexture(doc.createTexture(tex.getName()).setImage(tex.getImage()).setMimeType(tex.getMimeType()));
    if (m.getName() === 'Glow') nm.setEmissiveFactor([0.6, 1, 0.9]);
    matCache.set(m, nm);
    return nm;
  };
  for (const node of sroot.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    // Rigid pieces (the helmet) hang off a bone node instead of being skinned.
    let rigidBone = null;
    if (!node.getSkin()) {
      let p = node.getParentNode();
      while (p && !KK_MAP[p.getName()]) p = p.getParentNode();
      rigidBone = p ? p.getName() : 'head';
    }
    const nm = doc.createMesh(prefix + '_' + node.getName().replace(/^Skeleton_(Warrior|Mage)_/, ''));
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
      const jo = prim.getAttribute('JOINTS_0'), we = prim.getAttribute('WEIGHTS_0');
      const n = pos.getCount();
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
      const world = node.getWorldMatrix();
      const xf = (m, v, w1) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w1, m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w1, m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w1];
      for (let i = 0; i < n; i++) {
        let p = pos.getElement(i, []), q = nor.getElement(i, []);
        let infl;
        if (rigidBone) {
          p = xf(world, p, 1);
          q = xf(world, q, 0);
          infl = [[rigidBone, 1]];
        } else {
          const ji = jo.getElement(i, []), wi = we.getElement(i, []);
          infl = [];
          for (let k = 0; k < 4; k++) if (wi[k] > 0) infl.push([sj[ji[k]].getName(), wi[k]]);
        }
        let mp = [0, 0, 0], mn = [0, 0, 0], tw = 0;
        const acc = new Map();
        for (const [b, w] of infl) {
          const kk = KK_MAP[b] ? b : 'chest';
          mp = v3.add(mp, v3.mul(map(kk, p, false), w));
          mn = v3.add(mn, v3.mul(map(kk, q, true), w));
          tw += w;
          const ui = segs.get(kk).ual;
          acc.set(ui, (acc.get(ui) ?? 0) + w);
        }
        mp = v3.mul(mp, 1 / tw);
        mn = v3.norm(mn);
        P.set(mp, i * 3);
        N.set(mn, i * 3);
        const top = [...acc].sort((x, y) => y[1] - x[1]).slice(0, 4);
        const sum = top.reduce((s, x) => s + x[1], 0);
        top.forEach(([ui, w], k) => { J[i * 4 + k] = ui; W[i * 4 + k] = w / sum; });
      }
      const np = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buffer))
        .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer))
        .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(prim.getIndices().getArray().slice()).setBuffer(buffer))
        .setMaterial(copyMaterial(prim.getMaterial()));
      if (uv) np.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv.getArray().slice()).setBuffer(buffer));
      nm.addPrimitive(np);
    }
    out.push(doc.createNode(nm.getName()).setMesh(nm).setSkin(baseSkin));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Nature props
// ---------------------------------------------------------------------------

/** Nature props kept from the megakit (node names are kept as-is). */
const NATURE = [
  'CommonTree_1', 'CommonTree_3', 'CommonTree_5', 'Pine_1', 'Pine_3', 'TwistedTree_1', 'TwistedTree_3', 'DeadTree_2',
  'Bush_Common', 'Bush_Common_Flowers', 'Bush_Large', 'Fern_1', 'Fern_2', 'Plant_1', 'Plant_7', 'Flower_3_Group',
  'Flower_4_Group', 'Clover_1', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Tall', 'Rock_Medium_1',
  'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Mushroom_Common',
  // Round 4 (world track): cliffs, lush undergrowth, stepping stones and blossom for the temple hill.
  'Rock_Big_1', 'Rock_Big_2', 'Rock_Medium_4', 'GiantPine_1', 'Bush_Long_1', 'Bush_Large_Flowers', 'Grass_Wide_Tall',
  'Grass_Wispy_Short', 'Plant_1_Big', 'Plant_2', 'Mushroom_RedCap',
];

/**
 * Props from other CC0 packs, as [name in the game, file, ...node names to fold into one mesh].
 * Folding keeps a multi-node model (trunk + snow cap) as one named prop; a chest and its lid stay separate
 * props so the lid can swing open.
 */
const FLOBIT = process.env.FLOBIT_DIR ?? '/home/user/flo-bit/low-poly-asset-packs/nature-pack/glb';
const KAYKIT = process.env.KAYKIT_DIR ?? '/home/user/kaykit-game-assets/kaykit-dungeon-remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf';
const EXTRA = [
  ['SnowPine_1', pjoin(FLOBIT, 'pine_tree_1_snow.glb')],
  ['SnowPine_3', pjoin(FLOBIT, 'pine_tree_3_snow.glb')],
  ['SnowTree_2', pjoin(FLOBIT, 'common_tree_2_snow.glb')],
  ['BareTree_1', pjoin(FLOBIT, 'dead_tree_1.glb')],
  ['BareTree_3', pjoin(FLOBIT, 'dead_tree_3.glb')],
  ['Stump_1', pjoin(FLOBIT, 'tree_stump_1.glb')],
  ['Chest', pjoin(KAYKIT, 'chest.glb'), 'chest'],
  ['Chest_Lid', pjoin(KAYKIT, 'chest.glb'), 'chest_lid'],
  ['ChestGold', pjoin(KAYKIT, 'chest_gold.glb'), 'chest_gold'],
  ['ChestGold_Lid', pjoin(KAYKIT, 'chest_gold.glb'), 'chest_gold_lid'],
  ['Pillar', pjoin(KAYKIT, 'pillar.gltf.glb')],
  ['Rubble', pjoin(KAYKIT, 'rubble_large.gltf.glb')],
];

/** Moves every mesh primitive of `nodes` (baked to their world transform) onto one new node called `name`. */
async function foldNodes(doc, nodes, name) {
  const { transformPrimitive } = await import('@gltf-transform/functions');
  const mesh = doc.createMesh(name);
  for (const n of nodes) {
    const m = n.getMesh();
    if (!m) continue;
    for (const prim of m.listPrimitives()) {
      const copy = prim.clone();
      // Each copy gets its own vertex arrays before baking the transform.
      for (const sem of copy.listSemantics()) copy.setAttribute(sem, copy.getAttribute(sem).clone());
      if (copy.getIndices()) copy.setIndices(copy.getIndices().clone());
      transformPrimitive(copy, n.getWorldMatrix());
      mesh.addPrimitive(copy);
    }
  }
  return doc.createNode(name).setMesh(mesh);
}

async function nature() {
  const dir = pjoin(SRC, 'stylized-nature-megakit/glTF');
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('nature');
  for (const file of NATURE) {
    const part = await io.read(pjoin(dir, file + '.gltf'));
    const map = mergeDocuments(doc, part);
    for (const s of part.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
  }
  for (const [name, file, ...only] of EXTRA) {
    const part = await io.read(file);
    const map = mergeDocuments(doc, part);
    const nodes = part.getRoot().listNodes().filter((n) => n.getMesh() && (!only.length || only.includes(n.getName())));
    // A lid is a child of its chest in the source: fold it on its own so it keeps its hinge offset.
    scene.addChild(await foldNodes(doc, nodes.map((n) => map.get(n)), name));
  }
  for (const n of doc.getRoot().listNodes()) if (!n.getMesh() && !n.listChildren().length) n.dispose();
  // Lambert in game ignores normal maps; dropping them saves most of the texture bytes.
  for (const m of doc.getRoot().listMaterials()) m.setNormalTexture(null);
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
  await doc.transform(prune(), dedup(), flatten(), join({ keepNamed: true }), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.02 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pjoin(OUT, 'nature.glb'), doc);
}

if (which === 'all' || which === 'anims') await anims();
if (which === 'all' || which === 'bodies') {
  if (!UBC || !existsSync(UBC)) throw new Error('bodies need <ubc-dir>');
  await body('male');
  await body('female');
}
if (which === 'all' || which === 'nature') await nature();
for (const f of ['anims.glb', 'male.glb', 'female.glb', 'nature.glb']) {
  try { console.log(f, (statSync(pjoin(OUT, f)).size / 1024).toFixed(0) + ' KB'); } catch { /* not built */ }
}
