import * as THREE from 'three';
import { noise2, seeded } from '../engine/util';

/**
 * Procedural textures, painted into canvases at load time: no image files to
 * download, crisp at any resolution we pick, and small enough for phones.
 * Each material gets a colour map plus a normal map derived from a height
 * field so lit surfaces show relief (joints, cracks, grain).
 */

interface Painted {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function fbm(x: number, y: number, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f) * a;
    f *= 2;
    a *= 0.5;
  }
  return v;
}

/** Height field (0..1 per pixel) → tangent-space normal map canvas. */
function normalFromHeight(h: Float32Array, size: number, strength: number) {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function finish(color: HTMLCanvasElement, normal: HTMLCanvasElement, repeat: number): Painted {
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { map, normalMap };
}

/** Irregular flagstones with dark mossy joints, chips and wet spots. */
export function flagstoneTexture(size = 512, repeat = 1): Painted {
  const rng = seeded(11);
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  // Staggered rows of stones of varying width
  const rows = 6;
  const rowH = size / rows;
  const stones: { x0: number; x1: number; y0: number; y1: number; tone: number }[] = [];
  for (let r = 0; r < rows; r++) {
    let x = -rng() * rowH;
    while (x < size) {
      const w = rowH * (0.8 + rng() * 0.9);
      stones.push({ x0: x, x1: x + w, y0: r * rowH, y1: (r + 1) * rowH, tone: 0.75 + rng() * 0.35 });
      x += w;
    }
  }
  const stoneAt = (px: number, py: number) => {
    for (const s of stones) {
      const sx = ((px - s.x0) % size + size) % size + s.x0;
      if (py >= s.y0 && py < s.y1 && sx >= s.x0 && sx < s.x1) return { s, ex: Math.min(sx - s.x0, s.x1 - sx), ey: Math.min(py - s.y0, s.y1 - py) };
    }
    return null;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 22, y / 22);
      const fine = noise2(x / 3.1, y / 3.1);
      const hit = stoneAt(x, y);
      const edge = hit ? Math.min(hit.ex, hit.ey) : 0;
      const joint = 1 - Math.min(1, edge / (3 + n * 4));
      const tone = hit ? hit.s.tone : 0.5;
      // Height: stones slightly domed, joints recessed, fine pitting
      const height = (1 - joint) * (0.7 + n * 0.3) - fine * 0.08;
      h[y * size + x] = height;
      // Colour: grey-brown stone, darker joints with moss
      let r = 112 * tone + n * 30 - fine * 14;
      let g = 108 * tone + n * 26 - fine * 14;
      let b = 98 * tone + n * 20 - fine * 12;
      const moss = joint * (0.6 + n * 0.6);
      r = r * (1 - moss) + 38 * moss;
      g = g * (1 - moss) + 54 * moss;
      b = b * (1 - moss) + 30 * moss;
      const wet = Math.max(0, fbm(x / 60 + 7, y / 60) - 0.55) * 1.6;
      const o = (y * size + x) * 4;
      img.data[o] = r * (1 - wet * 0.35);
      img.data[o + 1] = g * (1 - wet * 0.35);
      img.data[o + 2] = b * (1 - wet * 0.25);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, normalFromHeight(h, size, 6), repeat);
}

/** Forest floor: grass, dirt and leaf litter. Tiled over the terrain (vertex colours tint it). */
export function groundDetailTexture(size = 256, repeat = 1): Painted {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 18, y / 18, 3);
      const blades = noise2(x / 1.6, y / 6) * 0.6 + noise2(x / 5, y / 1.4) * 0.4;
      const pebble = Math.max(0, noise2(x / 7 + 3, y / 7) - 0.72) * 4;
      const v = 0.75 + blades * 0.35 + n * 0.2 + pebble * 0.3;
      h[y * size + x] = blades * 0.6 + pebble;
      const o = (y * size + x) * 4;
      img.data[o] = 200 * v;
      img.data[o + 1] = 205 * v;
      img.data[o + 2] = 190 * v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, normalFromHeight(h, size, 3), repeat);
}

/** Lacquered red wood with grain and worn edges (pillars, beams). */
export function lacquerTexture(size = 128): Painted {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(y / 2.2 + fbm(x / 30, y / 6) * 8) * 0.5 + 0.5;
      const wear = Math.max(0, fbm(x / 14 + 4, y / 14) - 0.62) * 3;
      h[y * size + x] = grain * 0.3 + wear;
      const o = (y * size + x) * 4;
      img.data[o] = (120 + grain * 25) * (1 - wear * 0.5) + wear * 60;
      img.data[o + 1] = (32 + grain * 8) * (1 - wear * 0.3) + wear * 40;
      img.data[o + 2] = (26 + grain * 6) * (1 - wear * 0.3) + wear * 30;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, normalFromHeight(h, size, 2), 1);
}

/** Curved grey roof tiles in rows (uses the roof height-field UVs, 1 unit = 1 m). */
export function roofTileTexture(size = 128): Painted {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = (x / size) * 4;
      const ridge = Math.abs(Math.sin(col * Math.PI));
      const row = ((y / size) * 6) % 1;
      const lip = row > 0.88 ? 0.4 : 0;
      const n = fbm(x / 10, y / 10, 3);
      h[y * size + x] = ridge * 0.8 + lip - row * 0.2;
      const v = 0.55 + ridge * 0.35 + n * 0.25 - lip * 0.6;
      const o = (y * size + x) * 4;
      img.data[o] = 62 * v;
      img.data[o + 1] = 70 * v;
      img.data[o + 2] = 74 * v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, normalFromHeight(h, size, 4), 1);
}

/** Drifting ground mist (soft noise), used on large transparent planes. */
export function mistTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 40, y / 40, 4);
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.max(0, n - 0.35) * 255 * 1.4;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
