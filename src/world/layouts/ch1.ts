import { circle, rect } from '../terrain';
import type { LayoutDef } from './types';

/**
 * Chapter 1 — Black Wind Forest.
 *
 * A dark, rain-soaked forest valley between mountain ridges. The trail winds north from the forest edge
 * through a clearing to Mirror Pond, crosses the stream on an old plank bridge, and reaches a hollow under
 * the temple hill. Stone stairs climb to the temple courtyard (h 7.5), more stairs to the upper terrace
 * (h 12) and the Hall of Black Feathers.
 *
 * Side paths: Heron's Rest on the far shore of the pond (ornate chest), the Hidden Spring up the stream
 * (brazier-sealed chest), Crow's Ledge above the hollow (elite guard, sealed chest, and a barred gate that
 * becomes a shortcut once opened from the courtyard), the Stele Garden behind rubble east of the courtyard,
 * and the Hermit's Grotto behind rubble west of the terrace.
 */
export const CH1: LayoutDef = {
  id: 'black-wind-forest',
  terrain: {
    areas: [
      { shape: circle(0, 4, 9), h: 0, floor: 'grass' }, // forest edge (start)
      { shape: circle(-2, -24, 12), h: 0.3, floor: 'grass' }, // clearing
      { shape: circle(-0.5, -45, 3.2), h: 0.4, floor: 'moss' }, // shrine alcove
      { shape: circle(-4, -60, 13), h: 0.5, floor: 'grass' }, // pond glade
      { shape: circle(-3.5, -89, 3.2), h: 1.1, floor: 'moss' }, // shrine alcove past the bridge
      { shape: circle(-16, -108, 12), h: 1.5, floor: 'grass' }, // pine hollow
      { shape: circle(32, -72, 5.5), h: 0.8, floor: 'moss' }, // Heron's Rest
      { shape: circle(-36, -98, 6.5), h: 2.2, floor: 'moss' }, // Hidden Spring
      { shape: circle(-32, -144, 6.5), h: 7.5, floor: 'dirt', edge: 0.4 }, // Crow's Ledge
      { shape: rect(-15, -168, 15, -138), h: 7.5, floor: 'stone', pave: true, edge: 0.35 }, // temple courtyard
      { shape: circle(31, -160, 6.5), h: 8.5, floor: 'moss', edge: 0.5 }, // Stele Garden
      { shape: rect(-17, -208, 17, -184), h: 12, floor: 'stone', pave: true, edge: 0.3 }, // upper terrace
      { shape: rect(-27, -202, -17, -190), h: 12, floor: 'stone', pave: true, edge: 0.3 }, // west pavilion pad
      { shape: rect(17, -202, 27, -190), h: 12, floor: 'stone', pave: true, edge: 0.3 }, // east pavilion pad
      { shape: circle(-40, -210, 5.5), h: 12.5, floor: 'dirt', edge: 1.5 }, // Hermit's Grotto
      { shape: rect(-6, -216, 6, -208), h: 12, floor: 'stone', pave: true, edge: 0.3 }, // arena approach
      { shape: circle(0, -230, 14), h: 12, floor: 'stone', pave: true, edge: 0.3 }, // boss arena
      { shape: rect(-11, -257, 11, -244), h: 12, floor: 'stone', pave: true, edge: 0.4 }, // hall porch
    ],
    paths: [
      { pts: [[0, -2, 0], [-1, -8, 0.15], [-2, -13, 0.3]], w: 5, floor: 'dirt' },
      { pts: [[-3, -34, 0.3], [-4, -40, 0.4], [-5, -50, 0.5]], w: 5, floor: 'dirt' },
      { pts: [[-5, -70, 0.5], [-6, -72.5, 0.5]], w: 4.5, floor: 'dirt' },
      { pts: [[-6, -72, 0.5], [-6.4, -74.4, 0.95], [-7, -78.2, 0.95], [-7.4, -80.6, 0.6]], w: 3.2, floor: 'wood', bridge: true },
      { pts: [[-7.4, -80.2, 0.6], [-8.5, -88, 1.1], [-10, -95, 1.3], [-14, -100, 1.5]], w: 4.5, floor: 'dirt' },
      // to Heron's Rest along the pond's south shore
      { pts: [[6, -53, 0.5], [16, -49.5, 0.4], [26, -56, 0.5], [30, -66, 0.7]], w: 3.4, floor: 'grass' },
      // up the stream to the Hidden Spring
      { pts: [[-9, -90, 1.15], [-20, -93, 1.6], [-30, -96, 2.1]], w: 3, floor: 'dirt' },
      // stairs from the hollow to the courtyard
      { pts: [[-10, -117, 1.5], [-9.8, -120.5, 1.5], [-9, -138.6, 7.5]], w: 5, floor: 'stone', stairs: true },
      // the hollow up to Crow's Ledge, then on to the courtyard's west wall (barred gate)
      { pts: [[-26, -111, 1.5], [-37, -120, 3.4], [-35, -134, 7.5], [-33, -140, 7.5]], w: 3.5, floor: 'dirt' },
      { pts: [[-27, -146, 7.5], [-21, -149, 7.5], [-14.5, -150, 7.5]], w: 3, floor: 'dirt' },
      // courtyard east to the Stele Garden
      { pts: [[14.5, -155, 7.5], [20, -156, 7.7], [26, -158, 8.5]], w: 3, floor: 'stone' },
      // courtyard to the upper terrace
      { pts: [[0, -167, 7.5], [0, -169.5, 7.5], [0, -184.5, 12]], w: 6, floor: 'stone', stairs: true },
      // terrace west pad to the Hermit's Grotto
      { pts: [[-26.5, -196, 12], [-31, -201, 12.3], [-36, -206, 12.5]], w: 2.6, floor: 'dirt' },
    ],
    water: [
      { shape: circle(13, -62, 8), level: 0.25, depth: 1.6 },
      { line: [[-52, -88, 1.9], [-30, -84, 1.2], [-14, -79, 0.7], [0, -71, 0.35], [8, -65, 0.25]], w: 3.6, depth: 0.9 },
      { shape: circle(-41, -103, 2.6), level: 2.0, depth: 1.0 },
    ],
    peaks: [
      { x: 42, z: -18, r: 30, h: 16 }, { x: -46, z: -34, r: 30, h: 20 }, { x: -62, z: -120, r: 34, h: 22 },
      { x: 58, z: -112, r: 36, h: 18 }, { x: 46, z: -215, r: 40, h: 24 }, { x: -52, z: -238, r: 40, h: 26 },
      { x: 0, z: -292, r: 50, h: 30 }, { x: 60, z: -170, r: 30, h: 16 },
    ],
    wild: { bank: 2.6, run: 6, slope: 0.5, max: 15, noise: 1.3, camRelief: 0.65 },
  },
  palette: { grass: 0x3f5c2a, moss: 0x32502a, dirt: 0x5a4a34, rock: 0x5a5852, high: 0x26341f, wild: 0x2e4524 },
  water: { shallow: 0x3a6a62, deep: 0x0e2a32, foam: 0xc8e4e0 },
  zones: [
    { checkpoint: [0, 7], shrine: [3.6, 5], trigger: circle(-2, -24, 10), area: { x0: -12, x1: 8, z0: -34, z1: -15 }, opensGate: 0 },
    { checkpoint: [-4.2, -44], shrine: [-0.2, -45.4], trigger: circle(-4, -60, 10), area: { x0: -14, x1: 4, z0: -70, z1: -51 }, opensGate: 1 },
    { checkpoint: [-8.4, -88], shrine: [-3.4, -89.4], trigger: circle(-16, -108, 9.5), area: { x0: -26, x1: -7, z0: -117, z1: -100 }, opensGate: 2 },
    { checkpoint: [-9, -141], shrine: [-12.6, -141.6], trigger: rect(-15, -168, 15, -145), area: { x0: -13, x1: 13, z0: -166, z1: -147 }, opensGate: 3 },
    { checkpoint: [0, -187], shrine: [4.2, -187.6], trigger: rect(-17, -208, 17, -191), area: { x0: -15, x1: 15, z0: -206, z1: -193 }, opensGate: 4 },
    { checkpoint: [0, -210.5], shrine: [4.4, -210.8], trigger: circle(0, -230, 11), area: { x0: -12, x1: 12, z0: -242, z1: -219 }, closesGate: 4 },
  ],
  gates: [
    { z: -39, x0: -7.5, x1: 0 },
    { z: -73.6, x0: -9, x1: -3.5 },
    { z: -121.2, x0: -13.5, x1: -6 },
    { z: -170.2, x0: -4, x1: 4 },
    { z: -215.2, x0: -6, x1: 6 },
  ],
  boss: [0, -232],
  route: [[0, 7], [-1, -8], [-2, -24], [-4, -40], [-4, -58], [-5.5, -71], [-6.6, -76], [-7.6, -82], [-9, -92], [-14, -100], [-15, -108], [-10.5, -116],
    [-9.8, -121], [-9, -138], [-4, -150], [0, -160], [0, -168], [0, -184], [0, -196], [0, -211], [0, -226]],
  regions: [
    { name: "Heron's Rest", shape: circle(32, -72, 6) },
    { name: 'Hidden Spring', shape: circle(-36, -98, 7) },
    { name: "Crow's Ledge", shape: circle(-32, -144, 7) },
    { name: 'Stele Garden', shape: circle(31, -160, 7) },
    { name: "Hermit's Grotto", shape: circle(-40, -210, 6) },
    { name: 'Stream Crossing', shape: rect(-10, -82, -3, -71) },
    { name: 'Temple Stairs', shape: rect(-13, -138, -6, -119) },
  ],
  props: [
    // forest edge & clearing
    { kind: 'statue', at: [-6.5, -1], rot: 0.4 },
    { kind: 'nature', name: 'Rock_Big_1', at: [7, -18], s: 0.7, r: 1.6 },
    { kind: 'nature', name: 'CommonTree_3', at: [-9, -20], s: 1.1, r: 0.7 },
    { kind: 'nature', name: 'Rock_Big_2', at: [4, -32], s: 0.6, r: 1.3 },
    { kind: 'nature', name: 'Stump_1', at: [-6, -28], s: 1.4, r: 0.6 },
    { kind: 'statue', at: [-8, -36], rot: 0.3 },
    { kind: 'statue', at: [2, -36], rot: -0.3 },
    // pond glade
    { kind: 'nature', name: 'TwistedTree_1', at: [-13, -56], s: 0.5, r: 0.8 },
    { kind: 'nature', name: 'Rock_Big_1', at: [-12, -66], s: 0.6, r: 1.4 },
    { kind: 'stele', at: [-1, -50], rot: 0.2 },
    { kind: 'lantern', at: [-8.5, -70] },
    { kind: 'lantern', at: [-2.6, -70.5] },
    // hollow
    { kind: 'nature', name: 'GiantPine_1', at: [-22, -104], s: 0.8, r: 1.0 },
    { kind: 'nature', name: 'Rock_Big_2', at: [-12, -103], s: 0.6, r: 1.3 },
    { kind: 'pillar', at: [-20, -114], s: 1.8 },
    { kind: 'pillar', at: [-6.5, -110], s: 1.1 },
    { kind: 'paifang', at: [-9.8, -118.6], s: 6, rot: 0.05 },
    // heron's rest / spring / ledge
    { kind: 'lantern', at: [29, -75] },
    { kind: 'nature', name: 'TwistedTree_3', at: [36, -69], s: 0.45, r: 0.8 },
    { kind: 'boulder', at: [-42, -96], s: 1.6 },
    { kind: 'nature', name: 'Rock_Big_1', at: [-28, -140], s: 0.7, r: 1.5 },
    { kind: 'bonePile', at: [-30, -148] },
    // courtyard
    { kind: 'statue', at: [-12.5, -139.5], rot: 0 },
    { kind: 'statue', at: [-5.5, -139.5], rot: 0 },
    { kind: 'lantern', at: [-11, -152] }, { kind: 'lantern', at: [11, -152] },
    { kind: 'lantern', at: [-11, -164] }, { kind: 'lantern', at: [11, -164] },
    { kind: 'pillar', at: [-12, -158], s: 2.6 }, { kind: 'pillar', at: [12, -146], s: 1.2 },
    { kind: 'pavilion', at: [8.5, -143.5], rot: Math.PI },
    { kind: 'statue', at: [-4, -167], rot: 0 }, { kind: 'statue', at: [4, -167], rot: 0 },
    { kind: 'stele', at: [31, -164], rot: 0.1 }, { kind: 'stele', at: [35, -158], rot: -1.2 }, { kind: 'stele', at: [27, -164], rot: 0.7 },
    // terrace
    { kind: 'pavilionSmall', at: [-22, -196], rot: Math.PI / 2 },
    { kind: 'pavilionSmall', at: [22, -196], rot: -Math.PI / 2 },
    { kind: 'lantern', at: [-14, -187] }, { kind: 'lantern', at: [14, -187] },
    { kind: 'lantern', at: [-14, -205] }, { kind: 'lantern', at: [14, -205] },
    { kind: 'balustrade', at: [-10.5, -184.6], rot: Math.PI / 2, s: 9 },
    { kind: 'balustrade', at: [10.5, -184.6], rot: Math.PI / 2, s: 9 },
    { kind: 'overhang', at: [-41, -211], s: 9, d: 9, rot: 0.3 },
    // arena and hall
    { kind: 'lantern', at: [-11, -238] }, { kind: 'lantern', at: [11, -238] },
    { kind: 'lantern', at: [-12.5, -226] }, { kind: 'lantern', at: [12.5, -226] },
    { kind: 'hall', at: [0, -253] },
  ],
  foliage: {
    trees: [['CommonTree_3', 3], ['CommonTree_5', 2], ['Pine_1', 3], ['Pine_3', 2], ['GiantPine_1', 0.8], ['TwistedTree_1', 0.6], ['CommonTree_1', 1.2]],
    treeDensity: 0.26,
    treeBand: [2.4, 30],
    under: [['Bush_Common', 2], ['Bush_Large', 2], ['Fern_1', 3], ['Fern_2', 2], ['Bush_Long_1', 2], ['Plant_1_Big', 1], ['Rock_Medium_1', 0.8],
      ['Mushroom_RedCap', 0.5], ['Bush_Large_Flowers', 0.6], ['Grass_Wide_Tall', 1.5], ['Rock_Medium_4', 0.5]],
    underDensity: 0.62,
    cover: [['Grass_Common_Short', 3], ['Grass_Wispy_Short', 2], ['Clover_1', 2], ['Grass_Wide_Tall', 0.8], ['Flower_3_Group', 0.8], ['Fern_1', 0.6],
      ['Plant_7', 1], ['Flower_4_Group', 0.4], ['Mushroom_Common', 0.3]],
    coverDensity: 0.55,
    slopeRocks: [['Rock_Big_1', 1], ['Rock_Big_2', 1], ['Rock_Medium_4', 1]],
    far: 'pine',
    treeScale: [0.85, 1.35],
  },
  breakables: [
    ['barrel', 5, 0], ['crate', 6.2, -1], ['urn', -5, -14], ['rock', 3, -27], ['barrel', -10, -30], ['crate', -11, -31],
    ['urn', -10, -55], ['urn', -10.6, -56.2], ['rock', 2, -64], ['barrel', -13, -64],
    ['urn', -9, -112], ['barrel', -23, -110], ['crate', -24, -111.3], ['rock', -14, -99],
    ['urn', -13, -144], ['urn', -13.5, -145.2], ['barrel', 13, -160], ['barrel', 12.6, -161.3], ['bell', 6, -158], ['crate', -6, -164],
    ['barrel', -15, -200], ['crate', 15, -203], ['urn', 15.5, -201.6], ['bell', -8, -203],
    ['urn', -9, -222], ['urn', 9, -222], ['crate', -10, -246], ['barrel', 10, -246],
    ['rubble', 17.8, -155.4], ['rubble', -29.2, -198.4],
  ],
  chests: [
    { id: 'c1-clearing', at: [-11, -24], rot: 1.4, kind: 'normal' },
    { id: 'c1-heron', at: [34, -74.5], rot: -0.6, kind: 'ornate' },
    { id: 'c1-spring', at: [-37.5, -97.5], rot: 1.2, kind: 'sealed', sealedBy: 'p1-braziers' },
    { id: 'c1-hollow', at: [-8, -114], rot: -0.8, kind: 'normal' },
    { id: 'c1-ledge', at: [-35, -147.5], rot: 0.8, kind: 'sealed', sealedBy: 'e1-ledge' },
    { id: 'c1-garden', at: [33.5, -161.5], rot: -1.2, kind: 'ornate' },
    { id: 'c1-terrace', at: [24.5, -193], rot: -1.6, kind: 'normal' },
    { id: 'c1-hermit', at: [-41.5, -212.5], rot: 0.6, kind: 'ornate' },
  ],
  collectables: [
    { id: 'h1-clearing', at: [7.5, -24], kind: 'herb' },
    { id: 'h1-glade', at: [-13.5, -61], kind: 'herb' },
    { id: 'l1-bridge', at: [-9.6, -86], kind: 'lore', text: 'A monk\'s note, soaked through: "The black wind came up the stream at night. We barred the ledge gate from the courtyard side."' },
    { id: 'r1-spring', at: [-33, -101.5], kind: 'relic' },
    { id: 'h1-ledge', at: [-29, -142], kind: 'herb' },
    { id: 'l1-garden', at: [28.5, -157.5], kind: 'lore', text: 'Carved on the stele: "Light the three fires of the forest, and the spring will give up what the abbot hid."' },
    { id: 'h1-heron', at: [29.5, -70], kind: 'herb' },
    { id: 'r1-hermit', at: [-38, -208], kind: 'relic' },
  ],
  encounters: [
    { id: 'e1-heron', at: [31, -70], r: 6, kinds: [['ghoul', 2], ['weaver', 1]] },
    { id: 'e1-ledge', at: [-32, -143], r: 6.5, kinds: [['armored', 1], ['spiderling', 4]], elite: 'armored', level: 2 },
    { id: 'e1-spring', at: [-34, -97], r: 6, kinds: [['spiderling', 4], ['ghoul', 1]] },
    { id: 'e1-hermit', at: [-39, -209], r: 5, kinds: [['ghoul', 3]], level: 2 },
  ],
  doors: [
    { id: 'd1-ledge', a: [-15.6, -148.2], b: [-15.6, -151.8], from: [-12, -150], look: 'gate' },
  ],
  puzzles: [
    { id: 'p1-braziers', chest: 'c1-spring', braziers: [[-32.5, -95], [34.5, -69], [-24, -112.5]] },
  ],
};
