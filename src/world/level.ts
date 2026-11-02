import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, noise2, seeded } from '../engine/util';
import { makeBlob } from '../game/vfx';
import { flagstoneTexture, groundDetailTexture, mistTexture } from './textures';
import { focusUniform, propParts, setNatureTint, windUniform } from './nature';
import type { ChapterDef } from '../game/chapters';
import { buildShrine, type Shrine } from './shrine';
import {
  balustrade, breakable, brokenPillar, colored, guardianStatue,
  pavilion, pineGeometry, stoneLantern, templeHall, vcMaterial, sealBarrier,
  type BreakableDef, type BreakableKind, type PropResult,
} from './props';
import {
  banner, bigSkull, bonePile, boulder, brazierStand, hoodoo, iceSpire, overhang, paifang, ribArch, rockArch, stele, tent,
} from './setpieces';
import { Terrain, shapeDistance, type Floor, type Shape } from './terrain';
import { buildIce, buildWater, waterTime } from './water';
import { Explore, type ChestInfo, type CollectInfo, type EncounterInfo, type Spawned } from './explore';
import { LAYOUTS } from './layouts';
import type { LayoutDef, PropPlace } from './layouts/types';

export type { ChestInfo, CollectInfo, EncounterInfo, Spawned } from './explore';

/**
 * A chapter's map. Each chapter has its own hand-designed layout (src/world/layouts/*): a heightfield with
 * ridges, cliffs, stairs and bridges, water, set dressing, foliage, shrines, gates, chests and secrets.
 * `applyChapter` builds the map for a chapter (and re-tints lights/fog); the rest of the game talks to the
 * level only through the queries below (heights, walkability, movement with wall sliding, zones).
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

export type SpawnKind = 'spiderling' | 'armored' | 'weaver' | 'ghoul' | 'wolf' | 'archer' | 'bone' | 'frost' | 'boss' | 'tiger' | 'bonelady';
/** `eliteKind`: the first enemy of this kind in an elite wave is the elite (default 'armored'). */
export interface WaveDef { kinds: [SpawnKind, number][]; elite?: boolean; eliteKind?: SpawnKind }
export interface ZoneDef {
  name: string;
  checkpoint: THREE.Vector3;
  /** Legacy straight-line trigger (z); use Level.zoneTriggered, which tests the zone's trigger shape. */
  triggerZ: number;
  trigger: Shape;
  area: Rect;
  level: number;
  waves: WaveDef[];
  opensGate?: number;
  closesGate?: number;
}

const OBST_CELL = 4;

export class Level {
  /** Everything built for the current chapter's map (rebuilt on chapter change). */
  readonly group = new THREE.Group();
  readonly obstacles: Circle[] = [];
  readonly breakables: Breakable[] = [];
  readonly gates: Gate[] = [];
  /** Keeper's Shrines, one beside each zone's checkpoint (zones[i] ↔ shrines[i]). */
  readonly shrines: Shrine[] = [];
  readonly zones: ZoneDef[] = [];
  /** Walkable extents of the current map (minimap frame). */
  readonly bounds = { x0: -34, x1: 34, z0: -160, z1: 14 };
  /** Where the chapter boss spawns. */
  readonly bossSpot = new THREE.Vector3();
  /** Critical path from the first shrine to the boss. */
  readonly route: THREE.Vector3[] = [];
  terrain!: Terrain;
  layout!: LayoutDef;
  explore: Explore | null = null;
  /** Index of the chapter whose map is built (-1 before the first build). */
  chapterIndex = -1;

  /** Exploration hooks (the game decides loot and spawns). */
  onChestOpen?: (c: ChestInfo) => void;
  onCollect?: (c: CollectInfo) => void;
  onEncounter?: (e: EncounterInfo) => Spawned[];
  onNotice?: (text: string, color: string) => void;

  private rng = seeded(42);
  private quality: 'low' | 'medium' | 'high' = 'medium';
  private readonly lights = new THREE.Group();
  private moon: THREE.DirectionalLight | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private terrainMat: THREE.MeshLambertMaterial | null = null;
  private stoneMat: THREE.MeshLambertMaterial | null = null;
  private readonly mist: THREE.Mesh[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private obstHash = new Map<number, Circle[]>();
  private regionList: { name: string; shape: Shape }[] = [];
  private detail: ReturnType<typeof groundDetailTexture> | null = null;
  private flag: ReturnType<typeof flagstoneTexture> | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** One-time setup (lights, mist, shared textures) and the first chapter's map. */
  build(quality: 'low' | 'medium' | 'high') {
    this.quality = quality;
    this.buildLights();
    this.buildMist();
    this.detail = groundDetailTexture(quality === 'low' ? 128 : 256);
    this.flag = flagstoneTexture(quality === 'low' ? 256 : 512);
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.detail.map, normalMap: this.detail.normalMap });
    this.stoneMat = new THREE.MeshLambertMaterial({ map: this.flag.map, normalMap: this.flag.normalMap, normalScale: new THREE.Vector2(1.2, 1.2) });
    this.scene.add(this.lights, this.group);
    this.load(0);
  }

  /** Builds the chapter's map if it isn't the current one, then applies its palette, fog and zone waves. */
  applyChapter(c: ChapterDef) {
    if (c.id !== this.chapterIndex) this.load(c.id, c);
    c.zones.forEach((cz, i) => {
      const z = this.zones[i];
      if (!z) return;
      z.name = cz.name;
      z.level = cz.level;
      z.waves = cz.waves;
    });
    const t = c.theme;
    this.scene.background = new THREE.Color(t.bg);
    this.scene.fog = new THREE.FogExp2(t.fog, t.fogDensity);
    this.hemi?.color.setHex(t.hemiSky);
    this.hemi?.groundColor.setHex(t.hemiGround);
    if (this.hemi) this.hemi.intensity = t.hemiIntensity;
    this.moon?.color.setHex(t.moon);
    if (this.moon) this.moon.intensity = t.moonIntensity;
    for (const m of this.mist) (m.material as THREE.MeshBasicMaterial).color.setHex(t.fog).lerp(new THREE.Color(0xc0d0d4), 0.5);
    setNatureTint(t.foliage);
  }

  private clear() {
    this.explore?.dispose();
    this.explore = null;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.userData.sharedGeo) m.geometry?.dispose();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
    });
    for (const d of this.owned) d.dispose();
    this.owned.length = 0;
    this.group.clear();
    this.obstacles.length = 0;
    this.breakables.length = 0;
    this.gates.length = 0;
    this.shrines.length = 0;
    this.zones.length = 0;
    this.route.length = 0;
    this.obstHash.clear();
  }

  private load(index: number, chapter?: ChapterDef) {
    this.clear();
    this.chapterIndex = index;
    this.rng = seeded(42 + index * 101);
    const L = (this.layout = LAYOUTS[index]);
    this.terrain = new Terrain(L.terrain);
    const wb = this.terrain.walkBox;
    Object.assign(this.bounds, { x0: Math.floor(wb.x0 - 6), x1: Math.ceil(wb.x1 + 6), z0: Math.floor(wb.z0 - 6), z1: Math.ceil(wb.z1 + 6) });
    this.bossSpot.set(L.boss[0], this.heightAt(L.boss[0], L.boss[1]), L.boss[1]);
    for (const [x, z] of L.route) this.route.push(new THREE.Vector3(x, this.heightAt(x, z), z));
    this.buildZones(chapter);
    this.regionList = [...L.regions, ...this.zones.map((z) => ({ name: z.name, shape: z.trigger }))];
    this.buildTerrainMesh();
    this.buildPaving();
    this.buildWater();
    for (const p of L.props) this.placeProp(p);
    this.buildShrines();
    this.buildFoliage();
    for (const [k, x, z] of L.breakables) this.addBreakable(k, x, z);
    this.buildGates();
    this.explore = new Explore(L, index, this, {
      onChestOpen: (c) => this.onChestOpen?.(c),
      onCollect: (c) => this.onCollect?.(c),
      onEncounter: (e) => this.onEncounter?.(e) ?? [],
      onNotice: (t, c) => this.onNotice?.(t, c),
    });
    this.obstacles.push(...this.explore.colliders);
    this.group.add(this.explore.group);
    this.bakeStatic();
    this.hashObstacles();
  }

  private buildZones(chapter?: ChapterDef) {
    const L = this.layout;
    L.zones.forEach((lz, i) => {
      const cz = chapter?.zones[i];
      const [x, z] = lz.checkpoint;
      const tb = shapeBox(lz.trigger);
      this.zones.push({
        name: cz?.name ?? `Area ${i + 1}`,
        checkpoint: new THREE.Vector3(x, this.heightAt(x, z), z),
        triggerZ: tb.z1,
        trigger: lz.trigger,
        area: lz.area,
        level: cz?.level ?? 1,
        waves: cz?.waves ?? [],
        opensGate: lz.opensGate,
        closesGate: lz.closesGate,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  heightAt(x: number, z: number) {
    return this.terrain.heightAt(x, z);
  }

  /** Height of the rendered ground (under bridges this is the stream bed, not the deck). */
  terrainHeight(x: number, z: number) {
    return this.terrain.groundAt(x, z);
  }

  /** True if a circle of radius r centred at (x,z) is on walkable ground (cliffs, water and props block). */
  isWalkable(x: number, z: number, r = 0.4) {
    const t = this.terrain;
    if (!t.walkableAt(x, z)) return false;
    if (r > 0) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (!t.walkableAt(x + Math.sin(a) * r, z + Math.cos(a) * r)) return false;
      }
    }
    const list = this.obstHash.get(this.hashKey(Math.floor(x / OBST_CELL), Math.floor(z / OBST_CELL)));
    if (list) {
      for (const o of list) {
        const dx = x - o.x, dz = z - o.z, rr = o.r + r;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    for (const b of this.breakables) {
      if (b.broken) continue;
      const dx = x - b.pos.x, dz = z - b.pos.z, rr = b.def.radius + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    if (this.explore?.blocking(x, z, r)) return false;
    return true;
  }

  private hashKey(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  private hashObstacles() {
    this.obstHash.clear();
    for (const o of this.obstacles) {
      const i0 = Math.floor((o.x - o.r - 1.6) / OBST_CELL), i1 = Math.floor((o.x + o.r + 1.6) / OBST_CELL);
      const j0 = Math.floor((o.z - o.r - 1.6) / OBST_CELL), j1 = Math.floor((o.z + o.r + 1.6) / OBST_CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = this.hashKey(i, j);
          let l = this.obstHash.get(k);
          if (!l) this.obstHash.set(k, (l = []));
          l.push(o);
        }
      }
    }
  }

  private crossesGate(z0: number, z1: number, x: number) {
    for (const g of this.gates) {
      if (!g.active || x < g.x0 || x > g.x1) continue;
      if ((z0 - g.z) * (z1 - g.z) <= 0 && z0 !== z1) return true;
    }
    return false;
  }

  /** Moves pos by (dx,dz) with wall sliding and snaps it to the ground. Returns true if any movement happened. */
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
    for (let i = 0; i < 60; i++) {
      const x = area.x0 + Math.random() * (area.x1 - area.x0);
      const z = area.z0 + Math.random() * (area.z1 - area.z0);
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
      if (this.isWalkable(x, z, r)) return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    for (let i = 0; i < 60; i++) {
      const x = area.x0 + Math.random() * (area.x1 - area.x0);
      const z = area.z0 + Math.random() * (area.z1 - area.z0);
      if (this.isWalkable(x, z, 0.3)) return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    const cx = (area.x0 + area.x1) / 2, cz = (area.z0 + area.z1) / 2;
    return new THREE.Vector3(cx, this.heightAt(cx, cz), cz);
  }

  /** True once the player has stepped into zone i's trigger shape. */
  zoneTriggered(i: number, p: THREE.Vector3) {
    const z = this.zones[i];
    return !!z && shapeDistance(z.trigger, p.x, p.z) <= 0;
  }

  /** Name of the place at a point (named regions first, then the nearest zone). */
  locationAt(x: number, z: number) {
    for (const r of this.regionList) if (shapeDistance(r.shape, x, z) <= 0) return r.name;
    let best = this.zones[0]?.name ?? '', bd = Infinity;
    for (const zn of this.zones) {
      const d = Math.hypot(zn.checkpoint.x - x, zn.checkpoint.z - z);
      if (d < bd) { bd = d; best = zn.name; }
    }
    return best;
  }

  /** Index of the zone whose area holds this point, or -1. */
  zoneIndexAt(x: number, z: number) {
    return this.zones.findIndex((zn) => shapeDistance(zn.trigger, x, z) <= 0);
  }

  /** True while an optional guarded encounter is being fought. */
  get exploreFighting() {
    return this.explore?.fighting ?? false;
  }

  /** Steps chests, collectables, shortcuts, puzzles and encounters (call each frame while playing). */
  updateExplore(dt: number, time: number, player: THREE.Vector3, fighting: boolean, zoneLevel: number) {
    this.explore?.update(dt, time, player, fighting, zoneLevel);
  }

  /** Re-arms optional encounters (rest / death). */
  resetExplore() {
    this.explore?.reset();
  }

  // -------------------------------------------------------------------------
  // Building: lights, mist
  // -------------------------------------------------------------------------

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0x9ab8bc, 0x34402a, 2.0);
    const moon = new THREE.DirectionalLight(0xd2dce6, 1.9);
    moon.position.set(-8, 16, 6);
    if (this.quality === 'high') {
      moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024);
      const c = moon.shadow.camera;
      c.left = -18; c.right = 18; c.top = 18; c.bottom = -18; c.near = 1; c.far = 60;
      moon.shadow.bias = -0.0008;
      moon.shadow.normalBias = 0.03;
    }
    this.moon = moon;
    this.hemi = hemi;
    this.lights.add(hemi, moon, moon.target);
  }

  /** Keeps the moon's shadow box centred on the player. */
  followShadow(p: THREE.Vector3) {
    if (!this.moon) return;
    this.moon.position.set(p.x - 8, p.y + 16, p.z + 6);
    this.moon.target.position.set(p.x, p.y, p.z);
  }

  private buildMist() {
    if (this.quality === 'low') return;
    const tex = mistTexture();
    for (const [y, op, sc] of [[0.6, 0.16, 1], [1.8, 0.09, 1.6]] as const) {
      const mat = new THREE.MeshBasicMaterial({ map: tex.clone(), color: 0xa8c0c4, transparent: true, opacity: op, depthWrite: false });
      mat.map!.repeat.set(2 * sc, 2 * sc);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), mat);
      m.position.y = y;
      m.renderOrder = 4;
      this.mist.push(m);
      this.scene.add(m);
    }
  }

  private addLightPool(x: number, y: number, z: number, r: number) {
    const blob = makeBlob(0xffa050, 0.5, r, true);
    blob.position.set(x, y + 0.04, z);
    blob.userData.sharedGeo = true;
    this.owned.push(blob.material as THREE.Material);
    this.group.add(blob);
  }

  // -------------------------------------------------------------------------
  // Building: ground
  // -------------------------------------------------------------------------

  private floorColor(f: Floor | null, pal: LayoutDef['palette']) {
    switch (f) {
      case 'grass': return pal.grass;
      case 'moss': return pal.moss;
      case 'dirt': return pal.dirt;
      case 'sand': return pal.sand ?? pal.dirt;
      case 'snow': return pal.snow ?? 0xdde6ee;
      case 'ice': return pal.ice ?? 0xa8c8e0;
      case 'rock': case 'stone': case 'bone': return pal.rock;
      case 'wood': return pal.dirt;
      default: return pal.wild;
    }
  }

  /** Terrain mesh from the coarse ground grid, in chunks so frustum culling can skip most of it. */
  private buildTerrainMesh() {
    const t = this.terrain, pal = this.layout.palette;
    const CH = 48;
    const cWild = new THREE.Color(pal.wild), cHigh = new THREE.Color(pal.high), cRock = new THREE.Color(pal.rock);
    const c = new THREE.Color(), tmp = new THREE.Color();
    // Per-node colour, computed once and shared by chunk borders.
    const cols = new Float32Array(t.gnx * t.gnz * 3);
    for (let j = 0; j < t.gnz; j++) {
      for (let i = 0; i < t.gnx; i++) {
        const k = j * t.gnx + i, x = t.gx0 + i, z = t.gz0 + j;
        const d = t.dist[k], g = t.ground[k];
        const slope = t.slopeAt(x, z);
        const n = noise2(x * 0.3, z * 0.3), n2 = noise2(x * 1.1 + 4, z * 1.1);
        if (d <= 0.01) {
          c.setHex(this.floorColor(t.floorAt(x, z), pal));
          // Worn centre lines on dirt and grass, patchy moss.
          if (t.floorAt(x, z) === 'grass') c.lerp(tmp.setHex(pal.moss), clamp(n * 0.8 - 0.1, 0, 0.7));
          c.multiplyScalar(0.88 + 0.24 * n2);
        } else {
          const above = g - this.heightAt(clamp(x, t.walkBox.x0, t.walkBox.x1), clamp(z, t.walkBox.z0, t.walkBox.z1));
          c.copy(cWild).lerp(cHigh, clamp(above / 14 + n * 0.25 - 0.1, 0, 1));
          c.lerp(cRock, smoothstep(0.7, 1.4, slope + n * 0.3));
          c.multiplyScalar(0.85 + 0.3 * n2);
        }
        // Wet, darker banks near water.
        const wl = t.waterLevel[k];
        if (wl > -1e8 && g < wl + 0.6) c.multiplyScalar(0.7);
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
    }
    for (let cj = 0; cj < t.gnz - 1; cj += CH) {
      for (let ci = 0; ci < t.gnx - 1; ci += CH) {
        const w = Math.min(CH, t.gnx - 1 - ci), h = Math.min(CH, t.gnz - 1 - cj);
        const pos = new Float32Array((w + 1) * (h + 1) * 3), col = new Float32Array((w + 1) * (h + 1) * 3), uv = new Float32Array((w + 1) * (h + 1) * 2);
        for (let j = 0; j <= h; j++) {
          for (let i = 0; i <= w; i++) {
            const gi = ci + i, gj = cj + j, k = gj * t.gnx + gi, v = j * (w + 1) + i;
            const x = t.gx0 + gi, z = t.gz0 + gj;
            pos[v * 3] = x; pos[v * 3 + 1] = t.ground[k] - (t.dist[k] <= 0.01 ? 0.02 : 0); pos[v * 3 + 2] = z;
            col[v * 3] = cols[k * 3]; col[v * 3 + 1] = cols[k * 3 + 1]; col[v * 3 + 2] = cols[k * 3 + 2];
            uv[v * 2] = x / 3; uv[v * 2 + 1] = z / 3;
          }
        }
        const idx: number[] = [];
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const a = j * (w + 1) + i, b = a + 1, cc = a + w + 1, d = cc + 1;
            idx.push(a, cc, b, b, cc, d);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.terrainMat!);
        mesh.receiveShadow = true;
        mesh.userData.dynamic = true; // keep chunks separate (culling), don't bake
        this.group.add(mesh);
      }
    }
  }

  /** Flagstone surfaces, stairs and bridges. */
  private buildPaving() {
    const L = this.layout;
    const stone = this.stoneMat!;
    const addSurface = (geo: THREE.BufferGeometry, lift: number) => {
      const p = geo.getAttribute('position');
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        p.setY(i, this.heightAt(p.getX(i), p.getZ(i)) + lift);
        uv[i * 2] = p.getX(i) / 6; uv[i * 2 + 1] = p.getZ(i) / 6;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, stone);
      m.receiveShadow = true;
      this.group.add(m);
    };
    for (const a of L.terrain.areas) {
      if (!a.pave) continue;
      const s = a.shape;
      if (s.kind === 'rect') {
        const w = s.x1 - s.x0, d = s.z1 - s.z0;
        addSurface(new THREE.PlaneGeometry(w, d, Math.ceil(w / 2), Math.ceil(d / 2)).rotateX(-Math.PI / 2).translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2), 0.04);
      } else if (s.kind === 'circle') {
        addSurface(new THREE.CircleGeometry(s.r, 40, 0, Math.PI * 2).rotateX(-Math.PI / 2).translate(s.x, 0, s.z), 0.045);
      } else {
        const shape = new THREE.Shape(s.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
        addSurface(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), 0.045);
      }
    }
    for (const p of L.terrain.paths) {
      if (p.stairs) this.buildStairs(p.pts, p.w);
      else if (p.bridge) this.buildBridge(p.pts, p.w);
      else if (p.pave) addSurface(this.stripGeometry(p.pts, p.w), 0.035);
    }
  }

  /** A flat ribbon along a polyline (paved path). */
  private stripGeometry(pts: [number, number, number][], w: number) {
    const pos: number[] = [], idx: number[] = [];
    const dense: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    dense.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    dense.forEach(([x, z], i) => {
      const [px, pz] = dense[Math.max(0, i - 1)], [nx, nz] = dense[Math.min(dense.length - 1, i + 1)];
      let tx = nx - px, tz = nz - pz;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      pos.push(x - tz * w / 2, 0, z + tx * w / 2, x + tz * w / 2, 0, z - tx * w / 2);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  private buildStairs(pts: [number, number, number][], w: number) {
    const mats: THREE.Matrix4[] = [];
    const side: THREE.BufferGeometry[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      const dh = bh - ah;
      if (Math.abs(dh) < 0.15) continue;
      const steps = Math.max(2, Math.round(Math.abs(dh) / 0.28));
      const depth = len / steps;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const y = ah + dh * t - 0.5 + 0.08;
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(ax + (bx - ax) * t, y, az + (bz - az) * t), q, new THREE.Vector3(w, 1, depth + 0.04)));
      }
      // Low walls along both sides.
      for (const sd of [-1, 1]) {
        const ox = Math.cos(yaw) * sd * (w / 2 + 0.3), oz = -Math.sin(yaw) * sd * (w / 2 + 0.3);
        const wall = colored(new THREE.BoxGeometry(0.6, 1.4, len + 0.4), 0x57534d);
        wall.rotateX(Math.atan2(dh, len));
        wall.rotateY(yaw);
        wall.translate((ax + bx) / 2 + ox, (ah + bh) / 2 + 0.05, (az + bz) / 2 + oz);
        side.push(wall);
      }
    }
    const stepGeo = new THREE.BoxGeometry(1, 1, 1);
    const uvs = stepGeo.getAttribute('uv');
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 2, uvs.getY(i) * 0.25);
    this.owned.push(stepGeo);
    if (mats.length) this.instanced(stepGeo, this.stoneMat!, mats, undefined, false, 24, false);
    if (side.length) this.group.add(new THREE.Mesh(mergeGeometries(side, false)!, vcMaterial));
  }

  private buildBridge(pts: [number, number, number][], w: number) {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ah] = pts[i], [bx, bz, bh] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 0.55));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ah + (bh - ah) * t;
        parts.push(colored(new THREE.BoxGeometry(w + 0.4, 0.16, len / n - 0.06).rotateY(yaw).translate(x, y - 0.06, z), k % 2 ? 0x5a3e28 : 0x4e3622, 0.12));
      }
      for (const sd of [-1, 1]) {
        const ox = Math.cos(yaw) * sd * (w / 2 + 0.15), oz = -Math.sin(yaw) * sd * (w / 2 + 0.15);
        const m = Math.max(1, Math.round(len / 1.6));
        for (let k = 0; k <= m; k++) {
          const t = k / m;
          const x = ax + (bx - ax) * t + ox, z = az + (bz - az) * t + oz, y = ah + (bh - ah) * t;
          const g = this.terrainHeight(x, z);
          parts.push(colored(new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(x, y + 0.45, z), 0x3a2618));
          if (y - g > 0.3) parts.push(colored(new THREE.BoxGeometry(0.22, y - g + 0.6, 0.22).translate(x, (y + g) / 2 - 0.3, z), 0x2e2016));
          this.obstacles.push({ x, z, r: 0.2 });
        }
        const rail = new THREE.BoxGeometry(0.1, 0.1, Math.hypot(len, bh - ah));
        rail.rotateX(-Math.atan2(bh - ah, len)).rotateY(yaw).translate((ax + bx) / 2 + ox, (ah + bh) / 2 + 0.95, (az + bz) / 2 + oz);
        parts.push(colored(rail, 0x6a2a1a));
      }
    }
    this.group.add(new THREE.Mesh(mergeGeometries(parts, false)!, vcMaterial));
  }

  private buildWater() {
    const L = this.layout;
    const lines = L.terrain.water.filter((w) => w.line);
    const flowAt = (x: number, z: number): [number, number] => {
      let best = Infinity, fx = 0, fz = 0;
      for (const w of lines) {
        const p = w.line!;
        for (let i = 0; i < p.length - 1; i++) {
          const [ax, az] = p[i], [bx, bz] = p[i + 1];
          const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
          const t = clamp(((x - ax) * ex + (z - az) * ez) / l2, 0, 1);
          const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
          if (d < best && d < w.w! / 2 + 2) { best = d; const l = Math.sqrt(l2); fx = ex / l; fz = ez / l; }
        }
      }
      return [fx * 0.8, fz * 0.8];
    };
    const water = buildWater(this.terrain, L.water, flowAt);
    if (water) {
      water.userData.dynamic = true;
      this.owned.push(water.material as THREE.Material);
      this.group.add(water);
    }
    for (const w of L.terrain.water) {
      if (!w.frozen || !w.shape) continue;
      const shape = w.shape;
      const ice = buildIce(this.terrain, (x, z) => shapeDistance(shape, x, z) < 0.2, w.level ?? 0, L.water);
      if (ice) {
        ice.userData.dynamic = true;
        this.owned.push(ice.material as THREE.Material);
        this.group.add(ice);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Building: props, shrines, gates, breakables
  // -------------------------------------------------------------------------

  private place(p: PropResult, x: number, y: number, z: number, rotY = 0) {
    p.group.position.set(x, y, z);
    p.group.rotation.y = rotY;
    this.group.add(p.group);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    for (const c of p.colliders) this.obstacles.push({ x: x + c.x * cos + c.z * sin, z: z - c.x * sin + c.z * cos, r: c.r });
    for (const l of p.lights) this.addLightPool(x + l.x * cos + l.z * sin, y, z - l.x * sin + l.z * cos, l.r);
  }

  private natureBuckets = new Map<string, THREE.Matrix4[]>();

  private addNature(name: string, x: number, y: number, z: number, s: number, rot = this.rng() * 6.28) {
    let l = this.natureBuckets.get(name);
    if (!l) this.natureBuckets.set(name, (l = []));
    l.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(s, s, s)));
  }

  private placeProp(p: PropPlace) {
    const [x, z] = p.at;
    const y = p.y ?? this.heightAt(x, z);
    const rot = p.rot ?? 0, s = p.s ?? 1;
    const sand = this.layout.palette.sand ?? 0xb07a48;
    switch (p.kind) {
      case 'pavilion': return this.place(pavilion(8, 6, 1), x, y, z, rot);
      case 'pavilionSmall': return this.place(pavilion(6, 6, s > 1 ? 2 : 1), x, y, z, rot);
      case 'hall': return this.place(templeHall(), x, y, z, rot);
      case 'statue': return this.place(guardianStatue(), x, y, z, rot);
      case 'lantern': return this.place(stoneLantern(), x, y, z, rot);
      case 'pillar': return this.place(brokenPillar(s), x, y, z, rot);
      case 'balustrade': {
        const b = balustrade(s);
        b.position.set(x, y, z);
        b.rotation.y = rot;
        this.group.add(b);
        const n = Math.ceil(s / 0.8);
        for (let i = 0; i <= n; i++) {
          const t = -s / 2 + (s * i) / n;
          this.obstacles.push({ x: x + Math.sin(rot) * t, z: z + Math.cos(rot) * t, r: 0.3 });
        }
        return;
      }
      case 'paifang': return this.place(paifang(s), x, y, z, rot);
      case 'rockArch': return this.place(rockArch(s, sand, Math.round(x + z)), x, y, z, rot);
      case 'hoodoo': return this.place(hoodoo(s, sand, Math.round(x * 3 + z)), x, y, z, rot);
      case 'boulder': return this.place(boulder(s, this.layout.palette.rock, Math.round(x * 7 + z)), x, y - s * 0.15, z, rot);
      case 'ribArch': return this.place(ribArch(s), x, y, z, rot);
      case 'skull': return this.place(bigSkull(s), x, y, z, rot);
      case 'bonePile': return this.place(bonePile(Math.round(x * 5 + z)), x, y, z, rot);
      case 'iceSpire': return this.place(iceSpire(s, Math.round(x * 3 - z)), x, y, z, rot);
      case 'banner': return this.place(banner(), x, y, z, rot);
      case 'stele': return this.place(stele(), x, y, z, rot);
      case 'tent': return this.place(tent(), x, y, z, rot);
      case 'overhang': return this.place(overhang(s, p.d ?? 8, this.layout.palette.rock), x, y, z, rot);
      case 'brazierStand': return this.place(brazierStand(), x, y, z, rot);
      case 'kayPillar': this.addNature('Pillar', x, y, z, s, rot); this.obstacles.push({ x, z, r: 0.5 * s }); return;
      case 'rubble': this.addNature('Rubble', x, y, z, s, rot); this.obstacles.push({ x, z, r: 0.9 * s }); return;
      case 'nature':
        this.addNature(p.name!, x, y - 0.1, z, s, rot);
        if (p.r) this.obstacles.push({ x, z, r: p.r });
        return;
    }
  }

  private buildShrines() {
    this.layout.zones.forEach((lz, i) => {
      const cp = this.zones[i].checkpoint;
      const [x, zz] = lz.shrine ?? [cp.x + 3.2, cp.z - 1.5];
      const s = buildShrine(x, this.heightAt(x, zz), zz, Math.atan2(cp.x - x, cp.z - zz));
      this.obstacles.push({ x, z: zz, r: 1.3 });
      this.shrines.push(s);
      this.group.add(s.group);
    });
  }

  private addBreakable(kind: BreakableKind, x: number, z: number) {
    const def = breakable(kind);
    const y = this.heightAt(x, z);
    def.mesh.position.set(x, y, z);
    def.mesh.rotation.y = this.rng() * 6;
    def.mesh.userData.dynamic = true;
    this.group.add(def.mesh);
    this.breakables.push({ def, pos: new THREE.Vector3(x, y, z), hp: def.hp, broken: false });
  }

  private buildGates() {
    for (const d of this.layout.gates) {
      const { mesh, mat } = sealBarrier(d.x1 - d.x0);
      const cx = (d.x0 + d.x1) / 2;
      mesh.position.set(cx, this.heightAt(cx, d.z), d.z);
      mesh.userData.dynamic = true;
      this.owned.push(mat);
      this.group.add(mesh);
      this.gates.push({ ...d, active: true, mesh, mat, fade: 1 });
    }
  }

  // -------------------------------------------------------------------------
  // Foliage
  // -------------------------------------------------------------------------

  /**
   * Scatters the chapter's biome over the whole terrain: ground cover on grassy walkable floors, dense
   * undergrowth along the walkable edges (it also hides where the walkable ground ends), forest in a band
   * beyond, rocks on steep slopes and cheap silhouettes on the far ridges. Density scales with quality.
   */
  private buildFoliage() {
    const t = this.terrain, B = this.layout.foliage, q = this.quality;
    const treeD = q === 'high' ? 1 : q === 'medium' ? 0.5 : 0.3;
    const coverD = q === 'high' ? 1 : q === 'medium' ? 0.55 : 0.3;
    const step = q === 'low' ? 1.8 : 1.5;
    const far: THREE.Matrix4[] = [];
    const pickW = (list: [string, number][]) => {
      let sum = 0;
      for (const [, w] of list) sum += w;
      let r = this.rng() * sum;
      for (const [n, w] of list) if ((r -= w) <= 0) return n;
      return list[0][0];
    };
    const zoneClear = (x: number, z: number) =>
      this.zones.some((zn) => Math.hypot(zn.checkpoint.x - x, zn.checkpoint.z - z) < 3.5) ||
      this.layout.chests.some((c) => Math.hypot(c.at[0] - x, c.at[1] - z) < 1.6);
    const softFloors = new Set<Floor | null>(['grass', 'moss', 'dirt', 'sand', 'snow']);
    for (let z = t.gz0 + 1; z < t.gz0 + t.gnz - 1; z += step) {
      for (let x = t.gx0 + 1; x < t.gx0 + t.gnx - 1; x += step) {
        const jx = x + (this.rng() - 0.5) * step * 0.9, jz = z + (this.rng() - 0.5) * step * 0.9;
        const r = this.rng();
        const g = t.groundAt(jx, jz);
        const wl = t.waterAt(jx, jz);
        if (wl > -1e8 && g < wl + 0.15) continue;
        const d = t.distAt(jx, jz);
        if (d <= 0) {
          const k = t.fineIndex(jx, jz);
          if (k < 0 || t.deck[k]) continue;
          const f = t.floorAt(jx, jz);
          if (softFloors.has(f)) {
            if (r < B.coverDensity * coverD && !zoneClear(jx, jz)) this.addNature(pickW(B.cover), jx, this.heightAt(jx, jz) - 0.02, jz, 0.45 + this.rng() * 0.4);
          } else if (r < 0.04 * coverD && B.cover.length) {
            this.addNature(pickW(B.cover), jx, this.heightAt(jx, jz), jz, 0.3 + this.rng() * 0.25);
          }
          continue;
        }
        const slope = t.slopeAt(jx, jz);
        if (d < 1.8) {
          if (r < B.underDensity * coverD) this.addNature(pickW(B.under), jx, g - 0.08, jz, 0.6 + this.rng() * 0.6);
          else if (r < (B.underDensity + B.coverDensity * 0.5) * coverD && B.cover.length) this.addNature(pickW(B.cover), jx, g - 0.02, jz, 0.5 + this.rng() * 0.45);
          continue;
        }
        if (slope > 1.15) {
          if (r < 0.12 * treeD + 0.04 && B.slopeRocks.length) this.addNature(pickW(B.slopeRocks), jx, g - 0.4, jz, 0.7 + this.rng() * 1.1);
          continue;
        }
        if (d >= B.treeBand[0] && d <= B.treeBand[1]) {
          if (r < B.treeDensity * treeD && B.trees.length) {
            const [s0, s1] = B.treeScale;
            this.addNature(pickW(B.trees), jx, g - 0.15, jz, s0 + this.rng() * (s1 - s0));
          } else if (r < (B.treeDensity * treeD + B.underDensity * 0.45 * coverD)) {
            this.addNature(pickW(B.under), jx, g - 0.08, jz, 0.6 + this.rng() * 0.7);
          }
          continue;
        }
        if (d > B.treeBand[1] && B.far !== 'none' && r < 0.07 * (q === 'low' ? 0.6 : 1)) {
          far.push(new THREE.Matrix4().compose(new THREE.Vector3(jx, g - 0.2, jz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rng() * 6, 0)), new THREE.Vector3().setScalar(1.4 + this.rng() * 1.2)));
        }
      }
    }
    // Rocks along cliff edges inside the walkable regions.
    for (let j = 1; j < t.gnz - 1; j++) {
      for (let i = 1; i < t.gnx - 1; i++) {
        const k = j * t.gnx + i;
        if (t.dist[k] > 0.01) continue;
        const x = t.gx0 + i, z = t.gz0 + j;
        if (t.slopeAt(x, z) < 1.4 || this.rng() > 0.35 || !B.slopeRocks.length) continue;
        const s = 0.35 + this.rng() * 0.3;
        this.addNature(pickW(B.slopeRocks), x, t.groundAt(x, z) - 0.35, z, s);
      }
    }
    const shadows = q === 'high';
    for (const [name, list] of this.natureBuckets) {
      const tall = /Tree|Pine|Birch/.test(name);
      const big = tall || /Bush_Large|Rock_|Pillar|Rubble|Chest/.test(name);
      for (const part of propParts(name, tall ? 0.012 : 0.05, big && !/Rock_|Pillar|Rubble/.test(name))) {
        this.instanced(part.geometry, part.material, list.map((m) => m.clone().multiply(part.matrix)), undefined, shadows && tall, tall ? 20 : 36, true);
      }
    }
    this.natureBuckets.clear();
    if (far.length) {
      const g = pineGeometry();
      if (B.far === 'snowpine') {
        const c = g.getAttribute('color'), p = g.getAttribute('position');
        for (let i = 0; i < c.count; i++) if (p.getY(i) > 1.6 && (i % 9) < 5) c.setXYZ(i, 0.78, 0.84, 0.9);
      }
      this.owned.push(g);
      this.instanced(g, vcMaterial, far, undefined, false, 24, true);
    }
  }

  /** Builds instanced meshes bucketed into chunks so frustum culling still works. */
  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colors?: THREE.Color[], castShadow = false, chunk = 24, shared = false) {
    const buckets = new Map<number, number[]>();
    const p = new THREE.Vector3();
    list.forEach((m, i) => {
      p.setFromMatrixPosition(m);
      const k = Math.floor(p.z / chunk) * 1000 + Math.floor(p.x / chunk);
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
      im.castShadow = castShadow;
      im.userData.sharedGeo = true;
      if (!shared) this.owned.push(geo);
      this.group.add(im);
    }
  }

  /**
   * Merges every static, non-instanced mesh that shares a material into one mesh per 30 m chunk.
   */
  private bakeStatic() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; order: number }>();
    const remove: THREE.Object3D[] = [];
    const p = new THREE.Vector3();
    const isDynamic = (o: THREE.Object3D) => {
      for (let c: THREE.Object3D | null = o; c; c = c.parent) if (c.userData.dynamic) return true;
      return false;
    };
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || isDynamic(m)) return;
      const mat = m.material as THREE.Material;
      if (Array.isArray(mat) || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.transparent) return;
      m.getWorldPosition(p);
      const key = mat.uuid + ':' + Math.floor(p.z / 30) + ':' + Math.floor(p.x / 30);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, geos: [], order: m.renderOrder }));
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      b.geos.push(g.applyMatrix4(m.matrixWorld));
      remove.push(m);
    });
    for (const m of remove) {
      m.parent?.remove(m);
      (m as THREE.Mesh).geometry.dispose();
    }
    for (const b of buckets.values()) {
      const bySig = new Map<string, THREE.BufferGeometry[]>();
      for (const g of b.geos) {
        const sig = Object.keys(g.attributes).sort().join(',');
        if (!bySig.has(sig)) bySig.set(sig, []);
        bySig.get(sig)!.push(g);
      }
      for (const list of bySig.values()) {
        const merged = mergeGeometries(list, false);
        for (const g of list) g.dispose();
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, b.mat);
        mesh.renderOrder = b.order;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }
  }

  setGate(i: number, active: boolean) {
    const g = this.gates[i];
    if (!g) return;
    g.active = active;
    if (active) g.mesh.visible = true;
  }

  update(dt: number, time: number, focus?: THREE.Vector3) {
    windUniform.value = time;
    waterTime.value = time;
    for (const s of this.shrines) s.update(time);
    if (focus) focusUniform.value.copy(focus);
    for (const [i, m] of this.mist.entries()) {
      if (focus) m.position.set(focus.x - 4, focus.y + (i ? 1.8 : 0.6), focus.z - 4);
      const map = (m.material as THREE.MeshBasicMaterial).map!;
      map.offset.set((time * (0.004 + i * 0.003) + m.position.x / 140) % 1, (time * 0.002 - m.position.z / 140) % 1);
    }
    for (const g of this.gates) {
      g.mat.uniforms.uTime.value = time;
      g.fade = clamp(g.fade + (g.active ? 2 : -1.2) * dt, 0, 1);
      g.mat.uniforms.uAlpha.value = g.fade;
      g.mesh.visible = g.fade > 0.001;
    }
  }

  /** Renders the walkable layout to a canvas for the minimap (1px = 0.5m), shaded by height, water in blue. */
  renderMinimap(): HTMLCanvasElement {
    const scale = 2;
    const { x0, x1, z0, z1 } = this.bounds;
    const c = document.createElement('canvas');
    c.width = (x1 - x0) * scale;
    c.height = (z1 - z0) * scale;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    const saved = this.breakables.map((b) => b.broken);
    this.breakables.forEach((b) => (b.broken = true));
    const t = this.terrain;
    let hmin = Infinity, hmax = -Infinity;
    for (const z of this.zones) { hmin = Math.min(hmin, z.checkpoint.y); hmax = Math.max(hmax, z.checkpoint.y); }
    hmax = Math.max(hmax, this.bossSpot.y, hmin + 1);
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const x = x0 + px / scale, z = z1 - py / scale;
        const o = (py * c.width + px) * 4;
        img.data[o + 3] = 255;
        if (t.walkableAt(x, z)) {
          const k = clamp((this.heightAt(x, z) - hmin) / (hmax - hmin), 0, 1);
          const v = 112 + k * 70;
          img.data[o] = v; img.data[o + 1] = v - 6; img.data[o + 2] = v - 22;
        } else if (t.waterAt(x, z) > t.groundAt(x, z)) {
          img.data[o] = 40; img.data[o + 1] = 70; img.data[o + 2] = 96;
        } else {
          const g = clamp((t.groundAt(x, z) - hmin) / 30, 0, 1);
          const v = 26 + g * 22;
          img.data[o] = v; img.data[o + 1] = v + 2; img.data[o + 2] = v - 2;
        }
      }
    }
    this.breakables.forEach((b, i) => (b.broken = saved[i]));
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Debug/QA: flood-fills the walk grid from the first checkpoint (gates open) and lists unreachable spots. */
  checkReachable() {
    const t = this.terrain;
    const seen = new Uint8Array(t.walk.length);
    const start = t.fineIndex(this.zones[0].checkpoint.x, this.zones[0].checkpoint.z);
    const stack = [start];
    seen[start] = 1;
    const ok = (k: number) => {
      const i = k % t.fnx, j = Math.floor(k / t.fnx);
      return this.isWalkable(t.fx0 + i * t.cell, t.fz0 + j * t.cell, 0.35);
    };
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % t.fnx;
      for (const n of [k - 1, k + 1, k - t.fnx, k + t.fnx]) {
        if (n < 0 || n >= seen.length || seen[n]) continue;
        if (Math.abs((n % t.fnx) - i) > 1) continue;
        seen[n] = 1;
        if (ok(n)) stack.push(n);
      }
    }
    const L = this.layout;
    const spots: [string, number, number][] = [
      ...this.zones.map((z, i) => [`zone${i}`, z.checkpoint.x, z.checkpoint.z] as [string, number, number]),
      ['boss', this.bossSpot.x, this.bossSpot.z],
      ...L.chests.map((c) => [`chest:${c.id}`, c.at[0], c.at[1]] as [string, number, number]),
      ...L.collectables.map((c) => [`item:${c.id}`, c.at[0], c.at[1]] as [string, number, number]),
      ...L.encounters.map((c) => [`enc:${c.id}`, c.at[0], c.at[1]] as [string, number, number]),
      ...L.puzzles.flatMap((p) => p.braziers.map((b, i) => [`brazier:${p.id}${i}`, b[0], b[1]] as [string, number, number])),
    ];
    const bad: string[] = [];
    for (const [name, x, z] of spots) {
      // Anything within 2.5 m of a reached cell counts (chests/braziers are obstacles themselves).
      let found = false;
      for (let dz = -2.5; dz <= 2.5 && !found; dz += 0.5) {
        for (let dx = -2.5; dx <= 2.5 && !found; dx += 0.5) {
          const k = t.fineIndex(x + dx, z + dz);
          if (k >= 0 && seen[k] && t.walk[k] && ok(k)) found = true;
        }
      }
      if (!found) bad.push(name);
    }
    return bad;
  }
}

function shapeBox(s: Shape) {
  if (s.kind === 'circle') return { x0: s.x - s.r, z0: s.z - s.r, x1: s.x + s.r, z1: s.z + s.r };
  if (s.kind === 'rect') return { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 };
  const xs = s.pts.map((p) => p[0]), zs = s.pts.map((p) => p[1]);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

function smoothstep(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
