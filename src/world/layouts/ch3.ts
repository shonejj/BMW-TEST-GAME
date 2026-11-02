import { circle, rect } from '../terrain';
import type { LayoutDef } from './types';

/**
 * Chapter 3 — Frozen Bone Sanctum.
 *
 * A snowbound pine path leads onto a wide frozen lake (walkable ice, with a chest out on the ice), then up
 * switchbacks along the ice cliffs to a ledge (h 6). Beyond, the Bone Halls: a long nave lined with giant rib
 * arches (h 7), stairs to the Ossuary Plaza (h 10) and the Sanctum of Bone. Side paths: the Frozen Falls
 * grotto west of the lake (brazier-sealed chest), the Frost Shrine east of the ledge (frost witches, ornate
 * chest), a side chapel in the halls (sealed by its guardian), and a barred gate from the plaza back down to
 * the ledge as a shortcut.
 */
export const CH3: LayoutDef = {
  id: 'frozen-bone-sanctum',
  terrain: {
    areas: [
      { shape: circle(0, 3, 11), h: 0, floor: 'snow' },
      { shape: circle(-8, -31, 3), h: 0.3, floor: 'snow' },
      { shape: circle(-44, -54, 6.5), h: 1.5, floor: 'snow', edge: 1.4 }, // frozen falls
      { shape: circle(-15.5, -90, 2.8), h: 3, floor: 'snow' },
      { shape: circle(4, -122, 9), h: 6, floor: 'snow', edge: 1.2 }, // ice cliffs ledge
      { shape: circle(36, -128, 6.5), h: 8, floor: 'snow', edge: 0.8 }, // frost shrine
      { shape: rect(-9, -190, 9, -146), h: 7, floor: 'bone', pave: true, edge: 0.9 }, // bone halls
      { shape: rect(9, -172, 16, -164), h: 7, floor: 'bone', pave: true, edge: 0.9 }, // side chapel
      { shape: circle(0, -216, 12), h: 10, floor: 'stone', pave: true, edge: 0.6 }, // ossuary plaza
      { shape: rect(-6, -236, 6, -228), h: 10, floor: 'stone', pave: true, edge: 0.6 },
      { shape: circle(0, -250, 14), h: 10, floor: 'stone', pave: true, edge: 0.6 }, // sanctum
    ],
    paths: [
      { pts: [[0, -7, 0], [-3, -28, 0.3], [-2, -36, 0.3]], w: 5, floor: 'snow' },
      { pts: [[-19, -50, 0.3], [-32, -46, 1], [-40, -50, 1.5]], w: 3, floor: 'snow' },
      { pts: [[0, -74, 0.3], [0, -80, 0.3], [-12, -92, 3], [4, -106, 6], [4, -114, 6]], w: 4.6, floor: 'snow', edge: 1.3 },
      { pts: [[12, -122, 6], [24, -118, 7], [32, -124, 8]], w: 3, floor: 'snow' },
      { pts: [[4, -130, 6], [0, -139, 7], [0, -147, 7]], w: 5, floor: 'snow' },
      { pts: [[0, -189, 7], [0, -191.5, 7], [0, -204.5, 10]], w: 6, floor: 'stone', stairs: true },
      // shortcut: plaza west down the cliff to the ledge (barred until opened from the plaza)
      { pts: [[-11.5, -214, 10], [-20, -200, 9], [-20, -150, 7], [-8, -126, 6]], w: 3, floor: 'snow' },
    ],
    water: [
      { shape: circle(0, -55, 20), level: 0.3, depth: 2, frozen: true },
    ],
    peaks: [
      { x: 44, z: -30, r: 30, h: 18 }, { x: -50, z: -20, r: 30, h: 20 }, { x: 52, z: -100, r: 30, h: 22 },
      { x: -64, z: -110, r: 34, h: 26 }, { x: 46, z: -200, r: 40, h: 26 }, { x: -50, z: -250, r: 40, h: 28 },
      { x: 0, z: -300, r: 50, h: 34 },
    ],
    wild: { bank: 3.5, run: 5, slope: 0.6, max: 18, noise: 1.4, camRelief: 0.65 },
  },
  palette: { grass: 0xd8e2ea, moss: 0xc0ccd8, dirt: 0x9aa4ae, rock: 0x6a7480, snow: 0xe2eaf2, ice: 0xa8c8e0, high: 0xeef4fa, wild: 0xcad6e0 },
  water: { shallow: 0x9ccbe6, deep: 0x3a6a92, foam: 0xf0f8ff },
  zones: [
    { checkpoint: [0, 8], shrine: [3.6, 6], trigger: circle(0, -6, 6), area: { x0: -8, x1: 8, z0: -10, z1: -1 }, opensGate: 0 },
    { checkpoint: [-4, -31], shrine: [-8.6, -31.6], trigger: circle(0, -55, 14), area: { x0: -14, x1: 14, z0: -68, z1: -42 }, opensGate: 1 },
    { checkpoint: [-11, -91], shrine: [-16, -90.5], trigger: circle(4, -123, 7.5), area: { x0: -3, x1: 11, z0: -129, z1: -117 }, opensGate: 2 },
    { checkpoint: [0, -149], shrine: [5.5, -149.5], trigger: rect(-9, -186, 9, -154), area: { x0: -8, x1: 8, z0: -184, z1: -156 }, opensGate: 3 },
    { checkpoint: [0, -206.5], shrine: [5.2, -207], trigger: circle(0, -219, 8.5), area: { x0: -9, x1: 9, z0: -226, z1: -211 }, opensGate: 4 },
    { checkpoint: [0, -232], shrine: [4.6, -232.4], trigger: circle(0, -252, 11), area: { x0: -12, x1: 12, z0: -262, z1: -241 }, closesGate: 4 },
  ],
  gates: [
    { z: -20, x0: -6, x1: 3 },
    { z: -77, x0: -4, x1: 4 },
    { z: -142, x0: -4, x1: 4 },
    { z: -192.5, x0: -4, x1: 4 },
    { z: -236.4, x0: -6, x1: 6 },
  ],
  boss: [0, -252],
  route: [[0, 8], [0, -6], [-3, -28], [-2, -40], [0, -55], [0, -74], [0, -80], [-12, -92], [4, -106], [4, -114], [4, -123], [2, -135], [0, -147],
    [0, -168], [0, -189], [0, -204], [0, -216], [0, -232], [0, -248]],
  regions: [
    { name: 'Frozen Falls', shape: circle(-44, -54, 7) },
    { name: 'Frost Shrine', shape: circle(36, -128, 7) },
    { name: 'Ossuary Chapel', shape: rect(9, -172, 16, -164) },
    { name: 'Cliff Path', shape: rect(-23, -205, -14, -130) },
  ],
  props: [
    { kind: 'iceSpire', at: [7, -2], s: 3 }, { kind: 'iceSpire', at: [-8, 6], s: 2.2 },
    { kind: 'iceSpire', at: [8, -48], s: 3.5 }, { kind: 'iceSpire', at: [-10, -62], s: 2.6 }, { kind: 'iceSpire', at: [15, -66], s: 2.2 },
    { kind: 'boulder', at: [-6, -50], s: 1.2 }, { kind: 'bonePile', at: [5, -38] },
    { kind: 'iceSpire', at: [-47, -57], s: 4 }, { kind: 'iceSpire', at: [-41, -59], s: 2.5 },
    { kind: 'iceSpire', at: [9, -127], s: 3 }, { kind: 'stele', at: [-2, -118], rot: 0.5 },
    { kind: 'iceSpire', at: [39, -131], s: 3.2 },
    { kind: 'ribArch', at: [0, -156], s: 16 }, { kind: 'ribArch', at: [0, -165], s: 16 }, { kind: 'ribArch', at: [0, -174], s: 16 }, { kind: 'ribArch', at: [0, -183], s: 16 },
    { kind: 'bonePile', at: [-7, -160] }, { kind: 'bonePile', at: [7, -178] }, { kind: 'skull', at: [13.5, -170.5], s: 0.9, rot: -Math.PI / 2 },
    { kind: 'lantern', at: [-7.5, -150] }, { kind: 'lantern', at: [7.5, -150] },
    { kind: 'statue', at: [-4.6, -204.5] }, { kind: 'statue', at: [4.6, -204.5] },
    { kind: 'bonePile', at: [-9, -220] }, { kind: 'bonePile', at: [9, -213] },
    { kind: 'lantern', at: [-11, -245] }, { kind: 'lantern', at: [11, -245] }, { kind: 'lantern', at: [-11, -257] }, { kind: 'lantern', at: [11, -257] },
    { kind: 'skull', at: [0, -268], s: 2.6 },
    { kind: 'iceSpire', at: [-12, -262], s: 4 }, { kind: 'iceSpire', at: [12, -262], s: 4 },
  ],
  foliage: {
    trees: [['SnowPine_1', 3], ['SnowPine_3', 2], ['SnowTree_2', 1], ['BareTree_1', 0.6]],
    treeDensity: 0.2,
    treeBand: [2.4, 26],
    under: [['Rock_Medium_1', 1], ['Rock_Medium_4', 1], ['Bush_Common', 0.6], ['Grass_Wispy_Tall', 0.8], ['Stump_1', 0.4]],
    underDensity: 0.32,
    cover: [['Grass_Wispy_Short', 1], ['Pebble_Round_1', 1]],
    coverDensity: 0.08,
    slopeRocks: [['Rock_Big_1', 1], ['Rock_Big_2', 1], ['Rock_Medium_4', 0.6]],
    far: 'snowpine',
    treeScale: [1.1, 1.7],
  },
  breakables: [
    ['urn', 5, 0], ['crate', -6, -2], ['urn', -4, -48], ['rock', 10, -58],
    ['urn', -1, -125], ['barrel', 9, -119],
    ['urn', -7, -168], ['urn', 7, -159], ['bell', -6, -186], ['crate', 6, -186],
    ['urn', -8, -214], ['urn', 8, -222], ['crate', -10, -262], ['barrel', 10, -262],
  ],
  chests: [
    { id: 'c3-path', at: [-7, -1], rot: 0.7, kind: 'normal' },
    { id: 'c3-lake', at: [15, -60], rot: -1.2, kind: 'ornate' },
    { id: 'c3-falls', at: [-46, -52], rot: 1.2, kind: 'sealed', sealedBy: 'p3-braziers' },
    { id: 'c3-frost', at: [38, -127], rot: -1.4, kind: 'ornate' },
    { id: 'c3-chapel', at: [14.5, -166], rot: -1.6, kind: 'sealed', sealedBy: 'e3-chapel' },
    { id: 'c3-cliff', at: [-21, -175], rot: 1.5, kind: 'normal' },
  ],
  collectables: [
    { id: 'h3-path', at: [3.5, -11], kind: 'herb' },
    { id: 'r3-lake', at: [-12, -66], kind: 'relic' },
    { id: 'l3-falls', at: [-42, -50], kind: 'lore', text: 'Frozen into the ice: "Three fires at the falls, the ledge and the plaza will thaw the abbess\'s chest."' },
    { id: 'h3-ledge', at: [10, -120], kind: 'herb' },
    { id: 'r3-chapel', at: [11, -168], kind: 'relic' },
    { id: 'l3-plaza', at: [-8, -224], kind: 'lore', text: 'Bone-carved verse: "She keeps the bones of every climber, and counts them each night."' },
  ],
  encounters: [
    { id: 'e3-frost', at: [35, -127], r: 6.5, kinds: [['frost', 2], ['bone', 1]], level: 1 },
    { id: 'e3-chapel', at: [5, -168], r: 4.5, kinds: [['bone', 2], ['frost', 1]], elite: 'bone', level: 2 },
    { id: 'e3-falls', at: [-42, -53], r: 6, kinds: [['wolf', 3]] },
  ],
  doors: [
    { id: 'd3-cliff', a: [-13.4, -212], b: [-11.4, -216], from: [-8, -215], look: 'slab' },
  ],
  puzzles: [
    { id: 'p3-braziers', chest: 'c3-falls', braziers: [[-40, -57], [-1, -128], [9, -210]] },
  ],
};
