import { chance, pick } from '../engine/util';
import { CHAPTER_SET, generateItem, generateSetItem, rollRarity, type Item, type SetId } from './loot';

/**
 * Collectables beyond gear: curios (unique trinkets with play-changing effects), the gourd's drinks and
 * soaks, medicines (consumable pills) and celestial dew (gourd upgrades). Also the chest loot table the
 * world calls when the player opens a chest.
 */

// ---------------------------------------------------------------------------
// Curios
// ---------------------------------------------------------------------------

export type CurioId =
  | 'lotusSeed' | 'tigerFang' | 'goldRope' | 'crowFeather' | 'cinnabar' | 'boneBell' | 'windPearl' | 'goldBand' | 'ironBead' | 'bronzeMirror';

export interface CurioDef { id: CurioId; name: string; desc: string; lore: string }

export const CURIOS: Record<CurioId, CurioDef> = {
  lotusSeed: { id: 'lotusSeed', name: 'Jade Lotus Seed', desc: 'Perfect dodges heal 6% of your Life.', lore: 'Pressed into the palm of a dying abbot. It is still warm.' },
  tigerFang: { id: 'tigerFang', name: "Tiger's Fang", desc: 'Light attacks build 30% more Focus.', lore: 'Pulled from a war-tiger that was never quite an animal.' },
  goldRope: { id: 'goldRope', name: 'Golden Rope', desc: 'Immobilize holds foes 1.5s longer.', lore: 'A rope that once bound a mountain. Now it binds lesser things.' },
  crowFeather: { id: 'crowFeather', name: 'Black Crow Feather', desc: 'Dodge recovers 25% faster and rolls farther.', lore: 'It falls slower than a feather should.' },
  cinnabar: { id: 'cinnabar', name: 'Cinnabar Pearl', desc: 'Drinking from the gourd also restores 30 Mana and 15 Fury.', lore: 'An alchemist\'s failed pill of immortality. It succeeded at something else.' },
  boneBell: { id: 'boneBell', name: 'Bone Bell', desc: 'Every kill restores 2% of your Life.', lore: 'Its ring is too low to hear, but the dead hear it.' },
  windPearl: { id: 'windPearl', name: 'Wind-Calming Pearl', desc: '+8% Movement speed; heavy attacks charge 20% faster.', lore: 'Held in the mouth, it quiets the Yellow Wind for a breath.' },
  goldBand: { id: 'goldBand', name: 'Shard of the Golden Band', desc: 'Fury builds 40% faster, but your maximum Life is 10% lower.', lore: 'A fragment of the band that once tightened around a stubborn head.' },
  ironBead: { id: 'ironBead', name: 'Iron Prayer Bead', desc: '+15% Damage while your Life is above 80%.', lore: 'One bead from a rosary of a thousand. The monk who counted them never finished.' },
  bronzeMirror: { id: 'bronzeMirror', name: 'Cracked Bronze Mirror', desc: 'Critical hits deal 2.5× instead of 2× damage; −5% Critical chance.', lore: 'It shows your reflection a moment late.' },
};
export const CURIO_IDS = Object.keys(CURIOS) as CurioId[];
/** Curios guaranteed from each chapter boss (first kill). */
export const BOSS_CURIO: CurioId[] = ['crowFeather', 'tigerFang', 'boneBell'];

// ---------------------------------------------------------------------------
// Gourd: drinks change what a sip does, soaks add a lingering effect
// ---------------------------------------------------------------------------

export type DrinkId = 'coconutWine' | 'monkeyBrew' | 'jadeDew' | 'fireWine';
export interface DrinkDef { id: DrinkId; name: string; desc: string; heal: number; regen: boolean; speed: number; fury?: number; buff?: BuffId }
export const DRINKS: Record<DrinkId, DrinkDef> = {
  coconutWine: { id: 'coconutWine', name: 'Coconut Wine', desc: 'Restores 45% Life over a moment. The old monkey\'s favourite.', heal: 0.45, regen: true, speed: 1 },
  monkeyBrew: { id: 'monkeyBrew', name: 'Monkey Brew', desc: 'Restores 32% Life and fills 25 Fury.', heal: 0.32, regen: true, speed: 1, fury: 25 },
  jadeDew: { id: 'jadeDew', name: 'Jade Dew', desc: 'Restores 30% Life instantly; you drink 40% faster.', heal: 0.3, regen: false, speed: 1.4 },
  fireWine: { id: 'fireWine', name: 'Fire-Date Wine', desc: 'Restores 38% Life; +15% Damage for 12 seconds.', heal: 0.38, regen: true, speed: 1, buff: 'fireWine' },
};
export const DRINK_IDS = Object.keys(DRINKS) as DrinkId[];

export type SoakId = 'gojiBerry' | 'ginseng' | 'boneSnow' | 'tigerBone';
export interface SoakDef { id: SoakId; name: string; desc: string }
export const SOAKS: Record<SoakId, SoakDef> = {
  gojiBerry: { id: 'gojiBerry', name: 'Goji Berry', desc: 'After drinking: +10% Damage for 20 seconds.' },
  ginseng: { id: 'ginseng', name: 'Old Ginseng', desc: 'After drinking: restore 40 Mana.' },
  boneSnow: { id: 'boneSnow', name: 'Bone-Snow Lily', desc: 'After drinking: take 20% less damage for 15 seconds.' },
  tigerBone: { id: 'tigerBone', name: 'Tiger Bone Shavings', desc: 'After drinking: gain 1 Focus.' },
};
export const SOAK_IDS = Object.keys(SOAKS) as SoakId[];

/** Gourd upgrades with celestial dew: each level heals more and the gourd holds an extra charge every second level. */
export const GOURD_MAX = 4;
export const gourdLevelHeal = (lvl: number) => lvl * 0.06;
export const gourdLevelCharges = (lvl: number) => Math.floor(lvl / 2);
export const gourdUpgradeCost = (lvl: number) => ({ dew: 1, will: 150 + lvl * 250 });

// ---------------------------------------------------------------------------
// Medicines (consumables) and the timed buffs they grant
// ---------------------------------------------------------------------------

export type BuffId = 'tigerPill' | 'lotusPill' | 'ironPill' | 'clearMind' | 'fireWine' | 'gojiBerry' | 'boneSnow';
export const BUFF_NAMES: Record<BuffId, string> = {
  tigerPill: 'Tiger Tendon', lotusPill: 'Snow Lotus', ironPill: 'Iron Bone', clearMind: 'Clear Mind', fireWine: 'Fire Wine', gojiBerry: 'Goji', boneSnow: 'Bone-Snow',
};

export type PillId = 'tigerPill' | 'lotusPill' | 'ironPill' | 'clearMind' | 'incense';
export interface PillDef { id: PillId; name: string; desc: string; price: number; buff?: BuffId; dur?: number }
export const PILLS: Record<PillId, PillDef> = {
  tigerPill: { id: 'tigerPill', name: 'Tiger Tendon Pill', desc: '+20% Damage for 90 seconds.', price: 120, buff: 'tigerPill', dur: 90 },
  lotusPill: { id: 'lotusPill', name: 'Snow Lotus Pill', desc: 'Regenerate 2% Life per second for 30 seconds.', price: 90, buff: 'lotusPill', dur: 30 },
  ironPill: { id: 'ironPill', name: 'Iron Bone Pill', desc: '+40 Armor for 90 seconds.', price: 110, buff: 'ironPill', dur: 90 },
  clearMind: { id: 'clearMind', name: 'Clear-Mind Pill', desc: 'Fill Focus to three and double Focus gain for 45 seconds.', price: 150, buff: 'clearMind', dur: 45 },
  incense: { id: 'incense', name: 'Keeper\'s Incense', desc: 'If you fall while it burns, you keep your Will. Lasts until you fall or rest.', price: 200 },
};
export const PILL_IDS = Object.keys(PILLS) as PillId[];

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type Reward =
  | { kind: 'will'; amount: number }
  | { kind: 'item'; item: Item }
  | { kind: 'curio'; id: CurioId }
  | { kind: 'drink'; id: DrinkId }
  | { kind: 'soak'; id: SoakId }
  | { kind: 'pill'; id: PillId; count: number }
  | { kind: 'dew'; count: number };

export type ChestKind = 'normal' | 'legendary' | 'sealed';

/**
 * Loot for a chest (call from the world track when a chest opens):
 * - normal: Will, a medicine, sometimes a Magic+ item or a gourd soak;
 * - legendary: a Rare+ item (often a set piece), Will, and a curio, drink or soak not yet owned;
 * - sealed: celestial dew, a Legendary+ item or set piece, and a curio not yet owned.
 * `owned` lists curio/drink/soak ids already collected, so chests prefer new ones.
 */
export function rollChestLoot(kind: ChestKind, level: number, chapter: number, owned: ReadonlySet<string> = new Set()): Reward[] {
  const out: Reward[] = [];
  const willBase = 20 + level * 9;
  const fresh = <T extends string>(ids: readonly T[]) => {
    const left = ids.filter((i) => !owned.has(i));
    return left.length ? pick(left) : null;
  };
  const set: SetId = chance(0.5) ? 'pilgrim' : CHAPTER_SET[Math.min(chapter, CHAPTER_SET.length - 1)];
  if (kind === 'normal') {
    out.push({ kind: 'will', amount: Math.round(willBase * (1 + Math.random())) });
    out.push({ kind: 'pill', id: pick(['tigerPill', 'lotusPill', 'ironPill', 'clearMind'] as PillId[]), count: 1 });
    if (chance(0.45)) out.push({ kind: 'item', item: generateItem(level, Math.max(1, rollRarity(20))) });
    else if (chance(0.3)) {
      const s = fresh(SOAK_IDS);
      if (s) out.push({ kind: 'soak', id: s });
    }
  } else if (kind === 'legendary') {
    out.push({ kind: 'will', amount: Math.round(willBase * 3) });
    out.push({ kind: 'item', item: chance(0.5) ? generateSetItem(level, set) : generateItem(level, Math.max(2, rollRarity(40))) });
    const c = fresh(CURIO_IDS) ?? fresh(DRINK_IDS) ?? fresh(SOAK_IDS);
    if (c) out.push(CURIO_IDS.includes(c as CurioId) ? { kind: 'curio', id: c as CurioId } : DRINK_IDS.includes(c as DrinkId) ? { kind: 'drink', id: c as DrinkId } : { kind: 'soak', id: c as SoakId });
    else out.push({ kind: 'pill', id: 'incense', count: 1 });
  } else {
    out.push({ kind: 'dew', count: 1 });
    out.push({ kind: 'item', item: chance(0.6) ? generateSetItem(level, set) : generateItem(level, Math.max(3, rollRarity(60))) });
    const c = fresh(CURIO_IDS);
    if (c) out.push({ kind: 'curio', id: c as CurioId });
    out.push({ kind: 'will', amount: Math.round(willBase * 5) });
  }
  return out;
}

/** Medicine dropped by ordinary foes now and then (instead of a pile of junk gear). */
export function rollFieldPill(): PillId {
  return pick(['tigerPill', 'lotusPill', 'ironPill', 'lotusPill', 'clearMind'] as PillId[]);
}

export const rewardName = (r: Reward): string => {
  switch (r.kind) {
    case 'will': return `${r.amount} Will`;
    case 'item': return r.item.name;
    case 'curio': return CURIOS[r.id].name;
    case 'drink': return DRINKS[r.id].name;
    case 'soak': return SOAKS[r.id].name;
    case 'pill': return `${PILLS[r.id].name}${r.count > 1 ? ' ×' + r.count : ''}`;
    case 'dew': return 'Celestial Dew';
  }
};

