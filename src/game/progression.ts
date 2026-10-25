/**
 * Spells and the "Self-Advance" talent tree. Talent points come from levels
 * (one per level); spells are equipped into four slots from the menu.
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
  | 'vitality' | 'toughness' | 'swiftness'
  | 'might' | 'precision' | 'focusFlow' | 'heavyMastery' | 'resonance'
  | 'immobilize' | 'ringfire' | 'spellPower' | 'quickCast' | 'manaFlow'
  | 'gourdCharges' | 'gourdPotency'
  | 'furyMastery' | 'longForm';

export type Branch = 'Body' | 'Staff' | 'Spells' | 'Gourd' | 'Great Sage';

export interface TalentDef {
  id: TalentId;
  name: string;
  branch: Branch;
  max: number;
  desc: (rank: number) => string;
  minLevel?: number;
  requires?: TalentId;
}

export const TALENTS: TalentDef[] = [
  { id: 'vitality', name: 'Iron Bones', branch: 'Body', max: 5, desc: (r) => `+${30 * r} maximum Life` },
  { id: 'toughness', name: 'Stone Skin', branch: 'Body', max: 5, desc: (r) => `+${6 * r} Armor` },
  { id: 'swiftness', name: 'Cloud Feet', branch: 'Body', max: 3, desc: (r) => `+${4 * r}% Movement speed, faster dodge recovery` },
  { id: 'might', name: 'Staff Might', branch: 'Staff', max: 5, desc: (r) => `+${6 * r}% Damage` },
  { id: 'precision', name: 'Keen Eye', branch: 'Staff', max: 5, desc: (r) => `+${2 * r}% Critical chance` },
  { id: 'focusFlow', name: 'Flowing Focus', branch: 'Staff', max: 3, desc: (r) => `Light attacks build Focus ${25 * r}% faster` },
  { id: 'heavyMastery', name: 'Smash Stance', branch: 'Staff', max: 3, desc: (r) => `+${15 * r}% Heavy attack damage, charge ${10 * r}% faster`, requires: 'focusFlow' },
  { id: 'resonance', name: 'Resonance', branch: 'Staff', max: 1, desc: () => 'The final hit of your light combo releases a golden shockwave', minLevel: 3, requires: 'might' },
  { id: 'immobilize', name: 'Spell: Immobilize', branch: 'Spells', max: 1, desc: () => 'Learn Immobilize — freeze foes with a golden seal', minLevel: 2 },
  { id: 'ringfire', name: 'Spell: Ring of Fire', branch: 'Spells', max: 1, desc: () => 'Learn Ring of Fire — a burning circle that protects you', minLevel: 4 },
  { id: 'spellPower', name: 'Arcane Insight', branch: 'Spells', max: 5, desc: (r) => `+${8 * r}% Spell damage` },
  { id: 'quickCast', name: 'Quick Incantation', branch: 'Spells', max: 4, desc: (r) => `-${5 * r}% Spell cooldowns` },
  { id: 'manaFlow', name: 'Mana Spring', branch: 'Spells', max: 3, desc: (r) => `+${r} Mana per second` },
  { id: 'gourdCharges', name: 'Bigger Gourd', branch: 'Gourd', max: 2, desc: (r) => `+${r} Gourd ${r === 1 ? 'charge' : 'charges'}` },
  { id: 'gourdPotency', name: 'Fine Wine', branch: 'Gourd', max: 3, desc: (r) => `Gourd heals ${10 * r}% more` },
  { id: 'furyMastery', name: 'Rising Fury', branch: 'Great Sage', max: 3, desc: (r) => `Fury builds ${15 * r}% faster` },
  { id: 'longForm', name: 'Enduring Form', branch: 'Great Sage', max: 2, desc: (r) => `Monkey King form lasts ${3 * r}s longer`, requires: 'furyMastery' },
];
export const TALENT_BY_ID = Object.fromEntries(TALENTS.map((t) => [t.id, t])) as Record<TalentId, TalentDef>;

export type Talents = Partial<Record<TalentId, number>>;

export const rank = (t: Talents, id: TalentId) => t[id] ?? 0;
export const pointsSpent = (t: Talents) => Object.values(t).reduce((a, b) => a + (b ?? 0), 0);
export const pointsAvailable = (level: number, t: Talents) => level - pointsSpent(t);

export function canLearn(def: TalentDef, t: Talents, level: number) {
  if (rank(t, def.id) >= def.max) return 'Maxed';
  if (pointsAvailable(level, t) <= 0) return 'No points';
  if (def.minLevel && level < def.minLevel) return `Requires level ${def.minLevel}`;
  if (def.requires && rank(t, def.requires) === 0) return `Requires ${TALENT_BY_ID[def.requires].name}`;
  return null;
}

export const spellUnlocked = (id: SpellId, t: Talents) => !SPELLS[id].unlock || rank(t, SPELLS[id].unlock!) > 0;
