import * as THREE from 'three';
import { approachAngle, clamp, damp, lerp, rand, wrapAngle, yawOf } from '../engine/util';
import { buildBoss, buildSpider, type BossRig, type SpiderKind, type SpiderRig } from './models';
import { COLORS, makeBlob } from './vfx';
import type { Game } from './game';

export type EnemyKind = SpiderKind | 'boss';

interface KindDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  dmg: number;
  xp: number;
  gold: [number, number];
  dropChance: number;
}

export const KINDS: Record<EnemyKind, KindDef> = {
  spiderling: { name: 'Spiderling', hp: 42, speed: 5.2, radius: 0.55, dmg: 8, xp: 9, gold: [1, 5], dropChance: 0.1 },
  armored: { name: 'Armored Broodmother', hp: 300, speed: 2.7, radius: 1.2, dmg: 22, xp: 55, gold: [10, 30], dropChance: 0.6 },
  weaver: { name: 'Web Weaver', hp: 95, speed: 3.6, radius: 0.75, dmg: 12, xp: 24, gold: [4, 12], dropChance: 0.35 },
  boss: { name: 'Blackfeather Lord', hp: 3600, speed: 3.4, radius: 1.6, dmg: 30, xp: 600, gold: [300, 500], dropChance: 1 },
};

const barGeo = new THREE.PlaneGeometry(1, 0.09);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a0505, depthTest: false, transparent: true, opacity: 0.8 });
const barFillMat = new THREE.MeshBasicMaterial({ color: 0xd8282a, depthTest: false });
const barEliteMat = new THREE.MeshBasicMaterial({ color: 0xff8a20, depthTest: false });

export abstract class Enemy {
  readonly root = new THREE.Group();
  readonly pos: THREE.Vector3;
  readonly def: KindDef;
  hp: number;
  maxHp: number;
  dmg: number;
  radius: number;
  level: number;
  alive = true;
  elite = false;
  yaw = 0;
  burn = 0;
  burnDps = 0;
  poison = 0;
  poisonDps = 0;
  removed = false;
  readonly isBoss: boolean = false;
  protected st = 0;
  protected deadTime = 0;
  protected flash = 0;
  /** Squash & stretch on hit (game-feel): 1 right after a hit, eases back to 0. */
  protected squash = 0;
  protected baseScale = 1;
  protected knock = new THREE.Vector2();
  protected spawnT = 0;
  protected dotTick = 0;
  protected readonly shadow: THREE.Mesh;
  protected readonly bar = new THREE.Group();
  protected readonly barFill: THREE.Mesh;
  protected flashMats: THREE.MeshLambertMaterial[] = [];

  constructor(protected readonly game: Game, readonly kind: EnemyKind, level: number, at: THREE.Vector3) {
    this.def = KINDS[kind];
    this.level = level;
    const scale = 1 + (level - 1) * 0.22;
    this.maxHp = this.hp = Math.round(this.def.hp * scale);
    this.dmg = this.def.dmg * (1 + (level - 1) * 0.15);
    this.radius = this.def.radius;
    this.pos = this.root.position;
    this.pos.copy(at);
    this.yaw = yawOf(game.player.pos.x - at.x, game.player.pos.z - at.z);
    this.shadow = makeBlob(0x000000, 0.55, this.radius * 1.5, false);
    game.renderer.scene.add(this.root, this.shadow);

    const bg = new THREE.Mesh(barGeo, barBgMat);
    this.barFill = new THREE.Mesh(barGeo, barFillMat);
    this.barFill.position.z = 0.001;
    bg.renderOrder = this.barFill.renderOrder = 20;
    this.bar.add(bg, this.barFill);
    this.bar.visible = false;
    game.renderer.scene.add(this.bar);
  }

  makeElite() {
    this.elite = true;
    this.maxHp = this.hp = Math.round(this.maxHp * 2.5);
    this.dmg *= 1.3;
    this.baseScale = 1.2;
    this.radius *= 1.2;
    this.barFill.material = barEliteMat;
    const ring = this.game.vfx.aura(this.radius * 1.6, COLORS.red);
    this.eliteRing = ring;
  }
  protected eliteRing: { mesh: THREE.Mesh; stop: () => void } | null = null;

  get xp() {
    return Math.round(this.def.xp * (1 + (this.level - 1) * 0.3) * (this.elite ? 3 : 1));
  }

  /** Visual + physical reaction to a hit (damage itself is applied by Game). */
  onHit(dir: { x: number; z: number }, knock: number) {
    this.flash = 0.12;
    this.squash = 1;
    const resist = this.isBoss ? 0.05 : this.kind === 'armored' ? 0.35 : 1;
    this.knock.x += dir.x * knock * 6 * resist;
    this.knock.y += dir.z * knock * 6 * resist;
    this.bar.visible = true;
  }

  kill() {
    this.alive = false;
    this.deadTime = 0;
    this.bar.visible = false;
    this.eliteRing?.stop();
    this.onDeath();
  }
  protected onDeath() {}

  dispose() {
    this.removed = true;
    this.game.renderer.scene.remove(this.root, this.shadow, this.bar);
    this.eliteRing?.stop();
  }

  update(dt: number) {
    this.st += dt;
    if (!this.alive) {
      this.deadTime += dt;
      this.animateDeath(dt);
      if (this.deadTime > 2.2) this.dispose();
      return;
    }
    // Damage over time
    this.dotTick -= dt;
    if (this.dotTick <= 0) {
      this.dotTick = 0.5;
      if (this.burn > 0) {
        this.game.dealDamage(this, Math.round(this.burnDps * 0.5), false, null, 0, 'burn');
        this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.6, this.pos.z, { count: 4, radius: this.radius, speed: [0, 1], up: [1, 3], gravity: -2, life: [0.3, 0.6], color: COLORS.fire, color2: COLORS.fireHot });
      }
      if (this.poison > 0 && this.alive) {
        this.game.dealDamage(this, Math.round(this.poisonDps * 0.5), false, null, 0, 'poison');
        this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.6, this.pos.z, { count: 3, radius: this.radius, speed: [0, 1], up: [0.5, 2], gravity: -1, life: [0.4, 0.8], color: COLORS.jade, color2: COLORS.jadeHot });
      }
      if (!this.alive) return;
    }
    this.burn = Math.max(0, this.burn - dt);
    this.poison = Math.max(0, this.poison - dt);

    // Knockback
    if (this.knock.lengthSq() > 0.01) {
      this.game.level.move(this.pos, this.knock.x * dt, this.knock.y * dt, this.radius);
      this.knock.multiplyScalar(Math.max(0, 1 - 8 * dt));
    }
    this.think(dt);
    this.pos.y = this.game.level.heightAt(this.pos.x, this.pos.z) + this.hover();

    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0 ? 1 : 0;
    for (const m of this.flashMats) m.emissive.setRGB(f, f * 0.9, f * 0.8).add(m.userData.baseEmissive ?? new THREE.Color(0));
    this.root.rotation.y = this.yaw;
    this.squash = Math.max(0, this.squash - dt * 7);
    const sq = this.squash * this.squash * (this.isBoss ? 0.3 : 1);
    this.root.scale.set(this.baseScale * (1 + 0.16 * sq), this.baseScale * (1 - 0.24 * sq), this.baseScale * (1 + 0.16 * sq));
    this.shadow.position.set(this.pos.x, this.pos.y - this.hover() + 0.03, this.pos.z);

    this.bar.position.set(this.pos.x, this.pos.y + this.barHeight(), this.pos.z);
    this.bar.quaternion.copy(this.game.renderer.camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, this.hp / this.maxHp);
    this.barFill.position.x = -(1 - this.barFill.scale.x) / 2;
    this.bar.scale.setScalar(this.elite ? 1.6 : this.radius * 1.4 + 0.3);
    if (this.elite) this.bar.visible = true;
    if (this.eliteRing) this.eliteRing.mesh.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
  }

  protected hover() { return 0; }
  protected barHeight() { return 1.6; }
  protected abstract think(dt: number): void;
  protected abstract animateDeath(dt: number): void;

  protected distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }
  protected faceYaw() {
    const p = this.game.player.pos;
    return yawOf(p.x - this.pos.x, p.z - this.pos.z);
  }
  protected registerFlashMats(mats: THREE.MeshLambertMaterial[]) {
    // Clone materials so each enemy can flash independently.
    const map = new Map<THREE.Material, THREE.MeshLambertMaterial>();
    for (const m of mats) {
      const c = m.clone();
      c.userData.baseEmissive = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
      c.emissiveIntensity = 1;
      map.set(m, c);
      this.flashMats.push(c);
    }
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && map.has(mesh.material as THREE.Material)) mesh.material = map.get(mesh.material as THREE.Material)!;
    });
  }
}

// ---------------------------------------------------------------------------
// Spiders
// ---------------------------------------------------------------------------

type SpiderState = 'spawn' | 'chase' | 'windup' | 'attack' | 'leapwind' | 'leap' | 'recover' | 'shoot';

export class Spider extends Enemy {
  readonly rig: SpiderRig;
  private state: SpiderState = 'spawn';
  private walkPhase = Math.random() * 10;
  private moveSpeed = 0;
  private leapCd = rand(2, 4);
  private shootCd = rand(1, 2.5);
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private tele: { cancel: () => void } | null = null;
  private attackHit = false;

  constructor(game: Game, kind: SpiderKind, level: number, at: THREE.Vector3) {
    super(game, kind, level, at);
    this.rig = buildSpider(kind);
    this.root.add(this.rig.root);
    this.registerFlashMats(this.rig.flashMats);
    this.st = 0;
    this.spawnT = 0;
    game.vfx.dustBurst(at, 8, this.radius);
  }

  protected barHeight() {
    return this.kind === 'weaver' ? 2.1 : this.kind === 'armored' ? 2.2 : 1.0;
  }

  private setState(s: SpiderState) {
    this.state = s;
    this.st = 0;
    this.attackHit = false;
  }

  protected think(dt: number) {
    const player = this.game.player;
    const d = this.distToPlayer();
    let want = 0; // desired move speed
    let dirX = 0, dirZ = 0;
    const toYaw = this.faceYaw();

    switch (this.state) {
      case 'spawn':
        this.rig.root.position.y = lerp(-1.2, 0, clamp(this.st / 0.6, 0, 1));
        if (this.st > 0.6) this.setState('chase');
        break;
      case 'chase': {
        if (!player.alive) break;
        this.yaw = approachAngle(this.yaw, toYaw, dt * 8);
        dirX = Math.sin(this.yaw); dirZ = Math.cos(this.yaw);
        want = this.def.speed;
        if (this.kind === 'spiderling' && d < 1.8 + this.radius) this.startWindup();
        else if (this.kind === 'armored') {
          this.leapCd -= dt;
          if (d < 2.8) this.startWindup();
          else if (this.leapCd <= 0 && d > 4 && d < 11) this.startLeapWindup();
        } else if (this.kind === 'weaver') {
          this.shootCd -= dt;
          if (d < 5) { dirX = -dirX; dirZ = -dirZ; want = this.def.speed * 0.9; }
          else if (d < 9) {
            // Strafe around the player
            const s = this.strafe;
            const nx = Math.cos(this.yaw) * s, nz = -Math.sin(this.yaw) * s;
            dirX = nx; dirZ = nz; want = this.def.speed * 0.6;
            if (Math.random() < dt * 0.3) this.strafe *= -1;
          }
          if (this.shootCd <= 0 && d < 12) this.setState('shoot');
        }
        break;
      }
      case 'windup': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * (this.kind === 'armored' ? 2 : 4));
        const dur = this.kind === 'armored' ? 0.6 : 0.42;
        if (this.st >= dur) this.setState('attack');
        break;
      }
      case 'attack': {
        const dur = this.kind === 'armored' ? 0.25 : 0.18;
        if (this.kind === 'spiderling') { dirX = Math.sin(this.yaw); dirZ = Math.cos(this.yaw); want = 8; }
        if (!this.attackHit && this.st >= dur * 0.6) {
          this.attackHit = true;
          const reach = this.kind === 'armored' ? 3.0 : 1.6 + this.radius;
          const da = Math.abs(wrapAngle(toYaw - this.yaw));
          if (d < reach + player.radius && da < 1.1) player.hurt(this.dmg, this.pos);
          this.game.audio.play('bite');
        }
        if (this.st >= dur) this.setState('recover');
        break;
      }
      case 'leapwind':
        if (this.st >= 0.85) this.setState('leap');
        break;
      case 'leap': {
        const dur = 0.55;
        const k = clamp(this.st / dur, 0, 1);
        this.pos.x = lerp(this.leapFrom.x, this.leapTo.x, k);
        this.pos.z = lerp(this.leapFrom.z, this.leapTo.z, k);
        this.rig.root.position.y = Math.sin(k * Math.PI) * 3;
        if (k >= 1) {
          this.rig.root.position.y = 0;
          const r = 2.8;
          if (Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < r + player.radius) player.hurt(this.dmg * 1.2, this.pos);
          this.game.vfx.shockwave(this.pos, r + 0.5, COLORS.red, 0.4);
          this.game.vfx.dustBurst(this.pos, 16, 1.5);
          this.game.debris.burst(this.pos, 0x5e5a52, 5, 0.14, 0.8);
          this.game.audio.play('slam');
          this.game.camRig.shake(0.35, 0.25);
          this.setState('recover');
        }
        break;
      }
      case 'shoot': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * 6);
        if (!this.attackHit && this.st >= 0.5) {
          this.attackHit = true;
          this.shootCd = rand(2, 3);
          this.game.spawnWeb(this.pos, this.yaw, this.dmg);
        }
        if (this.st >= 0.8) this.setState('chase');
        break;
      }
      case 'recover':
        if (this.st >= (this.kind === 'armored' ? 0.9 : 0.55)) this.setState('chase');
        break;
    }

    // Steering
    if (want > 0) {
      const sp = want * (this.poison > 0 ? 0.8 : 1);
      if (!this.game.level.move(this.pos, dirX * sp * dt, dirZ * sp * dt, this.radius)) {
        // Blocked: try sliding sideways
        this.game.level.move(this.pos, dirZ * sp * dt * this.strafe, -dirX * sp * dt * this.strafe, this.radius);
      }
    }
    this.moveSpeed = lerp(this.moveSpeed, want, damp(10, dt));
    this.animate(dt);
  }

  private startWindup() {
    this.setState('windup');
    const r = this.kind === 'armored' ? 3 : 1.6 + this.radius;
    const dur = this.kind === 'armored' ? 0.6 : 0.42;
    this.tele = this.game.vfx.telegraph(this.pos, r, dur + 0.1, { yaw: this.yaw, halfAngle: this.kind === 'armored' ? 1.0 : 0.8 });
  }

  private startLeapWindup() {
    this.leapCd = rand(4.5, 6.5);
    const p = this.game.player.pos;
    this.leapFrom.copy(this.pos);
    this.leapTo.set(p.x, p.y, p.z);
    // Stop short so we don't land inside walls.
    if (!this.game.level.isWalkable(this.leapTo.x, this.leapTo.z, this.radius)) this.leapTo.copy(this.pos);
    this.tele = this.game.vfx.telegraph(this.leapTo, 2.8, 0.85 + 0.55);
    this.setState('leapwind');
  }

  protected onDeath() {
    this.tele?.cancel();
    this.game.audio.play('skitter');
  }

  private animate(dt: number) {
    const r = this.rig;
    this.walkPhase += dt * (2 + this.moveSpeed * 3.2);
    const amp = clamp(this.moveSpeed / this.def.speed, 0, 1);
    for (const leg of r.legs) {
      const ph = this.walkPhase + leg.index * Math.PI * 0.5 + (leg.side > 0 ? Math.PI : 0);
      const base = leg.side * (Math.PI / 2) + (leg.index - 1.5) * 0.45 * leg.side;
      leg.hip.rotation.y = base + Math.sin(ph) * 0.35 * amp * leg.side;
      leg.hip.rotation.x = -Math.max(0, Math.cos(ph)) * 0.35 * amp; // lift the swinging leg
    }
    let rear = 0;
    if (this.state === 'windup' || this.state === 'leapwind') rear = this.kind === 'armored' ? -0.35 : -0.5;
    if (this.state === 'attack') rear = 0.3;
    r.body.rotation.x += (rear - r.body.rotation.x) * damp(14, dt);
    r.body.position.y = 0.42 + Math.abs(Math.sin(this.walkPhase * 2)) * 0.04 * amp;
    if (r.torso && r.armL && r.armR) {
      const raise = this.state === 'shoot' ? -2.4 : -0.3 + Math.sin(this.walkPhase) * 0.2;
      r.armL.rotation.x += (raise - r.armL.rotation.x) * damp(10, dt);
      r.armR.rotation.x += (raise - r.armR.rotation.x) * damp(10, dt);
      r.torso.rotation.x = this.state === 'shoot' ? -0.3 : 0;
    }
    r.glowMat.emissiveIntensity = 0.8 + Math.sin(this.game.time * 6) * 0.3;
  }

  protected animateDeath(dt: number) {
    const r = this.rig;
    r.body.rotation.z += (Math.PI - r.body.rotation.z) * damp(8, dt);
    for (const leg of r.legs) leg.hip.rotation.x += (-0.9 - leg.hip.rotation.x) * damp(6, dt); // legs curl up
    if (this.deadTime > 1.2) this.root.position.y -= dt * 0.8;
    this.shadow.visible = this.deadTime < 1;
  }
}

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

type BossState = 'intro' | 'chase' | 'sweep' | 'leap' | 'miasma' | 'summon' | 'barrage' | 'recover';

export class Boss extends Enemy {
  readonly isBoss = true;
  readonly rig: BossRig;
  private state: BossState = 'intro';
  private cds = { sweep: 0, leap: 3, miasma: 6, barrage: 4 };
  private summoned = [false, false];
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private didHit = false;
  private miasmaPts: THREE.Vector3[] = [];
  private flapPhase = 0;
  private enraged = false;

  constructor(game: Game, level: number, at: THREE.Vector3) {
    super(game, 'boss', level, at);
    this.rig = buildBoss();
    this.root.add(this.rig.root);
    this.registerFlashMats(this.rig.flashMats);
    this.rig.root.position.y = 12;
    this.yaw = 0;
  }

  get phase2() {
    return this.hp < this.maxHp * 0.5;
  }

  protected barHeight() {
    return 5.5;
  }

  onHit(dir: { x: number; z: number }, knock: number) {
    super.onHit(dir, knock);
    this.bar.visible = false; // boss uses the big HUD bar
  }

  private setState(s: BossState) {
    this.state = s;
    this.st = 0;
    this.didHit = false;
  }

  protected think(dt: number) {
    const player = this.game.player;
    const d = this.distToPlayer();
    const toYaw = this.faceYaw();
    const spd = this.phase2 ? 1.25 : 1;
    for (const k of Object.keys(this.cds) as (keyof Boss['cds'])[]) this.cds[k] -= dt * spd;

    if (this.phase2 && !this.enraged) {
      this.enraged = true;
      this.rig.eyeMat.color.setHex(0xaaff40);
      this.game.audio.play('roar');
      this.game.hud.toast('The Blackfeather Lord is enraged!', '#9cff6a');
      this.game.camRig.shake(0.5, 0.6);
    }
    for (let i = 0; i < 2; i++) {
      const th = i === 0 ? 0.7 : 0.35;
      if (!this.summoned[i] && this.hp < this.maxHp * th && this.state === 'chase') {
        this.summoned[i] = true;
        this.setState('summon');
      }
    }

    switch (this.state) {
      case 'intro': {
        const k = clamp(this.st / 1.6, 0, 1);
        this.rig.root.position.y = 12 * (1 - k) * (1 - k);
        this.yaw = toYaw;
        if (k >= 1 && !this.didHit) {
          this.didHit = true;
          this.game.vfx.shockwave(this.pos, 9, COLORS.jade, 0.8, 0.2);
          this.game.vfx.dustBurst(this.pos, 30, 3);
          this.game.debris.burst(this.pos, 0x5e5a52, 12, 0.2, 1.3);
          this.game.camRig.shake(0.8, 0.6);
          this.game.audio.play('slam');
          this.game.audio.play('roar');
        }
        if (this.st > 2.6) this.setState('chase');
        break;
      }
      case 'chase': {
        if (!player.alive) break;
        this.yaw = approachAngle(this.yaw, toYaw, dt * 3 * spd);
        if (d > 4) this.game.level.move(this.pos, Math.sin(this.yaw) * this.def.speed * spd * dt, Math.cos(this.yaw) * this.def.speed * spd * dt, this.radius);
        if (d < 5.5 && this.cds.sweep <= 0) this.startSweep();
        else if (d > 6 && this.cds.leap <= 0) this.startLeap();
        else if (this.cds.miasma <= 0) this.startMiasma();
        else if (this.phase2 && this.cds.barrage <= 0 && d > 4) this.setState('barrage');
        break;
      }
      case 'sweep': {
        const wind = this.phase2 ? 0.65 : 0.85;
        if (!this.didHit && this.st >= wind) {
          this.didHit = true;
          this.game.vfx.slash(this.pos, this.yaw, { radius: 6.5, arc: Math.PI * 1.05, colorA: 0x2bd06a, colorB: 0xd4ffd0, height: 1.6, dur: 0.35, reverse: Math.random() < 0.5 });
          const da = Math.abs(wrapAngle(toYaw - this.yaw));
          if (d < 6.5 + player.radius && da < 1.5) player.hurt(this.dmg, this.pos);
          this.game.audio.play('swingHeavy');
          this.game.camRig.shake(0.3, 0.2);
        }
        if (this.st >= wind + 0.6) this.setState('recover');
        break;
      }
      case 'leap': {
        const wind = 0.5, air = 0.75;
        if (this.st < wind) break;
        const k = clamp((this.st - wind) / air, 0, 1);
        this.pos.x = lerp(this.leapFrom.x, this.leapTo.x, k);
        this.pos.z = lerp(this.leapFrom.z, this.leapTo.z, k);
        this.rig.root.position.y = Math.sin(k * Math.PI) * 6;
        if (k >= 1 && !this.didHit) {
          this.didHit = true;
          this.rig.root.position.y = 0;
          if (Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 4.2 + player.radius) player.hurt(this.dmg * 1.4, this.pos);
          this.game.vfx.shockwave(this.pos, 5, COLORS.jade, 0.5, 0.2);
          this.game.vfx.shockwave(this.pos, 3, COLORS.red, 0.35);
          this.game.vfx.dustBurst(this.pos, 26, 2.5);
          this.game.debris.burst(this.pos, 0x5e5a52, 10, 0.2, 1.3);
          this.game.audio.play('slam');
          this.game.camRig.shake(0.8, 0.45);
        }
        if (this.st >= wind + air + 0.7) this.setState('recover');
        break;
      }
      case 'miasma': {
        if (!this.didHit && this.st >= 1.2) {
          this.didHit = true;
          for (const p of this.miasmaPts) {
            this.game.vfx.shockwave(p, 3, COLORS.jade, 0.4);
            this.game.addHazard(p, 2.6, 5, this.dmg * 0.35, 'enemy');
            if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 2.6) player.hurt(this.dmg * 0.6, p);
          }
          this.game.audio.play('gale');
        }
        if (this.st >= 1.8) this.setState('recover');
        break;
      }
      case 'summon': {
        if (!this.didHit && this.st >= 0.9) {
          this.didHit = true;
          this.game.vfx.shockwave(this.pos, 7, COLORS.jade, 0.7);
          this.game.audio.play('roar');
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const p = new THREE.Vector3(this.pos.x + Math.sin(a) * 4, 0, this.pos.z + Math.cos(a) * 4);
            if (this.game.level.isWalkable(p.x, p.z, 0.6)) {
              p.y = this.game.level.heightAt(p.x, p.z);
              this.game.spawnEnemy('spiderling', this.level - 1, p);
            }
          }
        }
        if (this.st >= 1.6) this.setState('chase');
        break;
      }
      case 'barrage': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * 4);
        if (!this.didHit && this.st >= 0.7) {
          this.didHit = true;
          this.cds.barrage = 7;
          for (let i = -4; i <= 4; i++) this.game.spawnFeather(this.pos, this.yaw + i * 0.16, this.dmg * 0.5);
          this.game.audio.play('swingHeavy');
        }
        if (this.st >= 1.3) this.setState('recover');
        break;
      }
      case 'recover':
        if (this.st >= (this.phase2 ? 0.5 : 0.9)) this.setState('chase');
        break;
    }
    this.animate(dt);
  }

  private startSweep() {
    this.cds.sweep = 2.6;
    this.setState('sweep');
    this.yaw = this.faceYaw();
    this.game.vfx.telegraph(this.pos, 6.5, this.phase2 ? 0.7 : 0.9, { yaw: this.yaw, halfAngle: 1.5 });
  }

  private startLeap() {
    this.cds.leap = 7;
    this.setState('leap');
    const p = this.game.player.pos;
    this.leapFrom.copy(this.pos);
    this.leapTo.set(p.x, p.y, p.z);
    if (!this.game.level.isWalkable(p.x, p.z, this.radius)) this.leapTo.copy(this.pos);
    this.game.vfx.telegraph(this.leapTo, 4.2, 1.25);
    this.game.audio.play('roar');
  }

  private startMiasma() {
    this.cds.miasma = this.phase2 ? 7 : 9;
    this.setState('miasma');
    const p = this.game.player.pos;
    this.miasmaPts = [new THREE.Vector3(p.x, p.y, p.z)];
    const n = this.phase2 ? 5 : 3;
    for (let i = 1; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(2.5, 5);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      this.miasmaPts.push(new THREE.Vector3(x, this.game.level.heightAt(x, z), z));
    }
    for (const q of this.miasmaPts) this.game.vfx.telegraph(q, 2.6, 1.25, { color: 0x30ff70 });
  }

  protected onDeath() {
    this.game.audio.play('roar');
    this.game.onBossDefeated(this);
  }

  private animate(dt: number) {
    const r = this.rig;
    const t = this.game.time;
    this.flapPhase += dt * (this.state === 'leap' || this.state === 'intro' || this.state === 'barrage' ? 9 : 2.5);
    const flap = Math.sin(this.flapPhase) * (this.state === 'barrage' ? 0.6 : 0.25);
    r.wingL.rotation.y = 0.5 + flap;
    r.wingR.rotation.y = -0.5 - flap;
    r.wingL.rotation.z = -0.2;
    r.wingR.rotation.z = 0.2;
    let armR = -0.4, armRy = 0, torsoY = 0, torsoX = 0, spearX = -1.3, spearY = 0;
    switch (this.state) {
      case 'sweep': {
        const wind = this.phase2 ? 0.65 : 0.85;
        const p = this.st < wind ? this.st / wind : 1 + clamp((this.st - wind) / 0.2, 0, 1);
        torsoY = p <= 1 ? 1.0 * p : lerp(1.0, -1.3, p - 1);
        armR = -1.5; spearX = -0.1; spearY = 0;
        break;
      }
      case 'leap':
        armR = -2.6; spearX = -2.0; torsoX = -0.2;
        break;
      case 'miasma':
      case 'summon':
        armR = -2.9; spearX = -1.6; torsoX = -0.25;
        r.eyeMat.color.setHex(Math.floor(t * 10) % 2 ? 0x5dff8a : 0xffffff);
        break;
      case 'barrage':
        torsoX = -0.3; armR = -1.0;
        break;
      default:
        if (!this.enraged) r.eyeMat.color.setHex(0x5dff8a);
        else r.eyeMat.color.setHex(0xaaff40);
    }
    const k = damp(this.state === 'sweep' ? 20 : 8, dt);
    r.armR.rotation.x += (armR - r.armR.rotation.x) * k;
    r.armR.rotation.y += (armRy - r.armR.rotation.y) * k;
    r.armL.rotation.x += (-0.3 + Math.sin(t * 1.5) * 0.1 - r.armL.rotation.x) * k;
    r.torso.rotation.y += (torsoY - r.torso.rotation.y) * k;
    r.torso.rotation.x += (torsoX - r.torso.rotation.x) * k;
    r.spear.rotation.x += (spearX - r.spear.rotation.x) * k;
    r.spear.rotation.y += (spearY - r.spear.rotation.y) * k;
    r.body.position.y = Math.sin(t * 2) * 0.08;
    r.head.rotation.y = Math.sin(t * 0.7) * 0.2;
    if (this.enraged && Math.random() < 0.3) {
      this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 3, this.pos.z, { count: 1, radius: 1.5, speed: [0, 0.5], up: [1, 3], gravity: -1, life: [0.5, 1], color: COLORS.jade, color2: COLORS.jadeHot, size: [0.3, 0.6] });
    }
  }

  protected animateDeath(dt: number) {
    const r = this.rig;
    r.body.rotation.x += (-1.4 - r.body.rotation.x) * damp(2, dt);
    r.wingL.rotation.y += (1.4 - r.wingL.rotation.y) * damp(2, dt);
    r.wingR.rotation.y += (-1.4 - r.wingR.rotation.y) * damp(2, dt);
    if (Math.random() < 0.5) this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 3, radius: 2, speed: [0, 2], up: [2, 6], gravity: -1, life: [0.6, 1.2], color: COLORS.jade, color2: COLORS.jadeHot, size: [0.3, 0.6] });
    if (this.deadTime > 1.8) this.root.position.y -= dt * 1.5;
    this.deadTime = Math.min(this.deadTime, 2.1); // keep the corpse until the victory screen
  }
}
