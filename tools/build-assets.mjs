// Builds the compressed glTF assets in src/assets/models from the CC0 source packs (see CREDITS.md).
//
//   node tools/build-assets.mjs <quaternius-dir>
//
// <quaternius-dir> holds universal-animation-library, universal-animation-library-2 and
// stylized-nature-megakit as downloaded from quaternius.com. The outputs are committed, so this only needs to
// run when the clip or prop selection changes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld, meshopt, textureCompress, flatten, join, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { join as pjoin } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node tools/build-assets.mjs <quaternius-dir>');
const OUT = new URL('../src/assets/models/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

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
  Zombie_Bite: 'zBite', Zombie_Spawn: 'zSpawn',
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

async function characters() {
  const doc = await io.read(pjoin(SRC, 'universal-animation-library/Unreal-Godot/UAL1.glb'));
  const lib2 = await io.read(pjoin(SRC, 'universal-animation-library-2/Unreal-Godot/UAL2.glb'));
  const root = doc.getRoot();
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const buffer = root.listBuffers()[0];

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
  // Seen from a top-down camera, ~40% of the mannequin's triangles is plenty, and every enemy pays for it.
  await doc.transform(prune(), dedup(), resample({ tolerance: 2e-4 }), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.002 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pjoin(OUT, 'characters.glb'), doc);
}

/** Nature props kept from the megakit (node names are kept as-is). */
const NATURE = [
  'CommonTree_1', 'CommonTree_3', 'CommonTree_5', 'Pine_1', 'Pine_3', 'TwistedTree_1', 'TwistedTree_3', 'DeadTree_2',
  'Bush_Common', 'Bush_Common_Flowers', 'Bush_Large', 'Fern_1', 'Fern_2', 'Plant_1', 'Plant_7', 'Flower_3_Group',
  'Flower_4_Group', 'Clover_1', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Tall', 'Rock_Medium_1',
  'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Mushroom_Common',
];

async function nature() {
  const dir = pjoin(SRC, 'stylized-nature-megakit/glTF');
  const doc = new (await import('@gltf-transform/core')).Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('nature');
  const { mergeDocuments } = await import('@gltf-transform/functions');
  for (const file of NATURE) {
    const part = await io.read(pjoin(dir, file + '.gltf'));
    const map = mergeDocuments(doc, part);
    for (const s of part.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
  await doc.transform(prune(), dedup(), flatten(), join({ keepNamed: true }), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.02 }),
    textureCompress({ encoder: (await import('sharp')).default, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(pjoin(OUT, 'nature.glb'), doc);
}

const which = process.argv[3] ?? 'all';
if (which === 'all' || which === 'characters') await characters();
if (which === 'all' || which === 'nature') await nature();
for (const f of ['characters.glb', 'nature.glb']) {
  try { console.log(f, (statSync(pjoin(OUT, f)).size / 1024).toFixed(0) + ' KB'); } catch { /* not built */ }
}
