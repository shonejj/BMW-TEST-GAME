import { chance, pick, rand, randInt } from '../engine/util';

export type Slot = 'weapon' | 'chest' | 'gloves' | 'boots' | 'relic';
export const SLOTS: Slot[] = ['weapon', 'chest', 'gloves', 'boots', 'relic'];
export const SLOT_NAMES: Record<Slot, string> = { weapon: 'Staff', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', relic: 'Talisman' };

export const RARITY_NAMES = ['Common', 'Magic', 'Rare', 'Legendary', 'Mythic'] as const;
export const RARITY_COLORS = ['#e6e2d8', '#5aa8ff', '#c06bff', '#ffa424', '#ff3b3b'];
export const RARITY_HEX = [0xe6e2d8, 0x5aa8ff, 0xc06bff, 0xffa424, 0xff3b3b];
export const SET_COLOR = '#5ef08a';

export type StatKey =
  | 'damage' | 'damagePct' | 'hp' | 'armor' | 'crit' | 'attackSpeed' | 'skillDamage' | 'moveSpeed' | 'cdr' | 'lifeOnHit' | 'manaRegen'
  | 'heavyDamage' | 'focusGain' | 'dodgeCd' | 'maxMana' | 'gourdHeal';

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const sgn = (v: number) => (v < 0 ? '−' : '+');
/** Stat names; the sign is added by `statLine`. */
const STAT_TEXT: Record<StatKey, (v: number) => string> = {
  damage: (v) => `${Math.round(Math.abs(v))} Damage`,
  damagePct: (v) => `${pct(v)} Damage`,
  hp: (v) => `${Math.round(Math.abs(v))} Life`,
  armor: (v) => `${Math.round(Math.abs(v))} Armor`,
  crit: (v) => `${(Math.abs(v) * 100).toFixed(1)}% Critical Chance`,
  attackSpeed: (v) => `${pct(v)} Attack Speed`,
  skillDamage: (v) => `${pct(v)} Spell Damage`,
  moveSpeed: (v) => `${pct(v)} Movement Speed`,
  cdr: (v) => `${pct(v)} Cooldown Reduction`,
  lifeOnHit: (v) => `${Math.round(Math.abs(v))} Life per Hit`,
  manaRegen: (v) => `${Math.abs(v).toFixed(1)} Mana per Second`,
  heavyDamage: (v) => `${pct(v)} Heavy Attack Damage`,
  focusGain: (v) => `${pct(v)} Focus Gain`,
  dodgeCd: (v) => `${pct(v)} Dodge Recovery Time`,
  maxMana: (v) => `${Math.round(Math.abs(v))} Maximum Mana`,
  gourdHeal: (v) => `${pct(v)} Gourd Healing`,
};
/** Stats where a lower number is better. */
const LOWER_IS_BETTER = new Set<StatKey>(['dodgeCd']);
/** True when this value of the stat helps the player. */
export const statIsGood = (k: StatKey, v: number) => (LOWER_IS_BETTER.has(k) ? v < 0 : v > 0);
export const statLine = (k: StatKey, v: number) => `${sgn(v)}${STAT_TEXT[k](v)}`;
/** Old name kept for callers that only show positive rolls. */
export const STAT_LABELS: Record<StatKey, (v: number) => string> = Object.fromEntries(
  (Object.keys(STAT_TEXT) as StatKey[]).map((k) => [k, (v: number) => statLine(k, v)]),
) as Record<StatKey, (v: number) => string>;

export type Power = 'burn' | 'doubleSlam' | 'galeTriple' | 'whirlPull' | 'furyGain' | 'killMana' | 'fireTrail';
export const POWER_TEXT: Record<Power, string> = {
  burn: 'Your attacks set enemies ablaze.',
  doubleSlam: 'Cloud Slam strikes a second time.',
  galeTriple: 'Jade Gale fires three waves.',
  whirlPull: 'Golden Whirlwind pulls enemies inward.',
  furyGain: 'Fury builds 60% faster.',
  killMana: 'Kills restore 8 Mana.',
  fireTrail: 'Dodging leaves a trail of fire.',
};

export type SetId = 'pilgrim' | 'blackfeather' | 'yellowWind' | 'paleBone';

export interface Item {
  id: number;
  name: string;
  slot: Slot;
  rarity: number;
  level: number;
  /** Rolled affixes. */
  stats: Partial<Record<StatKey, number>>;
  /** Fixed trade-off of the base design (plus and minus), see BASE_TRAITS. */
  implicit?: Partial<Record<StatKey, number>>;
  power?: Power;
  set?: SetId;
  /** Tempering at a shrine: each step raises the item's positive stats by 8%. */
  plus?: number;
}

const BASES: Record<Slot, string[]> = {
  weapon: ['Iron Staff', 'Bronze Cudgel', 'Ruyi Rod', 'Thunder Pillar', 'Cloud Spear'],
  chest: ['Leather Vest', 'Scale Chestplate', 'Doom Chestplate', 'Monk Robe'],
  gloves: ['Wraps', 'Gauntlets', 'Doom Gauntlets', 'Tiger Claws'],
  boots: ['Sandals', 'Cloud Treaders', 'Wind Boots', 'Mountain Greaves'],
  relic: ['Jade Charm', 'Fire Heart', 'Spirit Gourd', 'Prayer Beads'],
};
/** Which base design (index into BASES[slot]) an item was rolled from, recovered from its name. */
export function baseIndex(it: { slot: Slot; name: string; set?: SetId }): number {
  if (it.set) {
    const p = SETS[it.set].pieces.find((x) => x.slot === it.slot);
    if (p) return p.base;
  }
  const i = BASES[it.slot].findIndex((b) => it.name.includes(b));
  return Math.max(0, i);
}
export const baseName = (slot: Slot, base: number) => BASES[slot][base];

/**
 * Every base design has a fixed character with a real trade-off: heavy armour protects but slows your
 * dodge, a spear crits but leaves you frail, a cudgel hits hard but swings slowly. `l` scales flat values
 * with item level.
 */
interface Trait { note: string; stats: (l: number) => Partial<Record<StatKey, number>> }
export const BASE_TRAITS: Record<Slot, Trait[]> = {
  weapon: [
    { note: 'Balanced', stats: () => ({}) },
    { note: 'Crushing but slow', stats: () => ({ heavyDamage: 0.25, attackSpeed: -0.08 }) },
    { note: 'A conduit for spells', stats: () => ({ skillDamage: 0.18, maxMana: 20, damagePct: -0.08 }) },
    { note: 'Massive and heavy', stats: () => ({ damagePct: 0.18, attackSpeed: -0.07, moveSpeed: -0.05 }) },
    { note: 'Glass edge: deadly, fragile', stats: (l) => ({ crit: 0.07, attackSpeed: 0.05, hp: -20 * l }) },
  ],
  chest: [
    { note: 'Light and quick', stats: (l) => ({ moveSpeed: 0.04, dodgeCd: -0.1, armor: -3 * l }) },
    { note: 'Sturdy', stats: (l) => ({ armor: 4 * l, moveSpeed: -0.02 }) },
    { note: 'Heavy plate: tough, sluggish', stats: (l) => ({ armor: 10 * l, hp: 20 * l, moveSpeed: -0.06, dodgeCd: 0.2, manaRegen: -1 }) },
    { note: 'Meditative, unarmoured', stats: (l) => ({ manaRegen: 1.5, skillDamage: 0.1, armor: -5 * l }) },
  ],
  gloves: [
    { note: 'Nimble', stats: (l) => ({ attackSpeed: 0.05, armor: -2 * l }) },
    { note: 'Guarded', stats: (l) => ({ armor: 5 * l, attackSpeed: -0.03 }) },
    { note: 'Brutal, distracting', stats: () => ({ heavyDamage: 0.15, focusGain: -0.1 }) },
    { note: 'Savage, reckless', stats: (l) => ({ crit: 0.04, lifeOnHit: 1.5 * l, hp: -15 * l }) },
  ],
  boots: [
    { note: 'Swift', stats: (l) => ({ moveSpeed: 0.06, armor: -2 * l }) },
    { note: 'Cloud-step', stats: (l) => ({ dodgeCd: -0.2, hp: -10 * l }) },
    { note: 'Wind-runner', stats: (l) => ({ moveSpeed: 0.08, cdr: 0.03, armor: -4 * l }) },
    { note: 'Rooted', stats: (l) => ({ armor: 6 * l, hp: 10 * l, moveSpeed: -0.05 }) },
  ],
  relic: [
    { note: 'Quickens spells', stats: () => ({ cdr: 0.06, maxMana: -10 }) },
    { note: 'Burning power, burning life', stats: (l) => ({ skillDamage: 0.15, hp: -20 * l }) },
    { note: 'Sweetens the gourd', stats: () => ({ gourdHeal: 0.08, damagePct: -0.04 }) },
    { note: 'Calms the mind', stats: () => ({ focusGain: 0.2, damagePct: -0.04 }) },
  ],
};

export interface SetDef {
  name: string;
  pieces: { slot: Slot; base: number; name: string }[];
  two: string;
  four: string;
  /** Stats granted by the two-piece bonus. */
  twoStats: Partial<Record<StatKey, number>>;
}
export const SETS: Record<SetId, SetDef> = {
  pilgrim: {
    name: "Destined Pilgrim",
    pieces: [{ slot: 'weapon', base: 0, name: "Pilgrim's Iron Staff" }, { slot: 'chest', base: 3, name: "Pilgrim's Robe" }, { slot: 'boots', base: 0, name: "Pilgrim's Sandals" }, { slot: 'relic', base: 3, name: "Pilgrim's Prayer Beads" }],
    two: '+12% Gourd Healing', twoStats: { gourdHeal: 0.12 },
    four: 'Perfect dodges restore 6% Life and 15 Mana',
  },
  blackfeather: {
    name: 'Blackfeather Regalia',
    pieces: [{ slot: 'weapon', base: 4, name: 'Blackfeather Spear' }, { slot: 'chest', base: 0, name: 'Blackfeather Mantle' }, { slot: 'gloves', base: 3, name: 'Blackfeather Talons' }, { slot: 'boots', base: 2, name: 'Blackfeather Striders' }],
    two: '+6% Critical Chance', twoStats: { crit: 0.06 },
    four: 'Critical hits build extra Focus and Fury',
  },
  yellowWind: {
    name: 'Yellow Wind Panoply',
    pieces: [{ slot: 'weapon', base: 3, name: 'Yellow Wind Pillar' }, { slot: 'chest', base: 1, name: 'Yellow Wind Scale' }, { slot: 'gloves', base: 1, name: 'Yellow Wind Gauntlets' }, { slot: 'boots', base: 3, name: 'Yellow Wind Greaves' }],
    two: '+25 Armor', twoStats: { armor: 25 },
    four: 'Heavy attacks at charge 2 or more release three sand gales',
  },
  paleBone: {
    name: 'Pale Bone Vestments',
    pieces: [{ slot: 'weapon', base: 2, name: 'Pale Bone Rod' }, { slot: 'chest', base: 2, name: 'Pale Bone Shroud' }, { slot: 'gloves', base: 2, name: 'Pale Bone Grips' }, { slot: 'relic', base: 1, name: 'Pale Bone Heart' }],
    two: '+15% Spell Damage', twoStats: { skillDamage: 0.15 },
    four: 'Spells cost 30% less Mana; kills restore 3% Life',
  },
};
/** The set each chapter's boss (and elites) drop. */
export const CHAPTER_SET: SetId[] = ['blackfeather', 'yellowWind', 'paleBone'];

const PREFIXES = ['Jade', 'Searing', 'Savage', 'Purified', 'Blazing', 'Ancient', 'Storm', 'Gilded', 'Moonlit', 'Wrathful', 'Cursed', 'Celestial'];
const EPITHETS = ['Mythic', 'Doomed', 'Heavenly', 'Demonic', 'Eternal', 'Thunderous', 'Shadow', 'Immortal'];
const SUFFIXES = ['of Embers', 'of the Peak', 'of Ruin', 'of the Great Sage', 'of Wind', 'of the Abyss', 'of Rain', 'of Fury'];

const SLOT_STATS: Record<Slot, StatKey[]> = {
  weapon: ['damagePct', 'crit', 'attackSpeed', 'skillDamage', 'lifeOnHit', 'heavyDamage'],
  chest: ['hp', 'armor', 'manaRegen', 'skillDamage', 'damagePct', 'maxMana'],
  gloves: ['attackSpeed', 'crit', 'damagePct', 'lifeOnHit', 'armor', 'heavyDamage', 'focusGain'],
  boots: ['moveSpeed', 'hp', 'armor', 'cdr', 'manaRegen', 'dodgeCd'],
  relic: ['cdr', 'skillDamage', 'manaRegen', 'crit', 'hp', 'focusGain', 'gourdHeal'],
};

const lvlScale = (level: number) => 1 + level * 0.25;

function rollStat(k: StatKey, level: number, q: number): number {
  const l = lvlScale(level);
  switch (k) {
    case 'damage': return rand(4, 8) * l * q;
    case 'damagePct': return rand(0.04, 0.1) * q;
    case 'hp': return rand(15, 30) * l * q;
    case 'armor': return rand(4, 10) * l * q;
    case 'crit': return rand(0.02, 0.05) * q;
    case 'attackSpeed': return rand(0.04, 0.09) * q;
    case 'skillDamage': return rand(0.06, 0.14) * q;
    case 'moveSpeed': return rand(0.03, 0.07) * q;
    case 'cdr': return rand(0.03, 0.07) * q;
    case 'lifeOnHit': return rand(1, 3) * l * q;
    case 'manaRegen': return rand(0.6, 1.6) * q;
    case 'heavyDamage': return rand(0.08, 0.16) * q;
    case 'focusGain': return rand(0.08, 0.16) * q;
    case 'dodgeCd': return -rand(0.06, 0.12) * q;
    case 'maxMana': return rand(10, 20) * q;
    case 'gourdHeal': return rand(0.04, 0.08) * q;
  }
}

let nextId = 1;
export function setNextItemId(n: number) {
  nextId = Math.max(nextId, n);
}

export function rollRarity(bias = 0): number {
  const r = Math.random() * 100 - bias;
  if (r < 0.6) return 4;
  if (r < 4.5) return 3;
  if (r < 16) return 2;
  if (r < 46) return 1;
  return 0;
}

function implicitFor(slot: Slot, base: number, level: number) {
  const out: Item['implicit'] = {};
  for (const [k, v] of Object.entries(BASE_TRAITS[slot][base].stats(lvlScale(level))) as [StatKey, number][]) out[k] = v;
  return out;
}

export function generateItem(level: number, rarity: number, slot: Slot = pick(SLOTS), baseIdx?: number): Item {
  const q = 1 + rarity * 0.25;
  const bi = baseIdx ?? randInt(0, BASES[slot].length - 1);
  const base = BASES[slot][bi];
  const stats: Item['stats'] = {};
  if (slot === 'weapon') stats.damage = rollStat('damage', level, q) + 6;
  if (slot === 'chest') stats.armor = rollStat('armor', level, q) + 5;
  const pool = [...SLOT_STATS[slot]];
  const affixes = [0, 1, 2, 3, 4][rarity];
  for (let i = 0; i < affixes && pool.length; i++) {
    const k = pool.splice(randInt(0, pool.length - 1), 1)[0];
    stats[k] = (stats[k] ?? 0) + rollStat(k, level, q);
  }
  let name = base;
  if (rarity === 1) name = `${pick(PREFIXES)} ${base}`;
  else if (rarity === 2) name = `${pick(PREFIXES)} ${base} ${pick(SUFFIXES)}`;
  else if (rarity >= 3) name = `${pick(PREFIXES)} ${pick(EPITHETS)} ${base}`;
  const item: Item = { id: nextId++, name, slot, rarity, level, stats, implicit: implicitFor(slot, bi, level) };
  if (rarity >= 3) item.power = pick(Object.keys(POWER_TEXT) as Power[]);
  if (rarity === 4 && chance(0.5)) stats.damagePct = (stats.damagePct ?? 0) + 0.15;
  return item;
}

/** Items from saves made before base trade-offs existed get theirs on load. */
export function migrateItem(it: Item) {
  if (!it.implicit) it.implicit = implicitFor(it.slot, baseIndex(it), it.level);
  return it;
}

/** A piece of a named set: legendary-grade rolls on the set's fixed base. */
export function generateSetItem(level: number, set: SetId, slot?: Slot): Item {
  const def = SETS[set];
  const piece = slot ? def.pieces.find((p) => p.slot === slot) ?? pick(def.pieces) : pick(def.pieces);
  const it = generateItem(level, 3, piece.slot, piece.base);
  it.name = piece.name;
  it.set = set;
  delete it.power;
  return it;
}

/** All of an item's stats: rolled affixes (raised by tempering) plus its base trade-off. */
export function itemStats(it: Item): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  const temper = 1 + (it.plus ?? 0) * 0.08;
  for (const [k, v] of Object.entries(it.stats) as [StatKey, number][]) out[k] = (out[k] ?? 0) + (statIsGood(k, v) ? v * temper : v);
  for (const [k, v] of Object.entries(it.implicit ?? {}) as [StatKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

const WEIGHT: Record<StatKey, number> = {
  damage: 2, damagePct: 300, hp: 0.5, armor: 0.8, crit: 400, attackSpeed: 300, skillDamage: 200, moveSpeed: 200, cdr: 250,
  lifeOnHit: 3, manaRegen: 8, heavyDamage: 150, focusGain: 120, dodgeCd: -120, maxMana: 0.6, gourdHeal: 250,
};
/** Rough single-number value used for sorting. */
export function itemScore(it: Item | undefined): number {
  if (!it) return 0;
  let s = it.power ? 40 : 0;
  if (it.set) s += 30;
  for (const [k, v] of Object.entries(itemStats(it)) as [StatKey, number][]) s += v * WEIGHT[k];
  return s;
}

export function salvageValue(it: Item) {
  return Math.round((5 + it.level * 2) * (1 + it.rarity * it.rarity) * (1 + (it.plus ?? 0) * 0.3));
}

/** Will cost to temper an item one step at a shrine. */
export const temperCost = (it: Item) => Math.round((40 + it.level * 12) * (1 + it.rarity * 0.5) * Math.pow(1.6, it.plus ?? 0));
export const MAX_TEMPER = 5;

/** Equipped set pieces per set. */
export function setCounts(eq: Partial<Record<Slot, Item>>) {
  const n: Partial<Record<SetId, number>> = {};
  for (const it of Object.values(eq)) if (it?.set) n[it.set] = (n[it.set] ?? 0) + 1;
  return n;
}

export interface Inventory {
  gold: number;
  bag: Item[];
  equipped: Partial<Record<Slot, Item>>;
}
export const BAG_SIZE = 30;
