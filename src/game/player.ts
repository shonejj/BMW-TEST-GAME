import * as THREE from 'three';
import { approachAngle, clamp, damp, lerp, wrapAngle, yawOf } from '../engine/util';
import { Animator } from './animator';
import { buildHero, type HeroRig } from './outfits';
import { COLORS, Trail, makeBlob } from './vfx';
import type { Game } from './game';
import { itemStats, setCounts, SETS, type Inventory, type Power, type SetId, type StatKey } from './loot';
import { DEFAULT_SPELLS, SPELLS, rank, type SpellDef, type SpellId, type Talents } from './progression';
import { SPECIAL_MOVES, STANCES, STANCE_IDS, STING_COUNT, STING_STEP, hitAt, move, type ComboHit, type Move, type StanceId } from './stances';
import { DRINKS, gourdLevelCharges, gourdLevelHeal } from './items';

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
  heavyDamage: number;
  focusGain: number;
  furyGain: number;
  gourdCharges: number;
  gourdHeal: number;
  transformTime: number;
  powers: Set<Power>;
  resonance: boolean;
  /** Critical hit damage multiplier. */
  critMult: number;
  /** Dodge cooldown modifier (negative = faster recovery). */
  dodgeCd: number;
  /** Multiplier on damage taken. */
  damageTaken: number;
  /** Heavy charge rate multiplier. */
  chargeRate: number;
  /** Seconds after a roll starts in which a hit counts as a perfect dodge. */
  perfectWindow: number;
  /** Four-piece set bonuses that are active. */
  sets: Set<SetId>;
}

// ---------------------------------------------------------------------------
// Moves: windows of motion-captured clips (seconds), and the frame each one connects. Light combos,
// heavies and specials per stance live in stances.ts.
// ---------------------------------------------------------------------------

const comboDur = (c: ComboHit) => (c.move.to - c.move.from) / c.rate;

const ROLL = move('roll', 0.1, 1.02);
const DRINK = move('drink', 0.3, 2.65, 1.0);
const CAST = move('cast', 0.0, 0.5, 0.25);
const RING = move('heavyC', 0.1, 0.7, 0.47);
const GALE = move('dash', 0.1, 1.0, 0.33);
const SLAM = move('groundPound', 0.0, 1.0, 0.3);
const FLAME = [move('slashA', 0.05, 0.43, 0.24), move('slashB', 0.08, 0.53, 0.26), move('uppercut', 0.0, 0.5, 0.15)];
const TRANSFORM = move('transform', 0.0, 2.1, 0.75);
const DEATH = move('death', 0.0, 2.35);
const HURT = move('hit', 0.0, 0.33);

type State = 'free' | 'attack' | 'charge' | 'heavy' | 'special' | 'dodge' | 'cast' | 'flame' | 'slam' | 'gale' | 'drink' | 'transform' | 'dead';
type Special = 'resolute' | 'sweep' | 'sting';

export const BASE_TRANSFORM_DURATION = 15;

export class Player {
  readonly rig: HeroRig;
  readonly anim: Animator;
  readonly root: THREE.Group;
  readonly pos: THREE.Vector3;
  readonly radius = 0.5;
  readonly trail: Trail;
  yaw = Math.PI;
  hp = 200;
  mana = 100;
  fury = 0;
  /** Focus points 0..3, built by light hits and spent by heavy attacks. */
  focus = 0;
  level = 1;
  xp = 0;
  stats!: Stats;
  talents: Talents = {};
  spells: SpellId[] = [...DEFAULT_SPELLS];
  state: State = 'free';
  cooldowns = [0, 0, 0, 0];
  gourd = 3;
  transformTime = 0;
  invuln = 0;
  slowTime = 0;
  speedNow = 0;
  /** Current heavy charge level (0–3) while charging, for the HUD. */
  chargeLevel = 0;
  ringFire: { pos: THREE.Vector3; r: number; t: number } | null = null;
  /** Staff stance: its own light chain, heavy and special. */
  stance: StanceId = 'smash';
  /** Cooldown left on the stance special (s). */
  specialCd = 0;
  /** Index of the current hit in the light chain (for the HUD). */
  get comboIndex() {
    return this.combo;
  }
  /** Last time (game time) a perfect dodge happened. */
  private lastPerfect = -99;
  private special: Special = 'resolute';
  private specialHits = 0;
  private followUp = false;
  private heavyFrom = new THREE.Vector3();
  private heavyStance: StanceId = 'smash';
  private lungeLeft = 0;
  private lungeTotal = 0;

  private st = 0;
  private dur = 1;
  private move: Move | null = null;
  private combo = 0;
  private comboReset = 0;
  private queued = false;
  private hitDone = false;
  private dodgeCd = 0;
  private perfectUsed = false;
  private dodgeDir = new THREE.Vector2();
  private whirlTime = 0;
  private whirlTick = 0;
  private whirlAura: { mesh: THREE.Mesh; stop: () => void } | null = null;
  private slamFrom = new THREE.Vector3();
  private slamTo = new THREE.Vector3();
  private slamCount = 0;
  private flameHits = 0;
  private castSpell: SpellId = 'immobilize';
  private chargeT = 0;
  private heavyLevel = 0;
  private healLeft = 0;
  private hurtFlash = 0;
  private hurtT = 0;
  private equipped: Inventory['equipped'] = {};
  private lastStep = 0;
  private fireTrailTimer = 0;
  private readonly light: THREE.PointLight;
  private readonly shadow: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private readonly game: Game) {
    this.rig = buildHero();
    this.root = this.rig.root;
    this.anim = new Animator(this.rig.root, {
      idle: 'idle',
      moves: [{ name: 'walk', speed: 1.5 }, { name: 'jog', speed: 3.6 }, { name: 'sprint', speed: 6.2 }],
    });
    this.pos = this.root.position;
    this.light = new THREE.PointLight(0xffb070, 30, 16, 1.6);
    // The light lives in the scene (not under the model) and is never hidden: changing the
    // number of visible lights forces three.js to recompile every lit material.
    game.renderer.scene.add(this.light);
    this.shadow = makeBlob(0x000000, 0.6, 0.9, false);
    // Warm ring under the hero and a red marker under the auto-aim target (readability).
    this.ring = makeBlob(0xffb860, 0.22, 1.2, true);
    this.marker = makeBlob(0xff3020, 0.55, 1, true);
    game.renderer.scene.add(this.ring, this.marker);
    game.renderer.scene.add(this.shadow, this.root);
    this.trail = new Trail(game.renderer.scene);
    this.computeStats({ gold: 0, bag: [], equipped: {} });
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
  spellDef(slot: number): SpellDef {
    return SPELLS[this.spells[slot]];
  }
  spellCooldown(slot: number) {
    return this.spellDef(slot).cd * (1 - this.stats.cdr);
  }

  /** Stances the player knows (Smash from the start, the others from the skill tree). */
  knowsStance(id: StanceId) {
    const u = STANCES[id].unlock;
    return !u || rank(this.talents, u) > 0;
  }
  /** The current stance's light chain, with the fifth strike once learned. */
  chain(): ComboHit[] {
    const st = STANCES[this.stance];
    return rank(this.talents, st.extTalent) > 0 ? [...st.chain, st.ext] : st.chain;
  }
  get specialKnown() {
    return rank(this.talents, STANCES[this.stance].specialTalent) > 0;
  }
  get canTransform() {
    return rank(this.talents, 'sageForm') > 0;
  }

  /** Switches to the next known stance (or `to`). */
  cycleStance(to?: StanceId) {
    const known = STANCE_IDS.filter((id) => this.knowsStance(id));
    if (!to) {
      if (known.length < 2) {
        this.game.hud.toast('Learn Pillar or Thrust Stance in Self-Advance', '#c8b89a');
        return;
      }
      to = known[(known.indexOf(this.stance) + 1) % known.length];
    }
    if (!this.knowsStance(to) || to === this.stance) return;
    this.stance = to;
    this.combo = 0;
    this.comboReset = 0;
    const col = new THREE.Color(STANCES[to].color).getHex();
    this.game.vfx.shockwave(this.pos, 2.2, col, 0.35);
    this.game.vfx.twinkle(this.pos, 1, 5, col);
    this.game.audio.play('focus');
    this.game.hud.floatText(this.pos, `${STANCES[to].name} Stance`, 'focus-pop', 0.9);
    if (this.state === 'attack') this.setState('free');
  }

  computeStats(inv: Inventory): Stats {
    const t = this.talents;
    const j = this.game.journey;
    const s: Stats = {
      maxHp: 180 + this.level * 30 + rank(t, 'vitality') * 30,
      maxMana: 100,
      damage: 14 + this.level * 4,
      damagePct: rank(t, 'might') * 0.06,
      armor: this.level * 2 + rank(t, 'toughness') * 6,
      crit: 0.05 + rank(t, 'precision') * 0.02,
      attackSpeed: 0,
      skillDamage: rank(t, 'spellPower') * 0.08,
      moveSpeed: rank(t, 'swiftness') * 0.04,
      cdr: rank(t, 'quickCast') * 0.05,
      lifeOnHit: 0,
      manaRegen: rank(t, 'manaFlow'),
      heavyDamage: rank(t, 'heavyMastery') * 0.15,
      focusGain: 1 + rank(t, 'focusFlow') * 0.25,
      furyGain: 1 + rank(t, 'furyMastery') * 0.15,
      gourdCharges: 3 + rank(t, 'gourdCharges'),
      gourdHeal: 0.45 * (1 + rank(t, 'gourdPotency') * 0.1),
      transformTime: BASE_TRANSFORM_DURATION + rank(t, 'longForm') * 3,
      powers: new Set(),
      resonance: rank(t, 'resonance') > 0,
      critMult: 2,
      dodgeCd: 0,
      damageTaken: 1,
      chargeRate: 1,
      perfectWindow: 0.24,
      sets: new Set(),
    };
    let gourdBonus = 0;
    const add = (k: StatKey, v: number) => {
      if (k === 'hp') s.maxHp += v;
      else if (k === 'gourdHeal') gourdBonus += v;
      else s[k] += v;
    };
    for (const it of Object.values(inv.equipped)) {
      if (!it) continue;
      for (const [k, v] of Object.entries(itemStats(it)) as [StatKey, number][]) add(k, v);
      if (it.power) s.powers.add(it.power);
    }
    for (const [id, n] of Object.entries(setCounts(inv.equipped)) as [SetId, number][]) {
      if (n >= 2) for (const [k, v] of Object.entries(SETS[id].twoStats) as [StatKey, number][]) add(k, v);
      if (n >= 4) s.sets.add(id);
    }
    // Journey: relics, curios, gourd, medicines.
    let hpMult = 1;
    if (j) {
      const relics = j.s.relics;
      if (relics.includes('emberEye')) s.crit += 0.05;
      if (relics.includes('windEar')) s.perfectWindow = 0.34;
      if (relics.includes('unbendingHeart')) hpMult *= 1.1;
      if (j.has('goldBand')) { s.furyGain *= 1.4; hpMult *= 0.9; }
      if (j.has('windPearl')) { s.moveSpeed += 0.08; s.chargeRate *= 1.2; }
      if (j.has('bronzeMirror')) { s.critMult = 2.5; s.crit -= 0.05; }
      if (j.has('crowFeather')) s.dodgeCd -= 0.25;
      if (j.has('tigerFang')) s.focusGain *= 1.3;
      if (j.buff('clearMind')) s.focusGain *= 2;
      if (j.buff('tigerPill')) s.damagePct += 0.2;
      if (j.buff('fireWine')) s.damagePct += 0.15;
      if (j.buff('gojiBerry')) s.damagePct += 0.1;
      if (j.buff('ironPill')) s.armor += 40;
      if (j.buff('boneSnow')) s.damageTaken *= 0.8;
      s.gourdCharges += gourdLevelCharges(j.s.gourdLevel);
      gourdBonus += gourdLevelHeal(j.s.gourdLevel);
      s.gourdHeal = DRINKS[j.s.drink].heal * (1 + rank(t, 'gourdPotency') * 0.1 + gourdBonus);
    }
    s.maxHp = Math.max(50, Math.round(s.maxHp * hpMult));
    s.maxMana = Math.max(40, s.maxMana);
    s.crit = Math.max(0, s.crit);
    s.attackSpeed = Math.max(-0.4, s.attackSpeed);
    s.moveSpeed = Math.max(-0.4, s.moveSpeed);
    s.dodgeCd = Math.max(-0.6, s.dodgeCd);
    s.manaRegen = Math.max(-4, s.manaRegen);
    s.focusGain = Math.max(0.2, s.focusGain);
    if (s.powers.has('furyGain')) s.furyGain *= 1.6;
    s.cdr = Math.min(s.cdr, 0.5);
    this.stats = s;
    this.equipped = inv.equipped;
    if (!this.transformed) this.rig.applyGear(inv.equipped);
    this.hp = Math.min(this.hp, s.maxHp);
    this.gourd = Math.min(this.gourd, s.gourdCharges);
    return s;
  }

  refillGourd() {
    this.gourd = this.stats.gourdCharges;
  }

  respawn(at: THREE.Vector3) {
    this.pos.copy(at);
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
    this.refillGourd();
    this.setState('free');
    this.transformTime = 0;
    this.invuln = 1.5;
    this.whirlTime = 0;
    this.whirlAura?.stop();
    this.whirlAura = null;
    this.ringFire = null;
    this.cooldowns = [0, 0, 0, 0];
    this.focus = 0;
    this.specialCd = 0;
    this.chargeLevel = 0;
    this.yaw = Math.PI;
    this.applyTransformLook(false);
    this.root.rotation.set(0, this.yaw, 0);
    this.rig.model.rotation.set(0, 0, 0);
    this.rig.model.visible = true;
    this.anim.release(0);
    this.showGourd(false);
  }

  private setState(s: State, m: Move | null = null, dur = 1) {
    this.state = s;
    this.st = 0;
    this.move = m;
    this.dur = dur;
    this.hitDone = false;
    this.queued = false;
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  /** Extra crit chance for the blow being rolled (set around strikes by stance moves). */
  private critBonus = 0;
  /** Forces the next rolls to crit (Resolute Strike after a perfect dodge). */
  private forceCrit = false;

  rollDamage(mult: number, skill: boolean) {
    const s = this.stats;
    const crit = this.forceCrit || Math.random() < s.crit + this.critBonus + (this.transformed ? 0.1 : 0);
    let d = s.damage * (1 + s.damagePct) * mult * (skill ? 1 + s.skillDamage : 1);
    if (this.transformed) d *= 1.8;
    if (this.game.journey.has('ironBead') && this.hp > s.maxHp * 0.8) d *= 1.15;
    if (crit) {
      d *= s.critMult;
      if (s.sets.has('blackfeather') && !skill) {
        this.focus = Math.min(3, this.focus + 0.12);
        this.fury = Math.min(100, this.fury + 2);
      }
    }
    d *= 0.9 + Math.random() * 0.2;
    return { amount: Math.max(1, Math.round(d)), crit };
  }

  /** Strikes with extra crit chance (stance moves). */
  private strikeWith(o: Parameters<Game['strike']>[0], critBonus = 0) {
    this.critBonus = critBonus;
    const n = this.game.strike(o);
    this.critBonus = 0;
    return n;
  }

  /** True while a guarded move is under way (Pillar charge, Sweeping Pillar): less damage, no flinch. */
  private get guarded() {
    return (this.state === 'charge' && this.stance === 'pillar') || (this.state === 'special' && this.special === 'sweep');
  }

  /** Called by the game when a foe dies. */
  onKill() {
    const s = this.stats;
    if (this.game.journey.has('boneBell')) this.heal(s.maxHp * 0.02);
    if (s.sets.has('paleBone')) this.heal(s.maxHp * 0.03);
  }

  /** Called by the game when an enemy hits us. Returns damage actually taken. */
  hurt(amount: number, from?: THREE.Vector3) {
    if (!this.alive) return 0;
    // Perfect dodge: getting "hit" in the first moments of a roll.
    if (this.state === 'dodge' && this.st < this.stats.perfectWindow && !this.perfectUsed) {
      this.perfectUsed = true;
      this.focus = Math.min(3, this.focus + 1);
      this.lastPerfect = this.game.time;
      const s = this.stats;
      if (this.game.journey.has('lotusSeed')) this.heal(s.maxHp * 0.06);
      if (s.sets.has('pilgrim')) {
        this.heal(s.maxHp * 0.06);
        this.mana = Math.min(s.maxMana, this.mana + 15);
      }
      this.game.onPerfectDodge();
      return 0;
    }
    if (this.invuln > 0) return 0;
    let mult = (this.transformed ? 0.6 : 1) * this.stats.damageTaken;
    if (this.ringFire && this.pos.distanceTo(this.ringFire.pos) < this.ringFire.r) mult *= 0.7;
    if (this.guarded) mult *= 0.6;
    const reduced = Math.max(1, Math.round(amount * (100 / (100 + Math.max(0, this.stats.armor) * 1.2)) * mult));
    this.hp -= reduced;
    this.hurtFlash = 0.25;
    if (this.state === 'free') this.hurtT = HURT.to - HURT.from;
    this.game.audio.play('hurt');
    this.game.camRig.shake(0.25, 0.15);
    this.game.hud.damageFlash();
    this.game.rumble(0.35, 120);
    if (this.settingsNumbers()) this.game.hud.floatText(this.pos, `-${reduced}`, 'dmg player', 0.8);
    if (from && !this.guarded && (this.state === 'free' || this.state === 'drink')) {
      this.tmp.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(0.35);
      this.game.level.move(this.pos, this.tmp.x, this.tmp.z, this.radius);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return reduced;
  }

  private settingsNumbers() {
    return this.game.settings.damageNumbers;
  }

  heal(n: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }

  private die() {
    this.setState('dead', DEATH, DEATH.to - DEATH.from);
    this.whirlTime = 0;
    this.whirlAura?.stop();
    this.whirlAura = null;
    this.trail.active = false;
    this.game.audio.play('death');
    this.game.onPlayerDeath();
  }

  // -------------------------------------------------------------------------
  // Aim
  // -------------------------------------------------------------------------

  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  /** The enemy auto-aim last picked (shown with a marker). */
  aimTarget: { pos: THREE.Vector3 } | null = null;

  /** Direction (yaw) to attack in, combining mouse, stick, movement and auto-aim. */
  private aimYaw(moveX: number, moveZ: number): number {
    const input = this.game.input;
    let base = this.yaw;
    let explicit = false;
    if (input.mouseAiming && input.mouseNdc) {
      this.plane.constant = -(this.pos.y + 0.5);
      this.ray.setFromCamera(this.ndc.set(input.mouseNdc.x, input.mouseNdc.y), this.game.renderer.camera);
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
    const best = this.pickTarget(base, explicit, Math.hypot(moveX, moveZ) < 0.2);
    this.aimTarget = best;
    if (best) return yawOf(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    return base;
  }

  /** Soft auto-aim towards the nearest enemy in front (strong when not using the mouse). */
  pickTarget(base: number, explicit: boolean, idle: boolean) {
    const cone = explicit ? 0.5 : 1.4;
    let best: { pos: THREE.Vector3 } | null = null;
    let bestScore = Infinity;
    for (const e of this.game.targets()) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 7) continue;
      const da = Math.abs(wrapAngle(yawOf(dx, dz) - base));
      if (da > cone) continue;
      const score = d + da * 3;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best && !explicit && idle) {
      for (const e of this.game.targets()) {
        const d = e.pos.distanceTo(this.pos);
        if (d < 5 && d < bestScore) { bestScore = d; best = e; }
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt: number) {
    const input = this.game.input;
    const s = this.stats;
    for (let i = 0; i < 4; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.comboReset -= dt;
    if (this.comboReset <= 0 && this.state !== 'attack') this.combo = 0;

    if (this.alive) {
      this.mana = Math.min(s.maxMana, this.mana + (5 + s.manaRegen) * dt);
      if (this.transformTime > 0) {
        this.transformTime -= dt;
        if (this.transformTime <= 0) this.endTransform();
      }
      if (this.healLeft > 0) {
        const h = Math.min(this.healLeft, s.maxHp * s.gourdHeal * dt / 0.5);
        this.healLeft -= h;
        this.heal(h);
      }
    }
    if (this.ringFire) {
      this.ringFire.t -= dt;
      if (this.ringFire.t <= 0) this.ringFire = null;
    }

    const mx = input.moveX, mz = input.moveY;
    const moving = Math.hypot(mx, mz) > 0.15;
    const atkSpeed = 1 + s.attackSpeed + (this.transformed ? 0.3 : 0);
    let speed = 6.4 * (1 + s.moveSpeed) * (this.transformed ? 1.15 : 1) * (this.slowTime > 0 ? 0.6 : 1);

    this.st += dt;
    const k = this.st / this.dur;
    const canAct = (this.state === 'attack' && this.hitDone && k > 0.55) || this.state === 'free';

    // Universal cancels: dodge out of almost anything, heavy charge out of light attacks.
    if (this.alive && this.state !== 'dodge' && this.state !== 'transform' && this.state !== 'slam' && input.consume('dodge')) {
      if (this.startDodge(mx, mz)) return this.finish(dt);
    }
    if (this.alive && (this.state === 'free' || this.state === 'attack') && input.consume('stance')) this.cycleStance();

    switch (this.state) {
      case 'free': {
        if (this.whirlTime > 0) speed *= 0.8;
        this.locomote(dt, mx, mz, moving, speed);
        if (input.consume('gourd')) this.startDrink();
        else if (this.tryCast()) { /* cast started */ }
        else if (input.heavyHeld && this.whirlTime <= 0) this.startCharge();
        else if (input.attackHeld && this.whirlTime <= 0) this.startAttack(mx, mz);
        break;
      }
      case 'attack': {
        const chain = this.chain();
        const c = chain[Math.min(this.combo, chain.length - 1)];
        const at = hitAt(c.move);
        if (k < at && this.lungeLeft > 0) {
          const step = Math.min(this.lungeLeft, (c.lunge * dt) / (this.dur * at));
          this.lungeLeft -= step;
          if (!this.targetInReach(1.1)) this.game.level.move(this.pos, Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, this.radius);
        }
        if (!this.hitDone && k >= at) {
          this.hitDone = true;
          this.doComboHit(c, this.combo === chain.length - 1);
        }
        this.trail.active = k > at - 0.25 && k < at + 0.2;
        if (input.attackHeld && k > 0.4) this.queued = true;
        if (canAct && input.heavyHeld) { this.startCharge(true); break; }
        if (canAct && this.tryCast()) break;
        if (k >= 1) {
          const next = (this.combo + 1) % chain.length;
          this.comboReset = 0.5;
          this.trail.active = false;
          if (this.queued || input.attackHeld) {
            this.combo = next;
            this.startAttack(mx, mz, true);
          } else {
            this.combo = next;
            this.setState('free');
          }
        }
        this.speedNow = 0;
        break;
      }
      case 'charge': {
        this.chargeT += dt * s.chargeRate * (1 + (this.stance === 'smash' ? rank(this.talents, 'heavyMastery') * 0.1 : 0));
        this.yaw = approachAngle(this.yaw, this.aimYaw(mx, mz), dt * 6);
        const lvl = Math.min(3, Math.floor(this.chargeT / 0.45));
        if (lvl > this.chargeLevel) {
          this.chargeLevel = lvl;
          this.game.vfx.shockwave(this.pos, 1.5 + lvl * 0.6, COLORS.gold, 0.35);
          this.game.audio.play('chargeLevel');
          this.game.rumble(0.2 + lvl * 0.1, 80);
        }
        if (Math.random() < 0.4 + this.chargeLevel * 0.2) {
          this.rig.staffTip.getWorldPosition(this.tmp);
          this.game.vfx.sparks.emit(this.tmp.x, this.tmp.y, this.tmp.z, { count: 1 + this.chargeLevel, radius: 0.3, speed: [0.5, 2], up: [0.5, 2], gravity: -1, life: [0.2, 0.5], color: COLORS.goldHot, color2: COLORS.gold });
        }
        if (!input.heavyHeld || this.chargeT > 2.6) this.releaseHeavy();
        this.speedNow = 0;
        break;
      }
      case 'heavy': {
        const hm = STANCES[this.heavyStance].heavy;
        const at = hitAt(hm);
        if (this.heavyStance === 'thrust') {
          // Lunge: cover the distance before the blow, untouchable while flying through the line.
          if (k < at && this.lungeLeft > 0) {
            const step = Math.min(this.lungeLeft, (this.lungeTotal * dt) / (this.dur * at));
            this.lungeLeft -= step;
            this.game.level.move(this.pos, Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, this.radius);
            this.invuln = Math.max(this.invuln, 0.05);
            if (Math.random() < 0.6) this.game.vfx.dustBurst(this.pos, 2, 0.4);
          }
        } else if (this.heavyStance === 'smash' && k < at) {
          this.game.level.move(this.pos, Math.sin(this.yaw) * 4 * dt, Math.cos(this.yaw) * 4 * dt, this.radius);
        }
        this.trail.active = k > at - 0.22 && k < at + 0.12;
        if (!this.hitDone && k >= at) {
          this.hitDone = true;
          if (this.heavyStance === 'smash') this.doHeavyImpact();
          else if (this.heavyStance === 'pillar') this.doPillarCrash();
          else this.doThrustLunge();
        }
        if (k >= 1) { this.trail.active = false; this.setState('free'); }
        this.speedNow = 0;
        break;
      }
      case 'special': {
        this.updateSpecial(dt, k, mx, mz);
        this.speedNow = 0;
        break;
      }
      case 'dodge': {
        // The tail of a roll cancels straight into an attack, so dodge-and-counter feels instant.
        if (k > 0.6 && input.attackHeld) { this.startAttack(mx, mz); break; }
        if (k > 0.45 && input.heavyHeld) { this.startCharge(true); break; }
        const sp = (18 * (1 - k) + 3) * (this.game.journey.has('crowFeather') ? 1.15 : 1);
        this.game.level.move(this.pos, this.dodgeDir.x * sp * dt, this.dodgeDir.y * sp * dt, this.radius);
        if (s.powers.has('fireTrail')) {
          this.fireTrailTimer -= dt;
          if (this.fireTrailTimer <= 0) {
            this.fireTrailTimer = 0.06;
            this.game.addHazard(this.pos.clone(), 1.4, 2.5, this.rollDamage(0.35, true).amount, 'player');
          }
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'drink': {
        this.locomote(dt, mx, mz, moving, speed * 0.35);
        this.showGourd(k > 0.06 && k < 0.92);
        if (!this.hitDone && k >= hitAt(DRINK)) {
          this.hitDone = true;
          if (DRINKS[this.game.journey.s.drink].regen) this.healLeft = s.maxHp * s.gourdHeal;
          else this.heal(s.maxHp * s.gourdHeal);
          this.game.journey.onDrink();
          this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1, this.pos.z, { count: 24, radius: 0.8, speed: [0.3, 1.2], up: [1, 3], gravity: -1, life: [0.6, 1.2], color: 0x8affb0, color2: 0xfff2b0 });
          this.game.audio.play('drink');
        }
        if (k >= 1) { this.showGourd(false); this.setState('free'); }
        break;
      }
      case 'flame': {
        const step = 0.3 / atkSpeed;
        if (this.flameHits < 3 && this.st >= step * this.flameHits + 0.08) {
          this.yaw = this.aimYaw(mx, mz);
          this.doFlameHit(this.flameHits);
          this.flameHits++;
        }
        this.trail.active = true;
        if (this.st >= step * 3 + 0.2) { this.trail.active = false; this.setState('free'); }
        break;
      }
      case 'slam': {
        const kk = Math.min(1, this.st / 0.5);
        this.pos.lerpVectors(this.slamFrom, this.slamTo, kk);
        this.pos.y = this.game.level.heightAt(this.pos.x, this.pos.z);
        this.trail.active = kk > 0.6;
        if (kk >= 1 && this.slamCount === 0) {
          this.slamCount = 1;
          this.doSlamImpact(1);
        }
        if (this.slamCount === 1 && s.powers.has('doubleSlam') && this.st > 0.85) {
          this.slamCount = 2;
          this.doSlamImpact(0.8);
        }
        if (this.st >= 0.5 + (s.powers.has('doubleSlam') ? 0.55 : 0.28)) { this.trail.active = false; this.setState('free'); }
        break;
      }
      case 'gale': {
        if (k >= hitAt(GALE) && !this.hitDone) {
          this.hitDone = true;
          const waves = s.powers.has('galeTriple') ? [-0.35, 0, 0.35] : [0];
          for (const off of waves) this.game.spawnGale(this.pos, this.yaw + off, this.rollDamage(1.4, true));
          this.game.audio.play('gale');
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'cast': {
        if (k >= hitAt(this.move ?? CAST) && !this.hitDone) {
          this.hitDone = true;
          this.doCastImpact();
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'transform': {
        if (k >= hitAt(TRANSFORM) && !this.hitDone) {
          this.hitDone = true;
          this.applyTransformLook(true);
          this.game.vfx.shockwave(this.pos, 8, COLORS.gold, 0.7, 0.2);
          this.game.vfx.beam(this.pos, COLORS.gold, 14, 1.2, 2.5);
          this.game.vfx.crack(this.pos, 4.5, 3);
          this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1, this.pos.z, { count: 60, speed: [4, 12], up: [2, 9], life: [0.4, 1], color: COLORS.goldHot, color2: COLORS.fire });
          this.game.strike({ origin: this.pos, yaw: 0, range: 7, halfArc: Math.PI, mult: 2.5, knock: 4, skill: true, color: COLORS.gold, stagger: true });
          this.game.camRig.shake(0.7, 0.5);
          this.game.rumble(0.8, 300);
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'dead':
        break;
    }

    // Golden Whirlwind runs alongside free movement.
    if (this.whirlTime > 0) {
      this.whirlTime -= dt;
      this.whirlTick -= dt;
      this.trail.active = true;
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
        this.trail.active = false;
      }
    }
    this.finish(dt);
  }

  private finish(dt: number) {
    if (this.transformed && Math.random() < 0.7) {
      this.rig.staffTip.getWorldPosition(this.tmp);
      this.game.vfx.sparks.emit(this.tmp.x, this.tmp.y, this.tmp.z, { count: 1, speed: [0, 1], up: [0.5, 2], gravity: -1, life: [0.2, 0.5], color: COLORS.fire, color2: COLORS.fireHot, size: [0.2, 0.4] });
    }
    this.animate(dt);
    this.root.rotation.y = this.yaw;
    this.shadow.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    this.ring.position.set(this.pos.x, this.pos.y + 0.035, this.pos.z);
    const tgt = this.aimTarget as { pos: THREE.Vector3; alive?: boolean; radius?: number } | null;
    this.marker.visible = !!tgt && tgt.alive !== false && (this.state === 'attack' || this.state === 'charge' || this.state === 'heavy');
    if (tgt && this.marker.visible) {
      this.marker.position.set(tgt.pos.x, tgt.pos.y + 0.04, tgt.pos.z);
      this.marker.scale.setScalar((tgt.radius ?? 0.6) * 1.6 + Math.sin(this.game.time * 10) * 0.08);
    }
    // Weapon trail samples (world space, after the pose has been applied)
    this.root.updateMatrixWorld(true);
    this.rig.staffMid.getWorldPosition(this.tmp);
    this.rig.staffTip.getWorldPosition(this.tmp2);
    this.trail.setColors(this.transformed || this.state === 'flame' ? COLORS.fire : COLORS.gold, this.transformed || this.state === 'flame' ? COLORS.fireHot : COLORS.goldHot);
    this.trail.push(this.tmp, this.tmp2, this.game.time);
    this.trail.update(this.game.time);
    const glow = this.state === 'charge' ? 0.8 + this.chargeLevel * 0.6 : this.focus >= 3 ? 1.2 : 0;
    this.rig.goldMat.emissiveIntensity = (this.transformed ? 1.6 : 0.6) + glow * (0.7 + 0.3 * Math.sin(this.game.time * 14));
  }

  private locomote(dt: number, mx: number, mz: number, moving: boolean, speed: number) {
    if (moving) {
      this.game.level.move(this.pos, mx * speed * dt, mz * speed * dt, this.radius);
      if (this.whirlTime <= 0) this.yaw = approachAngle(this.yaw, yawOf(mx, mz), dt * 14);
      this.speedNow = lerp(this.speedNow, speed * Math.hypot(mx, mz), damp(10, dt));
    } else {
      this.speedNow = lerp(this.speedNow, 0, damp(10, dt));
    }
  }

  private startAttack(mx: number, mz: number, chained = false) {
    const chain = this.chain();
    if (!chained) this.combo = this.comboReset > 0 ? this.combo : 0;
    if (this.combo >= chain.length) this.combo = 0;
    const c = chain[this.combo];
    const atkSpeed = 1 + this.stats.attackSpeed + (this.transformed ? 0.3 : 0);
    this.setState('attack', c.move, comboDur(c) / atkSpeed);
    this.lungeLeft = c.lunge;
    this.yaw = this.aimYaw(mx, mz);
  }

  /** True when the auto-aim target (or any foe in front) is already within `d` of our reach. */
  private targetInReach(d: number) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const e of this.game.targets()) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < d + e.radius + this.radius && Math.abs(dx * fz - dz * fx) < e.radius + 0.6) return true;
    }
    return false;
  }

  /** `followUp`: started from a combo or a roll, so a quick tap becomes the stance special. */
  private startCharge(followUp = false) {
    this.setState('charge');
    this.followUp = followUp;
    this.chargeT = 0;
    this.chargeLevel = 0;
    this.trail.active = false;
    this.game.audio.play('heavyCharge');
  }

  private releaseHeavy() {
    const tap = this.chargeT < 0.2;
    if (tap && this.followUp && this.specialKnown && this.specialCd <= 0) {
      this.chargeLevel = 0;
      this.startSpecial();
      return;
    }
    this.heavyLevel = this.chargeLevel;
    this.heavyStance = this.stance;
    const hm = STANCES[this.stance].heavy;
    const rate = this.stance === 'smash' ? (tap ? 1.5 : 1.25) : this.stance === 'pillar' ? (tap ? 1.3 : 1.1) : (tap ? 1.4 : 1.2);
    this.setState('heavy', hm, (hm.to - hm.from) / rate);
    this.heavyFrom.copy(this.pos);
    if (this.stance === 'thrust') {
      this.lungeTotal = this.lungeLeft = 2.6 + this.heavyLevel * 1.6 + rank(this.talents, 'thrustMastery') * 1.5;
      this.game.vfx.dustBurst(this.pos, 8, 0.6);
    }
    this.chargeLevel = 0;
    this.game.audio.play('swingHeavy');
  }

  private startSpecial() {
    const sp: Special = this.stance === 'smash' ? 'resolute' : this.stance === 'pillar' ? 'sweep' : 'sting';
    this.special = sp;
    this.specialHits = 0;
    this.specialCd = STANCES[this.stance].specialCd;
    this.yaw = this.aimYaw(this.game.input.moveX, this.game.input.moveY);
    const atk = 1 + this.stats.attackSpeed * 0.5;
    if (sp === 'resolute') {
      this.setState('special', SPECIAL_MOVES.resolute, 0.62 / atk);
      this.lungeLeft = 1.6;
      this.forceCrit = this.game.time - this.lastPerfect < 1.5;
    } else if (sp === 'sweep') {
      this.setState('special', SPECIAL_MOVES.sweep, 0.7 / atk);
    } else {
      this.setState('special', SPECIAL_MOVES.sting, (STING_COUNT * STING_STEP + 0.25) / atk);
    }
    const col = new THREE.Color(STANCES[this.stance].color).getHex();
    this.game.vfx.flash(this.tmp.set(this.pos.x, this.pos.y + 1, this.pos.z), 1.4, col, 0.12);
    this.game.hud.floatText(this.pos, STANCES[this.stance].specialName, 'focus-pop', 0.8);
    this.game.audio.play('swingHeavy');
  }

  private updateSpecial(dt: number, k: number, mx: number, mz: number) {
    const col = new THREE.Color(STANCES[this.stance].color).getHex();
    const m = this.move!;
    if (this.special === 'sting') {
      const step = STING_STEP / (1 + this.stats.attackSpeed * 0.5);
      this.trail.active = true;
      if (this.specialHits < STING_COUNT && this.st >= step * this.specialHits + 0.05) {
        this.yaw = approachAngle(this.yaw, this.aimYaw(mx, mz), 0.6);
        const last = this.specialHits === STING_COUNT - 1;
        this.game.vfx.slash(this.pos, this.yaw + (Math.random() - 0.5) * 0.3, { radius: 4.6, arc: 0.3, tilt: (Math.random() - 0.5) * 0.6, colorA: col, colorB: COLORS.goldHot, dur: 0.16 });
        const hits = this.strikeWith({ origin: this.pos, yaw: this.yaw, range: 4.6, halfArc: 0.42, mult: last ? 1.1 : 0.55, knock: last ? 2.2 : 0.3, skill: false, color: COLORS.goldHot, stagger: last, poise: 18, burn: this.stats.powers.has('burn') || this.transformed }, 0.1);
        this.gainFocus(hits, hits > 0 ? 0.06 : 0);
        this.game.audio.play('swing');
        this.specialHits++;
      }
      if (k >= 1) { this.trail.active = false; this.setState('free'); }
      return;
    }
    const at = hitAt(m);
    if (this.special === 'resolute' && k < at && this.lungeLeft > 0) {
      const step = Math.min(this.lungeLeft, (1.6 * dt) / (this.dur * at));
      this.lungeLeft -= step;
      if (!this.targetInReach(1.2)) this.game.level.move(this.pos, Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, this.radius);
    }
    this.trail.active = k > at - 0.25 && k < at + 0.15;
    if (!this.hitDone && k >= at) {
      this.hitDone = true;
      const hd = 1 + this.stats.heavyDamage;
      if (this.special === 'resolute') {
        const p = this.tmp2.set(this.pos.x + Math.sin(this.yaw) * 2, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2).clone();
        this.game.vfx.slash(this.pos, this.yaw, { radius: 3.4, reverse: true, tilt: Math.PI / 2, height: 1.3, colorA: col, colorB: COLORS.goldHot, dur: 0.3 });
        this.game.vfx.shockwave(p, 3.2, col, 0.4, 0.16);
        this.game.vfx.crack(p, 2.2, 2.5, true);
        this.game.vfx.dustBurst(p, 12, 1.2);
        const hits = this.game.strike({ origin: p, yaw: this.yaw, range: 2.9, halfArc: Math.PI, mult: 3 * hd, knock: 3, skill: false, color: COLORS.goldHot, stagger: true, poise: 70, burn: this.transformed });
        if (hits > 0) {
          this.focus = Math.min(3, this.focus + 1);
          this.game.audio.play('focus');
        }
        this.forceCrit = false;
        this.game.audio.play('heavyHit');
        this.game.camRig.shake(0.45, 0.25);
        this.game.hitstop(0.08);
      } else {
        this.game.vfx.slash(this.pos, this.yaw + Math.PI, { radius: 5.2, arc: Math.PI * 1.98, colorA: col, colorB: COLORS.goldHot, dur: 0.34, height: 0.8 });
        this.game.vfx.shockwave(this.pos, 5.6, col, 0.45, 0.14);
        this.game.vfx.dustBurst(this.pos, 18, 2.4);
        this.game.strike({ origin: this.pos, yaw: 0, range: 5.2, halfArc: Math.PI, mult: 2.2 * hd, knock: 4.5, skill: false, color: COLORS.goldHot, stagger: true, poise: 80, burn: this.transformed });
        this.game.audio.play('whirl');
        this.game.camRig.shake(0.4, 0.25);
      }
      this.game.rumble(0.5, 140);
    }
    if (k >= 1) { this.trail.active = false; this.forceCrit = false; this.setState('free'); }
  }

  private startDodge(mx: number, mz: number) {
    if (this.dodgeCd > 0) return false;
    const swift = rank(this.talents, 'swiftness');
    this.forceCrit = false;
    this.setState('dodge', ROLL, 0.44 - swift * 0.02);
    this.dodgeCd = 0.5 * (1 - swift * 0.1) * (1 + this.stats.dodgeCd);
    this.perfectUsed = false;
    this.invuln = Math.max(this.invuln, 0.32);
    this.whirlTime = Math.min(this.whirlTime, 0.01);
    this.chargeLevel = 0;
    this.trail.active = false;
    this.showGourd(false);
    if (Math.hypot(mx, mz) > 0.15) this.dodgeDir.set(mx, mz).normalize();
    else this.dodgeDir.set(Math.sin(this.yaw), Math.cos(this.yaw));
    this.yaw = yawOf(this.dodgeDir.x, this.dodgeDir.y);
    this.game.vfx.dustBurst(this.pos, 8, 0.5);
    this.game.audio.play('dodge');
    this.combo = 0;
    return true;
  }

  private startDrink() {
    if (this.gourd <= 0) {
      this.game.hud.toast('The gourd is empty', '#c8b89a');
      return;
    }
    this.gourd--;
    this.setState('drink', DRINK, 1.25 / DRINKS[this.game.journey.s.drink].speed);
  }

  /** Mana cost of a spell after set bonuses. */
  spellMana(slot: number) {
    return Math.round(this.spellDef(slot).mana * (this.stats.sets.has('paleBone') ? 0.7 : 1));
  }

  /** Checks spell / transform presses. Returns true if a cast started. */
  private tryCast(): boolean {
    const input = this.game.input;
    if (input.consume('transform')) {
      if (!this.canTransform) {
        this.game.hud.toast('Learn "Awaken the Sage" in Self-Advance to transform', '#c8b89a');
        return false;
      }
      if (this.fury >= 100 && !this.transformed) {
        this.setState('transform', TRANSFORM, 1.5);
        this.invuln = 1;
        this.fury = 0;
        this.transformTime = this.stats.transformTime;
        this.game.audio.play('transform');
        this.game.hud.toast('Monkey King form awakened!', '#ffd46a');
        return true;
      }
      if (!this.transformed) this.game.hud.toast('Fury not full yet', '#aaa');
    }
    for (let i = 0; i < 4; i++) {
      if (!input.consume(`skill${i}` as 'skill0')) continue;
      const sk = this.spellDef(i);
      if (this.cooldowns[i] > 0) return false;
      const cost = this.spellMana(i);
      if (this.mana < cost) {
        this.game.hud.toast('Not enough mana', '#6fb0ff');
        return false;
      }
      this.mana -= cost;
      this.cooldowns[i] = this.spellCooldown(i);
      this.castSkill(sk.id);
      return true;
    }
    return false;
  }

  private castSkill(id: SpellId) {
    const input = this.game.input;
    this.yaw = this.aimYaw(input.moveX, input.moveY);
    this.trail.active = false;
    switch (id) {
      case 'whirl':
        this.whirlTime = 2.4;
        this.whirlTick = 0;
        this.whirlAura?.stop();
        this.whirlAura = this.game.vfx.aura(4.4);
        this.setState('free');
        break;
      case 'flame':
        this.setState('flame');
        this.flameHits = 0;
        this.game.audio.play('fire');
        break;
      case 'slam': {
        this.setState('slam', SLAM, 0.82);
        this.slamCount = 0;
        this.slamFrom.copy(this.pos);
        const dist = 5.5, step = 0.25;
        this.slamTo.copy(this.pos);
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
        this.setState('gale', GALE, 0.5);
        break;
      case 'immobilize':
      case 'ringfire':
        this.castSpell = id;
        this.setState('cast', id === 'ringfire' ? RING : CAST, 0.55);
        this.game.audio.play('swing');
        break;
    }
  }

  private doCastImpact() {
    if (this.castSpell === 'immobilize') {
      const c = this.tmp.set(this.pos.x + Math.sin(this.yaw) * 2.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2.5);
      this.game.immobilize(c, 6.5, this.game.journey.has('goldRope') ? 4.5 : 3);
    } else {
      const c = this.pos.clone();
      this.ringFire = { pos: c, r: 5, t: 6 };
      this.game.vfx.fireRing(c, 5, 6);
      this.game.vfx.shockwave(c, 5.5, COLORS.fire, 0.5);
      this.game.addHazard(c, 5, 6, this.rollDamage(0.9, true).amount, 'player');
      this.game.audio.play('ringfire');
      this.game.camRig.shake(0.3, 0.2);
    }
  }

  private gainFocus(hits: number, bonus = 0) {
    if (hits <= 0) return;
    const before = Math.floor(this.focus);
    this.focus = Math.min(3, this.focus + (Math.min(hits, 3) * 0.16 + bonus) * this.stats.focusGain);
    if (Math.floor(this.focus) > before) this.game.audio.play('focus');
  }

  private doComboHit(c: ComboHit, last: boolean) {
    const t = this.transformed;
    const stanceCol = new THREE.Color(STANCES[this.stance].color).getHex();
    const colA = t ? COLORS.fire : this.stance === 'smash' ? COLORS.gold : stanceCol;
    const colB = t ? COLORS.fireHot : COLORS.goldHot;
    const range = c.range * (t ? 1.2 : 1);
    const burn = this.stats.powers.has('burn') || t;
    const crit = (c.crit ?? 0) + (this.stance === 'thrust' ? rank(this.talents, 'thrustMastery') * 0.04 : 0);
    const base = { mult: c.mult, knock: c.knock, skill: false, color: colB, burn, stagger: c.stagger, poise: c.poise };
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let hits = 0;
    let impact: THREE.Vector3 | null = null;
    switch (c.shape) {
      case 'arc':
      case 'arcRev':
        this.game.vfx.slash(this.pos, this.yaw, { radius: range, arc: Math.min(Math.PI * 1.3, c.arc * 2), reverse: c.shape === 'arcRev', tilt: c.shape === 'arc' ? -0.15 : 0.15, colorA: colA, colorB: colB });
        this.game.audio.play('swing');
        hits = this.strikeWith({ ...base, origin: this.pos, yaw: this.yaw, range, halfArc: c.arc }, crit);
        break;
      case 'spin':
        this.game.vfx.slash(this.pos, this.yaw + Math.PI, { radius: range, arc: Math.PI * 1.98, colorA: colA, colorB: colB, dur: 0.3, height: 0.9 });
        this.game.audio.play('whirl');
        hits = this.strikeWith({ ...base, origin: this.pos, yaw: 0, range, halfArc: Math.PI }, crit);
        break;
      case 'crack': {
        this.game.vfx.slash(this.pos, this.yaw, { radius: Math.min(range, 4) * 0.8, reverse: true, tilt: Math.PI / 2, height: 1.3, colorA: colA, colorB: colB, dur: 0.3 });
        if (c.arc < 1) {
          // Narrow overhead crash: hits a long line in front.
          hits = this.strikeWith({ ...base, origin: this.pos, yaw: this.yaw, range, halfArc: Math.PI, line: 1.1 }, crit);
          for (let d = 1.6; d <= range; d += 1.4) this.game.vfx.crack(this.tmp2.set(this.pos.x + fx * d, this.pos.y, this.pos.z + fz * d), 0.9, 2, false);
          impact = this.tmp.set(this.pos.x + fx * range * 0.6, this.pos.y, this.pos.z + fz * range * 0.6);
        } else {
          impact = this.tmp.set(this.pos.x + fx * 2.2, this.pos.y, this.pos.z + fz * 2.2);
          this.game.vfx.crack(impact, 1.8, 2, false);
          hits = this.strikeWith({ ...base, origin: impact, yaw: this.yaw, range: 2.6 + Math.max(0, range - 3.9) * 0.5, halfArc: Math.PI }, crit);
        }
        this.game.vfx.shockwave(impact, 2.8, colA, 0.35);
        this.game.vfx.dustBurst(impact, 10, 1);
        this.game.audio.play('swingHeavy');
        this.game.camRig.shake(0.35, 0.2);
        break;
      }
      case 'stab':
      case 'lunge':
      case 'rise': {
        const rise = c.shape === 'rise';
        this.game.vfx.slash(this.pos, this.yaw, { radius: range, arc: rise ? 0.9 : 0.32, tilt: rise ? Math.PI / 2 : 0, reverse: rise, height: rise ? 1.2 : 1.05, colorA: colA, colorB: colB, dur: 0.2 });
        for (let d = 1; d <= range; d += 0.7) {
          if (Math.random() < 0.6) this.game.vfx.sparks.emit(this.pos.x + fx * d, this.pos.y + 1.05, this.pos.z + fz * d, { count: 1, radius: 0.15, speed: [0.5, 2], up: [0, 1], life: [0.15, 0.3], color: colB, color2: colA });
        }
        this.game.audio.play(c.shape === 'lunge' ? 'swingHeavy' : 'swing');
        hits = this.strikeWith({ ...base, origin: this.pos, yaw: this.yaw, range, halfArc: Math.PI, line: rise ? 1.3 : 0.9 }, crit);
        if (c.shape === 'lunge') this.game.camRig.shake(0.25, 0.15);
        break;
      }
      case 'kick':
        impact = this.tmp.set(this.pos.x + fx * 1.4, this.pos.y, this.pos.z + fz * 1.4);
        this.game.vfx.dustBurst(impact, 8, 0.7);
        this.game.vfx.shockwave(impact, 1.6, colA, 0.25);
        this.game.audio.play('heavyHit');
        hits = this.strikeWith({ ...base, origin: this.pos, yaw: this.yaw, range, halfArc: c.arc }, crit);
        break;
    }
    if (last && this.stats.resonance) {
      const at = impact ?? this.pos;
      this.game.vfx.shockwave(at, 5.5, COLORS.goldHot, 0.5, 0.15);
      this.game.strike({ origin: at, yaw: 0, range: 5, halfArc: Math.PI, mult: 0.8, knock: 1.5, skill: true, color: COLORS.goldHot, silentSwing: true });
    }
    this.gainFocus(hits, hits > 0 ? c.focus ?? 0 : 0);
    if (t) this.game.spawnFireWave(this.pos, this.yaw, this.rollDamage(0.6, false));
  }

  /** Yellow Wind four-piece: strong heavies loose three sand gales. */
  private windGales(level: number) {
    if (level < 2 || !this.stats.sets.has('yellowWind')) return;
    for (const off of [-0.35, 0, 0.35]) this.game.spawnGale(this.pos, this.yaw + off, this.rollDamage(1.0, true));
    this.game.audio.play('gale');
  }

  /** Spends all Focus; returns how many points were spent. */
  private spendFocus() {
    const spent = Math.floor(this.focus);
    this.focus -= spent;
    if (spent > 0) this.game.hud.floatText(this.pos, `Focus ×${spent}`, 'focus-pop', 0.9);
    return spent;
  }

  /** Pillar heavy: an overhead crash that splits the ground down a long line. */
  private doPillarCrash() {
    const L = this.heavyLevel;
    const spent = this.spendFocus();
    const len = 5 + L * 1.6 + spent * 0.8 + rank(this.talents, 'pillarMastery');
    const mult = (1.7 + 0.95 * L + 0.9 * spent) * (1 + this.stats.heavyDamage + rank(this.talents, 'pillarMastery') * 0.15);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const col = this.transformed ? COLORS.fire : 0x7ad0ff;
    let i = 0;
    for (let d = 1.4; d <= len; d += 1.1, i++) {
      const p = this.tmp2.set(this.pos.x + fx * d, this.pos.y, this.pos.z + fz * d);
      this.game.vfx.crack(p, 0.9 + L * 0.2, 3, L + spent > 0);
      if (i % 2 === 0) this.game.vfx.dustBurst(p, 4 + L * 2, 0.6);
    }
    const end = this.tmp.set(this.pos.x + fx * len, this.pos.y, this.pos.z + fz * len);
    this.game.vfx.shockwave(end, 2 + L * 0.6, col, 0.4, 0.16);
    this.game.vfx.flash(this.tmp2.set(this.pos.x + fx * 1.8, this.pos.y + 0.6, this.pos.z + fz * 1.8), 2 + L, COLORS.goldHot, 0.16);
    this.game.vfx.sparks.emit(this.pos.x + fx * 2, this.pos.y + 0.3, this.pos.z + fz * 2, { count: 16 + L * 10, radius: 1, speed: [3, 8], up: [3, 8], life: [0.3, 0.8], color: COLORS.goldHot, color2: col });
    this.game.debris.burst(end, 0x5e5a52, 5 + L * 3, 0.16, 1 + L * 0.2);
    if (L + spent >= 3) this.game.vfx.beam(end, col, 10, 0.7, 1.4);
    this.game.strike({ origin: this.pos, yaw: this.yaw, range: len, halfArc: Math.PI, line: 1.4 + L * 0.2, mult, knock: 2 + L, skill: false, color: COLORS.goldHot, burn: this.transformed, stagger: true, poise: 50 + L * 35 + spent * 25 });
    this.windGales(L);
    this.game.audio.play(L + spent >= 2 ? 'slam' : 'heavyHit');
    this.game.camRig.shake(0.45 + L * 0.15, 0.3);
    this.game.hitstop(0.07 + L * 0.03);
    this.game.rumble(0.45 + L * 0.2, 160 + L * 60);
  }

  /** Thrust heavy: the lunge has carried us through the line; everything along the path is pierced. */
  private doThrustLunge() {
    const L = this.heavyLevel;
    const spent = this.spendFocus();
    const from = this.heavyFrom;
    const len = Math.hypot(this.pos.x - from.x, this.pos.z - from.z) + 2.6;
    const mult = (1.3 + 0.85 * L + 0.85 * spent) * (1 + this.stats.heavyDamage);
    const col = this.transformed ? COLORS.fire : 0x9cff8a;
    this.game.vfx.slash(this.pos, this.yaw, { radius: 3.2, arc: 0.35, colorA: col, colorB: COLORS.goldHot, dur: 0.25 });
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (let d = 0; d <= len; d += 0.6) {
      this.game.vfx.sparks.emit(from.x + fx * d, from.y + 1, from.z + fz * d, { count: 2, radius: 0.2, speed: [0.3, 2], up: [0.2, 1.5], life: [0.2, 0.5], color: COLORS.goldHot, color2: col });
    }
    const tip = this.tmp.set(this.pos.x + fx * 2.2, this.pos.y, this.pos.z + fz * 2.2);
    this.game.vfx.shockwave(tip, 2 + L * 0.5, col, 0.35, 0.14);
    this.game.vfx.flash(this.tmp2.set(tip.x, tip.y + 1, tip.z), 1.6 + L * 0.5, COLORS.goldHot, 0.14);
    this.strikeWith({ origin: from, yaw: this.yaw, range: len, halfArc: Math.PI, line: 1.2, mult, knock: 1.5 + L, skill: false, color: COLORS.goldHot, burn: this.transformed, stagger: L > 0 || spent > 0, poise: 30 + L * 30 + spent * 25 },
      0.1 + L * 0.12 + rank(this.talents, 'thrustMastery') * 0.04);
    this.windGales(L);
    this.game.audio.play(L + spent >= 2 ? 'slam' : 'heavyHit');
    this.game.camRig.shake(0.3 + L * 0.12, 0.25);
    this.game.hitstop(0.06 + L * 0.03);
    this.game.rumble(0.35 + L * 0.2, 140 + L * 50);
  }

  private doHeavyImpact() {
    const L = this.heavyLevel;
    const spent = this.spendFocus();
    const at = this.tmp.set(this.pos.x + Math.sin(this.yaw) * 1.8, this.pos.y, this.pos.z + Math.cos(this.yaw) * 1.8).clone();
    const r = 2.8 + L * 0.8 + spent * 0.4;
    const mult = (1.6 + 0.9 * L + 0.9 * spent) * (1 + this.stats.heavyDamage);
    const col = this.transformed ? COLORS.fire : COLORS.gold;
    this.game.vfx.shockwave(at, r + 0.8, col, 0.45, 0.16);
    this.game.vfx.shockwave(at, r * 0.55, COLORS.goldHot, 0.3, 0.3);
    this.game.vfx.crack(at, 1.6 + L * 0.7 + spent * 0.3, 3.5, L + spent > 0);
    this.game.vfx.flash(this.tmp2.set(at.x, at.y + 0.6, at.z), 2 + L, COLORS.goldHot, 0.16);
    this.game.vfx.dustBurst(at, 14 + L * 6, 1.2 + L * 0.4);
    this.game.vfx.sparks.emit(at.x, at.y + 0.3, at.z, { count: 20 + L * 12, radius: 1, speed: [3, 9], up: [3, 9], life: [0.3, 0.8], color: COLORS.goldHot, color2: col });
    this.game.debris.burst(at, 0x5e5a52, 6 + L * 3, 0.16, 1 + L * 0.2);
    if (L + spent >= 3) this.game.vfx.beam(at, COLORS.gold, 10, 0.7, 1.6);
    this.game.strike({ origin: at, yaw: 0, range: r, halfArc: Math.PI, mult, knock: 2.5 + L, skill: false, color: COLORS.goldHot, burn: this.transformed, stagger: L > 0 || spent > 0, poise: 30 + L * 30 + spent * 25 });
    this.game.audio.play(L + spent >= 2 ? 'slam' : 'heavyHit');
    this.game.camRig.shake(0.4 + L * 0.15 + spent * 0.1, 0.3);
    this.game.hitstop(0.06 + L * 0.03);
    this.game.rumble(0.4 + L * 0.2, 150 + L * 60);
    if (L + spent >= 2) this.game.vfx.twinkle(at, r * 0.6, 6);
    this.windGales(L);
  }

  private doFlameHit(i: number) {
    this.game.vfx.flames(this.tmp.set(this.pos.x + Math.sin(this.yaw) * 2.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2.5), 1.8, 5);
    this.game.vfx.slash(this.pos, this.yaw, { radius: 5, arc: Math.PI * 1.1, reverse: i % 2 === 1, tilt: (i - 1) * 0.25, colorA: COLORS.fire, colorB: COLORS.fireHot, dur: 0.32 });
    this.game.vfx.sparks.emit(this.pos.x + Math.sin(this.yaw) * 2.5, this.pos.y + 1, this.pos.z + Math.cos(this.yaw) * 2.5, { count: 25, radius: 2, speed: [1, 4], up: [1, 4], life: [0.3, 0.7], color: COLORS.fire, color2: COLORS.fireHot, gravity: -1 });
    this.game.strike({ origin: this.pos, yaw: this.yaw, range: 5, halfArc: 1.5, mult: 1.15, knock: 1.2, skill: true, color: COLORS.fireHot, burn: true });
    this.game.audio.play('fire');
  }

  private doSlamImpact(scale: number) {
    const r = 5 * scale;
    this.game.vfx.shockwave(this.pos, r + 1, COLORS.gold, 0.5, 0.18);
    this.game.vfx.shockwave(this.pos, r * 0.6, COLORS.goldHot, 0.3, 0.3);
    this.game.vfx.crack(this.pos, 3 * scale, 3.5);
    this.game.vfx.flash(this.tmp.set(this.pos.x, this.pos.y + 0.6, this.pos.z), 2.5, COLORS.goldHot, 0.16);
    this.game.vfx.dustBurst(this.pos, 24, 2);
    this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 0.3, this.pos.z, { count: 30, radius: 1.5, speed: [3, 8], up: [3, 8], life: [0.3, 0.7], color: COLORS.goldHot, color2: COLORS.gold });
    this.game.debris.burst(this.pos, 0x5e5a52, 10, 0.18, 1.2);
    this.game.strike({ origin: this.pos, yaw: 0, range: r, halfArc: Math.PI, mult: 2.4 * scale, knock: 3, skill: true, color: COLORS.goldHot, burn: this.transformed, stagger: true });
    this.game.audio.play('slam');
    this.game.camRig.shake(0.6, 0.35);
    this.game.hitstop(0.08);
    this.game.rumble(0.7, 200);
  }

  private endTransform() {
    this.transformTime = 0;
    this.applyTransformLook(false);
    this.game.vfx.shockwave(this.pos, 4, COLORS.gold, 0.5);
    this.game.hud.toast('The transformation fades', '#d0c0a0');
  }

  private applyTransformLook(on: boolean) {
    // Golden-furred Great Sage: warm the whole palette and make the staff burn.
    const m = this.rig.character.mats;
    m.matte.color.setHex(on ? 0xffe2a0 : 0xffffff);
    m.matte.emissive.setHex(on ? 0x3a2000 : 0x000000);
    m.cloth.color.setHex(on ? 0xffd890 : 0xffffff);
    m.metal.color.setHex(on ? 0xffc860 : 0xffffff);
    m.metal.emissive.setHex(on ? 0x5a3000 : 0x000000);
    if (on) {
      m.armor.color.setHex(0xc89a3a);
      m.armor.emissive.setHex(0x5a3000);
      m.armor.emissiveIntensity = 1;
      this.rig.staffMat.color.setHex(0xffa040);
      this.rig.staffMat.emissive.setHex(0xff5010);
    } else {
      this.rig.staffMat.emissive.setHex(0x000000);
      this.rig.applyGear(this.equipped);
    }
    this.root.scale.setScalar(on ? 1.25 : 1);
    this.light.color.setHex(on ? 0xffc060 : 0xffb070);
    this.light.intensity = on ? 45 : 30;
    this.game.camRig.setZoom(on ? 1.12 : 1);
  }

  private showGourd(inHand: boolean) {
    const r = this.rig;
    r.gourdHand.visible = inHand;
    r.gourdHip.visible = !inHand;
    r.staff.visible = !inHand;
    r.staffBack.visible = inHand;
  }

  // -------------------------------------------------------------------------
  // Animation: gameplay state picks a clip window and its time; locomotion blends by speed
  // -------------------------------------------------------------------------

  private poseMove(m: Move, k: number, fade = 0.08) {
    this.anim.pose(m.clip, m.from + clamp(k, 0, 1) * (m.to - m.from), fade);
  }

  private animate(dt: number) {
    const r = this.rig;
    const a = this.anim;
    const k = this.st / this.dur;
    let spin = 0;
    switch (this.state) {
      case 'charge': {
        const cp = STANCES[this.stance].chargePose;
        a.pose(cp.clip, cp.t + Math.sin(this.game.time * 40) * 0.004 * (1 + this.chargeLevel), 0.12);
        break;
      }
      case 'special':
        if (this.special === 'sting' && this.move) {
          // Each stab replays the thrust window.
          const step = STING_STEP / (1 + this.stats.attackSpeed * 0.5);
          const u = this.specialHits >= STING_COUNT ? 1 : ((this.st - 0.05) % step) / step;
          this.poseMove(this.move, Math.max(0, u), 0.04);
        } else if (this.move) this.poseMove(this.move, k, 0.06);
        break;
      case 'flame': {
        const step = 0.3 / (1 + this.stats.attackSpeed);
        const i = Math.min(2, Math.floor(this.st / step));
        this.poseMove(FLAME[i], (this.st - i * step) / step, 0.05);
        break;
      }
      case 'slam': {
        // Leap phase stretched over the travel, then the landing at normal speed.
        const land = hitAt(SLAM);
        const u = this.st < 0.5 ? (this.st / 0.5) * land : land + ((this.st - 0.5) / Math.max(0.01, this.dur - 0.5)) * (1 - land);
        this.poseMove(SLAM, u, 0.06);
        break;
      }
      case 'free':
        if (this.whirlTime > 0) {
          this.poseMove(SPECIAL_MOVES.sweep, hitAt(SPECIAL_MOVES.sweep), 0.1);
          spin = this.game.time * 22;
        } else if (this.hurtT > 0) {
          this.poseMove(HURT, 1 - this.hurtT / (HURT.to - HURT.from), 0.05);
        } else if (a.playing) {
          a.release(0.18);
        }
        break;
      default:
        if (this.move) this.poseMove(this.move, k, this.state === 'dodge' ? 0.05 : 0.08);
    }
    r.model.rotation.y = spin;
    a.update(dt, this.state === 'free' || this.state === 'drink' ? this.speedNow : 0);
    // Footsteps: two per locomotion cycle, on grass in the forest and stone in the temple.
    const half = Math.floor(a.stridePhase * 2);
    if (this.speedNow > 1.2 && half !== this.lastStep && this.state === 'free') {
      this.game.audio.play(this.pos.z > -44 ? 'stepGrass' : 'stepStone');
    }
    this.lastStep = half;

    // Secondary motion: tail, sash tails and plumes trail behind movement.
    const t = this.game.time;
    const speedK = clamp(this.speedNow / 6.4, 0, 1.3);
    r.tail.rotation.y = Math.sin(t * 3) * 0.3;
    r.tail.rotation.x = Math.sin(t * 2.1) * 0.15 - speedK * 0.3;
    for (let i = 0; i < r.sashes.length; i++) {
      r.sashes[i].rotation.x = -(0.15 + speedK * 0.9 + Math.sin(t * 9 + i * 1.7) * 0.08 * (0.4 + speedK));
      r.sashes[i].rotation.z = Math.sin(t * 4.3 + i) * 0.08;
    }
    r.feathers.rotation.x = Math.sin(t * 2.4) * 0.04 - speedK * 0.12;

    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (!this.transformed) r.character.mats.matte.emissive.setRGB(this.hurtFlash > 0 ? 0.5 : 0, 0, 0);
    r.model.visible = !(this.invuln > 0.5 && this.state === 'free' && Math.floor(this.game.time * 12) % 2 === 0);
    this.light.position.set(this.pos.x, this.pos.y + 3.2, this.pos.z + 1);
  }
}
