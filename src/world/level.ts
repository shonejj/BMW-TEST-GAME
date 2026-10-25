import * as THREE from 'three';
import { clamp, noise2, seeded } from '../engine/util';
import { makeBlob } from '../game/vfx';
import {
  balustrade, bambooGeometry, breakable, brokenPillar, colored, fernGeometry, grassGeometry, guardianStatue,
  pavilion, pineGeometry, rockGeometry, sealBarrier, stoneLantern, templeHall, vcMaterial, vcMaterialDouble,
  type BreakableDef, type BreakableKind, type PropResult,
} from './props';

/**
 * Chapter 1, "Mountain-Sea Temple". The level runs from south (+Z, near the
 * camera) to north (-Z): forest clearing → temple courtyard → stone stairs →
 * upper plaza → boss arena in front of the main hall.
 */

interface Rect { x0: number; x1: number; z0: number; z1: number }
interface Circle { x: number; z: number; r: number }

export interface Breakable {
  def: BreakableDef;
  pos: THREE.Vector3;
  hp: number;
  broken: boolean;
}

export interface Gate {
  z: number;
  x0: number;
  x1: number;
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  fade: number;
}

export type SpawnKind = 'spiderling' | 'armored' | 'weaver' | 'boss';
export interface WaveDef { kinds: [SpawnKind, number][]; elite?: boolean }
export interface ZoneDef {
  name: string;
  checkpoint: THREE.Vector3;
  triggerZ: number;
  area: Rect;
  level: number;
  waves: WaveDef[];
  opensGate?: number;
  closesGate?: number;
}

export const STAIRS = { z0: -80, z1: -100, h: 5 };

const WALK_RECTS: Rect[] = [
  { x0: -11, x1: 11, z0: -37, z1: 9 },     // forest clearing
  { x0: -5, x1: 5, z0: -46, z1: -34 },     // path
  { x0: -14, x1: 14, z0: -81, z1: -44 },   // courtyard
  { x0: -6, x1: 6, z0: -102, z1: -78 },    // stairs
  { x0: -16, x1: 16, z0: -123, z1: -100 }, // upper plaza
  { x0: -6, x1: 6, z0: -127, z1: -121 },   // arena entrance
];
const WALK_CIRCLES: Circle[] = [{ x: 0, z: -139, r: 14 }];
/** Extra flat ground (not walkable) under buildings. */
const PADS: Rect[] = [
  { x0: -21, x1: -9, z0: -11, z1: 1 },
  { x0: 14, x1: 24, z0: -66, z1: -54 },
  { x0: -26, x1: -16, z0: -118, z1: -106 },
  { x0: 16, x1: 26, z0: -118, z1: -106 },
  { x0: -14, x1: 14, z0: -172, z1: -152 },
];

export class Level {
  readonly group = new THREE.Group();
  readonly obstacles: Circle[] = [];
  readonly breakables: Breakable[] = [];
  readonly gates: Gate[] = [];
  readonly zones: ZoneDef[];
  readonly bounds = { x0: -34, x1: 34, z0: -160, z1: 14 };
  private readonly rng = seeded(42);

  constructor(private readonly scene: THREE.Scene) {
    this.zones = [
      {
        name: 'Forest Clearing', checkpoint: new THREE.Vector3(0, 0, 5), triggerZ: -12, level: 1,
        area: { x0: -10, x1: 10, z0: -35, z1: -8 },
        waves: [{ kinds: [['spiderling', 6]] }, { kinds: [['spiderling', 5], ['weaver', 1]] }],
        opensGate: 0,
      },
      {
        name: 'Temple Courtyard', checkpoint: new THREE.Vector3(0, 0, -41), triggerZ: -50, level: 2,
        area: { x0: -13, x1: 13, z0: -79, z1: -47 },
        waves: [
          { kinds: [['spiderling', 8], ['weaver', 1]] },
          { kinds: [['armored', 1], ['spiderling', 6]], elite: true },
          { kinds: [['spiderling', 8], ['weaver', 2]] },
        ],
        opensGate: 1,
      },
      {
        name: 'Stone Stairs', checkpoint: new THREE.Vector3(0, 0, -78), triggerZ: -86, level: 3,
        area: { x0: -5, x1: 5, z0: -101, z1: -88 },
        waves: [{ kinds: [['spiderling', 9]] }, { kinds: [['armored', 1], ['spiderling', 4]] }],
      },
      {
        name: 'Upper Plaza', checkpoint: new THREE.Vector3(0, 5, -101), triggerZ: -105, level: 4,
        area: { x0: -15, x1: 15, z0: -121, z1: -104 },
        waves: [
          { kinds: [['spiderling', 12], ['weaver', 2]] },
          { kinds: [['armored', 2], ['spiderling', 6]] },
          { kinds: [['spiderling', 10], ['weaver', 2], ['armored', 1]], elite: true },
        ],
        opensGate: 2,
      },
      {
        name: 'Hall of Black Feathers', checkpoint: new THREE.Vector3(0, 5, -118), triggerZ: -129, level: 6,
        area: { x0: -12, x1: 12, z0: -150, z1: -128 },
        waves: [{ kinds: [['boss', 1]] }],
        closesGate: 2,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  heightAt(_x: number, z: number) {
    if (z >= STAIRS.z0) return 0;
    if (z <= STAIRS.z1) return STAIRS.h;
    return ((STAIRS.z0 - z) / (STAIRS.z0 - STAIRS.z1)) * STAIRS.h;
  }

  /** True if a circle of radius r centred at (x,z) is on walkable ground. */
  isWalkable(x: number, z: number, r = 0.4) {
    let inside = false;
    for (const q of WALK_RECTS) {
      if (x >= q.x0 + r && x <= q.x1 - r && z >= q.z0 + r && z <= q.z1 - r) { inside = true; break; }
    }
    if (!inside) {
      for (const c of WALK_CIRCLES) {
        if (Math.hypot(x - c.x, z - c.z) <= c.r - r) { inside = true; break; }
      }
    }
    if (!inside) return false;
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z, rr = o.r + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    for (const b of this.breakables) {
      if (b.broken) continue;
      const dx = x - b.pos.x, dz = z - b.pos.z, rr = b.def.radius + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }

  private crossesGate(z0: number, z1: number, x: number) {
    for (const g of this.gates) {
      if (!g.active || x < g.x0 || x > g.x1) continue;
      if ((z0 - g.z) * (z1 - g.z) <= 0 && z0 !== z1) return true;
    }
    return false;
  }

  /** Moves pos by (dx,dz) with wall sliding. Returns true if any movement happened. */
  move(pos: THREE.Vector3, dx: number, dz: number, r: number) {
    const nx = pos.x + dx, nz = pos.z + dz;
    const pad = Math.sign(dz) * r;
    let moved = false;
    if (this.isWalkable(nx, nz, r) && !this.crossesGate(pos.z, nz + pad, nx)) {
      pos.x = nx; pos.z = nz; moved = true;
    } else if (dx !== 0 && this.isWalkable(nx, pos.z, r)) {
      pos.x = nx; moved = true;
    } else if (dz !== 0 && this.isWalkable(pos.x, nz, r) && !this.crossesGate(pos.z, nz + pad, pos.x)) {
      pos.z = nz; moved = true;
    }
    pos.y = this.heightAt(pos.x, pos.z);
    return moved;
  }

  /** Finds a random walkable point inside a rect. */
  randomPointIn(area: Rect, r = 0.6, avoid?: THREE.Vector3, minDist = 0) {
    for (let i = 0; i < 40; i++) {
      const x = area.x0 + Math.random() * (area.x1 - area.x0);
      const z = area.z0 + Math.random() * (area.z1 - area.z0);
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
      if (this.isWalkable(x, z, r)) return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    const cx = (area.x0 + area.x1) / 2, cz = (area.z0 + area.z1) / 2;
    return new THREE.Vector3(cx, this.heightAt(cx, cz), cz);
  }

  /** Signed-ish distance from a point to the flat (walkable + pad) ground. */
  private flatDistance(x: number, z: number) {
    let d = Infinity;
    for (const q of [...WALK_RECTS, ...PADS]) {
      const dx = Math.max(q.x0 - x, 0, x - q.x1);
      const dz = Math.max(q.z0 - z, 0, z - q.z1);
      d = Math.min(d, Math.hypot(dx, dz));
    }
    for (const c of WALK_CIRCLES) d = Math.min(d, Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r));
    return d;
  }

  terrainHeight(x: number, z: number) {
    const d = this.flatDistance(x, z);
    const hill = clamp(d / 5, 0, 1);
    return this.heightAt(x, clamp(z, -170, 20)) + hill * hill * (1.5 + noise2(x * 0.15, z * 0.15) * 4) - (d === 0 ? 0.02 : 0);
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  build(quality: 'low' | 'medium' | 'high') {
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.8 : 1;
    this.buildLights();
    this.buildTerrain();
    this.buildFlagstones();
    this.buildStairs();
    this.buildArchitecture();
    this.buildFoliage(density);
    this.buildBreakables();
    this.buildGates();
    this.scene.add(this.group);
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0x7f9fb6, 0x26301f, 1.7);
    const moon = new THREE.DirectionalLight(0xb8cce6, 1.6);
    moon.position.set(-0.6, 1, 0.45);
    this.group.add(hemi, moon);
  }

  private addLightPool(x: number, y: number, z: number, r: number) {
    const blob = makeBlob(0xffa050, 0.5, r, true);
    blob.position.set(x, y + 0.04, z);
    this.group.add(blob);
  }

  private buildTerrain() {
    const { x0, x1, z0, z1 } = { x0: -48, x1: 48, z0: -175, z1: 26 };
    const w = x1 - x0, d = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, d, 64, 150).rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(0x2c3f22), moss = new THREE.Color(0x203020), dirt = new THREE.Color(0x4a3f30), dark = new THREE.Color(0x182218);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.terrainHeight(x, z);
      pos.setY(i, y);
      const n = noise2(x * 0.3, z * 0.3);
      const fd = this.flatDistance(x, z);
      if (fd === 0) {
        // Dirt path through the clearing, mossy elsewhere.
        const path = clamp(1 - Math.abs(x + Math.sin(z * 0.15) * 2) / 6, 0, 1);
        c.copy(grass).lerp(dirt, clamp(path + n * 0.4 - 0.15, 0, 1));
      } else {
        c.copy(moss).lerp(dark, clamp(fd / 8 + n * 0.3, 0, 1));
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(terrain);

  }

  private buildFlagstones() {
    const tile = colored(new THREE.BoxGeometry(1.9, 0.12, 1.9), 0x6a665e, 0);
    const mats: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const place = (x: number, z: number) => {
      if (this.rng() < 0.06) return; // missing tiles
      const y = this.heightAt(x, z) + 0.02;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x + (this.rng() - 0.5) * 0.1, y, z + (this.rng() - 0.5) * 0.1),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * 0.04, (this.rng() - 0.5) * 0.08, (this.rng() - 0.5) * 0.04)),
        new THREE.Vector3(1, 1, 1),
      );
      mats.push(m);
      const v = 0.75 + this.rng() * 0.35;
      colors.push(new THREE.Color(v, v * 0.97, v * 0.92));
    };
    for (let x = -14; x <= 14; x += 2) for (let z = -80; z <= -45; z += 2) place(x, z);
    for (let x = -16; x <= 16; x += 2) for (let z = -122; z <= -101; z += 2) place(x, z);
    for (let x = -14; x <= 14; x += 2) for (let z = -153; z <= -123; z += 2) if (Math.hypot(x, z + 139) < 14.5 || Math.abs(x) < 6) place(x, z);
    this.instanced(tile, vcMaterial, mats, colors);
  }

  private buildStairs() {
    const steps = 20;
    const depth = (STAIRS.z0 - STAIRS.z1) / steps;
    const stepGeo = colored(new THREE.BoxGeometry(12, 1, depth + 0.05), 0x6e6a62, 0.03);
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < steps; i++) {
      const top = ((i + 1) / steps) * STAIRS.h;
      const z = STAIRS.z0 - depth * (i + 0.5);
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(0, top - 0.5, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    }
    this.instanced(stepGeo, vcMaterial, mats);
    // Side walls + balustrades
    const len = Math.hypot(STAIRS.z0 - STAIRS.z1, STAIRS.h);
    const ang = Math.atan2(STAIRS.h, STAIRS.z0 - STAIRS.z1);
    for (const sx of [-6.4, 6.4]) {
      const wall = new THREE.Mesh(colored(new THREE.BoxGeometry(0.8, 1.6, len), 0x57534d), vcMaterial);
      wall.position.set(sx, STAIRS.h / 2 - 0.2, (STAIRS.z0 + STAIRS.z1) / 2);
      wall.rotation.x = ang;
      this.group.add(wall);
      for (let k = 0; k < 2; k++) {
        const z = k ? STAIRS.z1 - 0.5 : STAIRS.z0 + 0.5;
        this.place(stoneLantern(), sx * 1.15, this.heightAt(0, z), z);
      }
    }
    // Plaza front balustrades on either side of the stair head
    for (const sx of [-1, 1]) {
      const b = balustrade(9.5);
      b.rotation.y = Math.PI / 2;
      b.position.set(sx * 11.2, STAIRS.h, -100.3);
      this.group.add(b);
    }
  }

  private place(p: PropResult, x: number, y: number, z: number, rotY = 0) {
    p.group.position.set(x, y, z);
    p.group.rotation.y = rotY;
    this.group.add(p.group);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    for (const c of p.colliders) this.obstacles.push({ x: x + c.x * cos + c.z * sin, z: z - c.x * sin + c.z * cos, r: c.r });
    for (const l of p.lights) this.addLightPool(x + l.x * cos + l.z * sin, y, z - l.x * sin + l.z * cos, l.r);
  }

  private buildArchitecture() {
    // Forest clearing: pavilion on the left, guardian statues, rocks.
    this.place(pavilion(8, 6, 1), -15, 0, -5, 0.15);
    this.place(guardianStatue(), -7.5, 0, -2, 0.4);
    this.place(guardianStatue(), 7.5, 0, -30, -0.4);
    this.place(guardianStatue(), -7.5, 0, -30, 0.4);
    const bigRock = (x: number, z: number, s: number, seed: number) => {
      const m = new THREE.Mesh(rockGeometry(seed, 0x5a5750), vcMaterial);
      m.scale.set(s, s * 0.9, s);
      m.position.set(x, this.heightAt(x, z), z);
      m.rotation.y = seed;
      this.group.add(m);
      this.obstacles.push({ x, z, r: s * 0.85 });
    };
    bigRock(8.5, -14, 1.8, 11);
    bigRock(9.5, -18, 1.2, 12);
    bigRock(-9, -22, 1.5, 13);
    bigRock(4, -6, 0.9, 14);

    // Courtyard: stone lanterns, broken pillars, side pavilion.
    for (const [x, z] of [[-10, -50], [10, -50], [-10, -74], [10, -74]]) this.place(stoneLantern(), x, 0, z);
    for (const [x, z, h] of [[-12, -60, 1.6], [-12, -66, 2.6], [12, -56, 0.9]]) this.place(brokenPillar(h), x, 0, z);
    this.place(pavilion(6, 6, 2), 19, 0, -60, -Math.PI / 2);
    this.place(guardianStatue(), -4, 0, -79, 0);
    this.place(guardianStatue(), 4, 0, -79, 0);

    // Upper plaza: twin pavilions, lanterns.
    this.place(pavilion(6, 6, 1), -21, STAIRS.h, -112, Math.PI / 2);
    this.place(pavilion(6, 6, 1), 21, STAIRS.h, -112, -Math.PI / 2);
    for (const [x, z] of [[-13, -104], [13, -104], [-13, -119], [13, -119]]) this.place(stoneLantern(), x, STAIRS.h, z);
    // Arena ring of lanterns and the temple hall
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.sin(a) * 13.2, z = -139 + Math.cos(a) * 13.2;
      if (z > -128) continue;
      this.place(stoneLantern(), x, STAIRS.h, z);
    }
    this.place(templeHall(), 0, STAIRS.h, -162);
  }

  private mat4(x: number, y: number, z: number, s: number, rotY: number, sy = s) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
      new THREE.Vector3(s, sy, s),
    );
  }

  /** Builds instanced meshes bucketed into chunks along Z so frustum culling still works. */
  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colors?: THREE.Color[]) {
    const buckets = new Map<number, number[]>();
    const p = new THREE.Vector3();
    list.forEach((m, i) => {
      p.setFromMatrixPosition(m);
      const k = Math.floor(p.z / 24) * 10 + Math.floor(p.x / 40);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(i);
    });
    for (const idx of buckets.values()) {
      const im = new THREE.InstancedMesh(geo, mat, idx.length);
      idx.forEach((src, j) => {
        im.setMatrixAt(j, list[src]);
        if (colors) im.setColorAt(j, colors[src]);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  private buildFoliage(density: number) {
    const pines: THREE.Matrix4[] = [], bamboo: THREE.Matrix4[] = [], ferns: THREE.Matrix4[] = [], grass: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
    const { x0, x1 } = { x0: -46, x1: 46 };
    for (let z = 24; z > -172; z -= 1.6) {
      for (let x = x0; x < x1; x += 1.6) {
        const jx = x + (this.rng() - 0.5) * 1.5, jz = z + (this.rng() - 0.5) * 1.5;
        const fd = this.flatDistance(jx, jz);
        const y = this.terrainHeight(jx, jz);
        const r = this.rng();
        // Trees only where they won't hide the walkable area from the camera.
        const occludes = this.flatDistance(jx, jz - 2.5) < 1 || this.flatDistance(jx, jz - 5) < 1;
        if (fd > 3 && !occludes) {
          if (r < 0.2 * density) {
            const s = 1 + this.rng() * 0.9;
            if (this.rng() < 0.2) bamboo.push(this.mat4(jx, y, jz, s * 0.9, this.rng() * 6));
            else pines.push(this.mat4(jx, y - 0.2, jz, s, this.rng() * 6));
          } else if (r < 0.45 * density) ferns.push(this.mat4(jx, y, jz, 1 + this.rng(), this.rng() * 6));
          else if (r < 0.5) rocks.push(this.mat4(jx, y - 0.2, jz, 0.5 + this.rng() * 1.2, this.rng() * 6));
        } else if (fd > 0.3) {
          if (r < 0.5 * density) ferns.push(this.mat4(jx, y, jz, 0.8 + this.rng() * 0.8, this.rng() * 6));
          else if (r < 0.7 * density) grass.push(this.mat4(jx, y, jz, 1 + this.rng(), this.rng() * 6));
        } else if (jz > -40 && r < 0.12 * density) {
          // Low grass inside the clearing (no collision).
          if (this.isWalkable(jx, jz, 0)) grass.push(this.mat4(jx, y, jz, 0.8 + this.rng() * 0.6, this.rng() * 6));
        } else if (jz <= -44 && r < 0.05) {
          // Rubble and weeds between flagstones
          rocks.push(this.mat4(jx, this.heightAt(jx, jz) + 0.05, jz, 0.12 + this.rng() * 0.15, this.rng() * 6));
        }
      }
    }
    this.instanced(pineGeometry(), vcMaterial, pines);
    this.instanced(bambooGeometry(), vcMaterial, bamboo);
    this.instanced(fernGeometry(), vcMaterialDouble, ferns);
    this.instanced(grassGeometry(), vcMaterial, grass);
    this.instanced(rockGeometry(5), vcMaterial, rocks);
  }

  private addBreakable(kind: BreakableKind, x: number, z: number) {
    const def = breakable(kind);
    const y = this.heightAt(x, z);
    def.mesh.position.set(x, y, z);
    def.mesh.rotation.y = this.rng() * 6;
    this.group.add(def.mesh);
    this.breakables.push({ def, pos: new THREE.Vector3(x, y, z), hp: def.hp, broken: false });
  }

  private buildBreakables() {
    const list: [BreakableKind, number, number][] = [
      ['barrel', 5, -10], ['barrel', 6, -11.2], ['crate', 5.2, -12], ['urn', -5, -16], ['rock', -3, -25], ['rock', 3, -33],
      ['barrel', -8, -9], ['crate', -9.2, -10],
      ['urn', -11, -52], ['urn', -11.5, -53.2], ['barrel', 11, -63], ['barrel', 11.5, -64.3], ['crate', 10.2, -64], ['bell', 6, -62],
      ['rock', -6, -70], ['urn', 0, -56], ['crate', -6, -76], ['barrel', -7, -76.5],
      ['urn', -3, -92], ['urn', 3, -95],
      ['barrel', -14, -108], ['barrel', -13.5, -109.3], ['crate', 14, -115], ['urn', 13.5, -116.3], ['bell', -8, -116], ['rock', 6, -107],
      ['urn', -9, -132], ['urn', 9, -132], ['crate', -10, -146], ['barrel', 10, -146],
    ];
    for (const [k, x, z] of list) this.addBreakable(k, x, z);
  }

  private buildGates() {
    const defs = [
      { z: -36.2, x0: -5, x1: 5 },
      { z: -80.4, x0: -6, x1: 6 },
      { z: -121.5, x0: -6, x1: 6 },
    ];
    for (const d of defs) {
      const { mesh, mat } = sealBarrier(d.x1 - d.x0);
      mesh.position.set((d.x0 + d.x1) / 2, this.heightAt(0, d.z), d.z);
      this.group.add(mesh);
      this.gates.push({ ...d, active: true, mesh, mat, fade: 1 });
    }
  }

  setGate(i: number, active: boolean) {
    const g = this.gates[i];
    if (!g) return;
    g.active = active;
    if (active) g.mesh.visible = true;
  }

  update(dt: number, time: number) {
    for (const g of this.gates) {
      g.mat.uniforms.uTime.value = time;
      g.fade = clamp(g.fade + (g.active ? 2 : -1.2) * dt, 0, 1);
      g.mat.uniforms.uAlpha.value = g.fade;
      g.mesh.visible = g.fade > 0.001;
    }
  }

  /** Renders the walkable layout to a canvas for the minimap (1px = 0.5m). */
  renderMinimap(): HTMLCanvasElement {
    const scale = 2;
    const { x0, x1, z0, z1 } = this.bounds;
    const c = document.createElement('canvas');
    c.width = (x1 - x0) * scale;
    c.height = (z1 - z0) * scale;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1b1c1a';
    ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const saved = this.breakables.map((b) => b.broken);
    this.breakables.forEach((b) => (b.broken = true));
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const x = x0 + px / scale, z = z1 - py / scale;
        if (this.isWalkable(x, z, 0)) {
          const o = (py * c.width + px) * 4;
          const v = z <= STAIRS.z0 ? 150 : 128;
          img.data[o] = v; img.data[o + 1] = v - 6; img.data[o + 2] = v - 20; img.data[o + 3] = 255;
        }
      }
    }
    this.breakables.forEach((b, i) => (b.broken = saved[i]));
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
