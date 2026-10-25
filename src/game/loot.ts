import { chance, pick, rand, randInt } from '../engine/util';

export type Slot = 'weapon' | 'chest' | 'gloves' | 'boots' | 'relic';
export const SLOTS: Slot[] = ['weapon', 'chest', 'gloves', 'boots', 'relic'];
export const SLOT_NAMES: Record<Slot, string> = { weapon: 'Staff', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', relic: 'Relic' };

export const RARITY_NAMES = ['Common', 'Magic', 'Rare', 'Legendary', 'Mythic'] as const;
export const RARITY_COLORS = ['#e6e2d8', '#5aa8ff', '#c06bff', '#ffa424', '#ff3b3b'];
export const RARITY_HEX = [0xe6e2d8, 0x5aa8ff, 0xc06bff, 0xffa424, 0xff3b3b];

export type StatKey = 'damage' | 'damagePct' | 'hp' | 'armor' | 'crit' | 'attackSpeed' | 'skillDamage' | 'moveSpeed' | 'cdr' | 'lifeOnHit' | 'manaRegen';

export const STAT_LABELS: Record<StatKey, (v: number) => string> = {
  damage: (v) => `+${Math.round(v)} Damage`,
  damagePct: (v) => `+${Math.round(v * 100)}% Damage`,
  hp: (v) => `+${Math.round(v)} Life`,
  armor: (v) => `+${Math.round(v)} Armor`,
  crit: (v) => `+${(v * 100).toFixed(1)}% Critical Chance`,
  attackSpeed: (v) => `+${Math.round(v * 100)}% Attack Speed`,
  skillDamage: (v) => `+${Math.round(v * 100)}% Skill Damage`,
  moveSpeed: (v) => `+${Math.round(v * 100)}% Movement Speed`,
  cdr: (v) => `-${Math.round(v * 100)}% Cooldowns`,
  lifeOnHit: (v) => `+${Math.round(v)} Life per Hit`,
  manaRegen: (v) => `+${v.toFixed(1)} Mana per Second`,
};

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

export interface Item {
  id: number;
  name: string;
  slot: Slot;
  rarity: number;
  level: number;
  stats: Partial<Record<StatKey, number>>;
  power?: Power;
}

const BASES: Record<Slot, string[]> = {
  weapon: ['Iron Staff', 'Bronze Cudgel', 'Ruyi Rod', 'Thunder Pillar', 'Cloud Spear'],
  chest: ['Leather Vest', 'Scale Chestplate', 'Doom Chestplate', 'Monk Robe'],
  gloves: ['Wraps', 'Gauntlets', 'Doom Gauntlets', 'Tiger Claws'],
  boots: ['Sandals', 'Cloud Treaders', 'Wind Boots', 'Mountain Greaves'],
  relic: ['Jade Charm', 'Fire Heart', 'Spirit Gourd', 'Prayer Beads'],
};
const PREFIXES = ['Jade', 'Searing', 'Savage', 'Purified', 'Blazing', 'Ancient', 'Storm', 'Gilded', 'Moonlit', 'Wrathful', 'Cursed', 'Celestial'];
const EPITHETS = ['Mythic', 'Doomed', 'Heavenly', 'Demonic', 'Eternal', 'Thunderous', 'Shadow', 'Immortal'];
const SUFFIXES = ['of Embers', 'of the Peak', 'of Ruin', 'of the Monkey King', 'of Wind', 'of the Abyss', 'of Rain', 'of Fury'];

const SLOT_STATS: Record<Slot, StatKey[]> = {
  weapon: ['damagePct', 'crit', 'attackSpeed', 'skillDamage', 'lifeOnHit'],
  chest: ['hp', 'armor', 'manaRegen', 'skillDamage', 'damagePct'],
  gloves: ['attackSpeed', 'crit', 'damagePct', 'lifeOnHit', 'armor'],
  boots: ['moveSpeed', 'hp', 'armor', 'cdr', 'manaRegen'],
  relic: ['cdr', 'skillDamage', 'manaRegen', 'crit', 'hp'],
};

function rollStat(k: StatKey, level: number, q: number): number {
  const l = 1 + level * 0.25;
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

export function generateItem(level: number, rarity: number, slot: Slot = pick(SLOTS)): Item {
  const q = 1 + rarity * 0.25;
  const base = pick(BASES[slot]);
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
  const item: Item = { id: nextId++, name, slot, rarity, level, stats };
  if (rarity >= 3) item.power = pick(Object.keys(POWER_TEXT) as Power[]);
  if (rarity === 4 && chance(0.5)) stats.damagePct = (stats.damagePct ?? 0) + 0.15;
  return item;
}

/** Rough single-number value used for "better / worse" comparison. */
export function itemScore(it: Item | undefined): number {
  if (!it) return 0;
  const s = it.stats;
  return (
    (s.damage ?? 0) * 2 + (s.damagePct ?? 0) * 300 + (s.hp ?? 0) * 0.5 + (s.armor ?? 0) * 0.8 + (s.crit ?? 0) * 400 +
    (s.attackSpeed ?? 0) * 300 + (s.skillDamage ?? 0) * 200 + (s.moveSpeed ?? 0) * 200 + (s.cdr ?? 0) * 250 +
    (s.lifeOnHit ?? 0) * 3 + (s.manaRegen ?? 0) * 8 + (it.power ? 40 : 0)
  );
}

export function salvageValue(it: Item) {
  return Math.round((5 + it.level * 2) * (1 + it.rarity * it.rarity));
}

export interface Inventory {
  gold: number;
  bag: Item[];
  equipped: Partial<Record<Slot, Item>>;
}
export const BAG_SIZE = 30;
