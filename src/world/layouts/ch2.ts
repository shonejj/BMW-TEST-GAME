import { circle, rect } from '../terrain';
import type { LayoutDef } from './types';

/**
 * Chapter 2 — Yellow Wind Ridge.
 *
 * From rolling dunes the trail enters a steep sandstone canyon under a wind-carved arch, opens into the
 * Canyon Narrows (a cave pocket to the west holds a guarded sealed chest), zig-zags up a switchback to a
 * ruined sandstone fort (h 8), passes under more arches between hoodoos and climbs stairs to Tiger Hall (h 15).
 * Side paths: Bone-Dry Basin east of the fort (ornate chest, archer camp), rubble-blocked lookout west of the
 * arches, and a brazier puzzle spread over the canyon.
 */
export const CH2: LayoutDef = {
  id: 'yellow-wind-ridge',
  terrain: {
    areas: [
      { shape: circle(0, 2, 14), h: 0, floor: 'sand', undulate: 0.9 }, // dune sea
      { shape: circle(7.5, -44, 3), h: 0.9, floor: 'sand' }, // shrine alcove
      { shape: circle(-2, -60, 12), h: 1, floor: 'sand', undulate: 0.5, edge: 1.3 }, // canyon narrows
      { shape: circle(-30, -68, 6.5), h: 1.2, floor: 'rock', edge: 2.2 }, // wind cave
      { shape: circle(13, -81, 3), h: 3, floor: 'dirt' }, // shrine alcove on the climb
      { shape: circle(-8, -94, 7), h: 5.2, floor: 'dirt', edge: 1.2 }, // switchback corner
      { shape: rect(-14, -140, 14, -112), h: 8, floor: 'stone', pave: true, edge: 0.6 }, // sandstone fort
      { shape: circle(38, -106, 7), h: 6, floor: 'sand', undulate: 0.6 }, // bone-dry basin
      { shape: circle(-5, -149, 3), h: 8, floor: 'sand' }, // shrine alcove
      { shape: circle(0, -190, 12), h: 11, floor: 'sand', undulate: 0.4 }, // arches
      { shape: circle(-26, -186, 5.5), h: 11.5, floor: 'rock', edge: 0.5 }, // lookout
      { shape: rect(-6, -222, 6, -217), h: 15, floor: 'stone', pave: true, edge: 0.5 },
      { shape: circle(0, -234, 14), h: 15, floor: 'stone', pave: true, edge: 0.4 }, // tiger hall arena
      { shape: rect(-11, -262, 11, -247), h: 15, floor: 'stone', pave: true, edge: 0.5 },
    ],
    paths: [
      { pts: [[0, -11, 0], [6, -30, 0.5], [2, -48.5, 1]], w: 6, floor: 'sand', edge: 1.6 },
      { pts: [[-13, -62, 1], [-24, -66, 1.2]], w: 3.6, floor: 'rock', edge: 1.6 },
      { pts: [[-4, -71, 1], [10, -80, 3], [-1, -88, 5.0], [-6, -92, 5.2], [4, -104, 8], [4, -113, 8]], w: 5, floor: 'dirt', edge: 1.2 },
      { pts: [[13.5, -125, 8], [26, -122, 7], [34, -112, 6]], w: 3.6, floor: 'sand' },
      { pts: [[0, -139.5, 8], [0, -150, 8], [8, -165, 9.5], [0, -179, 11]], w: 6, floor: 'sand', edge: 1.2 },
      { pts: [[-11, -188, 11], [-21, -186, 11.5]], w: 2.6, floor: 'rock' },
      { pts: [[0, -201, 11], [0, -204, 11], [0, -217.5, 15]], w: 6, floor: 'stone', stairs: true },
    ],
    water: [
      { shape: circle(-34, -72, 2.2), level: 0.8, depth: 0.8 }, // cave pool
    ],
    peaks: [
      { x: 40, z: -40, r: 28, h: 14 }, { x: -40, z: -30, r: 26, h: 16 }, { x: -48, z: -120, r: 34, h: 22 },
      { x: 60, z: -160, r: 34, h: 18 }, { x: -46, z: -220, r: 36, h: 24 }, { x: 0, z: -295, r: 50, h: 28 },
    ],
    wild: { bank: 6, run: 3.5, slope: 0.7, max: 18, noise: 1.6, camRelief: 0.7 },
  },
  palette: { grass: 0x8a7038, moss: 0x7a6434, dirt: 0x8a6440, rock: 0x8a5a3a, sand: 0xc09058, high: 0x7a4a2a, wild: 0xa87448 },
  water: { shallow: 0x5a8a7a, deep: 0x1a3a3a, foam: 0xe8dcc0 },
  zones: [
    { checkpoint: [0, 9], shrine: [4, 7], trigger: circle(0, -4, 8), area: { x0: -10, x1: 10, z0: -12, z1: 0 }, opensGate: 0 },
    { checkpoint: [3, -44], shrine: [8, -44.5], trigger: circle(-2, -62, 10), area: { x0: -12, x1: 8, z0: -70, z1: -53 }, opensGate: 1 },
    { checkpoint: [9, -79.5], shrine: [13.5, -81.5], trigger: circle(-8, -94, 6.5), area: { x0: -14, x1: -2, z0: -100, z1: -88 }, opensGate: 2 },
    { checkpoint: [4, -114.5], shrine: [8, -114.5], trigger: rect(-14, -140, 14, -118), area: { x0: -12, x1: 12, z0: -138, z1: -120 }, opensGate: 3 },
    { checkpoint: [-0.5, -148.5], shrine: [-5.5, -149.5], trigger: circle(0, -190, 10), area: { x0: -10, x1: 10, z0: -200, z1: -181 }, opensGate: 4 },
    { checkpoint: [0, -219.5], shrine: [4.6, -219.8], trigger: circle(0, -236, 11), area: { x0: -12, x1: 12, z0: -246, z1: -225 }, closesGate: 4 },
  ],
  gates: [
    { z: -20, x0: -2, x1: 8 },
    { z: -73.5, x0: -7, x1: 5 },
    { z: -109, x0: 0, x1: 8 },
    { z: -143, x0: -4, x1: 4 },
    { z: -222.6, x0: -6, x1: 6 },
  ],
  boss: [0, -236],
  route: [[0, 9], [0, -4], [3, -20], [6, -30], [2, -48], [-2, -60], [-3, -71], [10, -80], [-6, -92], [4, -104], [4, -113], [0, -126], [0, -140],
    [0, -150], [8, -165], [0, -179], [0, -190], [0, -204], [0, -219], [0, -232]],
  regions: [
    { name: 'Wind Cave', shape: circle(-30, -68, 7) },
    { name: 'Bone-Dry Basin', shape: circle(38, -106, 8) },
    { name: 'Sand-Wolf Lookout', shape: circle(-26, -186, 6) },
    { name: 'The Switchback', shape: rect(-12, -112, 14, -71) },
  ],
  props: [
    { kind: 'rockArch', at: [4.2, -38], s: 10.5, rot: 0.15 },
    { kind: 'hoodoo', at: [-9, -10], s: 6 }, { kind: 'hoodoo', at: [11, 6], s: 4.5 },
    { kind: 'boulder', at: [9, -2], s: 1.5 }, { kind: 'boulder', at: [-8, 8], s: 1.2 },
    { kind: 'hoodoo', at: [-10, -56], s: 7 }, { kind: 'boulder', at: [6, -66], s: 1.4 }, { kind: 'bonePile', at: [-6, -68] },
    { kind: 'overhang', at: [-30, -71.5], s: 11, d: 9 },
    { kind: 'banner', at: [-12, -114] }, { kind: 'banner', at: [12, -114] }, { kind: 'banner', at: [-12, -138] }, { kind: 'banner', at: [12, -138] },
    { kind: 'tent', at: [-8, -132] }, { kind: 'tent', at: [8, -130] },
    { kind: 'pillar', at: [-12, -124], s: 2.2 }, { kind: 'pillar', at: [11, -122], s: 1.4 },
    { kind: 'tent', at: [41, -103] }, { kind: 'banner', at: [35, -109] },
    { kind: 'rockArch', at: [3.6, -158], s: 12, rot: -0.5 }, { kind: 'rockArch', at: [4, -172], s: 12, rot: 0.5 },
    { kind: 'hoodoo', at: [-9, -194], s: 7 }, { kind: 'hoodoo', at: [8, -198], s: 5.5 }, { kind: 'hoodoo', at: [9, -183], s: 4 },
    { kind: 'statue', at: [-4.5, -217.5] }, { kind: 'statue', at: [4.5, -224.5] },
    { kind: 'banner', at: [-12, -230] }, { kind: 'banner', at: [12, -230] }, { kind: 'banner', at: [-10, -242] }, { kind: 'banner', at: [10, -242] },
    { kind: 'hall', at: [0, -256] },
  ],
  foliage: {
    trees: [['DeadTree_2', 2], ['BareTree_1', 2], ['BareTree_3', 1], ['TwistedTree_3', 0.5]],
    treeDensity: 0.04,
    treeBand: [3, 20],
    under: [['Rock_Medium_1', 2], ['Rock_Medium_2', 2], ['Rock_Medium_4', 1], ['Grass_Wispy_Tall', 1.5], ['Bush_Common', 0.6], ['Pebble_Round_1', 1]],
    underDensity: 0.3,
    cover: [['Grass_Wispy_Short', 1], ['Pebble_Round_1', 1.2], ['Grass_Common_Short', 0.5]],
    coverDensity: 0.1,
    slopeRocks: [['Rock_Big_1', 1], ['Rock_Big_2', 1], ['Rock_Medium_3', 1]],
    far: 'none',
    treeScale: [0.6, 1.0],
  },
  breakables: [
    ['urn', 5, -4], ['crate', -6, 0], ['urn', -8, -64], ['barrel', 5, -54], ['crate', 6, -55],
    ['barrel', -10, -120], ['crate', -11, -121.4], ['urn', 10, -135], ['bell', 7, -133], ['barrel', 9, -126],
    ['urn', -6, -186], ['urn', 6, -194], ['crate', -10, -250], ['barrel', 10, -250],
    ['rubble', -14.5, -187.6],
  ],
  chests: [
    { id: 'c2-dunes', at: [-9, 1], rot: 0.6, kind: 'normal' },
    { id: 'c2-cave', at: [-31, -70.5], rot: 0.2, kind: 'sealed', sealedBy: 'e2-cave' },
    { id: 'c2-corner', at: [-12.5, -96], rot: 1, kind: 'normal' },
    { id: 'c2-basin', at: [40, -108], rot: -0.8, kind: 'ornate' },
    { id: 'c2-fort', at: [-11, -130], rot: 1.5, kind: 'sealed', sealedBy: 'p2-braziers' },
    { id: 'c2-lookout', at: [-27.5, -188], rot: 0.9, kind: 'ornate' },
  ],
  collectables: [
    { id: 'h2-dunes', at: [8, -8], kind: 'herb' },
    { id: 'r2-cave', at: [-27, -65.5], kind: 'relic' },
    { id: 'l2-fort', at: [10, -133], kind: 'lore', text: 'A wolf captain\'s order: "Three signal fires: canyon, cave mouth, basin. Light all three and the fort strongbox opens."' },
    { id: 'h2-basin', at: [35, -102], kind: 'herb' },
    { id: 'r2-lookout', at: [-24, -184], kind: 'relic' },
  ],
  encounters: [
    { id: 'e2-cave', at: [-29, -67], r: 6.5, kinds: [['wolf', 3], ['ghoul', 1]], elite: 'wolf', level: 2 },
    { id: 'e2-basin', at: [37, -106], r: 7, kinds: [['archer', 3], ['wolf', 2]] },
    { id: 'e2-lookout', at: [-25, -186], r: 5, kinds: [['ghoul', 2], ['archer', 1]], level: 2 },
  ],
  doors: [],
  puzzles: [
    { id: 'p2-braziers', chest: 'c2-fort', braziers: [[8.5, -31], [-25, -63], [31, -109]] },
  ],
};
