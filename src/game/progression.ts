/**
 * Spells and the "Self-Advance" skill tree. Sparks come from levels (one per level) and from relics of the
 * Great Sage won from chapter bosses. Nodes raise stats, but most of them unlock things: stances, combo
 * extensions, stance specials, spells, the Monkey King form and an extra curio slot.
 */

export type SpellId = 'whirl' | 'flame' | 'slam' | 'gale' | 'immobilize' | 'ringfire';

export interface SpellDef {
  id: SpellId;
  name: string;
  mana: number;
  cd: number;
  desc: string;
  /** Talent that must be learned before the spell can be equipped. */
  unlock?: TalentId;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  whirl: { id: 'whirl', name: 'Golden Whirlwind', mana: 30, cd: 7, desc: 'Spin your staff inside a golden ring, striking everything around you while you move.' },
  flame: { id: 'flame', name: 'Flaming Staff', mana: 25, cd: 5, desc: 'Ignite the staff and unleash three sweeping fire arcs that set foes ablaze.' },
  slam: { id: 'slam', name: 'Cloud Slam', mana: 30, cd: 8, desc: 'Leap forward and smash the ground, shattering foes and stone.' },
  gale: { id: 'gale', name: 'Jade Gale', mana: 20, cd: 4, desc: 'Send a piercing wave of jade wind that poisons everything it passes through.' },
  immobilize: { id: 'immobilize', name: 'Immobilize', mana: 35, cd: 12, desc: 'A golden seal freezes every foe in the area in place for 3 seconds (bosses briefly).', unlock: 'immobilize' },
  ringfire: { id: 'ringfire', name: 'Ring of Fire', mana: 40, cd: 14, desc: 'Summon a ring of flame around you for 6 seconds. Enemies inside burn; you take 30% less damage.', unlock: 'ringfire' },
};
export const SPELL_IDS = Object.keys(SPELLS) as SpellId[];
export const DEFAULT_SPELLS: SpellId[] = ['whirl', 'flame', 'slam', 'gale'];

export type TalentId =
  | 'vitality' | 'toughness' | 'swiftness' | 'curioSlot'
  | 'might' | 'precision' | 'focusFlow' | 'resonance'
  | 'heavyMastery' | 'smashExt' | 'smashSpecial'
  | 'pillarStance' | 'pillarMastery' | 'pillarExt' | 'pillarSpecial'
  | 'thrustStance' | 'thrustMastery' | 'thrustExt' | 'thrustSpecial'
  | 'immobilize' | 'ringfire' | 'spellPower' | 'quickCast' | 'manaFlow'
  | 'gourdCharges' | 'gourdPotency'
  | 'sageForm' | 'furyMastery' | 'longForm';

export type Branch = 'Body' | 'Staff' | 'Smash' | 'Pillar' | 'Thrust' | 'Spells' | 'Great Sage';
export const BRANCHES: [Branch, string][] = [
  ['Body', 'hp'], ['Staff', 'damage'], ['Smash', 'damage'], ['Pillar', 'armor'], ['Thrust', 'speed'], ['Spells', 'spell'], ['Great Sage', 'crit'],
];

/** What a node does, for the tree's colour coding: a stat bump, or an unlock that changes how you play. */
export type TalentKind = 'stat' | 'stance' | 'combo' | 'special' | 'spell' | 'passive';

export interface TalentDef {
  id: TalentId;
  name: string;
  branch: Branch;
  max: number;
  kind: TalentKind;
  desc: (rank: number) => string;
  minLevel?: number;
  requires?: TalentId;
}

export const TALENTS: TalentDef[] = [
  // Body
  { id: 'vitality', name: 'Iron Bones', branch: 'Body', kind: 'stat', max: 5, desc: (r) => `+${30 * r} maximum Life` },
  { id: 'toughness', name: 'Stone Skin', branch: 'Body', kind: 'stat', max: 5, desc: (r) => `+${6 * r} Armor` },
  { id: 'swiftness', name: 'Cloud Feet', branch: 'Body', kind: 'stat', max: 3, desc: (r) => `+${4 * r}% Movement speed, faster dodge recovery` },
  { id: 'gourdCharges', name: 'Bigger Gourd', branch: 'Body', kind: 'stat', max: 2, desc: (r) => `+${r} Gourd ${r === 1 ? 'charge' : 'charges'}` },
  { id: 'gourdPotency', name: 'Fine Wine', branch: 'Body', kind: 'stat', max: 3, desc: (r) => `Gourd heals ${10 * r}% more` },
  { id: 'curioSlot', name: 'Curio Pouch', branch: 'Body', kind: 'passive', max: 1, minLevel: 6, desc: () => 'A third curio slot: carry one more trinket with a play-changing effect' },
  // Staff (all stances)
  { id: 'might', name: 'Staff Might', branch: 'Staff', kind: 'stat', max: 5, desc: (r) => `+${6 * r}% Damage` },
  { id: 'precision', name: 'Keen Eye', branch: 'Staff', kind: 'stat', max: 5, desc: (r) => `+${2 * r}% Critical chance` },
  { id: 'focusFlow', name: 'Flowing Focus', branch: 'Staff', kind: 'stat', max: 3, desc: (r) => `Light attacks build Focus ${25 * r}% faster` },
  { id: 'resonance', name: 'Resonance', branch: 'Staff', kind: 'passive', max: 1, minLevel: 3, requires: 'might', desc: () => 'The final hit of every light combo releases a golden shockwave' },
  // Smash stance (known from the start)
  { id: 'heavyMastery', name: 'Smash Mastery', branch: 'Smash', kind: 'stat', max: 3, desc: (r) => `Smash heavy: +${15 * r}% damage, charge ${10 * r}% faster` },
  { id: 'smashExt', name: 'Falling Mountain', branch: 'Smash', kind: 'combo', max: 1, minLevel: 2, desc: () => 'Smash combo gains a fifth strike: a wind-up cleave that cracks the ground' },
  { id: 'smashSpecial', name: 'Resolute Strike', branch: 'Smash', kind: 'special', max: 1, minLevel: 4, requires: 'smashExt', desc: () => 'Smash special — tap Heavy during a combo or right after a dodge: a leaping overhead blow. +1 Focus on hit; after a perfect dodge it always crits' },
  // Pillar stance
  { id: 'pillarStance', name: 'Pillar Stance', branch: 'Pillar', kind: 'stance', max: 1, minLevel: 3, desc: () => 'Learn Pillar Stance: wide sweeping combos and a guarded charge (40% less damage, no flinching) that ends in a crashing line' },
  { id: 'pillarMastery', name: 'Rooted Pillar', branch: 'Pillar', kind: 'stat', max: 3, requires: 'pillarStance', desc: (r) => `Pillar heavy: +${15 * r}% damage, crash line ${r}m longer` },
  { id: 'pillarExt', name: 'Rising Pillar', branch: 'Pillar', kind: 'combo', max: 1, requires: 'pillarStance', desc: () => 'Pillar combo gains a fifth strike: a rising uppercut that launches and staggers' },
  { id: 'pillarSpecial', name: 'Sweeping Pillar', branch: 'Pillar', kind: 'special', max: 1, minLevel: 5, requires: 'pillarExt', desc: () => 'Pillar special — tap Heavy during a combo: a spinning sweep that hurls everything around you away and breaks poise' },
  // Thrust stance
  { id: 'thrustStance', name: 'Thrust Stance', branch: 'Thrust', kind: 'stance', max: 1, minLevel: 5, desc: () => 'Learn Thrust Stance: fast, long-reaching stabs that crit more often, and a charged lunge that pierces every foe in a line' },
  { id: 'thrustMastery', name: 'Piercing Will', branch: 'Thrust', kind: 'stat', max: 3, requires: 'thrustStance', desc: (r) => `Thrust: +${4 * r}% crit on light attacks, lunge ${r * 1.5}m farther` },
  { id: 'thrustExt', name: 'Hundred Steps', branch: 'Thrust', kind: 'combo', max: 1, requires: 'thrustStance', desc: () => 'Thrust combo gains a fifth strike: a rising stab that lifts the target' },
  { id: 'thrustSpecial', name: 'Thousand Stings', branch: 'Thrust', kind: 'special', max: 1, minLevel: 7, requires: 'thrustExt', desc: () => 'Thrust special — tap Heavy during a combo: a flurry of six rapid stabs, each one building Focus' },
  // Spells
  { id: 'immobilize', name: 'Spell: Immobilize', branch: 'Spells', kind: 'spell', max: 1, minLevel: 2, desc: () => 'Learn Immobilize — freeze foes with a golden seal' },
  { id: 'ringfire', name: 'Spell: Ring of Fire', branch: 'Spells', kind: 'spell', max: 1, minLevel: 4, desc: () => 'Learn Ring of Fire — a burning circle that protects you' },
  { id: 'spellPower', name: 'Arcane Insight', branch: 'Spells', kind: 'stat', max: 5, desc: (r) => `+${8 * r}% Spell damage` },
  { id: 'quickCast', name: 'Quick Incantation', branch: 'Spells', kind: 'stat', max: 4, desc: (r) => `-${5 * r}% Spell cooldowns` },
  { id: 'manaFlow', name: 'Mana Spring', branch: 'Spells', kind: 'stat', max: 3, desc: (r) => `+${r} Mana per second` },
  // Great Sage
  { id: 'sageForm', name: 'Awaken the Sage', branch: 'Great Sage', kind: 'spell', max: 1, minLevel: 2, desc: () => 'Unlock the Monkey King form: when Fury is full, transform into the golden Great Sage' },
  { id: 'furyMastery', name: 'Rising Fury', branch: 'Great Sage', kind: 'stat', max: 3, requires: 'sageForm', desc: (r) => `Fury builds ${15 * r}% faster` },
  { id: 'longForm', name: 'Enduring Form', branch: 'Great Sage', kind: 'stat', max: 2, requires: 'furyMastery', desc: (r) => `Monkey King form lasts ${3 * r}s longer` },
];
export const TALENT_BY_ID = Object.fromEntries(TALENTS.map((t) => [t.id, t])) as Record<TalentId, TalentDef>;

export type Talents = Partial<Record<TalentId, number>>;

export const rank = (t: Talents, id: TalentId) => t[id] ?? 0;
export const pointsSpent = (t: Talents) => Object.values(t).reduce((a, b) => a + (b ?? 0), 0);
/** Sparks: one per level, plus bonus sparks (relics of the Great Sage). */
export const pointsAvailable = (level: number, t: Talents, bonus = 0) => level + bonus - pointsSpent(t);

export function canLearn(def: TalentDef, t: Talents, level: number, bonus = 0) {
  if (rank(t, def.id) >= def.max) return 'Maxed';
  if (pointsAvailable(level, t, bonus) <= 0) return 'No points';
  if (def.minLevel && level < def.minLevel) return `Requires level ${def.minLevel}`;
  if (def.requires && rank(t, def.requires) === 0) return `Requires ${TALENT_BY_ID[def.requires].name}`;
  return null;
}

export const spellUnlocked = (id: SpellId, t: Talents) => !SPELLS[id].unlock || rank(t, SPELLS[id].unlock!) > 0;
