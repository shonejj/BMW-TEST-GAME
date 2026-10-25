import * as THREE from 'three';
import { approachAngle, clamp, damp, lerp, wrapAngle, yawOf } from '../engine/util';
import { buildMonkey, type MonkeyRig } from './models';
import { COLORS, makeBlob } from './vfx';
import type { Game } from './game';
import type { Inventory, Power, StatKey } from './loot';

export interface Stats {
  maxHp: number;
  maxMana: number;
  damage: number;
  damagePct: number;
  armor: number;
  crit: number;
  attackSpeed: number;
  skillDamage: number;
  moveSpeed: number;
  cdr: number;
  lifeOnHit: number;
  manaRegen: number;
  powers: Set<Power>;
}

export interface SkillDef {
  id: 'whirl' | 'flame' | 'slam' | 'gale';
  name: string;
  mana: number;
  cd: number;
  desc: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'whirl', name: 'Golden Whirlwind', mana: 30, cd: 7, desc: 'Spin your staff inside a golden ring, striking everything around you while moving.' },
  { id: 'flame', name: 'Flaming Staff', mana: 25, cd: 5, desc: 'Ignite your staff and unleash three sweeping fire arcs.' },
  { id: 'slam', name: 'Cloud Slam', mana: 30, cd: 8, desc: 'Leap forward and smash the ground, shattering foes and stone.' },
  { id: 'gale', name: 'Jade Gale', mana: 20, cd: 4, desc: 'Send a piercing wave of jade wind that poisons enemies.' },
];

type State = 'free' | 'attack' | 'dodge' | 'flame' | 'slam' | 'gale' | 'transform' | 'dead';

const COMBO = [
  { dur: 0.34, hitAt: 0.42, range: 3.3, arc: 1.35, mult: 1.0, knock: 0.6 },
  { dur: 0.34, hitAt: 0.42, range: 3.3, arc: 1.35, mult: 1.1, knock: 0.6 },
  { dur: 0.52, hitAt: 0.5, range: 3.8, arc: 0.9, mult: 1.9, knock: 2.2 },
];

export const TRANSFORM_DURATION = 15;

export class Player {
  readonly rig: MonkeyRig;
  readonly root: THREE.Group;
  readonly pos: THREE.Vector3;
  readonly radius = 0.5;
  yaw = Math.PI;
  hp = 200;
  mana = 100;
  fury = 0;
  level = 1;
  xp = 0;
  stats: Stats;
  state: State = 'free';
  cooldowns = [0, 0, 0, 0];
  transformTime = 0;
  invuln = 0;
  slowTime = 0;
  speedNow = 0;

  private st = 0;
  private combo = 0;
  private comboReset = 0;
  private hitDone = false;
  private dodgeCd = 0;
  private dodgeDir = new THREE.Vector2();
  private whirlTime = 0;
  private whirlTick = 0;
  private whirlAura: { mesh: THREE.Mesh; stop: () => void } | null = null;
  private slamFrom = new THREE.Vector3();
  private slamTo = new THREE.Vector3();
  private slamCount = 0;
  private flameHits = 0;
  private runPhase = 0;
  private hurtFlash = 0;
  private fireTrailTimer = 0;
  private readonly light: THREE.PointLight;
  private readonly shadow: THREE.Mesh;
  private readonly baseColors: Record<string, number>;
  private tmp = new THREE.Vector3();

  constructor(private readonly game: Game) {
    this.rig = buildMonkey();
    this.root = this.rig.root;
    this.pos = this.root.position;
    this.light = new THREE.PointLight(0xffb070, 30, 16, 1.6);
    this.light.position.set(0, 3.2, 1);
    this.root.add(this.light);
    this.shadow = makeBlob(0x000000, 0.6, 0.9, false);
    game.renderer.scene.add(this.shadow);
    game.renderer.scene.add(this.root);
    this.baseColors = {
      fur: this.rig.mats.fur.color.getHex(),
      cloth: this.rig.mats.cloth.color.getHex(),
      armor: this.rig.mats.armor.color.getHex(),
      staff: this.rig.mats.staff.color.getHex(),
    };
    this.stats = this.computeStats({ gold: 0, bag: [], equipped: {} });
  }

  get transformed() {
    return this.transformTime > 0;
  }
  get alive() {
    return this.state !== 'dead';
  }
  get xpToNext() {
    return Math.round(60 * Math.pow(this.level, 1.55));
  }

  computeStats(inv: Inventory): Stats {
    const s: Stats = {
      maxHp: 180 + this.level * 30,
      maxMana: 100,
      damage: 14 + this.level * 4,
      damagePct: 0,
      armor: this.level * 2,
      crit: 0.05,
      attackSpeed: 0,
      skillDamage: 0,
      moveSpeed: 0,
      cdr: 0,
      lifeOnHit: 0,
      manaRegen: 0,
      powers: new Set(),
    };
    for (const it of Object.values(inv.equipped)) {
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats) as [StatKey, number][]) {
        if (k === 'hp') s.maxHp += v;
        else s[k] += v;
      }
      if (it.power) s.powers.add(it.power);
    }
    s.cdr = Math.min(s.cdr, 0.5);
    this.stats = s;
    this.hp = Math.min(this.hp, s.maxHp);
    return s;
  }

  respawn(at: THREE.Vector3) {
    this.pos.copy(at);
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
    this.state = 'free';
    this.st = 0;
    this.transformTime = 0;
    this.invuln = 1.5;
    this.whirlTime = 0;
    this.whirlAura?.stop();
    this.whirlAura = null;
    this.cooldowns = [0, 0, 0, 0];
    this.yaw = Math.PI;
    this.applyTransformLook(false);
    this.root.rotation.set(0, this.yaw, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.body.position.set(0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  rollDamage(mult: number, skill: boolean) {
    const s = this.stats;
    const crit = Math.random() < s.crit + (this.transformed ? 0.1 : 0);
    let d = s.damage * (1 + s.damagePct) * mult * (skill ? 1 + s.skillDamage : 1);
    if (this.transformed) d *= 1.8;
    if (crit) d *= 2;
    d *= 0.9 + Math.random() * 0.2;
    return { amount: Math.max(1, Math.round(d)), crit };
  }

  /** Called by the game when an enemy hits us. Returns damage actually taken. */
  hurt(amount: number, from?: THREE.Vector3) {
    if (!this.alive || this.invuln > 0) return 0;
    const reduced = Math.max(1, Math.round(amount * (100 / (100 + this.stats.armor * 1.2)) * (this.transformed ? 0.6 : 1)));
    this.hp -= reduced;
    this.hurtFlash = 0.25;
    this.game.audio.play('hurt');
    this.game.camRig.shake(0.25, 0.15);
    this.game.hud.damageFlash();
    if (from && this.state === 'free') {
      this.tmp.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(0.35);
      this.game.level.move(this.pos, this.tmp.x, this.tmp.z, this.radius);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return reduced;
  }

  heal(n: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }

  private die() {
    this.state = 'dead';
    this.st = 0;
    this.whirlTime = 0;
    this.whirlAura?.stop();
    this.whirlAura = null;
    this.game.audio.play('death');
    this.game.onPlayerDeath();
  }

  // -------------------------------------------------------------------------
  // Aim
  // -------------------------------------------------------------------------

  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Direction (yaw) to attack in, combining mouse, stick, movement and auto-aim. */
  private aimYaw(moveX: number, moveZ: number): number {
    const input = this.game.input;
    let base = this.yaw;
    let explicit = false;
    if (input.mouseAiming && input.mouseNdc) {
      this.plane.constant = -(this.pos.y + 0.5);
      this.ray.setFromCamera(new THREE.Vector2(input.mouseNdc.x, input.mouseNdc.y), this.game.renderer.camera);
      if (this.ray.ray.intersectPlane(this.plane, this.tmp)) {
        base = yawOf(this.tmp.x - this.pos.x, this.tmp.z - this.pos.z);
        explicit = true;
      }
    } else if (input.padAim) {
      base = yawOf(input.padAim.x, input.padAim.y);
      explicit = true;
    } else if (Math.hypot(moveX, moveZ) > 0.2) {
      base = yawOf(moveX, moveZ);
    }
    // Soft auto-aim towards the nearest enemy in front (strong when not using the mouse).
    const cone = explicit ? 0.5 : 1.4;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const e of this.game.targets()) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 7) continue;
      const da = Math.abs(wrapAngle(yawOf(dx, dz) - base));
      if (da > cone) continue;
      const score = d + da * 3;
      if (score < bestScore) { bestScore = score; best = e.pos; }
    }
    if (!best && !explicit && Math.hypot(moveX, moveZ) < 0.2) {
      for (const e of this.game.targets()) {
        const d = e.pos.distanceTo(this.pos);
        if (d < 5 && d < bestScore) { bestScore = d; best = e.pos; }
      }
    }
    if (best) return yawOf(best.x - this.pos.x, best.z - this.pos.z);
    return base;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt: number) {
    const input = this.game.input;
    const s = this.stats;
    for (let i = 0; i < 4; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.comboReset -= dt;
    if (this.comboReset <= 0) this.combo = 0;

    if (this.alive) {
      this.mana = Math.min(s.maxMana, this.mana + (5 + s.manaRegen) * dt);
      if (this.transformTime > 0) {
        this.transformTime -= dt;
        if (this.transformTime <= 0) this.endTransform();
      }
    }

    const mx = input.moveX, mz = input.moveY;
    const moving = Math.hypot(mx, mz) > 0.15;
    const atkSpeed = 1 + s.attackSpeed + (this.transformed ? 0.3 : 0);
    let speed = 6.2 * (1 + s.moveSpeed) * (this.transformed ? 1.15 : 1) * (this.slowTime > 0 ? 0.6 : 1);

    this.st += dt;
    switch (this.state) {
      case 'free': {
        if (this.whirlTime > 0) speed *= 0.8;
        if (moving) {
          this.game.level.move(this.pos, mx * speed * dt, mz * speed * dt, this.radius);
          if (this.whirlTime <= 0) this.yaw = approachAngle(this.yaw, yawOf(mx, mz), dt * 16);
          this.speedNow = lerp(this.speedNow, speed * Math.hypot(mx, mz), damp(12, dt));
        } else {
          this.speedNow = lerp(this.speedNow, 0, damp(12, dt));
        }
        if (input.consume('dodge')) this.startDodge(mx, mz);
        else if (this.tryCast()) { /* cast started */ }
        else if (input.attackHeld && this.whirlTime <= 0) this.startAttack(mx, mz);
        break;
      }
      case 'attack': {
        const c = COMBO[this.combo];
        const dur = c.dur / atkSpeed;
        const k = this.st / dur;
        if (k < 0.6) this.game.level.move(this.pos, Math.sin(this.yaw) * 2.2 * dt, Math.cos(this.yaw) * 2.2 * dt, this.radius);
        if (!this.hitDone && k >= c.hitAt) {
          this.hitDone = true;
          this.doComboHit(this.combo);
        }
        if (input.consume('dodge')) { this.startDodge(mx, mz); break; }
        if (this.hitDone && this.tryCast()) break;
        if (k >= 1) {
          this.combo = (this.combo + 1) % COMBO.length;
          this.comboReset = 0.45;
          if (input.attackHeld) this.startAttack(mx, mz);
          else this.state = 'free';
        }
        this.speedNow = 0;
        break;
      }
      case 'dodge': {
        const dur = 0.32;
        const sp = 17 * (1 - this.st / dur) + 4;
        this.game.level.move(this.pos, this.dodgeDir.x * sp * dt, this.dodgeDir.y * sp * dt, this.radius);
        if (s.powers.has('fireTrail')) {
          this.fireTrailTimer -= dt;
          if (this.fireTrailTimer <= 0) {
            this.fireTrailTimer = 0.06;
            this.game.addHazard(this.pos.clone(), 1.4, 2.5, this.rollDamage(0.35, true).amount, 'player');
          }
        }
        if (this.st >= dur) this.state = 'free';
        break;
      }
      case 'flame': {
        const step = 0.3 / atkSpeed;
        if (this.flameHits < 3 && this.st >= step * this.flameHits + 0.08) {
          this.yaw = this.aimYaw(mx, mz);
          this.doFlameHit(this.flameHits);
          this.flameHits++;
        }
        if (this.st >= step * 3 + 0.2) this.state = 'free';
        break;
      }
      case 'slam': {
        const dur = 0.5;
        const k = Math.min(1, this.st / dur);
        this.pos.lerpVectors(this.slamFrom, this.slamTo, k);
        this.pos.y = this.game.level.heightAt(this.pos.x, this.pos.z);
        if (k >= 1 && this.slamCount === 0) {
          this.slamCount = 1;
          this.doSlamImpact(1);
        }
        if (this.slamCount === 1 && s.powers.has('doubleSlam') && this.st > dur + 0.35) {
          this.slamCount = 2;
          this.doSlamImpact(0.8);
        }
        if (this.st >= dur + (s.powers.has('doubleSlam') ? 0.55 : 0.25)) this.state = 'free';
        break;
      }
      case 'gale': {
        if (this.st >= 0.12 && !this.hitDone) {
          this.hitDone = true;
          const waves = s.powers.has('galeTriple') ? [-0.35, 0, 0.35] : [0];
          for (const off of waves) this.game.spawnGale(this.pos, this.yaw + off, this.rollDamage(1.4, true));
          this.game.audio.play('gale');
        }
        if (this.st >= 0.32) this.state = 'free';
        break;
      }
      case 'transform': {
        if (this.st >= 0.45 && !this.hitDone) {
          this.hitDone = true;
          this.applyTransformLook(true);
          this.game.vfx.shockwave(this.pos, 8, COLORS.gold, 0.7, 0.2);
          this.game.vfx.beam(this.pos, COLORS.gold, 14, 1.2, 2.5);
          this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1, this.pos.z, { count: 60, speed: [4, 12], up: [2, 9], life: [0.4, 1], color: COLORS.goldHot, color2: COLORS.fire });
          this.game.strike({ origin: this.pos, yaw: 0, range: 7, halfArc: Math.PI, mult: 2.5, knock: 4, skill: true, color: COLORS.gold });
          this.game.camRig.shake(0.7, 0.5);
        }
        if (this.st >= 0.9) this.state = 'free';
        break;
      }
      case 'dead':
        break;
    }

    // Golden Whirlwind runs alongside free movement.
    if (this.whirlTime > 0) {
      this.whirlTime -= dt;
      this.whirlTick -= dt;
      if (this.whirlTick <= 0) {
        this.whirlTick = 0.22;
        this.game.strike({ origin: this.pos, yaw: 0, range: 4.2, halfArc: Math.PI, mult: 0.55, knock: s.powers.has('whirlPull') ? -1.2 : 0.8, skill: true, color: COLORS.gold, silentSwing: true });
        this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.8, this.pos.z, { count: 6, radius: 3.8, speed: [2, 5], up: [0.5, 2], life: [0.2, 0.5], color: COLORS.goldHot, color2: COLORS.gold });
        this.game.audio.play('whirl');
      }
      if (this.whirlAura) this.whirlAura.mesh.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
      if (this.whirlTime <= 0) {
        this.whirlAura?.stop();
        this.whirlAura = null;
      }
    }

    if (this.transformed && Math.random() < 0.7) {
      this.rig.staffTip.getWorldPosition(this.tmp);
      this.game.vfx.sparks.emit(this.tmp.x, this.tmp.y, this.tmp.z, { count: 1, speed: [0, 1], up: [0.5, 2], gravity: -1, life: [0.2, 0.5], color: COLORS.fire, color2: COLORS.fireHot, size: [0.2, 0.4] });
    }

    this.animate(dt);
    this.root.rotation.y = this.yaw;
    this.shadow.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
  }

  private startAttack(mx: number, mz: number) {
    this.state = 'attack';
    this.st = 0;
    this.hitDone = false;
    this.yaw = this.aimYaw(mx, mz);
  }

  private startDodge(mx: number, mz: number) {
    if (this.dodgeCd > 0) return;
    this.state = 'dodge';
    this.st = 0;
    this.dodgeCd = 0.55;
    this.invuln = Math.max(this.invuln, 0.36);
    if (Math.hypot(mx, mz) > 0.15) this.dodgeDir.set(mx, mz).normalize();
    else this.dodgeDir.set(Math.sin(this.yaw), Math.cos(this.yaw));
    this.yaw = yawOf(this.dodgeDir.x, this.dodgeDir.y);
    this.game.vfx.dustBurst(this.pos, 8, 0.5);
    this.game.audio.play('dodge');
    this.combo = 0;
  }

  /** Checks skill / transform presses. Returns true if a cast started. */
  private tryCast(): boolean {
    const input = this.game.input;
    if (input.consume('transform')) {
      if (this.fury >= 100 && !this.transformed) {
        this.state = 'transform';
        this.st = 0;
        this.hitDone = false;
        this.invuln = 1;
        this.fury = 0;
        this.transformTime = TRANSFORM_DURATION;
        this.game.audio.play('transform');
        this.game.hud.toast('Monkey King form awakened!', '#ffd46a');
        return true;
      }
      if (!this.transformed) this.game.hud.toast('Fury not full yet', '#aaa');
    }
    for (let i = 0; i < 4; i++) {
      if (!input.consume(`skill${i}` as 'skill0')) continue;
      const sk = SKILLS[i];
      if (this.cooldowns[i] > 0) return false;
      if (this.mana < sk.mana) {
        this.game.hud.toast('Not enough mana', '#6fb0ff');
        return false;
      }
      this.mana -= sk.mana;
      this.cooldowns[i] = sk.cd * (1 - this.stats.cdr);
      this.castSkill(sk.id);
      return true;
    }
    return false;
  }

  private castSkill(id: SkillDef['id']) {
    const input = this.game.input;
    this.yaw = this.aimYaw(input.moveX, input.moveY);
    this.st = 0;
    this.hitDone = false;
    switch (id) {
      case 'whirl':
        this.whirlTime = 2.4;
        this.whirlTick = 0;
        this.whirlAura?.stop();
        this.whirlAura = this.game.vfx.aura(4.4);
        this.state = 'free';
        break;
      case 'flame':
        this.state = 'flame';
        this.flameHits = 0;
        this.game.audio.play('fire');
        break;
      case 'slam': {
        this.state = 'slam';
        this.slamCount = 0;
        this.slamFrom.copy(this.pos);
        // Leap towards the aimed enemy (or forward), stopping at walkable ground.
        const dist = 5.5;
        this.slamTo.copy(this.pos);
        const step = 0.25;
        for (let d = step; d <= dist; d += step) {
          const x = this.pos.x + Math.sin(this.yaw) * d, z = this.pos.z + Math.cos(this.yaw) * d;
          if (!this.game.level.isWalkable(x, z, this.radius)) break;
          let blocked = false;
          for (const g of this.game.level.gates) if (g.active && (this.pos.z - g.z) * (z - g.z) <= 0 && x > g.x0 && x < g.x1) blocked = true;
          if (blocked) break;
          let near = false;
          for (const e of this.game.targets()) if (Math.hypot(e.pos.x - x, e.pos.z - z) < e.radius + 0.6) near = true;
          this.slamTo.set(x, 0, z);
          if (near) break;
        }
        this.invuln = Math.max(this.invuln, 0.55);
        this.game.audio.play('swingHeavy');
        break;
      }
      case 'gale':
        this.state = 'gale';
        break;
    }
  }

  private doComboHit(i: number) {
    const c = COMBO[i];
    const t = this.transformed;
    const colA = t ? COLORS.fire : COLORS.gold;
    const colB = t ? COLORS.fireHot : COLORS.goldHot;
    const range = c.range * (t ? 1.2 : 1);
    if (i < 2) {
      this.game.vfx.slash(this.pos, this.yaw, { radius: range, reverse: i === 1, tilt: i === 0 ? -0.15 : 0.15, colorA: colA, colorB: colB });
      this.game.audio.play('swing');
    } else {
      this.game.vfx.slash(this.pos, this.yaw, { radius: range * 0.8, reverse: true, tilt: Math.PI / 2, height: 1.3, colorA: colA, colorB: colB, dur: 0.3 });
      this.tmp.set(this.pos.x + Math.sin(this.yaw) * 2.2, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2.2);
      this.game.vfx.shockwave(this.tmp, 2.8, colA, 0.35);
      this.game.vfx.dustBurst(this.tmp, 10, 1);
      this.game.audio.play('swingHeavy');
    }
    this.game.strike({ origin: this.pos, yaw: this.yaw, range, halfArc: c.arc, mult: c.mult, knock: c.knock, skill: false, color: colB, burn: this.stats.powers.has('burn') || t });
    if (t) this.game.spawnFireWave(this.pos, this.yaw, this.rollDamage(0.6, false));
  }

  private doFlameHit(i: number) {
    this.game.vfx.slash(this.pos, this.yaw, { radius: 5, arc: Math.PI * 1.1, reverse: i % 2 === 1, tilt: (i - 1) * 0.25, colorA: COLORS.fire, colorB: COLORS.fireHot, dur: 0.32 });
    this.game.vfx.sparks.emit(this.pos.x + Math.sin(this.yaw) * 2.5, this.pos.y + 1, this.pos.z + Math.cos(this.yaw) * 2.5, { count: 25, radius: 2, speed: [1, 4], up: [1, 4], life: [0.3, 0.7], color: COLORS.fire, color2: COLORS.fireHot, gravity: -1 });
    this.game.strike({ origin: this.pos, yaw: this.yaw, range: 5, halfArc: 1.5, mult: 1.15, knock: 1.2, skill: true, color: COLORS.fireHot, burn: true });
    this.game.audio.play('fire');
  }

  private doSlamImpact(scale: number) {
    const r = 5 * scale;
    this.game.vfx.shockwave(this.pos, r + 1, COLORS.gold, 0.5, 0.18);
    this.game.vfx.shockwave(this.pos, r * 0.6, COLORS.goldHot, 0.3, 0.3);
    this.game.vfx.dustBurst(this.pos, 24, 2);
    this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.3, this.pos.z, { count: 30, radius: 1.5, speed: [3, 8], up: [3, 8], life: [0.3, 0.7], color: COLORS.goldHot, color2: COLORS.gold });
    this.game.debris.burst(this.pos, 0x5e5a52, 10, 0.18, 1.2);
    this.game.strike({ origin: this.pos, yaw: 0, range: r, halfArc: Math.PI, mult: 2.4 * scale, knock: 3, skill: true, color: COLORS.goldHot, burn: this.transformed });
    this.game.audio.play('slam');
    this.game.camRig.shake(0.6, 0.35);
    this.game.hitstop(0.08);
  }

  private endTransform() {
    this.transformTime = 0;
    this.applyTransformLook(false);
    this.game.vfx.shockwave(this.pos, 4, COLORS.gold, 0.5);
    this.game.hud.toast('The transformation fades', '#d0c0a0');
  }

  private applyTransformLook(on: boolean) {
    const m = this.rig.mats;
    m.fur.color.setHex(on ? 0xeae6dc : this.baseColors.fur);
    m.cloth.color.setHex(on ? 0xd8b46a : this.baseColors.cloth);
    m.armor.color.setHex(on ? 0xc89a3a : this.baseColors.armor);
    m.armor.emissive.setHex(on ? 0x5a3000 : 0x000000);
    m.staff.color.setHex(on ? 0xffa040 : this.baseColors.staff);
    m.staff.emissive.setHex(on ? 0xff5010 : 0x000000);
    m.gold.emissiveIntensity = on ? 1.6 : 0.6;
    this.root.scale.setScalar(on ? 1.25 : 1);
    this.light.color.setHex(on ? 0xffc060 : 0xffb070);
    this.light.intensity = on ? 45 : 30;
    this.game.camRig.setZoom(on ? 1.12 : 1);
  }

  // -------------------------------------------------------------------------
  // Procedural animation
  // -------------------------------------------------------------------------

  private animate(dt: number) {
    const r = this.rig;
    const t = this.game.time;
    const k = damp(18, dt);
    const ease = (target: THREE.Euler, x: number, y: number, z: number, kk = k) => {
      target.x += (x - target.x) * kk;
      target.y += (wrapAngle(y - target.y)) * kk;
      target.z += (z - target.z) * kk;
    };
    const speedK = clamp(this.speedNow / 6, 0, 1.3);
    this.runPhase += dt * (4 + this.speedNow * 1.6);
    const sw = Math.sin(this.runPhase) * speedK;

    // Defaults: idle / locomotion
    let legL = sw * 0.8, legR = -sw * 0.8;
    let armLx = -sw * 0.6, armLz = -0.15, armRx = -0.5 + sw * 0.2, armRz = 0.1;
    let torsoX = 0.1 * speedK + Math.sin(t * 2) * 0.02, torsoY = 0;
    let staffX = -1.25 + speedK * 0.7, staffY = 0.25 - speedK * 0.5, staffZ = 0;
    let bodyY = Math.abs(Math.sin(this.runPhase)) * 0.07 * speedK;
    let bodyX = 0, bodyRotY = 0;
    const staffPos = this.tmp.set(0.32, 1.15, 0.15);

    switch (this.state) {
      case 'attack': {
        const c = COMBO[this.combo];
        const dur = c.dur / (1 + this.stats.attackSpeed + (this.transformed ? 0.3 : 0));
        const p = clamp(this.st / dur, 0, 1);
        const sweep = p < 0.25 ? -0.2 * (p / 0.25) : clamp((p - 0.25) / 0.3, 0, 1);
        const sweepE = 1 - Math.pow(1 - Math.max(0, sweep), 3);
        staffPos.set(0, 1.15, 0.15);
        if (this.combo < 2) {
          const dir = this.combo === 0 ? 1 : -1;
          staffY = dir * lerp(-1.8, 1.8, sweepE);
          staffX = -0.1;
          torsoY = staffY * 0.45;
          armRx = -1.4; armRz = 0.2;
          armLx = -1.2;
          legL = 0.4; legR = -0.3;
        } else {
          staffX = lerp(-2.7, 0.55, sweepE);
          staffY = 0;
          armRx = lerp(-2.8, -1.2, sweepE);
          armLx = armRx;
          torsoX = lerp(-0.25, 0.45, sweepE);
          bodyY = Math.sin(clamp(p * 1.6, 0, 1) * Math.PI) * 0.4;
          legL = 0.5; legR = -0.4;
        }
        // Snap fast for the swing itself
        r.staff.rotation.set(staffX, staffY, staffZ);
        break;
      }
      case 'dodge':
        bodyX = 0.7; legL = -1; legR = -0.8; armLx = 0.8; armRx = 0.8; staffX = -0.2; staffY = 0.6; bodyY = 0.15;
        break;
      case 'flame': {
        const step = 0.3 / (1 + this.stats.attackSpeed);
        const i = Math.min(2, Math.floor(this.st / step));
        const p = clamp((this.st - i * step) / step, 0, 1);
        const dir = i % 2 === 0 ? 1 : -1;
        staffPos.set(0, 1.15, 0.15);
        staffY = dir * lerp(-1.9, 1.9, 1 - Math.pow(1 - p, 3));
        staffX = -0.1 + (i - 1) * 0.2;
        torsoY = staffY * 0.5;
        armRx = -1.4; armLx = -1.2;
        r.staff.rotation.set(staffX, staffY, 0);
        break;
      }
      case 'slam': {
        const p = clamp(this.st / 0.5, 0, 1);
        bodyY = Math.sin(p * Math.PI) * 2.4;
        staffPos.set(0, 1.15, 0.15);
        staffX = p < 0.7 ? -2.6 : lerp(-2.6, 0.7, (p - 0.7) / 0.3);
        staffY = 0;
        armRx = staffX < 0 ? -2.8 : -1.2;
        armLx = armRx;
        legL = -0.8; legR = -0.6;
        torsoX = p < 0.7 ? -0.3 : 0.5;
        break;
      }
      case 'gale':
        staffPos.set(0.1, 1.2, 0.3);
        staffX = 0; staffY = 0; armRx = -1.6; armLx = -1.3; torsoX = 0.25; legL = 0.5; legR = -0.4;
        break;
      case 'transform': {
        const p = clamp(this.st / 0.9, 0, 1);
        bodyY = Math.sin(p * Math.PI) * 1.2;
        armLx = -3; armRx = -3; armLz = -0.4; armRz = 0.4;
        staffX = -1.57; staffY = 0;
        bodyRotY = p * Math.PI * 4;
        break;
      }
      case 'dead': {
        const p = clamp(this.st / 0.6, 0, 1);
        bodyX = -1.45 * p; bodyY = 0.25 * p; legL = 0.2; legR = -0.2; armLx = -2.6; armRx = -2.4; staffX = -0.2; staffY = 1.2;
        break;
      }
    }
    if (this.whirlTime > 0 && this.state === 'free') {
      bodyRotY = this.game.time * 22;
      staffPos.set(0, 1.1, 0);
      staffX = -0.05; staffY = Math.PI / 2;
      armLz = -1.2; armRz = 1.2; armLx = 0; armRx = 0;
    }

    ease(r.legL.rotation, legL, 0, 0);
    ease(r.legR.rotation, legR, 0, 0);
    ease(r.armL.rotation, armLx, 0, armLz);
    ease(r.armR.rotation, armRx, 0, armRz);
    ease(r.torso.rotation, torsoX, torsoY, 0);
    if (this.state !== 'attack' && this.state !== 'flame') {
      const kk = this.state === 'slam' || this.state === 'gale' ? damp(30, dt) : k;
      ease(r.staff.rotation, staffX, staffY, staffZ, kk);
    }
    r.staff.position.lerp(staffPos, damp(20, dt));
    r.body.position.y += (bodyY - r.body.position.y) * damp(20, dt);
    r.body.rotation.x += (bodyX - r.body.rotation.x) * k;
    if (bodyRotY !== 0) r.body.rotation.y = bodyRotY;
    else r.body.rotation.y += wrapAngle(0 - r.body.rotation.y) * damp(14, dt);
    r.cape.rotation.x = 0.12 + speedK * 0.55 + Math.sin(t * 9) * 0.06 * (0.3 + speedK);
    r.tail.rotation.y = Math.sin(t * 3) * 0.3;
    r.head.rotation.y = -torsoY * 0.5;

    // Hit flash
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const flash = this.hurtFlash > 0 ? 0.6 : 0;
    if (!this.transformed) r.mats.fur.emissive.setRGB(flash, 0, 0);
    // Blink while invulnerable after respawn
    this.root.visible = !(this.invuln > 0.5 && this.state === 'free' && Math.floor(t * 12) % 2 === 0);
  }
}
