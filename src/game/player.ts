import * as THREE from 'three';
import { approachAngle, clamp, damp, lerp, wrapAngle, yawOf } from '../engine/util';
import { buildMonkey, type MonkeyRig } from './models';
import { COLORS, Trail, makeBlob } from './vfx';
import type { Game } from './game';
import type { Inventory, Power, StatKey } from './loot';
import { DEFAULT_SPELLS, SPELLS, rank, type SpellDef, type SpellId, type Talents } from './progression';

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
}

// ---------------------------------------------------------------------------
// Keyframed poses
// ---------------------------------------------------------------------------

type V3 = [number, number, number];
interface Pose {
  legL: V3; legR: V3; armL: V3; armR: V3; torso: V3; head: V3; staff: V3; staffPos: V3;
  bodyY: number; bodyX: number; spin: number;
}
type Ease = 'lin' | 'in' | 'out' | 'inout' | 'back';
interface Key { t: number; p: Partial<Pose>; e?: Ease }
interface Clip { keys: Pose[]; times: number[]; eases: Ease[] }

const BASE: Pose = {
  legL: [0, 0, 0], legR: [0, 0, 0], armL: [-0.25, 0, -0.15], armR: [-0.55, 0, 0.12],
  torso: [0.06, 0, 0], head: [0, 0, 0], staff: [-1.25, 0.25, 0], staffPos: [0.32, 1.15, 0.15],
  bodyY: 0, bodyX: 0, spin: 0,
};
const ATK: V3 = [0, 1.12, 0.18];

const EASES: Record<Ease, (u: number) => number> = {
  lin: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  inout: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  back: (u) => 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2),
};

/** Each key inherits any channel it doesn't set from the previous key (the first from BASE). */
function clip(keys: Key[]): Clip {
  const poses: Pose[] = [];
  let prev = BASE;
  for (const k of keys) {
    const p = { ...prev, ...k.p } as Pose;
    poses.push(p);
    prev = p;
  }
  return { keys: poses, times: keys.map((k) => k.t), eases: keys.map((k) => k.e ?? 'inout') };
}

const lerp3 = (a: V3, b: V3, u: number, out: V3) => {
  out[0] = a[0] + (b[0] - a[0]) * u;
  out[1] = a[1] + (b[1] - a[1]) * u;
  out[2] = a[2] + (b[2] - a[2]) * u;
};
const V3_KEYS = ['legL', 'legR', 'armL', 'armR', 'torso', 'head', 'staff', 'staffPos'] as const;
const N_KEYS = ['bodyY', 'bodyX', 'spin'] as const;

function sample(c: Clip, u: number, out: Pose) {
  u = clamp(u, 0, 1);
  let i = 0;
  while (i < c.times.length - 2 && u > c.times[i + 1]) i++;
  const t0 = c.times[i], t1 = c.times[i + 1] ?? t0;
  const local = t1 > t0 ? clamp((u - t0) / (t1 - t0), 0, 1) : 1;
  const e = EASES[c.eases[i + 1] ?? 'lin'](local);
  const a = c.keys[i], b = c.keys[i + 1] ?? a;
  for (const k of V3_KEYS) lerp3(a[k], b[k], e, out[k]);
  for (const k of N_KEYS) out[k] = a[k] + (b[k] - a[k]) * e;
}
const newPose = (): Pose => ({
  legL: [0, 0, 0], legR: [0, 0, 0], armL: [0, 0, 0], armR: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0],
  staff: [0, 0, 0], staffPos: [0, 0, 0], bodyY: 0, bodyX: 0, spin: 0,
});

/** Light combo: R→L sweep, L→R sweep, spinning sweep, leaping overhead smash. */
const COMBO_CLIPS = [
  clip([
    { t: 0, p: { staffPos: ATK, staff: [-0.15, -2.0, 0.25], torso: [0.1, -0.7, 0], armR: [-1.3, 0, 0.5], armL: [-1.0, 0, -0.3], legL: [0.35, 0, 0], legR: [-0.25, 0, 0], bodyY: -0.05 } },
    { t: 0.32, p: { staff: [-0.2, -2.35, 0.3], torso: [0.12, -0.95, 0] }, e: 'out' },
    { t: 0.56, p: { staff: [-0.05, 1.9, -0.2], torso: [0.2, 0.85, 0], armR: [-1.5, 0, 0.1], bodyY: -0.1, legL: [0.55, 0, 0], legR: [-0.45, 0, 0] }, e: 'out' },
    { t: 1, p: { staff: [-0.3, 1.5, -0.1], torso: [0.1, 0.5, 0], bodyY: -0.04 } },
  ]),
  clip([
    { t: 0, p: { staffPos: ATK, staff: [-0.15, 2.0, -0.25], torso: [0.1, 0.7, 0], armR: [-1.4, 0, -0.2], armL: [-1.1, 0, -0.1], legL: [-0.25, 0, 0], legR: [0.35, 0, 0], bodyY: -0.05 } },
    { t: 0.3, p: { staff: [-0.2, 2.35, -0.3], torso: [0.12, 0.95, 0] }, e: 'out' },
    { t: 0.54, p: { staff: [-0.05, -1.9, 0.2], torso: [0.2, -0.85, 0], armR: [-1.4, 0, 0.6], bodyY: -0.1, legL: [-0.45, 0, 0], legR: [0.55, 0, 0] }, e: 'out' },
    { t: 1, p: { staff: [-0.3, -1.5, 0.1], torso: [0.1, -0.5, 0], bodyY: -0.04 } },
  ]),
  clip([
    { t: 0, p: { staffPos: [0, 1.1, 0], staff: [-0.08, 1.57, 0], armL: [0, 0, -1.25], armR: [0, 0, 1.25], bodyY: -0.1, legL: [0.35, 0, 0], legR: [-0.35, 0, 0], torso: [0.15, 0, 0] } },
    { t: 0.22, p: { spin: -0.5 }, e: 'out' },
    { t: 0.72, p: { spin: Math.PI * 2, bodyY: 0.1 }, e: 'inout' },
    { t: 1, p: { spin: Math.PI * 2, armL: [-0.4, 0, -0.4], armR: [-0.8, 0, 0.3], bodyY: 0 }, e: 'out' },
  ]),
  clip([
    { t: 0, p: { staffPos: ATK, staff: [-1.0, 0, 0], bodyY: -0.2, legL: [0.6, 0, 0], legR: [0.45, 0, 0], torso: [0.35, 0, 0], armR: [-1.2, 0, 0.1], armL: [-1.1, 0, -0.1] } },
    { t: 0.36, p: { bodyY: 1.3, staff: [-2.95, 0, 0], armR: [-2.9, 0, 0.1], armL: [-2.8, 0, -0.1], torso: [-0.35, 0, 0], legL: [-0.9, 0, 0], legR: [-0.5, 0, 0], bodyX: -0.15 }, e: 'out' },
    { t: 0.6, p: { bodyY: 0, staff: [0.7, 0, 0], armR: [-1.0, 0, 0.1], armL: [-0.9, 0, -0.1], torso: [0.6, 0, 0], legL: [0.75, 0, 0], legR: [-0.6, 0, 0], bodyX: 0.2 }, e: 'in' },
    { t: 1, p: { bodyY: -0.05, staff: [0.45, 0, 0], torso: [0.35, 0, 0], bodyX: 0.1 }, e: 'out' },
  ]),
];

interface ComboHit { dur: number; hitAt: number; range: number; arc: number; mult: number; knock: number; lunge: number }
const COMBO: ComboHit[] = [
  { dur: 0.36, hitAt: 0.46, range: 3.3, arc: 1.35, mult: 1.0, knock: 0.6, lunge: 2.4 },
  { dur: 0.36, hitAt: 0.44, range: 3.3, arc: 1.35, mult: 1.1, knock: 0.6, lunge: 2.4 },
  { dur: 0.48, hitAt: 0.5, range: 3.7, arc: Math.PI, mult: 1.3, knock: 1.4, lunge: 1.2 },
  { dur: 0.62, hitAt: 0.6, range: 3.8, arc: 0.9, mult: 2.1, knock: 2.6, lunge: 3.2 },
];

const CHARGE: Pose = { ...BASE, staffPos: ATK, staff: [-2.6, 0.25, 0], armR: [-2.9, 0, 0.25], armL: [-2.7, 0, -0.25], torso: [-0.25, 0.35, 0], legL: [0.6, 0, 0], legR: [-0.5, 0, 0], bodyY: -0.16 };
const HEAVY_CLIP = clip([
  { t: 0, p: CHARGE },
  { t: 0.26, p: { bodyY: 1.6, staff: [-3.05, 0, 0], torso: [-0.4, 0, 0], legL: [-1, 0, 0], legR: [-0.6, 0, 0] }, e: 'out' },
  { t: 0.44, p: { bodyY: 0, staff: [0.85, 0, 0], torso: [0.7, 0, 0], armR: [-0.9, 0, 0.1], armL: [-0.8, 0, -0.1], legL: [0.85, 0, 0], legR: [-0.75, 0, 0], bodyX: 0.3 }, e: 'in' },
  { t: 1, p: { bodyY: -0.08, staff: [0.6, 0, 0], torso: [0.45, 0, 0], bodyX: 0.2 }, e: 'out' },
]);
const HEAVY_TAP_CLIP = clip([
  { t: 0, p: { ...CHARGE, bodyY: -0.08 } },
  { t: 0.3, p: { bodyY: 0.45, staff: [-2.9, 0, 0], torso: [-0.3, 0, 0] }, e: 'out' },
  { t: 0.5, p: { bodyY: 0, staff: [0.8, 0, 0], torso: [0.6, 0, 0], armR: [-0.9, 0, 0.1], armL: [-0.8, 0, -0.1], legL: [0.7, 0, 0], legR: [-0.6, 0, 0], bodyX: 0.25 }, e: 'in' },
  { t: 1, p: { staff: [0.5, 0, 0], torso: [0.35, 0, 0], bodyX: 0.1 }, e: 'out' },
]);
const ROLL_CLIP = clip([
  { t: 0, p: { legL: [-1.3, 0, 0], legR: [-1.1, 0, 0], armL: [-1.1, 0, -0.2], armR: [-1.3, 0, 0.2], staff: [-0.4, 0.9, 0], torso: [0.5, 0, 0], head: [0.4, 0, 0] } },
  { t: 0.82, p: { bodyX: Math.PI * 2 }, e: 'inout' },
  { t: 1, p: { legL: [0.2, 0, 0], legR: [-0.2, 0, 0], torso: [0.15, 0, 0], head: [0, 0, 0] }, e: 'out' },
]);
const DRINK_CLIP = clip([
  { t: 0, p: {} },
  { t: 0.28, p: { armL: [-2.5, 0, 0.55], head: [-0.15, 0, 0], torso: [-0.05, 0, 0] }, e: 'out' },
  { t: 0.4, p: { head: [-0.5, 0, 0], torso: [-0.15, 0, 0] }, e: 'out' },
  { t: 0.78, p: { head: [-0.55, 0, 0] } },
  { t: 1, p: { armL: [-0.25, 0, -0.15], head: [0, 0, 0], torso: [0.06, 0, 0] }, e: 'inout' },
]);
const CAST_CLIP = clip([
  { t: 0, p: { staffPos: ATK, staff: [-1.6, 0, 0] } },
  { t: 0.38, p: { staff: [-2.9, 0, 0], armR: [-2.95, 0, 0.1], armL: [-2.6, 0, -0.3], bodyY: 0.2, torso: [-0.25, 0, 0] }, e: 'out' },
  { t: 0.55, p: { staff: [0.35, 0, 0], armR: [-1.3, 0, 0.1], armL: [-1.1, 0, -0.1], bodyY: -0.12, torso: [0.4, 0, 0], legL: [0.5, 0, 0], legR: [-0.4, 0, 0] }, e: 'in' },
  { t: 1, p: { staff: [0.1, 0, 0], torso: [0.2, 0, 0], bodyY: -0.04 } },
]);
const GALE_CLIP = clip([
  { t: 0, p: { staffPos: [0.1, 1.2, -0.35], staff: [0, 0, 0], torso: [-0.2, 0.5, 0], armR: [-1.0, 0, 0.1], legL: [-0.3, 0, 0], legR: [0.4, 0, 0] } },
  { t: 0.35, p: { staffPos: [0.1, 1.2, 0.7], torso: [0.35, -0.25, 0], armR: [-1.75, 0, 0.1], armL: [-1.4, 0, -0.1], legL: [0.6, 0, 0], legR: [-0.5, 0, 0] }, e: 'out' },
  { t: 1, p: { staffPos: [0.2, 1.15, 0.3], torso: [0.15, 0, 0] } },
]);
const TRANSFORM_CLIP = clip([
  { t: 0, p: {} },
  { t: 0.5, p: { bodyY: 1.3, armL: [-3.0, 0, -0.45], armR: [-3.0, 0, 0.45], staff: [-1.57, 0, 0], spin: Math.PI * 4, head: [-0.4, 0, 0] }, e: 'out' },
  { t: 1, p: { bodyY: 0, spin: Math.PI * 4, armL: [-0.6, 0, -0.6], armR: [-0.9, 0, 0.5], head: [0, 0, 0] }, e: 'in' },
]);
const DEATH_CLIP = clip([
  { t: 0, p: {} },
  { t: 0.25, p: { torso: [-0.5, 0, 0], head: [-0.4, 0, 0], legL: [0.4, 0, 0], legR: [-0.2, 0, 0] }, e: 'out' },
  { t: 1, p: { bodyX: -1.45, bodyY: 0.25, armL: [-2.6, 0, -0.4], armR: [-2.4, 0, 0.4], staff: [-0.2, 1.2, 0], legL: [0.2, 0, 0], legR: [-0.2, 0, 0] }, e: 'in' },
]);

type State = 'free' | 'attack' | 'charge' | 'heavy' | 'dodge' | 'cast' | 'flame' | 'slam' | 'gale' | 'drink' | 'transform' | 'dead';

export const BASE_TRANSFORM_DURATION = 15;
const ROLL_CENTER = 0.5;

export class Player {
  readonly rig: MonkeyRig;
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

  private st = 0;
  private dur = 1;
  private clip: Clip | null = null;
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
  private runPhase = 0;
  private hurtFlash = 0;
  private flinch = 0;
  private fireTrailTimer = 0;
  private readonly light: THREE.PointLight;
  private readonly shadow: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private readonly baseColors: Record<string, number>;
  private readonly pose = newPose();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private readonly game: Game) {
    this.rig = buildMonkey();
    this.root = this.rig.root;
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
    this.baseColors = {
      fur: this.rig.mats.fur.color.getHex(),
      cloth: this.rig.mats.cloth.color.getHex(),
      armor: this.rig.mats.armor.color.getHex(),
      staff: this.rig.mats.staff.color.getHex(),
    };
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

  computeStats(inv: Inventory): Stats {
    const t = this.talents;
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
    };
    for (const it of Object.values(inv.equipped)) {
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats) as [StatKey, number][]) {
        if (k === 'hp') s.maxHp += v;
        else s[k] += v;
      }
      if (it.power) s.powers.add(it.power);
    }
    if (s.powers.has('furyGain')) s.furyGain *= 1.6;
    s.cdr = Math.min(s.cdr, 0.5);
    this.stats = s;
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
    this.yaw = Math.PI;
    this.applyTransformLook(false);
    this.root.rotation.set(0, this.yaw, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.body.position.set(0, 0, 0);
    this.rig.gourdHand.visible = false;
    this.rig.gourdHip.visible = true;
  }

  private setState(s: State, c: Clip | null = null, dur = 1) {
    this.state = s;
    this.st = 0;
    this.clip = c;
    this.dur = dur;
    this.hitDone = false;
    this.queued = false;
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
    if (!this.alive) return 0;
    // Perfect dodge: getting "hit" in the first moments of a roll.
    if (this.state === 'dodge' && this.st < 0.24 && !this.perfectUsed) {
      this.perfectUsed = true;
      this.focus = Math.min(3, this.focus + 1);
      this.game.onPerfectDodge();
      return 0;
    }
    if (this.invuln > 0) return 0;
    let mult = this.transformed ? 0.6 : 1;
    if (this.ringFire && this.pos.distanceTo(this.ringFire.pos) < this.ringFire.r) mult *= 0.7;
    const reduced = Math.max(1, Math.round(amount * (100 / (100 + this.stats.armor * 1.2)) * mult));
    this.hp -= reduced;
    this.hurtFlash = 0.25;
    this.flinch = 1;
    this.game.audio.play('hurt');
    this.game.camRig.shake(0.25, 0.15);
    this.game.hud.damageFlash();
    this.game.rumble(0.35, 120);
    if (this.settingsNumbers()) this.game.hud.floatText(this.pos, `-${reduced}`, 'dmg player', 0.8);
    if (from && (this.state === 'free' || this.state === 'drink')) {
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
    this.setState('dead', DEATH_CLIP, 0.8);
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
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.flinch = Math.max(0, this.flinch - dt * 5);
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
        const c = COMBO[this.combo];
        if (k < c.hitAt) this.game.level.move(this.pos, Math.sin(this.yaw) * c.lunge * dt / this.dur * 0.4, Math.cos(this.yaw) * c.lunge * dt / this.dur * 0.4, this.radius);
        if (!this.hitDone && k >= c.hitAt) {
          this.hitDone = true;
          this.doComboHit(this.combo);
        }
        this.trail.active = k > c.hitAt - 0.25 && k < c.hitAt + 0.2;
        if (input.attackHeld && k > 0.4) this.queued = true;
        if (canAct && input.heavyHeld) { this.startCharge(); break; }
        if (canAct && this.tryCast()) break;
        if (k >= 1) {
          const next = (this.combo + 1) % COMBO.length;
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
        this.chargeT += dt * (1 + rank(this.talents, 'heavyMastery') * 0.1);
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
        const hitAt = this.clip === HEAVY_TAP_CLIP ? 0.5 : 0.44;
        if (k < hitAt) this.game.level.move(this.pos, Math.sin(this.yaw) * 4 * dt, Math.cos(this.yaw) * 4 * dt, this.radius);
        this.trail.active = k > hitAt - 0.22 && k < hitAt + 0.12;
        if (!this.hitDone && k >= hitAt) {
          this.hitDone = true;
          this.doHeavyImpact();
        }
        if (k >= 1) { this.trail.active = false; this.setState('free'); }
        this.speedNow = 0;
        break;
      }
      case 'dodge': {
        const sp = 18 * (1 - k) + 3;
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
        const show = k > 0.12 && k < 0.88;
        this.rig.gourdHand.visible = show;
        this.rig.gourdHip.visible = !show;
        if (!this.hitDone && k >= 0.42) {
          this.hitDone = true;
          this.healLeft = s.maxHp * s.gourdHeal;
          this.game.vfx.sparks.emit(this.pos.x, this.pos.y + 1, this.pos.z, { count: 24, radius: 0.8, speed: [0.3, 1.2], up: [1, 3], gravity: -1, life: [0.6, 1.2], color: 0x8affb0, color2: 0xfff2b0 });
          this.game.audio.play('drink');
        }
        if (k >= 1) this.setState('free');
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
        if (k >= 0.32 && !this.hitDone) {
          this.hitDone = true;
          const waves = s.powers.has('galeTriple') ? [-0.35, 0, 0.35] : [0];
          for (const off of waves) this.game.spawnGale(this.pos, this.yaw + off, this.rollDamage(1.4, true));
          this.game.audio.play('gale');
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'cast': {
        if (k >= 0.55 && !this.hitDone) {
          this.hitDone = true;
          this.doCastImpact();
        }
        if (k >= 1) this.setState('free');
        break;
      }
      case 'transform': {
        if (k >= 0.5 && !this.hitDone) {
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
    this.rig.mats.gold.emissiveIntensity = (this.transformed ? 1.6 : 0.6) + glow * (0.7 + 0.3 * Math.sin(this.game.time * 14));
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
    if (!chained) this.combo = this.comboReset > 0 ? this.combo : 0;
    const c = COMBO[this.combo];
    const atkSpeed = 1 + this.stats.attackSpeed + (this.transformed ? 0.3 : 0);
    this.setState('attack', COMBO_CLIPS[this.combo], c.dur / atkSpeed);
    this.yaw = this.aimYaw(mx, mz);
  }

  private startCharge() {
    this.setState('charge');
    this.chargeT = 0;
    this.chargeLevel = 0;
    this.trail.active = false;
    this.game.audio.play('heavyCharge');
  }

  private releaseHeavy() {
    this.heavyLevel = this.chargeLevel;
    const tap = this.chargeT < 0.2;
    this.setState('heavy', tap ? HEAVY_TAP_CLIP : HEAVY_CLIP, tap ? 0.5 : 0.6);
    this.chargeLevel = 0;
    this.game.audio.play('swingHeavy');
  }

  private startDodge(mx: number, mz: number) {
    if (this.dodgeCd > 0) return false;
    const swift = rank(this.talents, 'swiftness');
    this.setState('dodge', ROLL_CLIP, 0.42 - swift * 0.02);
    this.dodgeCd = 0.5 * (1 - swift * 0.1);
    this.perfectUsed = false;
    this.invuln = Math.max(this.invuln, 0.32);
    this.whirlTime = Math.min(this.whirlTime, 0.01);
    this.chargeLevel = 0;
    this.trail.active = false;
    this.rig.gourdHand.visible = false;
    this.rig.gourdHip.visible = true;
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
    this.setState('drink', DRINK_CLIP, 0.95);
  }

  /** Checks spell / transform presses. Returns true if a cast started. */
  private tryCast(): boolean {
    const input = this.game.input;
    if (input.consume('transform')) {
      if (this.fury >= 100 && !this.transformed) {
        this.setState('transform', TRANSFORM_CLIP, 0.95);
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
      if (this.mana < sk.mana) {
        this.game.hud.toast('Not enough mana', '#6fb0ff');
        return false;
      }
      this.mana -= sk.mana;
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
        this.setState('slam', COMBO_CLIPS[3], 0.82);
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
        this.setState('gale', GALE_CLIP, 0.38);
        break;
      case 'immobilize':
      case 'ringfire':
        this.castSpell = id;
        this.setState('cast', CAST_CLIP, 0.55);
        this.game.audio.play('swing');
        break;
    }
  }

  private doCastImpact() {
    if (this.castSpell === 'immobilize') {
      const c = this.tmp.set(this.pos.x + Math.sin(this.yaw) * 2.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2.5);
      this.game.immobilize(c, 6.5, 3);
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

  private doComboHit(i: number) {
    const c = COMBO[i];
    const t = this.transformed;
    const colA = t ? COLORS.fire : COLORS.gold;
    const colB = t ? COLORS.fireHot : COLORS.goldHot;
    const range = c.range * (t ? 1.2 : 1);
    let hits = 0;
    if (i < 2) {
      this.game.vfx.slash(this.pos, this.yaw, { radius: range, reverse: i === 1, tilt: i === 0 ? -0.15 : 0.15, colorA: colA, colorB: colB });
      this.game.audio.play('swing');
      hits = this.game.strike({ origin: this.pos, yaw: this.yaw, range, halfArc: c.arc, mult: c.mult, knock: c.knock, skill: false, color: colB, burn: this.stats.powers.has('burn') || t });
    } else if (i === 2) {
      this.game.vfx.slash(this.pos, this.yaw + Math.PI, { radius: range, arc: Math.PI * 1.98, colorA: colA, colorB: colB, dur: 0.3, height: 0.9 });
      this.game.audio.play('whirl');
      hits = this.game.strike({ origin: this.pos, yaw: 0, range, halfArc: Math.PI, mult: c.mult, knock: c.knock, skill: false, color: colB, burn: this.stats.powers.has('burn') || t });
    } else {
      this.game.vfx.slash(this.pos, this.yaw, { radius: range * 0.8, reverse: true, tilt: Math.PI / 2, height: 1.3, colorA: colA, colorB: colB, dur: 0.3 });
      this.tmp.set(this.pos.x + Math.sin(this.yaw) * 2.2, this.pos.y, this.pos.z + Math.cos(this.yaw) * 2.2);
      this.game.vfx.shockwave(this.tmp, 2.8, colA, 0.35);
      this.game.vfx.crack(this.tmp, 1.8, 2, false);
      this.game.vfx.dustBurst(this.tmp, 10, 1);
      this.game.audio.play('swingHeavy');
      hits = this.game.strike({ origin: this.tmp, yaw: this.yaw, range: 2.6, halfArc: Math.PI, mult: c.mult, knock: c.knock, skill: false, color: colB, burn: this.stats.powers.has('burn') || t, stagger: true });
      if (this.stats.resonance) {
        this.game.vfx.shockwave(this.tmp, 5.5, COLORS.goldHot, 0.5, 0.15);
        this.game.strike({ origin: this.tmp, yaw: 0, range: 5, halfArc: Math.PI, mult: 0.8, knock: 1.5, skill: true, color: COLORS.goldHot, silentSwing: true });
      }
      this.game.camRig.shake(0.35, 0.2);
    }
    this.gainFocus(hits, i === 3 && hits > 0 ? 0.25 : 0);
    if (t) this.game.spawnFireWave(this.pos, this.yaw, this.rollDamage(0.6, false));
  }

  private doHeavyImpact() {
    const L = this.heavyLevel;
    const spent = Math.floor(this.focus);
    this.focus -= spent;
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
    if (spent > 0) this.game.hud.floatText(this.pos, `Focus ×${spent}`, 'focus-pop', 0.9);
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
    const m = this.rig.mats;
    m.fur.color.setHex(on ? 0xeae6dc : this.baseColors.fur);
    m.cloth.color.setHex(on ? 0xd8b46a : this.baseColors.cloth);
    m.armor.color.setHex(on ? 0xc89a3a : this.baseColors.armor);
    m.armor.emissive.setHex(on ? 0x5a3000 : 0x000000);
    m.staff.color.setHex(on ? 0xffa040 : this.baseColors.staff);
    m.staff.emissive.setHex(on ? 0xff5010 : 0x000000);
    this.root.scale.setScalar(on ? 1.25 : 1);
    this.light.color.setHex(on ? 0xffc060 : 0xffb070);
    this.light.intensity = on ? 45 : 30;
    this.game.camRig.setZoom(on ? 1.12 : 1);
  }

  // -------------------------------------------------------------------------
  // Animation: keyframed clips for actions, procedural locomotion
  // -------------------------------------------------------------------------

  private locomotionPose(out: Pose) {
    const t = this.game.time;
    const speedK = clamp(this.speedNow / 6.4, 0, 1.3);
    const sw = Math.sin(this.runPhase);
    const b = BASE;
    out.legL[0] = sw * 0.9 * speedK; out.legL[1] = 0; out.legL[2] = 0;
    out.legR[0] = -sw * 0.9 * speedK; out.legR[1] = 0; out.legR[2] = 0;
    out.armL[0] = b.armL[0] - sw * 0.65 * speedK; out.armL[1] = 0; out.armL[2] = b.armL[2];
    out.armR[0] = b.armR[0] + sw * 0.25 * speedK; out.armR[1] = 0; out.armR[2] = b.armR[2];
    out.torso[0] = 0.06 + 0.22 * speedK + Math.sin(t * 2) * 0.025 * (1 - speedK);
    out.torso[1] = -sw * 0.12 * speedK;
    out.torso[2] = 0;
    out.head[0] = -0.1 * speedK; out.head[1] = Math.sin(t * 0.6) * 0.25 * (1 - speedK); out.head[2] = 0;
    out.staff[0] = -1.25 + speedK * 0.75 + Math.sin(t * 1.8) * 0.03;
    out.staff[1] = 0.25 - speedK * 0.6;
    out.staff[2] = speedK * 0.35;
    out.staffPos[0] = 0.32; out.staffPos[1] = 1.15 + Math.abs(sw) * 0.04 * speedK; out.staffPos[2] = 0.15;
    out.bodyY = Math.abs(sw) * 0.09 * speedK - 0.02 * speedK;
    out.bodyX = 0;
    out.spin = 0;
  }

  private animate(dt: number) {
    const r = this.rig;
    const p = this.pose;
    this.runPhase += dt * (3 + this.speedNow * 1.55);

    let fast = false;
    if (this.state === 'charge') {
      Object.assign(p, structuredCloneLite(CHARGE));
      p.bodyY += Math.sin(this.game.time * 40) * 0.01 * (1 + this.chargeLevel);
      p.torso[1] += this.chargeLevel * 0.08;
    } else if (this.state === 'flame') {
      const step = 0.3 / (1 + this.stats.attackSpeed);
      const i = Math.min(2, Math.floor(this.st / step));
      sample(COMBO_CLIPS[i % 2], clamp((this.st - i * step) / step, 0, 1) * 0.7 + 0.25, p);
      fast = true;
    } else if (this.clip) {
      sample(this.clip, this.st / this.dur, p);
      fast = true;
    } else {
      this.locomotionPose(p);
    }
    if (this.whirlTime > 0 && this.state === 'free') {
      p.staffPos[0] = 0; p.staffPos[1] = 1.1; p.staffPos[2] = 0;
      p.staff[0] = -0.05; p.staff[1] = Math.PI / 2; p.staff[2] = 0;
      p.armL[0] = 0; p.armL[2] = -1.2; p.armR[0] = 0; p.armR[2] = 1.2;
      p.spin = this.game.time * 22;
    }
    // Hurt flinch (additive)
    p.torso[0] -= this.flinch * 0.35;
    p.head[0] -= this.flinch * 0.2;

    const k = fast ? damp(32, dt) : damp(14, dt);
    const ease = (e: THREE.Euler, v: V3, kk = k) => {
      e.x += (v[0] - e.x) * kk;
      e.y += wrapAngle(v[1] - e.y) * kk;
      e.z += (v[2] - e.z) * kk;
    };
    ease(r.legL.rotation, p.legL);
    ease(r.legR.rotation, p.legR);
    ease(r.armL.rotation, p.armL);
    ease(r.armR.rotation, p.armR);
    ease(r.torso.rotation, p.torso);
    ease(r.head.rotation, p.head);
    // The staff snaps hard during swings so arcs stay crisp.
    ease(r.staff.rotation, p.staff, fast ? damp(45, dt) : k);
    r.staff.position.x += (p.staffPos[0] - r.staff.position.x) * k;
    r.staff.position.y += (p.staffPos[1] - r.staff.position.y) * k;
    r.staff.position.z += (p.staffPos[2] - r.staff.position.z) * k;

    // Body: flips/rolls rotate around the hips, not the feet.
    if (this.state === 'dodge') {
      const th = p.bodyX;
      r.body.rotation.x = th;
      r.body.position.set(0, ROLL_CENTER - ROLL_CENTER * Math.cos(th) + p.bodyY * 0.3, -ROLL_CENTER * Math.sin(th));
    } else {
      r.body.rotation.x += (p.bodyX - r.body.rotation.x) * k;
      r.body.position.x = 0;
      r.body.position.z += (0 - r.body.position.z) * k;
      r.body.position.y += (p.bodyY - r.body.position.y) * (fast ? damp(26, dt) : damp(18, dt));
    }
    if (p.spin !== 0) r.body.rotation.y = p.spin;
    else r.body.rotation.y += wrapAngle(0 - r.body.rotation.y) * damp(14, dt);

    const speedK = clamp(this.speedNow / 6.4, 0, 1.3);
    r.cape.rotation.x = 0.12 + speedK * 0.6 + (this.state === 'dodge' ? 0.8 : 0) + Math.sin(this.game.time * 9) * 0.06 * (0.3 + speedK);
    r.cape.rotation.z = Math.sin(this.game.time * 4.3) * 0.05;
    r.tail.rotation.y = Math.sin(this.game.time * 3) * 0.3;
    r.tail.rotation.x = Math.sin(this.game.time * 2.1) * 0.15;

    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (!this.transformed) r.mats.fur.emissive.setRGB(this.hurtFlash > 0 ? 0.6 : 0, 0, 0);
    r.body.visible = !(this.invuln > 0.5 && this.state === 'free' && Math.floor(this.game.time * 12) % 2 === 0);
    this.light.position.set(this.pos.x, this.pos.y + 3.2, this.pos.z + 1);
  }
}

function structuredCloneLite(p: Pose): Pose {
  return {
    legL: [...p.legL], legR: [...p.legR], armL: [...p.armL], armR: [...p.armR], torso: [...p.torso], head: [...p.head],
    staff: [...p.staff], staffPos: [...p.staffPos], bodyY: p.bodyY, bodyX: p.bodyX, spin: p.spin,
  };
}
