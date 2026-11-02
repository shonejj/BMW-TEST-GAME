import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getAssets } from '../game/assets';
import { colored, vcMaterial } from './props';
import type { ChestKind, CollectDef, DoorDef, EncounterDef, LayoutDef, LayoutKind, XZ } from './layouts/types';
import { loadChapterWorld, markWorld, type ChapterWorld } from './worldsave';

/**
 * Exploration layer of a chapter map: chests (normal, ornate, sealed), collectables, one-way shortcut gates,
 * brazier puzzles and optional guarded encounters. It owns their meshes, state and per-chapter persistence,
 * and reports what happened through callbacks so the game decides the loot and spawns the enemies.
 */

export interface ChestInfo {
  id: string;
  kind: ChestKind;
  pos: THREE.Vector3;
  /** 1 normal, 2 ornate, 3 sealed: scale loot quantity/quality with it. */
  tier: 1 | 2 | 3;
}
export interface CollectInfo { id: string; kind: CollectDef['kind']; pos: THREE.Vector3; text?: string }
export interface EncounterInfo {
  id: string;
  kinds: [LayoutKind, number][];
  elite?: LayoutKind;
  level: number;
  center: THREE.Vector3;
  /** Walkable spawn points around the encounter centre (at least as many as enemies). */
  points: THREE.Vector3[];
}
/** What the game hands back for spawned encounter enemies (the Enemy class satisfies it). */
export interface Spawned { alive: boolean }

export interface ExploreHooks {
  onChestOpen?: (c: ChestInfo) => void;
  onCollect?: (c: CollectInfo) => void;
  onEncounter?: (e: EncounterInfo) => Spawned[];
  onNotice?: (text: string, color: string) => void;
}

export interface WorldQuery {
  heightAt(x: number, z: number): number;
  isWalkable(x: number, z: number, r?: number): boolean;
}

interface Chest {
  def: { id: string; kind: ChestKind; sealedBy?: string };
  group: THREE.Group;
  lid: THREE.Object3D;
  seal: THREE.Mesh | null;
  sealed: boolean;
  state: 'closed' | 'opening' | 'open';
  t: number;
  emitted: boolean;
  nagT: number;
}

interface Item { def: CollectDef; mesh: THREE.Object3D; taken: boolean; base: number }
interface Door { def: DoorDef; mesh: THREE.Object3D; open: boolean; t: number; circles: { x: number; z: number; r: number }[]; nagT: number }
interface Encounter { def: EncounterDef; state: 'idle' | 'active' | 'cleared'; spawned: Spawned[] }
interface Brazier { pos: THREE.Vector3; flame: THREE.Mesh; lit: boolean }
interface Puzzle { id: string; chest: string; braziers: Brazier[]; solved: boolean }

const CHEST_HINGE = new THREE.Vector3(0, 0.62, -0.5);

const sealMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){
      float g = step(0.55, fract(sin(floor(vUv.x * 24.0) * 12.9898 + floor(vUv.y * 5.0 + uTime) * 78.233) * 43758.5));
      float band = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
      gl_FragColor = vec4(vec3(1.0, 0.25, 0.1) * 1.6, (0.2 + g * 0.6) * band * (0.7 + 0.3 * sin(uTime * 4.0)));
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

const glowMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const herbGlow = glowMat(0x7dff9a);
const relicGlow = glowMat(0xffd27a);
const loreGlow = glowMat(0xbfd8ff);
const flameMat = glowMat(0xff9a40);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function cloneProp(name: string) {
  const src = getAssets().nature.get(name);
  if (!src) throw new Error('Missing prop ' + name);
  const c = src.clone();
  c.traverse((o) => (o.userData.sharedGeo = true));
  return c;
}

export class Explore {
  readonly chests: Chest[] = [];
  readonly items: Item[] = [];
  readonly doors: Door[] = [];
  readonly encounters: Encounter[] = [];
  readonly puzzles: Puzzle[] = [];
  readonly group = new THREE.Group();
  /** Static colliders for the chests (added to the level's obstacles). */
  readonly colliders: { x: number; z: number; r: number }[] = [];
  private saved: ChapterWorld;

  constructor(layout: LayoutDef, private readonly chapter: number, private readonly world: WorldQuery, private readonly hooks: ExploreHooks) {
    this.saved = loadChapterWorld(chapter);
    for (const c of layout.chests) this.addChest(c.id, c.at, c.rot ?? 0, c.kind, c.sealedBy);
    for (const d of layout.collectables) this.addItem(d);
    for (const d of layout.doors) this.addDoor(d);
    for (const e of layout.encounters) this.encounters.push({ def: e, state: 'idle', spawned: [] });
    for (const p of layout.puzzles) this.addPuzzle(p.id, p.chest, p.braziers);
  }

  private addChest(id: string, at: XZ, rot: number, kind: ChestKind, sealedBy?: string) {
    const group = new THREE.Group();
    const gold = kind !== 'normal';
    const body = cloneProp(gold ? 'ChestGold' : 'Chest');
    const lidSrc = cloneProp(gold ? 'ChestGold_Lid' : 'Chest_Lid');
    // The lid swings about the hinge at the back edge.
    const lid = new THREE.Group();
    lid.position.copy(CHEST_HINGE);
    lidSrc.position.sub(CHEST_HINGE);
    lid.add(lidSrc);
    group.add(body, lid);
    const s = kind === 'ornate' ? 1.25 : kind === 'sealed' ? 1.35 : 1.05;
    group.scale.setScalar(s);
    const y = this.world.heightAt(at[0], at[1]);
    group.position.set(at[0], y, at[1]);
    group.rotation.y = rot;
    let seal: THREE.Mesh | null = null;
    if (kind === 'sealed') {
      seal = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.6, 20, 1, true).translate(0, 0.8, 0), sealMat);
      seal.renderOrder = 5;
      group.add(seal);
    }
    if (kind !== 'normal') {
      // A faint shaft of light marks valuable chests from a distance.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 7, 10, 1, true).translate(0, 3.5, 0), beamMat);
      beam.name = 'beam';
      beam.renderOrder = 5;
      group.add(beam);
    }
    group.userData.dynamic = true;
    this.group.add(group);
    this.colliders.push({ x: at[0], z: at[1], r: 0.75 * s });
    const opened = this.saved.chests.includes(id);
    const sealed = kind === 'sealed' && !this.saved.seals.includes(sealedBy ?? id);
    const chest: Chest = { def: { id, kind, sealedBy }, group, lid, seal, sealed, state: opened ? 'open' : 'closed', t: 0, emitted: opened, nagT: 0 };
    if (opened) this.showOpen(chest);
    if (seal && !sealed) seal.visible = false;
    this.chests.push(chest);
  }

  private showOpen(c: Chest) {
    c.lid.rotation.x = -1.9;
    const beam = c.group.getObjectByName('beam');
    if (beam) beam.visible = false;
    if (c.seal) c.seal.visible = false;
  }

  private addItem(def: CollectDef) {
    const g = new THREE.Group();
    if (def.kind === 'herb') {
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4).rotateZ(0.5).translate(0.12, 0.2, 0), herbGlow);
        leaf.rotation.y = (i / 5) * Math.PI * 2;
        g.add(leaf);
      }
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4).translate(0, 0.5, 0), relicGlow));
    } else if (def.kind === 'relic') {
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28).translate(0, 0.9, 0), relicGlow));
    } else {
      g.add(new THREE.Mesh(colored(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6).rotateZ(Math.PI / 2).translate(0, 0.8, 0), 0xd8c8a0), vcMaterial));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 0.8, 0), loreGlow));
    }
    const y = this.world.heightAt(def.at[0], def.at[1]);
    g.position.set(def.at[0], y, def.at[1]);
    g.userData.dynamic = true;
    const taken = this.saved.items.includes(def.id);
    g.visible = !taken;
    this.group.add(g);
    this.items.push({ def, mesh: g, taken, base: y });
  }

  private addDoor(def: DoorDef) {
    const [ax, az] = def.a, [bx, bz] = def.b;
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.Group();
    const y = Math.min(this.world.heightAt(ax, az), this.world.heightAt(bx, bz));
    g.position.set((ax + bx) / 2, y, (az + bz) / 2);
    g.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    const parts: THREE.BufferGeometry[] = [];
    if ((def.look ?? 'gate') === 'gate') {
      for (const s of [-1, 1]) parts.push(colored(new THREE.BoxGeometry(0.35, 3.2, 0.35).translate(s * (len / 2), 1.6, 0), 0x3a2618));
      const n = Math.max(3, Math.round(len / 0.45));
      for (let i = 0; i < n; i++) parts.push(colored(new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(-len / 2 + ((i + 0.5) * len) / n, 1.3, 0), 0x4a3020));
      for (const h of [0.5, 2.3]) parts.push(colored(new THREE.BoxGeometry(len, 0.18, 0.2).translate(0, h, 0), 0x3a2618));
      parts.push(colored(new THREE.BoxGeometry(0.4, 0.4, 0.3).translate(0, 1.4, 0.12), 0x8a6a30));
    } else {
      parts.push(colored(new THREE.BoxGeometry(len, 3, 0.6).translate(0, 1.5, 0), 0x5a5650, 0.1));
      parts.push(colored(new THREE.BoxGeometry(len * 0.5, 0.5, 0.65).translate(0, 2.2, 0), 0x7a6a40));
    }
    const mesh = new THREE.Mesh(parts.length > 1 ? mergeAll(parts) : parts[0], vcMaterial);
    g.add(mesh);
    g.userData.dynamic = true;
    this.group.add(g);
    const circles: { x: number; z: number; r: number }[] = [];
    const n = Math.ceil(len / 0.5);
    for (let i = 0; i <= n; i++) circles.push({ x: ax + ((bx - ax) * i) / n, z: az + ((bz - az) * i) / n, r: 0.45 });
    const open = this.saved.doors.includes(def.id);
    const door: Door = { def, mesh: g, open, t: open ? 1 : 0, circles, nagT: 0 };
    if (open) g.visible = false;
    this.doors.push(door);
  }

  private addPuzzle(id: string, chest: string, at: XZ[]) {
    const solved = this.saved.seals.includes(id);
    const braziers = at.map(([x, z]) => {
      const y = this.world.heightAt(x, z);
      const stand = new THREE.Mesh(mergeAll([
        colored(new THREE.CylinderGeometry(0.5, 0.65, 0.3, 8).translate(0, 0.15, 0), 0x4a4740),
        colored(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6).translate(0, 0.7, 0), 0x5a4628),
        colored(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 8).translate(0, 1.2, 0), 0x6a5030),
      ]), vcMaterial);
      stand.position.set(x, y, z);
      stand.userData.dynamic = true;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6).translate(0, 1.8, 0), flameMat);
      flame.position.set(x, y, z);
      flame.visible = solved;
      flame.userData.dynamic = true;
      this.group.add(stand, flame);
      this.colliders.push({ x, z, r: 0.6 });
      return { pos: new THREE.Vector3(x, y, z), flame, lit: solved };
    });
    this.puzzles.push({ id, chest, braziers, solved });
  }

  /** Door colliders currently blocking. */
  blocking(x: number, z: number, r: number) {
    for (const d of this.doors) {
      if (d.open) continue;
      for (const c of d.circles) {
        const dx = x - c.x, dz = z - c.z, rr = c.r + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
    return false;
  }

  /** Re-arms encounters (enemies return when you rest or die, souls-style). Opened chests stay opened. */
  reset() {
    for (const e of this.encounters) { e.state = 'idle'; e.spawned = []; }
  }

  /** Chest/collectable/encounter markers for the minimap. */
  markers() {
    const out: { x: number; z: number; kind: 'chest' | 'item' | 'shortcut' }[] = [];
    for (const c of this.chests) if (c.state === 'closed') out.push({ x: c.group.position.x, z: c.group.position.z, kind: 'chest' });
    for (const i of this.items) if (!i.taken) out.push({ x: i.mesh.position.x, z: i.mesh.position.z, kind: 'item' });
    for (const d of this.doors) if (!d.open) out.push({ x: d.mesh.position.x, z: d.mesh.position.z, kind: 'shortcut' });
    return out;
  }

  private unseal(key: string) {
    let any = false;
    for (const c of this.chests) {
      if (c.def.kind === 'sealed' && (c.def.sealedBy ?? c.def.id) === key && c.sealed) {
        c.sealed = false;
        any = true;
      }
    }
    markWorld(this.chapter, 'seals', key);
    if (any) this.hooks.onNotice?.('The seal on a chest has broken', '#ffb070');
  }

  update(dt: number, time: number, p: THREE.Vector3, fighting: boolean, zoneLevel: number) {
    sealMat.uniforms.uTime.value = time;
    // Chests
    for (const c of this.chests) {
      if (c.seal) {
        if (!c.sealed && c.seal.visible) {
          c.seal.scale.y = Math.max(0, c.seal.scale.y - dt * 1.5);
          if (c.seal.scale.y <= 0) c.seal.visible = false;
        }
      }
      if (c.state === 'opening') {
        c.t += dt;
        c.lid.rotation.x = -1.9 * Math.min(1, c.t / 0.6) ** 0.6;
        if (c.t > 0.35 && !c.emitted) {
          c.emitted = true;
          const tier = c.def.kind === 'sealed' ? 3 : c.def.kind === 'ornate' ? 2 : 1;
          this.hooks.onChestOpen?.({ id: c.def.id, kind: c.def.kind, pos: c.group.position.clone(), tier });
          const beam = c.group.getObjectByName('beam');
          if (beam) beam.visible = false;
        }
        if (c.t >= 0.6) c.state = 'open';
        continue;
      }
      if (c.state !== 'closed') continue;
      const d = Math.hypot(p.x - c.group.position.x, p.z - c.group.position.z);
      c.nagT = Math.max(0, c.nagT - dt);
      if (d > 2.0 * c.group.scale.x) continue;
      if (c.sealed) {
        if (c.nagT <= 0) {
          this.hooks.onNotice?.(this.puzzles.some((q) => q.chest === c.def.id) ? 'Sealed · light the braziers nearby' : 'Sealed · defeat the guardian nearby', '#ff9a6a');
          c.nagT = 6;
        }
        continue;
      }
      if (fighting) continue;
      c.state = 'opening';
      c.t = 0;
      markWorld(this.chapter, 'chests', c.def.id);
    }
    // Collectables
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.position.y = it.base + Math.sin(time * 2 + it.base) * 0.1;
      it.mesh.rotation.y = time * 0.8;
      if (Math.hypot(p.x - it.mesh.position.x, p.z - it.mesh.position.z) > 1.3) continue;
      it.taken = true;
      it.mesh.visible = false;
      markWorld(this.chapter, 'items', it.def.id);
      this.hooks.onCollect?.({ id: it.def.id, kind: it.def.kind, pos: it.mesh.position.clone(), text: it.def.text });
    }
    // Shortcut gates
    for (const d of this.doors) {
      if (d.open) {
        if (d.t < 1 && d.mesh.visible) {
          d.t = Math.min(1, d.t + dt * 0.7);
          d.mesh.position.y -= dt * 2.6;
          if (d.t >= 1) d.mesh.visible = false;
        }
        continue;
      }
      d.nagT = Math.max(0, d.nagT - dt);
      const fromD = Math.hypot(p.x - d.def.from[0], p.z - d.def.from[1]);
      if (fromD < 2.4) {
        d.open = true;
        d.t = 0;
        markWorld(this.chapter, 'doors', d.def.id);
        this.hooks.onNotice?.('A shortcut opens', '#ffd27a');
        continue;
      }
      const near = Math.hypot(p.x - d.mesh.position.x, p.z - d.mesh.position.z);
      if (near < 2.6 && d.nagT <= 0) {
        this.hooks.onNotice?.('It is barred from the other side', '#c8b89a');
        d.nagT = 8;
      }
    }
    // Brazier puzzles
    for (const q of this.puzzles) {
      if (q.solved) continue;
      for (const b of q.braziers) {
        if (b.lit || Math.hypot(p.x - b.pos.x, p.z - b.pos.z) > 1.8) continue;
        b.lit = true;
        b.flame.visible = true;
        const n = q.braziers.filter((x) => x.lit).length;
        if (n < q.braziers.length) this.hooks.onNotice?.(`Brazier lit (${n}/${q.braziers.length})`, '#ffb070');
      }
      if (q.braziers.every((b) => b.lit)) {
        q.solved = true;
        this.unseal(q.id);
      }
    }
    for (const q of this.puzzles) for (const b of q.braziers) if (b.lit) b.flame.scale.set(1, 0.85 + 0.15 * Math.sin(time * 9 + b.pos.x), 1);
    // Guarded encounters
    for (const e of this.encounters) {
      if (e.state === 'idle') {
        const d = Math.hypot(p.x - e.def.at[0], p.z - e.def.at[1]);
        if (d > e.def.r || !this.hooks.onEncounter) continue;
        e.state = 'active';
        e.spawned = this.hooks.onEncounter(this.encounterInfo(e.def, zoneLevel));
      } else if (e.state === 'active' && e.spawned.every((s) => !s.alive)) {
        e.state = 'cleared';
        if (this.chests.some((c) => c.def.sealedBy === e.def.id)) this.unseal(e.def.id);
      }
    }
  }

  /** True while an optional encounter's enemies are still alive. */
  get fighting() {
    return this.encounters.some((e) => e.state === 'active');
  }

  private encounterInfo(def: EncounterDef, zoneLevel: number): EncounterInfo {
    const [cx, cz] = def.at;
    const cy = this.world.heightAt(cx, cz);
    const total = def.kinds.reduce((a, [, n]) => a + n, 0);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 80 && points.length < total; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * def.r * 0.55;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (!this.world.isWalkable(x, z, 0.8)) continue;
      const y = this.world.heightAt(x, z);
      if (Math.abs(y - cy) > 1.5) continue;
      points.push(new THREE.Vector3(x, y, z));
    }
    while (points.length < total) points.push(new THREE.Vector3(cx, cy, cz));
    return { id: def.id, kinds: def.kinds, elite: def.elite, level: zoneLevel + (def.level ?? 1), center: new THREE.Vector3(cx, cy, cz), points };
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Chest meshes share the asset geometry; everything else here was built for this map.
      if (!m.userData.shared && m.geometry && !isAssetGeometry(m.geometry)) m.geometry.dispose();
    });
  }
}

const assetGeos = new WeakSet<THREE.BufferGeometry>();
function isAssetGeometry(g: THREE.BufferGeometry) {
  if (!assetGeos.has(g)) {
    for (const o of getAssets().nature.values()) o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) assetGeos.add(m.geometry); });
  }
  return assetGeos.has(g);
}

function mergeAll(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}
