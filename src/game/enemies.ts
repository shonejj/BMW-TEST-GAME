import * as THREE from 'three';
import { approachAngle, clamp, damp, lerp, rand, wrapAngle, yawOf } from '../engine/util';
import { buildSpider, type SpiderKind, type SpiderRig } from './models';
import { Animator, type Locomotion } from './animator';
import type { Character } from './characters';
import { buildCrowLord, buildMonk, buildWeaver, type CrowRig, type WeaverRig } from './outfits';
import { COLORS } from './vfx';
import type { Game } from './game';

export type EnemyKind = SpiderKind | 'ghoul' | 'boss';
type FlashMat = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };
const BLACK = new THREE.Color(0);

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
  ghoul: { name: 'Undead Monk', hp: 80, speed: 3.1, radius: 0.55, dmg: 13, xp: 16, gold: [2, 8], dropChance: 0.18 },
  weaver: { name: 'Web Weaver', hp: 95, speed: 3.6, radius: 0.75, dmg: 12, xp: 24, gold: [4, 12], dropChance: 0.35 },
  boss: { name: 'Blackfeather Lord', hp: 3600, speed: 3.4, radius: 1.6, dmg: 30, xp: 600, gold: [300, 500], dropChance: 1 },
};

/**
 * Blob shadows and health bars for every enemy, drawn as three instanced
 * meshes (3 draw calls total instead of 3 per enemy).
 */
export class EnemyOverlays {
  private readonly shadows: THREE.InstancedMesh;
  private readonly barBg: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly off = new THREE.Vector3();
  private readonly normal = new THREE.Color(0xd8282a);
  private readonly elite = new THREE.Color(0xff8a20);

  constructor(scene: THREE.Scene, private readonly max = 96) {
    const blob = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `varying vec2 vUv; void main() { float r = length(vUv); gl_FragColor = vec4(0.0, 0.0, 0.0, pow(max(0.0, 1.0 - r), 2.0) * 0.55); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), blob, max);
    const bar = new THREE.PlaneGeometry(1, 0.09);
    this.barBg = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0x1a0505, depthTest: false, transparent: true, opacity: 0.8 }), max);
    this.barFill = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), max);
    this.barFill.setColorAt(0, this.normal);
    for (const im of [this.shadows, this.barBg, this.barFill]) {
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.shadows.renderOrder = 1;
    this.barBg.renderOrder = 20;
    this.barFill.renderOrder = 21;
  }

  update(enemies: readonly Enemy[], camera: THREE.Camera) {
    let ns = 0, nb = 0;
    this.q.copy(camera.quaternion);
    for (const e of enemies) {
      if (ns >= this.max) break;
      if (e.shadowVisible) {
        const r = e.radius * 1.5;
        this.m.makeScale(r, 1, r).setPosition(e.pos.x, e.pos.y - e.hover() + 0.03, e.pos.z);
        this.shadows.setMatrixAt(ns++, this.m);
      }
      if (e.barVisible || (e.elite && e.alive)) {
        const s = e.elite ? 1.6 : e.radius * 1.4 + 0.3;
        this.v.set(e.pos.x, e.pos.y + e.barHeight(), e.pos.z);
        this.sc.set(s, s, s);
        this.m.compose(this.v, this.q, this.sc);
        this.barBg.setMatrixAt(nb, this.m);
        const f = Math.max(0.001, e.hp / e.maxHp);
        this.off.set(-(1 - f) / 2 * s, 0, 0.001).applyQuaternion(this.q);
        this.v.add(this.off);
        this.sc.set(s * f, s, s);
        this.m.compose(this.v, this.q, this.sc);
        this.barFill.setMatrixAt(nb, this.m);
        this.barFill.setColorAt(nb, e.elite ? this.elite : this.normal);
        nb++;
      }
    }
    this.shadows.count = ns;
    this.barBg.count = this.barFill.count = nb;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFill.instanceMatrix.needsUpdate = true;
    if (this.barFill.instanceColor) this.barFill.instanceColor.needsUpdate = true;
  }
}

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
  shadowVisible = true;
  barVisible = false;
  protected flashMats: FlashMat[] = [];

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
    game.renderer.scene.add(this.root);
  }

  makeElite() {
    this.elite = true;
    this.maxHp = this.hp = Math.round(this.maxHp * 2.5);
    this.dmg *= 1.3;
    this.baseScale = 1.2;
    this.radius *= 1.2;
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
    this.barVisible = true;
  }

  kill() {
    this.alive = false;
    this.deadTime = 0;
    this.barVisible = false;
    this.eliteRing?.stop();
    this.onDeath();
  }
  protected onDeath() {}

  dispose() {
    this.removed = true;
    this.game.renderer.scene.remove(this.root);
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
    if (this.stunT > 0) {
      // Immobilized: frozen in place, glowing gold.
      this.stunT -= dt;
      if (Math.random() < 0.15) this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.8, this.pos.z, { count: 1, radius: this.radius, speed: [0, 0.3], up: [0.3, 1], gravity: -0.5, life: [0.4, 0.8], color: COLORS.goldHot, color2: COLORS.gold });
    } else if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.root.rotation.x = Math.sin(this.staggerT * 18) * 0.12 * Math.min(1, this.staggerT * 3);
    } else {
      this.root.rotation.x = 0;
      this.think(dt);
    }
    this.pos.y = this.game.level.heightAt(this.pos.x, this.pos.z) + this.hover();

    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0 ? 1 : 0;
    const gold = this.stunT > 0 ? 0.45 : 0;
    for (const m of this.flashMats) m.emissive.setRGB(f + gold, f * 0.9 + gold * 0.75, f * 0.8 + gold * 0.15).add(m.userData.baseEmissive ?? BLACK);
    this.root.rotation.y = this.yaw;
    this.squash = Math.max(0, this.squash - dt * 7);
    const sq = this.squash * this.squash * (this.isBoss ? 0.3 : 1);
    this.root.scale.set(this.baseScale * (1 + 0.16 * sq), this.baseScale * (1 - 0.24 * sq), this.baseScale * (1 + 0.16 * sq));
    if (this.eliteRing) this.eliteRing.mesh.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
  }

  hover() { return 0; }
  barHeight() { return 1.6; }
  protected abstract think(dt: number): void;
  /** Cancel whatever attack is being wound up (stagger / immobilize). */
  protected abstract interrupt(): void;

  stunT = 0;
  staggerT = 0;
  protected poise = 0;

  /** Immobilize: freeze for `t` seconds (bosses resist most of it). */
  stun(t: number) {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, this.isBoss ? t * 0.4 : t);
    this.interrupt();
  }

  /** Heavy hits stagger regular enemies; bosses break once enough poise damage accumulates. */
  stagger(poiseDamage: number) {
    if (!this.alive) return;
    if (!this.isBoss) {
      this.staggerT = Math.max(this.staggerT, this.kind === 'armored' ? 0.45 : 0.7);
      this.interrupt();
      return;
    }
    this.poise += poiseDamage;
    if (this.poise >= 220) {
      this.poise = 0;
      this.staggerT = 1.8;
      this.interrupt();
      this.game.onBossBroken(this);
    }
  }
  protected abstract animateDeath(dt: number): void;

  protected distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }
  protected faceYaw() {
    const p = this.game.player.pos;
    return yawOf(p.x - this.pos.x, p.z - this.pos.z);
  }
  protected registerFlashMats(mats: FlashMat[]) {
    // Clone materials so each enemy can flash independently.
    const map = new Map<THREE.Material, FlashMat>();
    for (const m of mats) {
      // Materials built per instance (e.g. spiders with shader-animated legs) are used as-is.
      const c = m.userData.unique ? m : (m.clone() as FlashMat);
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

  barHeight() {
    return this.kind === 'weaver' ? 2.1 : this.kind === 'armored' ? 2.2 : 1.0;
  }

  protected interrupt() {
    this.tele?.cancel();
    this.tele = null;
    this.rig.root.position.y = 0;
    if (this.state !== 'spawn') this.setState('recover');
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
    r.legs.uPhase.value = this.walkPhase;
    r.legs.uAmp.value = amp;
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
    // Wind-ups flare the red glow so the coming attack reads clearly.
    const winding = this.state === 'windup' || this.state === 'leapwind' || this.state === 'shoot';
    r.glowMat.emissiveIntensity = winding ? 2.5 + Math.sin(this.game.time * 30) * 0.8 : 0.8 + Math.sin(this.game.time * 6) * 0.3;
  }

  protected animateDeath(dt: number) {
    const r = this.rig;
    r.body.rotation.z += (Math.PI - r.body.rotation.z) * damp(8, dt);
    r.legs.uCurl.value += (1 - r.legs.uCurl.value) * damp(6, dt); // legs curl up
    if (this.deadTime > 1.2) this.root.position.y -= dt * 0.8;
    this.shadowVisible = this.deadTime < 1;
  }
}

// ---------------------------------------------------------------------------
// Humanoids on the motion-captured rig
// ---------------------------------------------------------------------------

interface Clip { clip: string; from: number; to: number; hit: number }
const clipWin = (clip: string, from: number, to: number, hit = to): Clip => ({ clip, from, to, hit });

abstract class Humanoid extends Enemy {
  protected readonly anim: Animator;
  /** Scaled holder for the mannequin; lifted for leaps. */
  protected readonly lift = new THREE.Group();
  protected speedNow = 0;
  protected hitPose = clipWin('hit', 0, 0.33);

  constructor(game: Game, kind: EnemyKind, level: number, at: THREE.Vector3, protected readonly ch: Character, loco: Locomotion, scale: number) {
    super(game, kind, level, at);
    this.lift.scale.setScalar(scale);
    this.lift.add(ch.model);
    this.root.add(this.lift);
    const m = ch.mats;
    for (const mat of [m.matte, m.cloth, m.metal]) mat.userData.unique = true;
    this.registerFlashMats([m.matte, m.cloth, m.metal]);
    this.anim = new Animator(ch.model, loco);
    // Settle into the idle pose now: enemies spawned during a cutscene don't update until it ends.
    this.anim.update(0, 0);
  }

  /** Shows a clip window at fraction k. */
  protected play(c: Clip, k: number, fade = 0.1) {
    this.anim.pose(c.clip, c.from + clamp(k, 0, 1) * (c.to - c.from), fade);
  }

  update(dt: number) {
    super.update(dt);
    if (this.removed) return;
    // Stagger and immobilize skip think(): show a flinch (or a frozen pose) instead of the base wobble.
    if (this.alive && (this.staggerT > 0 || this.stunT > 0)) {
      this.root.rotation.x = 0;
      if (this.staggerT > 0) this.play(this.hitPose, 1 - this.staggerT / 0.7, 0.06);
      this.anim.update(this.stunT > 0 ? 0 : dt, 0);
    }
  }

  protected step(dt: number) {
    this.anim.update(dt, this.speedNow);
  }

  protected walk(dt: number, dirX: number, dirZ: number, want: number) {
    if (want > 0) {
      const sp = want * (this.poison > 0 ? 0.8 : 1);
      if (!this.game.level.move(this.pos, dirX * sp * dt, dirZ * sp * dt, this.radius)) {
        this.game.level.move(this.pos, dirZ * sp * dt, -dirX * sp * dt, this.radius);
      }
    }
    this.speedNow = lerp(this.speedNow, want, damp(10, dt));
  }

  protected deathClip = clipWin('death2', 0, 2.45);

  protected animateDeath(dt: number) {
    this.play(this.deathClip, this.deadTime / 1.3, 0.1);
    this.anim.update(dt, 0);
    if (this.deadTime > 1.5) this.root.position.y -= dt * 0.6;
    this.shadowVisible = this.deadTime < 1.3;
  }
}

// ---------------------------------------------------------------------------
// Undead monk: rises from the earth, shambles in and rakes with its claws
// ---------------------------------------------------------------------------

const MONK_ATTACKS = [clipWin('zScratch', 0.05, 1.6, 0.61), clipWin('zBite', 0.0, 1.3, 0.39)];
const MONK_SPAWN = clipWin('zSpawn', 0.0, 2.8);
let monkVariant = 0;

export class Ghoul extends Humanoid {
  private state: 'spawn' | 'chase' | 'attack' | 'recover' = 'spawn';
  private attack = MONK_ATTACKS[0];
  private attackHit = false;
  private tele: { cancel: () => void } | null = null;
  private readonly rate = rand(1.15, 1.35);

  constructor(game: Game, level: number, at: THREE.Vector3) {
    super(game, 'ghoul', level, at, buildMonk(monkVariant++), { idle: 'zIdle', moves: [{ name: 'zWalk', speed: 1.3 }, { name: 'zRun', speed: 3.4 }] }, rand(0.95, 1.05));
    game.vfx.dustBurst(at, 10, 0.8);
  }

  barHeight() { return 2.2; }

  protected interrupt() {
    this.tele?.cancel();
    this.tele = null;
    if (this.state !== 'spawn') this.setState('recover');
  }

  private setState(s: Ghoul['state']) {
    this.state = s;
    this.st = 0;
    this.attackHit = false;
  }

  protected think(dt: number) {
    const player = this.game.player;
    const d = this.distToPlayer();
    const toYaw = this.faceYaw();
    let want = 0;
    switch (this.state) {
      case 'spawn':
        this.yaw = toYaw;
        this.play(MONK_SPAWN, this.st / 1.7, 0);
        if (this.st >= 1.7) this.setState('chase');
        break;
      case 'chase':
        this.anim.release(0.2);
        if (!player.alive) break;
        this.yaw = approachAngle(this.yaw, toYaw, dt * 6);
        want = d > 1.6 ? this.def.speed : 0;
        if (d < 2.1 + player.radius) {
          this.attack = MONK_ATTACKS[Math.random() < 0.65 ? 0 : 1];
          this.setState('attack');
          const lead = (this.attack.hit - this.attack.from) / this.rate;
          this.tele = this.game.vfx.telegraph(this.pos, 2.2, lead + 0.05, { yaw: this.yaw, halfAngle: 0.8 });
        }
        break;
      case 'attack': {
        const a = this.attack;
        const dur = (a.to - a.from) / this.rate;
        const k = this.st / dur;
        const hitK = (a.hit - a.from) / (a.to - a.from);
        if (k < hitK) this.yaw = approachAngle(this.yaw, toYaw, dt * 3);
        this.play(a, k, 0.08);
        if (k < hitK + 0.05) { this.walk(dt, Math.sin(this.yaw), Math.cos(this.yaw), k > hitK - 0.15 ? 3.5 : 0); want = -1; }
        if (!this.attackHit && k >= hitK) {
          this.attackHit = true;
          this.tele = null;
          const da = Math.abs(wrapAngle(toYaw - this.yaw));
          if (d < 2.2 + player.radius && da < 1.1) player.hurt(this.dmg, this.pos);
          this.game.audio.play('bite');
        }
        if (k >= 0.82) this.setState('recover');
        break;
      }
      case 'recover':
        if (this.st >= 0.35) this.setState('chase');
        break;
    }
    if (want >= 0) this.walk(dt, Math.sin(this.yaw), Math.cos(this.yaw), want);
    this.step(dt);
  }

  protected onDeath() {
    this.tele?.cancel();
    this.game.audio.play('skitter');
  }
}

// ---------------------------------------------------------------------------
// Web Weaver: keeps her distance, circles, and spits webs
// ---------------------------------------------------------------------------

const WEAVER_CAST = clipWin('cast', 0.0, 0.5, 0.25);

export class Weaver extends Humanoid {
  private state: 'spawn' | 'chase' | 'shoot' | 'recover' = 'spawn';
  private shootCd = rand(1, 2.5);
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private shot = false;
  private readonly rig: WeaverRig;

  constructor(game: Game, level: number, at: THREE.Vector3) {
    const rig = buildWeaver();
    super(game, 'weaver', level, at, rig.character, { idle: 'idle', moves: [{ name: 'walk', speed: 1.5 }, { name: 'jog', speed: 3.6 }] }, 1.02);
    this.rig = rig;
    game.vfx.dustBurst(at, 8, 0.8);
  }

  barHeight() { return 2.3; }

  protected interrupt() {
    if (this.state !== 'spawn') { this.state = 'recover'; this.st = 0; }
  }

  protected think(dt: number) {
    const d = this.distToPlayer();
    const toYaw = this.faceYaw();
    let dirX = 0, dirZ = 0, want = 0;
    switch (this.state) {
      case 'spawn':
        this.yaw = toYaw;
        if (this.st > 0.6) { this.state = 'chase'; this.st = 0; }
        break;
      case 'chase': {
        this.anim.release(0.2);
        this.shootCd -= dt;
        this.yaw = approachAngle(this.yaw, toYaw, dt * 6);
        if (d < 5) { dirX = -Math.sin(toYaw); dirZ = -Math.cos(toYaw); want = this.def.speed * 0.9; }
        else if (d > 10) { dirX = Math.sin(toYaw); dirZ = Math.cos(toYaw); want = this.def.speed; }
        else {
          dirX = Math.cos(toYaw) * this.strafe; dirZ = -Math.sin(toYaw) * this.strafe; want = this.def.speed * 0.6;
          if (Math.random() < dt * 0.3) this.strafe *= -1;
        }
        // Face where she walks so the stride matches; turn back to the player to shoot.
        if (want > 0) this.yaw = approachAngle(this.yaw, yawOf(dirX, dirZ), dt * 8);
        if (this.shootCd <= 0 && d < 12 && this.game.player.alive) { this.state = 'shoot'; this.st = 0; this.shot = false; }
        break;
      }
      case 'shoot':
        this.yaw = approachAngle(this.yaw, toYaw, dt * 10);
        this.play(WEAVER_CAST, this.st / 0.8, 0.08);
        if (!this.shot && this.st >= 0.4) {
          this.shot = true;
          this.shootCd = rand(2, 3);
          this.game.spawnWeb(this.pos, this.yaw, this.dmg);
        }
        if (this.st >= 0.8) { this.state = 'chase'; this.st = 0; }
        break;
      case 'recover':
        if (this.st >= 0.5) { this.state = 'chase'; this.st = 0; }
        break;
    }
    this.walk(dt, dirX, dirZ, want);
    // Spider legs creep and twitch; they flare open when she casts.
    const t = this.game.time;
    const open = this.state === 'shoot' ? 0.35 : 0;
    this.rig.legs.forEach((l, i) => {
      const b = l.userData.base as THREE.Euler;
      l.rotation.x = b.x + Math.sin(t * (3 + this.speedNow) + i * 1.3) * 0.18 - open;
      l.rotation.y = b.y + Math.sin(t * 2 + i) * 0.08;
    });
    this.step(dt);
  }
}

// ---------------------------------------------------------------------------
// Boss: the Blackfeather Lord
// ---------------------------------------------------------------------------

type BossState = 'intro' | 'chase' | 'sweep' | 'leap' | 'miasma' | 'summon' | 'barrage' | 'recover';

const BOSS_SWEEP = clipWin('heavyA', 0.0, 0.73, 0.47);
const BOSS_POUND = clipWin('groundPound', 0.0, 1.0, 0.3);
const BOSS_ROAR = clipWin('transform', 0.0, 2.1);
const BOSS_THROW = clipWin('throw', 0.0, 1.33, 0.62);
const BOSS_BROKEN = clipWin('knockback', 0.0, 0.83);

export class Boss extends Humanoid {
  readonly isBoss = true;
  readonly rig: CrowRig;
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
    const rig = buildCrowLord();
    super(game, 'boss', level, at, rig.character, { idle: 'swordIdle', moves: [{ name: 'walk', speed: 3.0 }, { name: 'jog', speed: 7.2 }] }, 2.0);
    this.rig = rig;
    this.hitPose = BOSS_BROKEN;
    this.deathClip = clipWin('death', 0, 2.35);
    this.lift.position.y = 12;
    this.yaw = 0;
  }

  get introPlaying() {
    return this.state === 'intro';
  }

  get phase2() {
    return this.hp < this.maxHp * 0.5;
  }

  barHeight() {
    return 5.5;
  }

  onHit(dir: { x: number; z: number }, knock: number) {
    super.onHit(dir, knock);
    this.barVisible = false; // boss uses the big HUD bar
  }

  protected interrupt() {
    this.lift.position.y = 0;
    if (this.state !== 'intro') this.setState('recover');
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
      this.ch.mats.glow.color.setHex(0xd8ff60);
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
        this.lift.position.y = 12 * (1 - k) * (1 - k);
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
        this.lift.position.y = Math.sin(k * Math.PI) * 6;
        if (k >= 1 && !this.didHit) {
          this.didHit = true;
          this.lift.position.y = 0;
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

  update(dt: number) {
    super.update(dt);
    // Broken poise: knocked flat for the whole stagger instead of a flinch.
    if (this.alive && this.staggerT > 0) this.play(BOSS_BROKEN, 1 - this.staggerT / 1.8, 0.08);
  }

  private animate(dt: number) {
    const t = this.game.time;
    const wind = this.phase2 ? 0.65 : 0.85;
    let moving = 0;
    switch (this.state) {
      case 'intro':
        // Falls in braced for the landing, then rises and roars.
        if (this.st < 1.6) this.play(BOSS_POUND, 0.3, 0);
        else this.play(BOSS_ROAR, (this.st - 1.6) / 1.0 * 0.6 + 0.2, 0.15);
        break;
      case 'sweep': {
        const hitK = (BOSS_SWEEP.hit - BOSS_SWEEP.from) / (BOSS_SWEEP.to - BOSS_SWEEP.from);
        const k = this.st < wind ? (this.st / wind) * hitK : hitK + ((this.st - wind) / 0.5) * (1 - hitK);
        this.play(BOSS_SWEEP, k, 0.1);
        break;
      }
      case 'leap': {
        const hitK = (BOSS_POUND.hit - BOSS_POUND.from) / (BOSS_POUND.to - BOSS_POUND.from);
        const k = this.st < 0.5 ? 0.05 * (this.st / 0.5) : this.st < 1.25 ? 0.05 + ((this.st - 0.5) / 0.75) * (hitK - 0.05) : hitK + ((this.st - 1.25) / 0.7) * (1 - hitK);
        this.play(BOSS_POUND, k, 0.1);
        break;
      }
      case 'miasma':
        this.anim.loop('channel', 1, 0.2);
        this.ch.mats.glow.color.setHex(Math.floor(t * 10) % 2 ? 0x9dff9a : 0xffffff);
        break;
      case 'summon':
        this.play(BOSS_ROAR, this.st / 1.6, 0.15);
        break;
      case 'barrage':
        this.play(BOSS_THROW, this.st / 1.3, 0.1);
        break;
      case 'chase':
        moving = this.distToPlayer() > 4 ? this.def.speed * (this.phase2 ? 1.25 : 1) : 0;
        this.anim.release(0.25);
        break;
      default:
        this.anim.release(0.25);
    }
    if (this.state !== 'miasma') this.ch.mats.glow.color.setHex(this.enraged ? 0xd8ff60 : 0xffffff);
    this.speedNow = lerp(this.speedNow, moving, damp(8, dt));
    // Wings: slow breathing beats, fast flaps when airborne or casting.
    this.flapPhase += dt * (this.state === 'leap' || this.state === 'intro' || this.state === 'barrage' ? 9 : 2.5);
    const flap = Math.sin(this.flapPhase) * (this.state === 'barrage' || this.state === 'leap' ? 0.55 : 0.2);
    this.rig.wingL.rotation.y = 0.45 + flap;
    this.rig.wingR.rotation.y = -0.45 - flap;
    this.step(dt);
    if (this.enraged && Math.random() < 0.3) {
      this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 3, this.pos.z, { count: 1, radius: 1.5, speed: [0, 0.5], up: [1, 3], gravity: -1, life: [0.5, 1], color: COLORS.jade, color2: COLORS.jadeHot, size: [0.3, 0.6] });
    }
  }

  protected animateDeath(dt: number) {
    this.play(this.deathClip, this.deadTime / 1.6, 0.15);
    this.anim.update(dt, 0);
    this.rig.wingL.rotation.y += (1.3 - this.rig.wingL.rotation.y) * damp(2, dt);
    this.rig.wingR.rotation.y += (-1.3 - this.rig.wingR.rotation.y) * damp(2, dt);
    if (Math.random() < 0.5) this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 3, radius: 2, speed: [0, 2], up: [2, 6], gravity: -1, life: [0.6, 1.2], color: COLORS.jade, color2: COLORS.jadeHot, size: [0.3, 0.6] });
    if (this.deadTime > 1.8) this.root.position.y -= dt * 1.5;
    this.deadTime = Math.min(this.deadTime, 2.1); // keep the corpse until the victory screen
  }
}
