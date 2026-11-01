import * as THREE from 'three';
import { RARITY_HEX, type Item, type Slot } from '../game/loot';
import { baseIndex } from '../game/loot';
import { WEAPON_LOOK } from '../game/gearlook';

/**
 * Item art: every piece of gear is a small 3D model (staffs, armour, gauntlets, boots, relics), rendered
 * once into a low-resolution icon and shown with hard pixel edges, so equipment looks like crafted objects
 * that match the game's pixel-art look instead of flat vector glyphs. Rarity adds gems, glow and trim.
 */

const mat = (color: number, o: { emissive?: number; ei?: number; shin?: number; metal?: boolean } = {}) =>
  o.metal
    ? new THREE.MeshPhongMaterial({ color, shininess: o.shin ?? 60, specular: 0x998866, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1 })
    : new THREE.MeshLambertMaterial({ color, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1, side: THREE.DoubleSide });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.rotation.set(rx, ry, rz);
  g.add(me);
  return me;
}

/** Rarity gem + glow orb attached at `p`: bigger and brighter as rarity rises. */
function gem(g: THREE.Group, rarity: number, x: number, y: number, z: number, s = 1) {
  if (rarity < 1) return;
  const c = RARITY_HEX[rarity];
  add(g, new THREE.OctahedronGeometry(0.1 + rarity * 0.025, 0).scale(s, s * 1.3, s), glow(c), x, y, z);
  if (rarity >= 3) add(g, new THREE.TorusGeometry(0.17 + rarity * 0.02, 0.018, 6, 16), glow(c), x, y, z, Math.PI / 2, 0, 0);
}

const WEAPON = WEAPON_LOOK;

function weapon(base: number, rarity: number) {
  const g = new THREE.Group();
  const p = WEAPON[base % WEAPON.length];
  const len = base === 4 ? 2.6 : 2.2;
  const shaftGeo = base === 3 ? new THREE.CylinderGeometry(p.r, p.r, len, 6) : new THREE.CylinderGeometry(p.r, p.r * (base === 1 ? 0.75 : 1), len, 10);
  add(g, shaftGeo, mat(p.shaft, { metal: base !== 4, shin: 30 }));
  const capM = mat(p.cap, { metal: true, shin: 90 });
  for (const y of [len / 2, -len / 2]) {
    add(g, new THREE.CylinderGeometry(p.r * 1.35, p.r * 1.35, 0.26, 12), capM, 0, y - Math.sign(y) * 0.13, 0);
    add(g, new THREE.TorusGeometry(p.r * 1.35, 0.025, 6, 14), capM, 0, y - Math.sign(y) * 0.3, 0, Math.PI / 2, 0, 0);
  }
  if (base === 1) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(g, new THREE.SphereGeometry(0.045, 6, 4), capM, Math.cos(a) * p.r * 0.95, 0.45 + (i % 3) * 0.28, Math.sin(a) * p.r * 0.95);
    }
  }
  if (base === 2) for (const y of [-0.5, 0, 0.5]) add(g, new THREE.CylinderGeometry(p.r * 1.12, p.r * 1.12, 0.1, 12), mat(0xe0a83a, { metal: true }), 0, y, 0);
  if (base === 3) {
    const bolt = glow(0x9af0ff);
    [[0, 0.5, 0], [0.08, 0.25, 0], [-0.06, 0, 0], [0.08, -0.25, 0], [-0.05, -0.5, 0]].forEach(([x, y, z], i) => add(g, new THREE.BoxGeometry(0.03, 0.3, 0.03), bolt, x + p.r, y, z, 0, 0, i % 2 ? 0.5 : -0.5));
  }
  if (base === 4) {
    add(g, new THREE.ConeGeometry(0.13, 0.7, 4).scale(1, 1, 0.3), mat(0xcfe8f0, { metal: true, shin: 120 }), 0, len / 2 + 0.3, 0);
    add(g, new THREE.CylinderGeometry(0.03, 0.12, 0.5, 6), mat(0xc82a2a), 0, len / 2 - 0.45, 0.02);
  }
  gem(g, rarity, 0, len / 2 + (base === 4 ? 0.75 : 0.18), 0, 1.2);
  if (rarity >= 2) add(g, new THREE.SphereGeometry(0.2 + rarity * 0.03, 10, 8), new THREE.MeshBasicMaterial({ color: RARITY_HEX[rarity], transparent: true, opacity: 0.25 }), 0, len / 2 + 0.18, 0);
  g.rotation.z = -0.75;
  return g;
}

function torso(width: number, height: number, depth: number, color: number, metal: boolean) {
  const g = new THREE.Group();
  const body = add(g, new THREE.CylinderGeometry(width, width * 0.82, height, 12, 1), mat(color, { metal, shin: 50 }));
  body.scale.z = depth;
  return g;
}

function chest(base: number, rarity: number) {
  const accent = RARITY_HEX[rarity];
  let g: THREE.Group;
  if (base === 0) {
    g = torso(0.62, 1.1, 0.55, 0x8a5a2c, false);
    add(g, new THREE.BoxGeometry(0.22, 1.05, 0.05), mat(0x4a2a14), 0, 0, 0.34);
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.5, 0.05, 0.04), mat(0xc8a46a), 0, 0.35 - i * 0.22, 0.38, 0, 0, i % 2 ? 0.15 : -0.15);
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a4020), s * 0.62, 0.52, 0);
  } else if (base === 1) {
    g = torso(0.64, 1.1, 0.58, 0x5a6a7a, true);
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++) {
      const a = ((i + (row % 2) * 0.5) / 9) * Math.PI * 1.5 - Math.PI * 0.75;
      add(g, new THREE.SphereGeometry(0.1, 6, 4).scale(1, 0.55, 0.4), mat(row % 2 ? 0x8a9aaa : 0x6a7a8a, { metal: true }), Math.sin(a) * 0.62, 0.42 - row * 0.2, Math.cos(a) * 0.58 * 0.8 + 0.05, -0.3, a, 0);
    }
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9aaabb, { metal: true }), s * 0.66, 0.55, 0);
  } else if (base === 2) {
    g = torso(0.66, 1.1, 0.6, 0x2a2024, true);
    add(g, new THREE.BoxGeometry(0.5, 0.08, 0.06), glow(0xff3a20), 0, 0.2, 0.36);
    add(g, new THREE.BoxGeometry(0.08, 0.7, 0.06), glow(0xff3a20), 0, -0.1, 0.36);
    for (const s of [-1, 1]) {
      add(g, new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a2a30, { metal: true }), s * 0.7, 0.55, 0);
      for (let k = 0; k < 3; k++) add(g, new THREE.ConeGeometry(0.07, 0.34, 5), mat(0x7a6a70, { metal: true }), s * (0.72 + k * 0.1), 0.78 + k * 0.05, (k - 1) * 0.14, 0, 0, -s * (0.5 + k * 0.25));
    }
  } else {
    g = torso(0.6, 1.2, 0.5, 0xc8742a, false);
    add(g, new THREE.CylinderGeometry(0.64, 0.64, 0.16, 12, 1, true), mat(0x9a1a14), 0, -0.2, 0).scale.z = 0.58;
    for (const s of [-1, 1]) {
      add(g, new THREE.CylinderGeometry(0.2, 0.34, 0.9, 10), mat(0xb8661e), s * 0.85, 0.18, 0, 0, 0, s * 0.6);
    }
    add(g, new THREE.BoxGeometry(0.16, 0.7, 0.05), mat(0xe8d8b0), -0.14, 0.36, 0.3, 0, 0, 0.5);
    add(g, new THREE.BoxGeometry(0.16, 0.7, 0.05), mat(0xe8d8b0), 0.14, 0.36, 0.3, 0, 0, -0.5);
  }
  add(g, new THREE.TorusGeometry(0.3, 0.07, 6, 16, Math.PI), mat(base === 2 ? 0x3a2a30 : 0x6a4a2a, { metal: true }), 0, 0.62, 0, 0, 0, Math.PI);
  gem(g, rarity, 0, 0.18, 0.36, 1.2);
  if (rarity >= 1) add(g, new THREE.TorusGeometry(0.66, 0.025, 6, 24), glow(accent), 0, -0.55, 0, Math.PI / 2, 0, 0).scale.y = 0.85;
  g.rotation.set(0.1, -0.4, 0);
  return g;
}

function gloves(base: number, rarity: number) {
  const g = new THREE.Group();
  const cuff = [0xe8d8b0, 0x8a8a96, 0x2a2024, 0xc8742a][base % 4];
  const metal = base === 1 || base === 2;
  add(g, new THREE.CylinderGeometry(0.34, 0.3, 0.6, 12), mat(cuff, { metal }), 0, 0.6, 0);
  add(g, new THREE.BoxGeometry(0.62, 0.55, 0.38), mat(cuff, { metal }), 0, 0.05, 0);
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.13, 0.4, 0.17), mat(cuff, { metal }), -0.24 + i * 0.16, -0.38, 0);
  add(g, new THREE.BoxGeometry(0.15, 0.36, 0.17), mat(cuff, { metal }), 0.4, -0.05, 0.05, 0, 0, -0.7);
  if (base === 0) for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(0.32, 0.03, 6, 14), mat(0x6a5a3a), 0, 0.4 + i * 0.1, 0, Math.PI / 2, 0, 0);
  if (base === 1 || base === 2) {
    add(g, new THREE.BoxGeometry(0.6, 0.1, 0.4), mat(base === 2 ? 0x7a2a20 : 0xc8c8d0, { metal: true }), 0, 0.28, 0);
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.14, 0.12, 0.2), mat(base === 2 ? 0x7a2a20 : 0xc8c8d0, { metal: true }), -0.24 + i * 0.16, -0.18, 0.02);
  }
  if (base === 2) for (let i = 0; i < 4; i++) add(g, new THREE.ConeGeometry(0.05, 0.22, 5), mat(0xaa9aa0, { metal: true }), -0.24 + i * 0.16, 0.38, 0.2, 0.4, 0, 0);
  if (base === 3) {
    for (let i = 0; i < 3; i++) add(g, new THREE.ConeGeometry(0.045, 0.5, 5), mat(0xf0f0e0, { metal: true }), -0.16 + i * 0.16, -0.78, 0.05, Math.PI, 0, 0);
    for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.62, 0.05, 0.4), mat(0x2a1a10), 0, 0.12 - i * 0.14, 0);
  }
  gem(g, rarity, 0, 0.06, 0.22, 1);
  g.rotation.set(0.2, -0.5, -0.5);
  return g;
}

function boots(base: number, rarity: number) {
  const g = new THREE.Group();
  const c = [0x8a5a2c, 0xeaf6ff, 0x4ac8ff, 0x6a6a72][base % 4];
  const metal = base === 3;
  add(g, new THREE.CylinderGeometry(0.34, 0.38, 0.9, 12), mat(c, { metal }), -0.1, 0.45, 0);
  add(g, new THREE.BoxGeometry(0.62, 0.3, 1.15).translate(0, 0, 0.3), mat(c, { metal }), -0.1, -0.1, 0);
  add(g, new THREE.BoxGeometry(0.66, 0.1, 1.2).translate(0, 0, 0.3), mat(0x2a1a10), -0.1, -0.3, 0);
  if (base === 0) for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.7, 0.05, 0.06), mat(0xc8a46a), -0.1, 0.2 + i * 0.22, 0.3);
  if (base === 1) for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(0.2 + (i % 2) * 0.05, 8, 6), mat(0xffffff), -0.1 + (i - 1.5) * 0.28, -0.32, 0.05 - (i % 2) * 0.3);
  if (base === 2) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(g, new THREE.PlaneGeometry(0.22, 0.7), mat(0xdcf4ff), -0.1 + s * (0.42 + k * 0.1), 0.5 + k * 0.1, -0.1, 0, 0, -s * (0.3 + k * 0.28));
  if (base === 3) for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.74, 0.16, 0.3), mat(0x9a9aa4, { metal: true }), -0.1, 0.1 + i * 0.25, 0.1);
  gem(g, rarity, -0.1, 0.75, 0.3, 1);
  g.rotation.set(0.1, -0.6, 0);
  return g;
}

function relic(base: number, rarity: number) {
  const g = new THREE.Group();
  const accent = RARITY_HEX[rarity];
  if (base === 0) {
    add(g, new THREE.TorusGeometry(0.5, 0.17, 8, 24), mat(0x3ad48a, { metal: true, shin: 100, emissive: 0x0a4a2a }));
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), mat(0xe0a83a, { metal: true }), 0, 0.68, 0);
    for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), mat(0xc82a2a), (i - 1.5) * 0.05, -0.85, 0);
  } else if (base === 1) {
    add(g, new THREE.IcosahedronGeometry(0.5, 0), glow(0xff3a20));
    add(g, new THREE.IcosahedronGeometry(0.34, 0), glow(0xffb040));
    for (let i = 0; i < 6; i++) add(g, new THREE.ConeGeometry(0.1, 0.4, 5), glow(i % 2 ? 0xff7a20 : 0xffd040), Math.sin(i) * 0.3, 0.65 + (i % 3) * 0.1, Math.cos(i) * 0.2);
  } else if (base === 2) {
    add(g, new THREE.SphereGeometry(0.46, 14, 10).scale(1, 0.95, 1), mat(0xd8a030, { metal: true, shin: 80 }), 0, -0.25, 0);
    add(g, new THREE.SphereGeometry(0.3, 12, 8), mat(0xd8a030, { metal: true, shin: 80 }), 0, 0.42, 0);
    add(g, new THREE.CylinderGeometry(0.09, 0.12, 0.2, 8), mat(0x7a1a14), 0, 0.72, 0);
    add(g, new THREE.TorusGeometry(0.36, 0.035, 6, 20), mat(0xc82a2a), 0, 0.12, 0, Math.PI / 2, 0, 0);
  } else {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add(g, new THREE.SphereGeometry(0.11, 8, 6), mat(i % 6 === 0 ? 0xe0a83a : 0x5a3a24, { metal: i % 6 === 0 }), Math.sin(a) * 0.55, Math.cos(a) * 0.55 + 0.1, 0);
    }
    add(g, new THREE.SphereGeometry(0.16, 8, 6), mat(0xc82a2a), 0, -0.52, 0);
    for (let i = 0; i < 3; i++) add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), mat(0xc82a2a), (i - 1) * 0.05, -0.85, 0);
  }
  if (rarity >= 1) add(g, new THREE.TorusGeometry(0.85, 0.02, 6, 28), glow(accent), 0, 0, 0);
  gem(g, rarity, 0, base === 3 ? 0.65 : -0.9, 0.2, 1);
  g.rotation.set(0.15, -0.4, 0);
  return g;
}

const BUILD: Record<Slot, (base: number, rarity: number) => THREE.Group> = { weapon, chest, gloves, boots, relic };

const SIZE = 56;
const cache = new Map<string, string>();
let rt: THREE.WebGLRenderTarget | null = null;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;

function setup() {
  rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a2e24, 1.7));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.4);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const back = new THREE.DirectionalLight(0x88aaff, 1.2);
  back.position.set(3, 1, -3);
  scene.add(back);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
}

/** Pixel-art icon (data URL) for an item. Rendered once per design/rarity and cached. */
export function itemIcon(renderer: THREE.WebGLRenderer, it: { slot: Slot; rarity: number; name: string } | { slot: Slot; base: number; rarity: number }): string {
  const base = 'base' in it ? it.base : baseIndex(it as Item);
  const key = `${it.slot}:${base}:${it.rarity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!rt) setup();
  const model = BUILD[it.slot](base, it.rarity);
  scene!.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.y) * 0.56;
  cam!.left = -half; cam!.right = half; cam!.top = half; cam!.bottom = -half;
  cam!.position.set(c.x, c.y + 0.2, c.z + 10);
  cam!.lookAt(c);
  cam!.updateProjectionMatrix();

  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene!, cam!);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt!, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  scene!.remove(model);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });

  // Linear → sRGB, flip vertically, posterise slightly and add a dark 1px outline for the pixel-art look.
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  const g = out.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  const alphaAt = (x: number, y: number) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : px[((SIZE - 1 - y) * SIZE + x) * 4 + 3]);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const si = ((SIZE - 1 - y) * SIZE + x) * 4, di = (y * SIZE + x) * 4;
      if (px[si + 3] > 100) {
        for (let k = 0; k < 3; k++) {
          const v = Math.pow(px[si + k] / 255, 1 / 2.2);
          img.data[di + k] = Math.round(Math.min(1, v) * 7) * 36;
        }
        img.data[di + 3] = 255;
      } else if (alphaAt(x - 1, y) > 100 || alphaAt(x + 1, y) > 100 || alphaAt(x, y - 1) > 100 || alphaAt(x, y + 1) > 100) {
        img.data[di] = 12; img.data[di + 1] = 8; img.data[di + 2] = 6; img.data[di + 3] = 235;
      }
    }
  }
  g.putImageData(img, 0, 0);
  const url = out.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function itemImg(renderer: THREE.WebGLRenderer, it: { slot: Slot; rarity: number; name: string } | { slot: Slot; base: number; rarity: number }, cls = 'item-img') {
  return `<img class="${cls}" src="${itemIcon(renderer, it)}" alt="" draggable="false">`;
}
