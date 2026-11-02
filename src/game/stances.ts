import type { TalentId } from './progression';

/**
 * Staff stances, after the three schools of the Destined One: Smash (overhead power), Pillar (wide sweeps,
 * a guarded charge) and Thrust (reach and precision). Each has its own light combo chain cut from the
 * motion-captured clips, its own charged heavy and a stance special.
 *
 * A Move is a window of a clip (seconds) and the clip time its blow connects. Hit frames were picked from
 * the staff-tip speed peak of each clip.
 */
export interface Move { clip: string; from: number; to: number; hit: number }
export const move = (clip: string, from: number, to: number, hit = to): Move => ({ clip, from, to, hit });
/** Fraction of a move's window at which its hit lands. */
export const hitAt = (m: Move) => (m.hit - m.from) / (m.to - m.from);

/** How a light hit lands: a horizontal arc, a full spin, an overhead crack, a narrow stab, an uppercut. */
export type HitShape = 'arc' | 'arcRev' | 'spin' | 'crack' | 'stab' | 'rise' | 'kick' | 'lunge';

export interface ComboHit {
  move: Move;
  /** Playback rate of the window. */
  rate: number;
  range: number;
  /** Half-angle of the hit cone (radians). */
  arc: number;
  mult: number;
  knock: number;
  /** Forward travel before the blow lands (m); skipped when a foe is already in reach. */
  lunge: number;
  shape: HitShape;
  /** Extra crit chance for this hit. */
  crit?: number;
  /** Breaks poise / interrupts regular foes. */
  stagger?: boolean;
  poise?: number;
  /** Extra Focus on hit. */
  focus?: number;
}

export type StanceId = 'smash' | 'pillar' | 'thrust';
export const STANCE_IDS: StanceId[] = ['smash', 'pillar', 'thrust'];

export interface StanceDef {
  id: StanceId;
  name: string;
  /** One-line flavour for the HUD / menus. */
  blurb: string;
  /** Talent that teaches the stance (Smash is known from the start). */
  unlock?: TalentId;
  chain: ComboHit[];
  /** Fifth strike, learned in the skill tree. */
  ext: ComboHit;
  extTalent: TalentId;
  /** Pose held while charging the heavy: clip and time. */
  chargePose: { clip: string; t: number };
  /** Release move of the charged heavy. */
  heavy: Move;
  specialName: string;
  specialTalent: TalentId;
  /** Cooldown of the stance special (s). */
  specialCd: number;
  color: string;
}

const c = (m: Move, rate: number, range: number, arc: number, mult: number, knock: number, lunge: number, shape: HitShape, o: Partial<ComboHit> = {}): ComboHit =>
  ({ move: m, rate, range, arc, mult, knock, lunge, shape, ...o });

export const STANCES: Record<StanceId, StanceDef> = {
  smash: {
    id: 'smash',
    name: 'Smash',
    blurb: 'Forehand, backhand, a low spin and a crushing overhead. Heavy: a leaping ground slam that spends Focus.',
    chain: [
      c(move('combo1', 0.02, 0.37, 0.19), 1.0, 3.3, 1.35, 1.0, 0.6, 0.5, 'arc'),
      c(move('combo2', 0.0, 0.43, 0.24), 1.05, 3.3, 1.35, 1.1, 0.6, 0.5, 'arcRev'),
      c(move('combo3', 0.1, 0.87, 0.47), 1.3, 3.7, Math.PI, 1.3, 1.4, 0.3, 'spin'),
      c(move('heavyA', 0.02, 0.73, 0.47), 1.1, 3.9, 1.5, 2.1, 2.6, 0.9, 'crack', { stagger: true, focus: 0.25 }),
    ],
    ext: c(move('slashC', 0.45, 1.0, 0.66), 1.0, 4.2, 1.7, 2.6, 3, 0.7, 'crack', { stagger: true, poise: 60, focus: 0.3 }),
    extTalent: 'smashExt',
    chargePose: { clip: 'groundPound', t: 0.04 },
    heavy: move('groundPound', 0.06, 0.95, 0.3),
    specialName: 'Resolute Strike',
    specialTalent: 'smashSpecial',
    specialCd: 4,
    color: '#ffc04a',
  },
  pillar: {
    id: 'pillar',
    name: 'Pillar',
    blurb: 'Slow, wide sweeps that hit everything around you. Heavy: a guarded charge, then a crash down a long line.',
    unlock: 'pillarStance',
    chain: [
      c(move('slashA', 0.0, 0.43, 0.25), 0.95, 3.8, 1.75, 1.05, 1.1, 0.4, 'arc', { poise: 20 }),
      c(move('slashB', 0.0, 0.53, 0.27), 0.95, 3.8, 1.75, 1.15, 1.1, 0.4, 'arcRev', { poise: 20 }),
      c(move('heavyC', 0.25, 0.7, 0.52), 0.9, 4.3, Math.PI, 1.45, 2.2, 0.2, 'spin', { poise: 30 }),
      c(move('swordAttack', 0.25, 0.78, 0.45), 0.95, 4.8, 0.55, 2.1, 2.4, 0.7, 'crack', { stagger: true, poise: 50, focus: 0.25 }),
    ],
    ext: c(move('uppercut', 0.0, 0.5, 0.22), 1.0, 3.6, 1.2, 1.9, 1.0, 0.5, 'rise', { stagger: true, poise: 60, focus: 0.3 }),
    extTalent: 'pillarExt',
    chargePose: { clip: 'swordAttack', t: 0.33 },
    heavy: move('swordAttack', 0.33, 0.85, 0.45),
    specialName: 'Sweeping Pillar',
    specialTalent: 'pillarSpecial',
    specialCd: 5,
    color: '#7ad0ff',
  },
  thrust: {
    id: 'thrust',
    name: 'Thrust',
    blurb: 'Quick, far-reaching stabs that crit often. Heavy: a charged lunge that pierces every foe in a line.',
    unlock: 'thrustStance',
    chain: [
      c(move('combo4', 0.0, 0.45, 0.27), 1.2, 4.5, 0.5, 0.8, 0.4, 0.7, 'stab', { crit: 0.1 }),
      c(move('kick', 0.0, 0.5, 0.2), 1.1, 2.7, 1.1, 0.9, 2.2, 0.4, 'kick', { poise: 25, stagger: true }),
      c(move('combo4', 0.03, 0.4, 0.27), 1.45, 4.5, 0.5, 0.85, 0.4, 0.7, 'stab', { crit: 0.12 }),
      c(move('dash', 0.1, 0.9, 0.33), 1.1, 3.4, 0.7, 1.8, 2.0, 2.6, 'lunge', { crit: 0.15, stagger: true, focus: 0.25 }),
    ],
    ext: c(move('uppercut', 0.0, 0.5, 0.22), 1.1, 4.0, 0.7, 1.6, 0.8, 0.6, 'rise', { crit: 0.15, stagger: true, poise: 40, focus: 0.3 }),
    extTalent: 'thrustExt',
    chargePose: { clip: 'dash', t: 0.22 },
    heavy: move('dash', 0.22, 0.95, 0.33),
    specialName: 'Thousand Stings',
    specialTalent: 'thrustSpecial',
    specialCd: 5,
    color: '#9cff8a',
  },
};

/** Stance specials. */
export const SPECIAL_MOVES = {
  resolute: move('heavyA', 0.02, 0.73, 0.47),
  sweep: move('combo3', 0.1, 0.87, 0.47),
  sting: move('combo4', 0.06, 0.32, 0.27),
};
/** Number of stabs in Thousand Stings, and the time between them. */
export const STING_COUNT = 6;
export const STING_STEP = 0.13;
