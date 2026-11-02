import { clamp, noise2 } from '../engine/util';

/**
 * Heightfield terrain built from hand-placed layout primitives.
 *
 * A layout lists walkable regions (areas and paths, each with a height), water bodies and peaks. From those
 * the terrain bakes two grids:
 *  - a fine 0.5 m walk grid: walkable mask, standing height and floor type. Steps between neighbouring cells
 *    taller than a stair riser are cliffs, so they are not walkable from either side.
 *  - a coarse 1 m ground grid for the terrain mesh, where everything off the walkable regions rises into banks,
 *    ridges and mountains (inverse-distance blended from every region, so heights meet without seams).
 */

export type Shape =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'rect'; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'poly'; pts: [number, number][] };

export const circle = (x: number, z: number, r: number): Shape => ({ kind: 'circle', x, z, r });
export const rect = (x0: number, z0: number, x1: number, z1: number): Shape =>
  ({ kind: 'rect', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const poly = (...pts: [number, number][]): Shape => ({ kind: 'poly', pts });

export type Floor = 'grass' | 'moss' | 'dirt' | 'stone' | 'sand' | 'snow' | 'ice' | 'rock' | 'bone' | 'wood';
export const FLOORS: Floor[] = ['grass', 'moss', 'dirt', 'stone', 'sand', 'snow', 'ice', 'rock', 'bone', 'wood'];

export interface AreaDef {
  shape: Shape;
  /** Standing height. */
  h: number;
  floor: Floor;
  /** Gentle rolling (dunes, mounds): peak-to-peak height added by low-frequency noise. */
  undulate?: number;
  /** Multiplier on how the wild ground rises around this region (negative: falls away, like a hilltop). */
  edge?: number;
  /** Draw a flagstone surface over it. */
  pave?: boolean;
}

export interface PathDef {
  /** Centre line as [x, z, height]; height is interpolated along it. */
  pts: [number, number, number][];
  w: number;
  floor: Floor;
  /** Build stone steps where it climbs. */
  stairs?: boolean;
  /** A raised deck (bridge): walkable, but the ground under it is shaped as if it was not there. */
  bridge?: boolean;
  pave?: boolean;
  edge?: number;
}

export interface WaterDef {
  shape?: Shape;
  /** A stream: centre line [x, z, surface height] and width. */
  line?: [number, number, number][];
  w?: number;
  level?: number;
  depth: number;
  /** Frozen: a walkable ice sheet at `level`. */
  frozen?: boolean;
}

export interface PeakDef { x: number; z: number; r: number; h: number }

export interface WildDef {
  /** Height the ground reaches `run` metres away from a walkable region. */
  bank: number;
  run: number;
  /** Extra rise per metre beyond `run`, up to `max`. */
  slope: number;
  max: number;
  /** Amplitude of the craggy noise on the wild ground. */
  noise: number;
  /** 0..1: how much less the ground rises on the camera side, so slopes don't hide the hero (default 0.6). */
  camRelief?: number;
}

export interface TerrainDef {
  areas: AreaDef[];
  paths: PathDef[];
  water: WaterDef[];
  peaks: PeakDef[];
  wild: WildDef;
}

/** Signed distance (negative inside) plus the closest boundary point and the region height there. */
interface Hit { d: number; cx: number; cz: number; h: number; t: number }

interface Prim {
  sd(x: number, z: number, out: Hit): void;
  /** Standing height at a point inside. */
  hAt(x: number, z: number, hit: Hit): number;
  bb: [number, number, number, number];
  edge: number;
  floor: number;
  deck: boolean;
  src: AreaDef | PathDef;
}

function shapeSd(s: Shape, x: number, z: number, out: Hit) {
  if (s.kind === 'circle') {
    const dx = x - s.x, dz = z - s.z, l = Math.hypot(dx, dz) || 1e-6;
    out.d = l - s.r;
    out.cx = s.x + (dx / l) * s.r;
    out.cz = s.z + (dz / l) * s.r;
  } else if (s.kind === 'rect') {
    const qx = Math.max(s.x0 - x, x - s.x1), qz = Math.max(s.z0 - z, z - s.z1);
    out.d = qx > 0 || qz > 0 ? Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) : Math.max(qx, qz);
    out.cx = clamp(x, s.x0, s.x1);
    out.cz = clamp(z, s.z0, s.z1);
  } else {
    let best = Infinity, inside = false;
    const p = s.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [ax, az] = p[j], [bx, bz] = p[i];
      if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside;
      const ex = bx - ax, ez = bz - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; out.cx = px; out.cz = pz; }
    }
    out.d = inside ? -best : best;
  }
}

const probe: Hit = { d: 0, cx: 0, cz: 0, h: 0, t: 0 };
/** Signed distance from a point to a shape's outline (negative inside). */
export function shapeDistance(s: Shape, x: number, z: number) {
  shapeSd(s, x, z, probe);
  return probe.d;
}

export function shapeBox(s: Shape): [number, number, number, number] {
  if (s.kind === 'circle') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
  if (s.kind === 'rect') return [s.x0, s.z0, s.x1, s.z1];
  const xs = s.pts.map((p) => p[0]), zs = s.pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

/** Distance to a polyline: writes the closest point, interpolated value (3rd coord) and arc parameter. */
function lineSd(pts: [number, number, number][], x: number, z: number, out: Hit) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
    const ex = bx - ax, ez = bz - az;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    const px = ax + ex * t, pz = az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      out.cx = px; out.cz = pz; out.h = ah + (bh - ah) * t; out.t = i + t;
    }
  }
  out.d = best;
}

function lineBox(pts: [number, number, number][], pad: number): [number, number, number, number] {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
}

const undulation = (x: number, z: number, amp: number) =>
  amp ? amp * (noise2(x * 0.07 + 13, z * 0.07 - 5) * 0.75 + noise2(x * 0.19, z * 0.19) * 0.25 - 0.5) : 0;

function compile(def: TerrainDef): Prim[] {
  const prims: Prim[] = [];
  for (const a of def.areas) {
    prims.push({
      sd: (x, z, o) => { shapeSd(a.shape, x, z, o); o.h = a.h; },
      hAt: (x, z) => a.h + undulation(x, z, a.undulate ?? 0),
      bb: shapeBox(a.shape), edge: a.edge ?? 1, floor: FLOORS.indexOf(a.floor), deck: false, src: a,
    });
  }
  for (const p of def.paths) {
    prims.push({
      sd: (x, z, o) => { lineSd(p.pts, x, z, o); o.d -= p.w / 2; },
      hAt: (_x, _z, hit) => hit.h,
      bb: lineBox(p.pts, p.w / 2), edge: p.edge ?? 1, floor: FLOORS.indexOf(p.floor), deck: !!p.bridge, src: p,
    });
  }
  for (const w of def.water) {
    if (!w.frozen) continue;
    // Frozen water is just a walkable sheet of ice.
    const shape = w.shape!;
    prims.push({
      sd: (x, z, o) => { shapeSd(shape, x, z, o); o.h = w.level ?? 0; },
      hAt: () => w.level ?? 0,
      bb: shapeBox(shape), edge: 0.6, floor: FLOORS.indexOf('ice'), deck: false, src: { shape, h: w.level ?? 0, floor: 'ice' },
    });
  }
  return prims;
}

interface WaterPrim { def: WaterDef; bb: [number, number, number, number]; sd(x: number, z: number, o: Hit): void }

function compileWater(def: TerrainDef): WaterPrim[] {
  return def.water.filter((w) => !w.frozen).map((w) => {
    if (w.line) {
      return { def: w, bb: lineBox(w.line, w.w! / 2 + 4), sd: (x, z, o) => { lineSd(w.line!, x, z, o); o.d -= w.w! / 2; } };
    }
    const b = shapeBox(w.shape!);
    return { def: w, bb: [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4], sd: (x, z, o) => { shapeSd(w.shape!, x, z, o); o.h = w.level ?? 0; } };
  });
}

const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const fbm = (x: number, z: number) => noise2(x * 0.06, z * 0.06) * 0.55 + noise2(x * 0.17 + 7, z * 0.17) * 0.3 + noise2(x * 0.5, z * 0.5 + 3) * 0.15;

/** Max standing-height step between neighbouring 0.5 m cells before it counts as a cliff. */
const STEP = 0.42;

export class Terrain {
  /** Fine walk grid (0.5 m). */
  readonly cell = 0.5;
  readonly fx0: number; readonly fz0: number; readonly fnx: number; readonly fnz: number;
  readonly walk: Uint8Array;
  readonly H: Float32Array;
  readonly floor: Uint8Array;
  /** 1 where a cell is a bridge deck. */
  readonly deck: Uint8Array;
  /** Coarse ground grid (1 m nodes) covering the whole terrain mesh. */
  readonly gx0: number; readonly gz0: number; readonly gnx: number; readonly gnz: number;
  readonly ground: Float32Array;
  /** Distance from each coarse node to the nearest walkable region (0 inside). */
  readonly dist: Float32Array;
  /** Water surface height at each coarse node, or -Infinity where there's no water. */
  readonly waterLevel: Float32Array;
  /** Bounds of the walkable regions. */
  readonly walkBox: { x0: number; z0: number; x1: number; z1: number };
  private readonly prims: Prim[];
  private readonly waters: WaterPrim[];
  private readonly hit: Hit = { d: 0, cx: 0, cz: 0, h: 0, t: 0 };

  constructor(readonly def: TerrainDef, margin = 42) {
    this.prims = compile(def);
    this.waters = compileWater(def);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of this.prims) { x0 = Math.min(x0, p.bb[0]); z0 = Math.min(z0, p.bb[1]); x1 = Math.max(x1, p.bb[2]); z1 = Math.max(z1, p.bb[3]); }
    this.walkBox = { x0, z0, x1, z1 };
    // Coarse grid
    this.gx0 = Math.floor(x0 - margin); this.gz0 = Math.floor(z0 - margin);
    this.gnx = Math.ceil(x1 + margin) - this.gx0 + 1;
    this.gnz = Math.ceil(z1 + margin) - this.gz0 + 1;
    const n = this.gnx * this.gnz;
    this.ground = new Float32Array(n);
    this.dist = new Float32Array(n);
    this.waterLevel = new Float32Array(n).fill(-Infinity);
    // Fine grid
    this.fx0 = Math.floor(x0) - 2; this.fz0 = Math.floor(z0) - 2;
    this.fnx = Math.ceil((x1 + 2 - this.fx0) / this.cell) + 1;
    this.fnz = Math.ceil((z1 + 2 - this.fz0) / this.cell) + 1;
    const fn = this.fnx * this.fnz;
    this.walk = new Uint8Array(fn);
    this.H = new Float32Array(fn);
    this.floor = new Uint8Array(fn).fill(255);
    this.deck = new Uint8Array(fn);
    this.bakeGround();
    this.bakeWalk();
  }

  /** Highest walkable region containing (x,z): writes its height/floor, returns false if none. */
  private inside(x: number, z: number, out: { h: number; floor: number; deck: boolean }, skipDeck = false) {
    let found = false;
    const hit = this.hit;
    for (const p of this.prims) {
      if (skipDeck && p.deck) continue;
      if (x < p.bb[0] || x > p.bb[2] || z < p.bb[1] || z > p.bb[3]) continue;
      p.sd(x, z, hit);
      if (hit.d > 0) continue;
      const h = p.hAt(x, z, hit);
      if (!found || h > out.h || (p.deck && !out.deck && h >= out.h - 0.01)) { out.h = h; out.floor = p.floor; out.deck = p.deck; }
      found = true;
    }
    return found;
  }

  /** Wild ground height away from the walkable regions. Also returns the distance to the nearest one. */
  private wildAt(x: number, z: number): [number, number] {
    const w = this.def.wild;
    const relief = w.camRelief ?? 0.6;
    const hit = this.hit;
    let sw = 0, sh = 0, dmin = Infinity;
    for (const p of this.prims) {
      if (p.deck) continue;
      p.sd(x, z, hit);
      const d = Math.max(hit.d, 0);
      const h = p.src && 'pts' in p.src ? hit.h : (p.src as AreaDef).h;
      dmin = Math.min(dmin, d);
      const dx = x - hit.cx, dz = z - hit.cz, l = Math.hypot(dx, dz) || 1;
      const towardCam = Math.max(0, (dx + dz) / l * 0.7071);
      let rise = w.bank * smooth(0, w.run, d) + w.slope * Math.max(0, d - w.run);
      rise = Math.min(rise, w.max) * p.edge;
      if (rise > 0) rise *= 1 - relief * towardCam;
      const wt = 1 / Math.pow(d + 0.6, 4);
      sw += wt;
      sh += wt * (h + rise);
    }
    let g = sh / sw;
    const near = smooth(0.5, w.run, dmin);
    g += (fbm(x, z) - 0.5) * 2 * w.noise * near;
    for (const pk of this.def.peaks) {
      const q = Math.hypot(x - pk.x, z - pk.z) / pk.r;
      if (q < 1) g += pk.h * (1 - q * q) * (1 - q * q) * smooth(1, 6, dmin);
    }
    return [g, dmin];
  }

  /** Lowers ground towards a water body: shore slope and basin. Returns [height, level or -Inf]. */
  private carve(x: number, z: number, g: number): [number, number] {
    let level = -Infinity;
    const hit = this.hit;
    for (const w of this.waters) {
      if (x < w.bb[0] || x > w.bb[2] || z < w.bb[1] || z > w.bb[3]) continue;
      w.sd(x, z, hit);
      const lv = w.def.line ? hit.h : (w.def.level ?? 0);
      if (hit.d < 3.5) {
        const target = hit.d < 0
          ? lv - 0.15 - w.def.depth * smooth(0, 2.5, -hit.d)
          : lv - 0.15 + Math.max(0, g - lv + 0.15) * smooth(0, 3.5, hit.d);
        g = Math.min(g, target);
      }
      if (hit.d < 1.6) level = Math.max(level, lv);
    }
    return [g, level];
  }

  private bakeGround() {
    const tmp = { h: 0, floor: 0, deck: false };
    for (let j = 0; j < this.gnz; j++) {
      for (let i = 0; i < this.gnx; i++) {
        const x = this.gx0 + i, z = this.gz0 + j, k = j * this.gnx + i;
        let g: number, d: number;
        if (this.inside(x, z, tmp, true)) { g = tmp.h; d = 0; }
        else [g, d] = this.wildAt(x, z);
        const [cg, lv] = this.carve(x, z, g);
        this.ground[k] = cg;
        this.dist[k] = d;
        this.waterLevel[k] = lv;
      }
    }
  }

  private bakeWalk() {
    const tmp = { h: 0, floor: 0, deck: false };
    const hit = this.hit;
    const inRegion = new Uint8Array(this.walk.length);
    for (let j = 0; j < this.fnz; j++) {
      for (let i = 0; i < this.fnx; i++) {
        const x = this.fx0 + i * this.cell, z = this.fz0 + j * this.cell, k = j * this.fnx + i;
        if (!this.inside(x, z, tmp)) { this.H[k] = this.groundAt(x, z); continue; }
        let h = tmp.h, ok = true;
        if (!tmp.deck) {
          for (const w of this.waters) {
            if (x < w.bb[0] || x > w.bb[2] || z < w.bb[1] || z > w.bb[3]) continue;
            w.sd(x, z, hit);
            if (hit.d < 0.45) ok = false;
            const lv = w.def.line ? hit.h : (w.def.level ?? 0);
            if (hit.d < 3.5) h = Math.min(h, lv - 0.15 + Math.max(0, h - lv + 0.15) * smooth(0, 3.5, hit.d));
          }
        }
        this.H[k] = h;
        this.floor[k] = tmp.floor;
        this.deck[k] = tmp.deck ? 1 : 0;
        inRegion[k] = 1;
        this.walk[k] = ok ? 1 : 0;
      }
    }
    // Cliffs: a step taller than a riser between neighbouring cells blocks both of them.
    const cliff: number[] = [];
    for (let j = 0; j < this.fnz; j++) {
      for (let i = 0; i < this.fnx; i++) {
        const k = j * this.fnx + i;
        if (!inRegion[k]) continue;
        const h = this.H[k];
        for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii >= this.fnx || jj < 0 || jj >= this.fnz) continue;
          const kk = jj * this.fnx + ii;
          if (!inRegion[kk]) continue;
          if (Math.abs(this.H[kk] - h) > STEP * (di && dj ? 1.414 : 1)) cliff.push(k, kk);
        }
      }
    }
    for (const k of cliff) this.walk[k] = 0;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Terrain mesh height (coarse ground, bilinear). */
  groundAt(x: number, z: number) {
    const fx = clamp(x - this.gx0, 0, this.gnx - 1.001), fz = clamp(z - this.gz0, 0, this.gnz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * this.gnx + i, g = this.ground;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + this.gnx] * (1 - u) + g[k + this.gnx + 1] * u) * v;
  }

  /** Standing height: walk regions (incl. bridge decks) where defined, ground elsewhere. */
  heightAt(x: number, z: number) {
    const fx = (x - this.fx0) / this.cell, fz = (z - this.fz0) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.fnx - 1 || fz >= this.fnz - 1) return this.groundAt(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * this.fnx + i, H = this.H;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + this.fnx] * (1 - u) + H[k + this.fnx + 1] * u) * v;
  }

  /** Index into the fine grid, or -1 outside it. */
  fineIndex(x: number, z: number) {
    const i = Math.round((x - this.fx0) / this.cell), j = Math.round((z - this.fz0) / this.cell);
    if (i < 0 || j < 0 || i >= this.fnx || j >= this.fnz) return -1;
    return j * this.fnx + i;
  }

  walkableAt(x: number, z: number) {
    const k = this.fineIndex(x, z);
    return k >= 0 && this.walk[k] === 1;
  }

  floorAt(x: number, z: number): Floor | null {
    const k = this.fineIndex(x, z);
    return k < 0 || this.floor[k] === 255 ? null : FLOORS[this.floor[k]];
  }

  /** Coarse-grid lookups (nearest node). */
  private coarse(x: number, z: number) {
    const i = clamp(Math.round(x - this.gx0), 0, this.gnx - 1), j = clamp(Math.round(z - this.gz0), 0, this.gnz - 1);
    return j * this.gnx + i;
  }
  distAt(x: number, z: number) { return this.dist[this.coarse(x, z)]; }
  waterAt(x: number, z: number) { return this.waterLevel[this.coarse(x, z)]; }

  /** Ground slope (rise per metre) at a coarse node. */
  slopeAt(x: number, z: number) {
    const e = 1;
    return Math.hypot(this.groundAt(x + e, z) - this.groundAt(x - e, z), this.groundAt(x, z + e) - this.groundAt(x, z - e)) / (2 * e);
  }
}
