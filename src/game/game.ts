import * as THREE from 'three';
import { Audio } from '../audio/audio';
import { CameraRig } from '../engine/camera';
import { Input } from '../engine/input';
import { Renderer } from '../engine/renderer';
import { chance, isTouchDevice, rand, randInt, yawOf } from '../engine/util';
import { Controls } from '../ui/controls';
import { Hud, type Label } from '../ui/hud';
import { Menus } from '../ui/menus';
import { Debris } from '../world/debris';
import { Level, type Breakable, type SpawnKind } from '../world/level';
import { Rain } from '../world/weather';
import { Boss, Enemy, Spider } from './enemies';
import {
  BAG_SIZE, RARITY_COLORS, RARITY_HEX, generateItem, rollRarity, salvageValue, setNextItemId,
  type Inventory, type Item, type Slot,
} from './loot';
import { Player, SKILLS, TRANSFORM_DURATION } from './player';
import { loadSave, loadSettings, writeSave, writeSettings, type SaveData, type Settings } from './save';
import { COLORS, Vfx } from './vfx';

export interface StrikeOptions {
  origin: THREE.Vector3;
  yaw: number;
  range: number;
  halfArc: number;
  mult: number;
  knock: number;
  skill: boolean;
  color: number;
  burn?: boolean;
  silentSwing?: boolean;
}

interface Projectile {
  obj: THREE.Object3D;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  radius: number;
  owner: 'player' | 'enemy';
  dmg: number;
  crit: boolean;
  kind: 'gale' | 'fire' | 'web' | 'feather';
  hit: Set<Enemy>;
}

interface Hazard {
  pos: THREE.Vector3;
  r: number;
  t: number;
  dps: number;
  owner: 'player' | 'enemy';
  tick: number;
}

interface Drop {
  kind: 'gold' | 'item';
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  amount: number;
  item?: Item;
  label?: Label;
  beam?: { remove: () => void };
  magnet: boolean;
}

type GameState = 'boot' | 'menu' | 'playing' | 'paused' | 'dead' | 'victory';
type ZoneState = 'idle' | 'active' | 'cleared';

const goldGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8);
const goldMat = new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0xa06000, emissiveIntensity: 0.8 });
const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
const waveGeo = new THREE.RingGeometry(0.55, 1, 20, 1, 0, Math.PI * 0.8);
const webGeo = new THREE.IcosahedronGeometry(0.3, 0);
const featherGeo = new THREE.BoxGeometry(0.12, 0.05, 0.9);

export class Game {
  readonly renderer: Renderer;
  readonly camRig: CameraRig;
  readonly input: Input;
  readonly audio = new Audio();
  readonly hud: Hud;
  readonly controls: Controls;
  readonly menus: Menus;
  readonly level: Level;
  vfx!: Vfx;
  debris!: Debris;
  rain!: Rain;
  player!: Player;
  readonly touch = isTouchDevice();
  settings: Settings;
  inventory: Inventory = { gold: 0, bag: [], equipped: {} };

  time = 0;
  readonly perf = { logicMs: 0, renderMs: 0, calls: 0 };
  private state: GameState = 'boot';
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private projectiles: Projectile[] = [];
  private hazards: Hazard[] = [];
  private drops: Drop[] = [];
  private zoneState: ZoneState[] = [];
  private zoneWave: number[] = [];
  private zoneEnemies: Enemy[][] = [];
  private waveDelay = 0;
  private hitstopT = 0;
  private slowmoT = 0;
  private miniMap!: HTMLCanvasElement;
  private miniTimer = 0;
  private lastZoneName = '';
  private ng = 0;
  private kills = 0;
  private playTime = 0;
  private deathTimer = 0;
  private saveTimer = 0;
  private victoryTimer = -1;
  private lastFrame = performance.now();
  private tmp = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.settings = loadSettings(this.touch ? 'medium' : 'high');
    this.renderer.setQuality(this.settings.quality);
    this.camRig = new CameraRig(this.renderer.camera);
    this.input = new Input(this.renderer.renderer.domElement);
    this.hud = new Hud(container);
    const unlock = () => this.audio.unlock();
    this.controls = new Controls(container, this.input, this.touch, unlock);
    this.menus = new Menus(container, this);
    this.level = new Level(this.renderer.scene);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('resize', () => this.updateParticleScale());
  }

  // -------------------------------------------------------------------------
  // Boot & flow
  // -------------------------------------------------------------------------

  boot() {
    const q = this.settings.quality;
    this.level.build(q);
    this.vfx = new Vfx(this.renderer.scene, q === 'low' ? 800 : 1600);
    this.debris = new Debris(this.renderer.scene, (x, z) => this.level.heightAt(x, z));
    this.rain = new Rain(1400);
    this.rain.setVisibleCount(q === 'low' ? 450 : q === 'medium' ? 900 : 1400);
    this.renderer.scene.add(this.rain.lines);
    this.player = new Player(this);
    this.miniMap = this.level.renderMinimap();
    this.audio.setVolume(this.settings.volume);
    this.camRig.shakeScale = this.settings.screenShake;
    this.audio.setMusicVolume(this.settings.music);
    this.updateParticleScale();
    this.resetWorld(0);
    this.player.respawn(this.level.zones[0].checkpoint);
    this.camRig.snap(this.player.pos);
    this.toMainMenu();
    this.renderer.renderer.setAnimationLoop(() => this.loop());
    document.getElementById('boot')?.remove();
    this.renderer.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this.pause();
      this.hud.toast('Graphics were reset by the browser. Reload if the screen stays black.', '#ff9a6a');
    });
  }

  private updateParticleScale() {
    const v = new THREE.Vector2();
    this.renderer.renderer.getDrawingBufferSize(v);
    const pxPerUnit = v.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.renderer.camera.fov / 2)));
    this.vfx?.sparks.setScale(pxPerUnit);
    this.vfx?.dust.setScale(pxPerUnit);
  }

  toMainMenu() {
    this.state = 'menu';
    this.hud.setVisible(false);
    this.controls.setVisible(false);
    this.menus.showStart(!!loadSave());
  }

  startGame(fresh: boolean) {
    this.audio.unlock();
    if (this.touch) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
    }
    const save = fresh ? null : loadSave();
    if (save) {
      this.player.level = save.level;
      this.player.xp = save.xp;
      this.inventory = { gold: save.gold, bag: save.bag, equipped: save.equipped };
      this.ng = save.ng;
      this.kills = save.kills;
      this.playTime = save.playTime;
      setNextItemId(save.nextItemId);
    } else {
      this.player.level = 1;
      this.player.xp = 0;
      this.player.fury = 0;
      this.inventory = { gold: 0, bag: [], equipped: {} };
      this.ng = 0;
      this.kills = 0;
      this.playTime = 0;
    }
    this.player.computeStats(this.inventory);
    const cleared = save ? Math.min(save.cleared, this.level.zones.length - 1) : 0;
    this.resetWorld(cleared);
    this.player.respawn(this.level.zones[cleared].checkpoint);
    this.camRig.snap(this.player.pos);
    this.menus.close();
    this.hud.setVisible(true);
    this.controls.setVisible(true);
    this.state = 'playing';
    this.lastZoneName = '';
    this.hud.showTitle(cleared === 0 ? 'Chapter One' : `Chapter One · ${this.ng ? 'Torment ' + this.ng : 'Continue'}`, cleared === 0 ? 'Mountain-Sea Temple' : this.level.zones[cleared].name);
    this.hud.setObjective('Explore the temple grounds');
    this.save();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls.setVisible(false);
    this.menus.showPause();
  }

  resume() {
    this.menus.close();
    if (this.state === 'paused' || this.state === 'playing') {
      this.state = 'playing';
      this.controls.setVisible(true);
      this.input.clearPresses();
    }
  }

  openInventory() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls.setVisible(false);
    this.menus.showInventory();
  }

  applySettings(p: Partial<Settings>) {
    Object.assign(this.settings, p);
    if (p.quality) {
      this.renderer.setQuality(p.quality);
      this.rain.setVisibleCount(p.quality === 'low' ? 450 : p.quality === 'medium' ? 900 : 1400);
      this.updateParticleScale();
    }
    if (p.screenShake !== undefined) this.camRig.shakeScale = p.screenShake;
    if (p.volume !== undefined) this.audio.setVolume(p.volume);
    if (p.music !== undefined) this.audio.setMusicVolume(p.music);
    writeSettings(this.settings);
  }

  /** Clears all actors and restores zones: the first `cleared` zones count as done. */
  private resetWorld(cleared: number) {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.boss = null;
    for (const p of this.projectiles) this.renderer.scene.remove(p.obj);
    this.projectiles = [];
    this.hazards = [];
    for (const d of this.drops) this.removeDrop(d);
    this.drops = [];
    this.hud.clearLabels();
    this.hud.setBoss(null);
    const zones = this.level.zones;
    this.zoneState = zones.map((_, i) => (i < cleared ? 'cleared' : 'idle'));
    this.zoneWave = zones.map(() => 0);
    this.zoneEnemies = zones.map(() => []);
    this.level.gates.forEach((_, i) => {
      const opener = zones.findIndex((z) => z.opensGate === i);
      this.level.setGate(i, opener >= cleared);
    });
    for (const b of this.level.breakables) {
      b.broken = false;
      b.hp = b.def.hp;
      b.def.mesh.visible = true;
    }
    this.victoryTimer = -1;
    this.camRig.setZoom(1);
  }

  restartFromCheckpoint() {
    const cleared = this.zoneState.findIndex((s) => s !== 'cleared');
    const idx = cleared < 0 ? 0 : cleared;
    // Keep broken props broken; just reset actors and the current zone.
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.boss = null;
    for (const p of this.projectiles) this.renderer.scene.remove(p.obj);
    this.projectiles = [];
    this.hazards = [];
    this.hud.setBoss(null);
    for (let i = idx; i < this.zoneState.length; i++) {
      this.zoneState[i] = 'idle';
      this.zoneWave[i] = 0;
      this.zoneEnemies[i] = [];
    }
    this.level.gates.forEach((_, i) => {
      const opener = this.level.zones.findIndex((z) => z.opensGate === i);
      this.level.setGate(i, opener >= idx);
    });
    this.player.respawn(this.level.zones[idx].checkpoint);
    this.camRig.snap(this.player.pos);
    this.camRig.setZoom(1);
    this.menus.close();
    this.state = 'playing';
    this.controls.setVisible(true);
    this.hud.setVisible(true);
    this.hud.setObjective('Explore the temple grounds');
  }

  newGamePlus() {
    this.ng++;
    this.resetWorld(0);
    this.player.respawn(this.level.zones[0].checkpoint);
    this.camRig.snap(this.player.pos);
    this.menus.close();
    this.state = 'playing';
    this.hud.setVisible(true);
    this.controls.setVisible(true);
    this.hud.showTitle(`Torment ${this.ng}`, 'Mountain-Sea Temple');
    this.save();
  }

  private save(chapterComplete = false) {
    const firstOpen = this.zoneState.findIndex((s) => s !== 'cleared');
    const cleared = chapterComplete ? 0 : firstOpen;
    const data: SaveData = {
      version: 1,
      level: this.player.level,
      xp: this.player.xp,
      gold: this.inventory.gold,
      bag: this.inventory.bag,
      equipped: this.inventory.equipped,
      cleared: cleared < 0 ? 0 : cleared,
      ng: this.ng + (chapterComplete ? 1 : 0),
      nextItemId: Math.max(0, ...this.inventory.bag.map((i) => i.id), ...Object.values(this.inventory.equipped).map((i) => i?.id ?? 0)) + 1,
      kills: this.kills,
      playTime: this.playTime,
    };
    writeSave(data);
  }

  // -------------------------------------------------------------------------
  // Queries used by actors
  // -------------------------------------------------------------------------

  targets(): Enemy[] {
    return this.enemies.filter((e) => e.alive);
  }

  hitstop(t: number) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  /** Melee/AoE hit test against enemies and breakables. Returns the number of enemies hit. */
  strike(o: StrikeOptions): number {
    let hits = 0;
    let crit = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - o.origin.x, dz = e.pos.z - o.origin.z;
      const d = Math.hypot(dx, dz);
      if (d > o.range + e.radius) continue;
      if (o.halfArc < Math.PI && d > 0.5) {
        let da = Math.abs(yawOf(dx, dz) - o.yaw) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > o.halfArc + Math.atan2(e.radius, d)) continue;
      }
      const roll = this.player.rollDamage(o.mult, o.skill);
      const dir = d > 0.01 ? { x: dx / d, z: dz / d } : { x: Math.sin(o.yaw), z: Math.cos(o.yaw) };
      this.dealDamage(e, roll.amount, roll.crit, dir, o.knock, 'hit');
      if (o.burn) {
        e.burn = 3;
        e.burnDps = Math.max(e.burnDps * 0.5, roll.amount * 0.35);
      }
      this.tmp.set(e.pos.x - dir.x * e.radius * 0.5, e.pos.y, e.pos.z - dir.z * e.radius * 0.5);
      this.vfx.impact(this.tmp, o.color, roll.crit ? 16 : 8);
      hits++;
      crit ||= roll.crit;
    }
    for (const b of this.level.breakables) {
      if (b.broken) continue;
      const dx = b.pos.x - o.origin.x, dz = b.pos.z - o.origin.z;
      const d = Math.hypot(dx, dz);
      if (d > o.range + b.def.radius) continue;
      if (o.halfArc < Math.PI && d > 0.5) {
        let da = Math.abs(yawOf(dx, dz) - o.yaw) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > o.halfArc + 0.3) continue;
      }
      this.hitBreakable(b, o.skill ? 2 : 1);
    }
    if (hits > 0) {
      this.audio.play(crit ? 'crit' : 'hit');
      this.hitstop(crit ? 0.07 : 0.045);
      this.camRig.shake(crit ? 0.3 : 0.15, 0.12);
      this.player.heal(this.player.stats.lifeOnHit * Math.min(hits, 3));
      if (!o.skill) this.player.mana = Math.min(this.player.stats.maxMana, this.player.mana + 2 * Math.min(hits, 3));
    }
    return hits;
  }

  private hitBreakable(b: Breakable, power: number) {
    b.hp -= power;
    this.vfx.impact(b.pos, COLORS.goldHot, 5);
    if (b.hp > 0) {
      this.audio.play('hit');
      b.def.mesh.rotation.z += (Math.random() - 0.5) * 0.15;
      return;
    }
    b.broken = true;
    b.def.mesh.visible = false;
    this.debris.burst(b.pos, b.def.color, b.def.chunks, b.def.chunkSize, b.def.radius > 0.8 ? 1.4 : 1);
    this.vfx.dustBurst(b.pos, 8, b.def.radius);
    this.audio.play('shatter');
    this.camRig.shake(0.12, 0.1);
    const lvl = this.currentLevel();
    if (chance(0.55)) this.dropGold(b.pos, randInt(2, 8) * lvl);
    if (chance(b.def.radius > 0.8 ? 0.6 : 0.08)) this.dropItem(b.pos, lvl, 0);
  }

  private currentLevel() {
    const i = this.zoneState.findIndex((s) => s !== 'cleared');
    return this.level.zones[i < 0 ? 0 : i].level + this.ng * 8;
  }

  dealDamage(e: Enemy, amount: number, crit: boolean, dir: { x: number; z: number } | null, knock: number, kind: 'hit' | 'burn' | 'poison') {
    if (!e.alive || amount <= 0) return;
    e.hp -= amount;
    if (dir) e.onHit(dir, knock);
    if (this.settings.damageNumbers) {
      const cls = kind === 'burn' ? 'dmg burn' : kind === 'poison' ? 'dmg poison' : crit ? 'dmg crit' : 'dmg';
      this.hud.floatText(e.pos, crit ? `${amount}!` : String(amount), cls, crit ? 1.1 : 0.8);
    }
    if (!this.player.transformed) {
      const gain = amount * 0.05 * (this.player.stats.powers.has('furyGain') ? 1.6 : 1);
      const before = this.player.fury;
      this.player.fury = Math.min(100, this.player.fury + gain);
      if (before < 100 && this.player.fury >= 100) {
        this.hud.toast(this.touch ? 'Fury full! Tap the Monkey King button' : 'Fury full! Press T to transform', '#ffd46a');
        this.audio.play('legendary');
      }
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.kill();
      this.onEnemyKilled(e);
    }
  }

  private onEnemyKilled(e: Enemy) {
    this.kills++;
    this.gainXp(e.xp);
    if (this.player.stats.powers.has('killMana')) this.player.mana = Math.min(this.player.stats.maxMana, this.player.mana + 8);
    if (e.isBoss) return;
    const [g0, g1] = e.def.gold;
    const piles = e.elite ? 3 : 1;
    for (let i = 0; i < piles; i++) if (chance(e.kind === 'spiderling' ? 0.4 : 0.9)) this.dropGold(e.pos, Math.round(rand(g0, g1) * (1 + e.level * 0.4)));
    const drops = e.elite ? 2 : chance(e.def.dropChance) ? 1 : 0;
    for (let i = 0; i < drops; i++) this.dropItem(e.pos, e.level, (e.elite ? 25 : 0) + this.ng * 4);
    this.vfx.sparks.emit(e.pos.x, e.pos.y + 0.5, e.pos.z, { count: 12, radius: e.radius, speed: [1, 4], up: [1, 4], life: [0.3, 0.7], color: 0xff3020, color2: 0x801010 });
  }

  private gainXp(n: number) {
    const p = this.player;
    p.xp += n;
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level++;
      p.computeStats(this.inventory);
      p.hp = p.stats.maxHp;
      p.mana = p.stats.maxMana;
      this.vfx.beam(p.pos, COLORS.gold, 12, 1.6, 1.4);
      this.vfx.shockwave(p.pos, 3, COLORS.gold, 0.6);
      this.vfx.sparks.emit(p.pos.x, p.pos.y + 1, p.pos.z, { count: 40, radius: 0.8, speed: [0.5, 2], up: [3, 9], gravity: -1, life: [0.6, 1.4], color: COLORS.goldHot, color2: COLORS.gold });
      this.hud.floatText(p.pos, 'LvL Up ⬆', 'levelup', 1.8);
      this.audio.play('levelup');
    }
  }

  // -------------------------------------------------------------------------
  // Spawning helpers used by actors
  // -------------------------------------------------------------------------

  spawnEnemy(kind: SpawnKind, level: number, at: THREE.Vector3, elite = false, zone = -1): Enemy {
    const e = kind === 'boss' ? new Boss(this, level, at) : new Spider(this, kind, level, at);
    if (elite) e.makeElite();
    this.enemies.push(e);
    if (zone >= 0) this.zoneEnemies[zone].push(e);
    if (kind === 'boss') this.boss = e as Boss;
    return e;
  }

  private spawnWave(zoneIndex: number) {
    const z = this.level.zones[zoneIndex];
    const wave = z.waves[this.zoneWave[zoneIndex]];
    const lvl = z.level + this.ng * 8;
    let eliteGiven = false;
    for (const [kind, count] of wave.kinds) {
      for (let i = 0; i < count; i++) {
        if (kind === 'boss') {
          this.spawnEnemy('boss', lvl, new THREE.Vector3(0, this.level.heightAt(0, -141), -141), false, zoneIndex);
          continue;
        }
        const at = this.level.randomPointIn(z.area, 1.2, this.player.pos, 6);
        const elite = !!wave.elite && !eliteGiven && kind === 'armored';
        if (elite) eliteGiven = true;
        this.spawnEnemy(kind, lvl, at, elite, zoneIndex);
      }
    }
    this.audio.play('skitter');
  }

  private projectile(kind: Projectile['kind'], pos: THREE.Vector3, yaw: number, speed: number, life: number, radius: number, owner: Projectile['owner'], dmg: number, crit = false) {
    let obj: THREE.Object3D;
    let mat: THREE.MeshBasicMaterial;
    if (kind === 'gale' || kind === 'fire') {
      mat = new THREE.MeshBasicMaterial({ color: kind === 'gale' ? COLORS.jade : COLORS.fire, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(waveGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -Math.PI / 2 - (Math.PI * 0.8) / 2;
      mesh.scale.setScalar(kind === 'gale' ? 2.2 : 1.8);
      obj = new THREE.Group();
      obj.add(mesh);
    } else if (kind === 'web') {
      mat = new THREE.MeshBasicMaterial({ color: 0xe8f0e0, transparent: true, opacity: 0.9 });
      obj = new THREE.Mesh(webGeo, mat);
    } else {
      mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
      obj = new THREE.Mesh(featherGeo, mat);
    }
    obj.position.set(pos.x, pos.y + 1.1, pos.z);
    obj.rotation.y = yaw;
    obj.renderOrder = 6;
    this.renderer.scene.add(obj);
    this.projectiles.push({
      obj, mat, vel: new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed), life, maxLife: life, radius, owner, dmg, crit, kind, hit: new Set(),
    });
  }

  spawnGale(pos: THREE.Vector3, yaw: number, roll: { amount: number; crit: boolean }) {
    this.projectile('gale', pos, yaw, 16, 0.8, 1.8, 'player', roll.amount, roll.crit);
  }
  spawnFireWave(pos: THREE.Vector3, yaw: number, roll: { amount: number; crit: boolean }) {
    this.projectile('fire', pos, yaw, 15, 0.42, 1.5, 'player', roll.amount, roll.crit);
  }
  spawnWeb(pos: THREE.Vector3, yaw: number, dmg: number) {
    this.projectile('web', pos, yaw, 11, 1.4, 0.5, 'enemy', dmg);
    this.audio.play('web');
  }
  spawnFeather(pos: THREE.Vector3, yaw: number, dmg: number) {
    this.projectile('feather', pos, yaw, 15, 1.3, 0.45, 'enemy', dmg);
  }

  addHazard(pos: THREE.Vector3, r: number, dur: number, dps: number, owner: 'player' | 'enemy') {
    this.hazards.push({ pos: pos.clone(), r, t: dur, dps, owner, tick: 0 });
    if (owner === 'enemy') this.vfx.pool(pos, r, dur);
  }

  // -------------------------------------------------------------------------
  // Loot
  // -------------------------------------------------------------------------

  private landingSpot(from: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.8, 2.4);
      const x = from.x + Math.sin(a) * r, z = from.z + Math.cos(a) * r;
      if (this.level.isWalkable(x, z, 0.2)) return new THREE.Vector3(x, this.level.heightAt(x, z), z);
    }
    return from.clone();
  }

  private dropGold(from: THREE.Vector3, amount: number) {
    const obj = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(goldGeo, goldMat);
      c.position.set(rand(-0.15, 0.15), i * 0.05, rand(-0.15, 0.15));
      c.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
      obj.add(c);
    }
    obj.position.copy(from);
    this.renderer.scene.add(obj);
    const to = this.landingSpot(from);
    this.drops.push({ kind: 'gold', obj, from: from.clone(), to, age: 0, amount, magnet: false });
  }

  private dropItem(from: THREE.Vector3, level: number, bias: number, rarity = rollRarity(bias)) {
    const item = generateItem(level, rarity);
    const mat = new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 0.7 });
    const obj = new THREE.Mesh(gemGeo, mat);
    obj.position.copy(from);
    this.renderer.scene.add(obj);
    const to = this.landingSpot(from);
    const d: Drop = { kind: 'item', obj, from: from.clone(), to, age: 0, amount: 0, item, magnet: false };
    this.drops.push(d);
    if (rarity >= 2) {
      d.beam = this.vfx.beam(to, RARITY_HEX[rarity], rarity >= 3 ? 9 : 5, 9999, rarity >= 3 ? 0.9 : 0.6);
      if (rarity >= 3) this.audio.play('legendary');
    }
  }

  private removeDrop(d: Drop) {
    this.renderer.scene.remove(d.obj);
    d.label?.remove();
    d.beam?.remove();
  }

  private updateDrops(dt: number) {
    const p = this.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.magnet) {
        this.tmp.set(p.x, p.y + 1, p.z);
        d.obj.position.lerp(this.tmp, Math.min(1, dt * 14));
        if (d.obj.position.distanceTo(this.tmp) < 0.4) {
          this.collect(d);
          this.removeDrop(d);
          this.drops.splice(i, 1);
        }
        continue;
      }
      if (d.age < 0.55) {
        const k = d.age / 0.55;
        d.obj.position.lerpVectors(d.from, d.to, k);
        d.obj.position.y = d.from.y + (d.to.y - d.from.y) * k + Math.sin(k * Math.PI) * 2 + 0.25;
        d.obj.rotation.y += dt * 12;
      } else {
        if (!d.label) {
          const text = d.kind === 'gold' ? `${d.amount}g` : d.item!.name;
          const color = d.kind === 'gold' ? '#ffe08a' : RARITY_COLORS[d.item!.rarity];
          d.label = this.hud.addLabel(d.to, text, color, d.kind === 'gold' ? 'gold-label' : 'r' + d.item!.rarity);
        }
        d.obj.position.copy(d.to);
        d.obj.position.y += d.kind === 'item' ? 0.35 + Math.sin(this.time * 3 + i) * 0.08 : 0.05;
        if (d.kind === 'item') d.obj.rotation.y += dt * 2;
        const dist = Math.hypot(p.x - d.to.x, p.z - d.to.z);
        const range = d.kind === 'gold' ? 2.4 : 1.6;
        if (dist < range && this.player.alive) {
          if (d.kind === 'item' && this.inventory.bag.length >= BAG_SIZE) {
            if (Math.floor(this.time * 2) % 6 === 0) this.hud.toast('Bag full — salvage items in the inventory', '#ff9a6a');
            continue;
          }
          d.magnet = true;
          d.label?.remove();
          d.label = undefined;
          d.beam?.remove();
          d.beam = undefined;
        }
      }
    }
  }

  private collect(d: Drop) {
    if (d.kind === 'gold') {
      this.inventory.gold += d.amount;
      this.audio.play('coin');
      return;
    }
    const it = d.item!;
    this.audio.play('pickup');
    if (!this.inventory.equipped[it.slot]) {
      this.inventory.equipped[it.slot] = it;
      this.player.computeStats(this.inventory);
      this.hud.toast(`Equipped ${it.name}`, RARITY_COLORS[it.rarity]);
    } else {
      this.inventory.bag.push(it);
      if (it.rarity >= 2) this.hud.toast(`Picked up ${it.name}`, RARITY_COLORS[it.rarity]);
    }
    this.saveTimer = 0.5;
  }

  equip(it: Item) {
    const inv = this.inventory;
    const idx = inv.bag.findIndex((b) => b.id === it.id);
    if (idx < 0) return;
    inv.bag.splice(idx, 1);
    const prev = inv.equipped[it.slot];
    inv.equipped[it.slot] = it;
    if (prev) inv.bag.push(prev);
    this.player.computeStats(inv);
    this.audio.play('pickup');
    this.save();
  }

  unequip(slot: Slot) {
    const inv = this.inventory;
    const it = inv.equipped[slot];
    if (!it || inv.bag.length >= BAG_SIZE) return;
    delete inv.equipped[slot];
    inv.bag.push(it);
    this.player.computeStats(inv);
    this.save();
  }

  salvage(items: Item[]) {
    const ids = new Set(items.map((i) => i.id));
    let gold = 0;
    for (const it of items) gold += salvageValue(it);
    this.inventory.bag = this.inventory.bag.filter((i) => !ids.has(i.id));
    this.inventory.gold += gold;
    if (gold) this.audio.play('coin');
    this.save();
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  onPlayerDeath() {
    this.state = 'dead';
    this.deathTimer = 1.6;
    this.controls.setVisible(false);
    this.slowmoT = 1;
  }

  onBossDefeated(boss: Boss) {
    this.hud.setBoss(null);
    this.slowmoT = 1.5;
    this.camRig.shake(1, 1);
    this.vfx.shockwave(boss.pos, 12, COLORS.jade, 1.2, 0.25);
    this.vfx.beam(boss.pos, COLORS.jade, 20, 2.5, 3);
    for (let i = 0; i < 4; i++) this.dropGold(boss.pos, Math.round(rand(300, 500) * (1 + this.ng)));
    const lvl = boss.level;
    this.dropItem(boss.pos, lvl, 0, 3);
    this.dropItem(boss.pos, lvl, 0, chance(0.35 + this.ng * 0.1) ? 4 : 3);
    for (let i = 0; i < 3; i++) this.dropItem(boss.pos, lvl, 30 + this.ng * 5);
    for (const e of this.enemies) if (e.alive && !e.isBoss) { e.hp = 0; e.kill(); }
    this.hud.toast('Blackfeather Lord defeated!', '#9cff6a');
    this.victoryTimer = 6;
    this.hud.setObjective('Collect your spoils');
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  private loop() {
    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.frame(rawDt);
    // Rolling CPU timings (ms): game logic vs render submit. Read via window.game.perf.
    const total = performance.now() - now;
    const k = 0.05;
    this.perf.logicMs += (total - this.renderer.lastRenderMs - this.perf.logicMs) * k;
    this.perf.renderMs += (this.renderer.lastRenderMs - this.perf.renderMs) * k;
    this.perf.calls = this.renderer.renderer.info.render.calls;
  }

  private frame(rawDt: number) {
    this.input.update();
    if (this.input.consume('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (this.input.consume('inventory')) {
      if (this.state === 'playing') this.openInventory();
      else if (this.state === 'paused' && this.menus.current === 'inventory') this.resume();
    }

    let dt = rawDt;
    if (this.state === 'paused' || this.state === 'menu' || this.state === 'boot') dt = 0;
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      dt *= 0.08;
    }
    if (this.slowmoT > 0) {
      this.slowmoT -= rawDt;
      dt *= 0.35;
    }

    if (this.state === 'menu') {
      // Slow drift camera behind the menu.
      this.time += rawDt;
      this.tmp.set(Math.sin(this.time * 0.1) * 3, 0, -6 + Math.cos(this.time * 0.08) * 4);
      this.camRig.update(rawDt, this.tmp);
      this.rain.update(rawDt, this.camRig.target);
      this.level.update(rawDt, this.time);
      this.vfx.update(rawDt);
      this.renderer.render();
      return;
    }

    if (dt > 0) {
      this.time += dt;
      if (this.state === 'playing') this.playTime += dt;
      if (this.state === 'playing' || this.state === 'dead') {
        this.player.update(dt);
        this.updateDirector(dt);
        for (const e of this.enemies) e.update(dt);
        this.enemies = this.enemies.filter((e) => !e.removed);
        this.separate();
        this.updateProjectiles(dt);
        this.updateHazards(dt);
        this.updateDrops(dt);
      }
      this.debris.update(dt);
      this.vfx.update(dt);
      this.level.update(dt, this.time);
    }
    this.rain.update(rawDt, this.camRig.target);
    // Look-ahead: lead the camera towards where the player is moving / facing.
    const pl = this.player;
    const lead = !pl.alive ? 0 : pl.speedNow > 1 ? 1.8 : 0.8;
    this.camRig.setLead(Math.sin(pl.yaw) * lead, Math.cos(pl.yaw) * lead);
    this.camRig.update(rawDt, pl.pos);
    this.renderer.render();

    // UI
    const p = this.player;
    this.hud.setStats(p.hp, p.stats.maxHp, p.mana, p.stats.maxMana, p.xp, p.xpToNext, p.level, this.inventory.gold);
    this.hud.update(dt > 0 ? rawDt : 0, this.renderer.camera);
    this.controls.update(p.cooldowns, SKILLS.map((s) => s.cd * (1 - p.stats.cdr)), p.mana, SKILLS.map((s) => s.mana), p.fury, p.transformTime, TRANSFORM_DURATION);
    if (this.boss && this.boss.alive) this.hud.setBoss(this.boss.def.name + (this.ng ? ` · Torment ${this.ng}` : ''), this.boss.hp / this.boss.maxHp);
    this.miniTimer -= rawDt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.1;
      this.hud.drawMinimap(this.miniMap, this.level.bounds, p.pos.x, p.pos.z, p.yaw, this.targets().map((e) => ({ x: e.pos.x, z: e.pos.z, boss: e.isBoss })), this.level.gates);
    }
    const near = this.targets().filter((e) => e.pos.distanceTo(p.pos) < 18).length;
    this.audio.combatIntensity += ((near > 0 ? 1 : 0) - this.audio.combatIntensity) * Math.min(1, rawDt * 0.8);
    this.audio.update(rawDt);

    if (this.state === 'dead') {
      this.deathTimer -= rawDt;
      if (this.deathTimer <= 0 && this.menus.current !== 'dead') this.menus.showDeath();
    }
    if (this.victoryTimer > 0 && this.state === 'playing') {
      this.victoryTimer -= rawDt;
      if (this.victoryTimer <= 0) this.showVictory();
    }
    if (this.saveTimer > 0) {
      this.saveTimer -= rawDt;
      if (this.saveTimer <= 0) this.save();
    }
  }

  private showVictory() {
    // Auto-collect remaining loot
    for (const d of this.drops) {
      this.collect(d);
      this.removeDrop(d);
    }
    this.drops = [];
    this.state = 'victory';
    this.controls.setVisible(false);
    const t = Math.floor(this.playTime);
    this.menus.showVictory({ time: `${Math.floor(t / 60)}m ${t % 60}s`, kills: this.kills, gold: this.inventory.gold, level: this.player.level, ng: this.ng });
    // Mark the chapter complete in the save so "Continue" starts the next torment.
    this.save(true);
  }

  private updateDirector(dt: number) {
    const zones = this.level.zones;
    const p = this.player.pos;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const st = this.zoneState[i];
      if (st === 'idle' && p.z < z.triggerZ && (i === 0 || this.zoneState[i - 1] === 'cleared' || zones[i - 1].opensGate === undefined)) {
        this.zoneState[i] = 'active';
        this.zoneWave[i] = 0;
        this.spawnWave(i);
        this.waveDelay = 0;
        if (z.closesGate !== undefined) this.level.setGate(z.closesGate, true);
        if (i === zones.length - 1) {
          this.hud.showTitle(z.name, 'Blackfeather Lord');
          this.hud.setObjective('Defeat the Blackfeather Lord');
        } else this.hud.setObjective('Defeat the yaoguai');
      }
      if (this.zoneState[i] !== 'active') continue;
      const alive = this.zoneEnemies[i].filter((e) => e.alive).length;
      if (this.zoneWave[i] < z.waves.length - 1) {
        if (alive <= 1) {
          this.waveDelay += dt;
          if (this.waveDelay > 0.8) {
            this.waveDelay = 0;
            this.zoneWave[i]++;
            this.spawnWave(i);
          }
        }
      } else if (alive === 0) {
        this.zoneState[i] = 'cleared';
        if (z.opensGate !== undefined) {
          this.level.setGate(z.opensGate, false);
          this.hud.toast('The seal is broken', '#ff9a6a');
          this.audio.play('seal');
        }
        if (i < zones.length - 1) this.hud.setObjective('Press on deeper into the temple');
        this.save();
      }
      const remaining = alive + z.waves.slice(this.zoneWave[i] + 1).reduce((a, w) => a + w.kinds.reduce((b, [, n]) => b + n, 0), 0);
      if (this.zoneState[i] === 'active' && i < zones.length - 1) this.hud.setObjective(`Defeat the yaoguai · ${remaining} left`);
    }
    // Location name
    const here = [...zones].reverse().find((z) => p.z < z.checkpoint.z + 0.5) ?? zones[0];
    if (here.name !== this.lastZoneName) {
      this.lastZoneName = here.name;
      this.hud.setLocation(here.name);
    }
  }

  /** Keeps enemies from overlapping each other and the player. */
  private separate() {
    const list = this.enemies;
    const p = this.player;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const wa = a.isBoss ? 0.1 : 1, wb = b.isBoss ? 0.1 : 1;
          this.level.move(a.pos, (-dx / d) * push * wa, (-dz / d) * push * wa, a.radius);
          this.level.move(b.pos, (dx / d) * push * wb, (dz / d) * push * wb, b.radius);
        }
      }
      if (p.alive) {
        const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
        const min = a.radius + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          this.level.move(a.pos, (dx / d) * (min - d), (dz / d) * (min - d), a.radius);
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.obj.position.addScaledVector(pr.vel, dt);
      const k = pr.life / pr.maxLife;
      let dead = pr.life <= 0;
      if (pr.kind === 'gale' || pr.kind === 'fire') {
        pr.mat.opacity = Math.min(1, k * 2) * 0.85;
        pr.obj.scale.setScalar(1 + (1 - k) * 0.4);
        if (Math.random() < 0.6) {
          const c = pr.kind === 'gale' ? COLORS.jade : COLORS.fire;
          this.vfx.sparks.emit(pr.obj.position.x, pr.obj.position.y - 0.5, pr.obj.position.z, { count: 2, radius: 1.2, speed: [0, 1], up: [0.5, 2], life: [0.2, 0.5], color: c, color2: pr.kind === 'gale' ? COLORS.jadeHot : COLORS.fireHot, gravity: -1 });
        }
      }
      if (pr.kind === 'web') pr.obj.rotation.x += dt * 8;
      const px = pr.obj.position.x, pz = pr.obj.position.z;
      if (pr.owner === 'player') {
        for (const e of this.enemies) {
          if (!e.alive || pr.hit.has(e)) continue;
          if (Math.hypot(e.pos.x - px, e.pos.z - pz) < pr.radius + e.radius) {
            pr.hit.add(e);
            this.dealDamage(e, pr.dmg, pr.crit, { x: pr.vel.x / 16, z: pr.vel.z / 16 }, 0.8, 'hit');
            this.vfx.impact(e.pos, pr.kind === 'gale' ? COLORS.jadeHot : COLORS.fireHot, 8);
            if (pr.kind === 'gale') {
              e.poison = 3;
              e.poisonDps = Math.max(e.poisonDps * 0.5, pr.dmg * 0.25);
            } else {
              e.burn = 3;
              e.burnDps = Math.max(e.burnDps * 0.5, pr.dmg * 0.3);
            }
            this.audio.play('hit');
          }
        }
        for (const b of this.level.breakables) {
          if (!b.broken && Math.hypot(b.pos.x - px, b.pos.z - pz) < pr.radius + b.def.radius) this.hitBreakable(b, 2);
        }
      } else if (p.alive && Math.hypot(p.pos.x - px, p.pos.z - pz) < pr.radius + p.radius) {
        if (p.hurt(pr.dmg, pr.obj.position) > 0 && pr.kind === 'web') p.slowTime = 1.6;
        dead = true;
        this.vfx.impact(p.pos, pr.kind === 'web' ? 0xffffff : COLORS.jade, 6);
      }
      if (!this.level.isWalkable(px, pz, 0) && pr.owner === 'enemy' && pr.life < pr.maxLife - 0.15) dead = true;
      if (dead) {
        this.renderer.scene.remove(pr.obj);
        pr.mat.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateHazards(dt: number) {
    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t -= dt;
      h.tick -= dt;
      if (h.owner === 'player' && Math.random() < 0.4) {
        this.vfx.sparks.emit(h.pos.x, h.pos.y + 0.1, h.pos.z, { count: 1, radius: h.r * 0.7, speed: [0, 0.5], up: [1, 3], gravity: -2, life: [0.3, 0.6], color: COLORS.fire, color2: COLORS.fireHot, size: [0.25, 0.5] });
      }
      if (h.tick <= 0) {
        h.tick = 0.5;
        if (h.owner === 'enemy') {
          if (p.alive && Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) < h.r) p.hurt(h.dps * 0.5);
        } else {
          for (const e of this.enemies) {
            if (e.alive && Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) < h.r + e.radius) this.dealDamage(e, Math.round(h.dps * 0.5), false, null, 0, 'burn');
          }
        }
      }
      if (h.t <= 0) this.hazards.splice(i, 1);
    }
  }
}
