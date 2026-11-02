/**
 * The story of the Destined One, told across the three chapters: intros, boss entrances and deaths,
 * the aftermath of each chapter, the ending, and the lore notes scattered through the world.
 *
 * Original writing, inspired by Journey to the West.
 *
 * World track: place lore notes with `loreNotesForChapter(chapter)` and call `game.findLore(id)` (or the
 * module-level `registerLoreNote(id)`) when the player picks one up. The Journal tab shows found notes.
 */

export type Line = [speaker: string, text: string];

export const HERO = 'Destined One';
export const KEEPER = 'Old Keeper';

export interface Relic {
  id: string;
  name: string;
  /** Passive the relic grants once recovered, shown in the journal. */
  boon: string;
}

export interface ChapterStory {
  /** Opening cutscene: three lines (sky, approach, the hero arrives). */
  intro: [Line, Line, Line];
  /** Boss entrance: three lines. */
  bossIntro: [Line, Line, Line];
  /** Spoken as the boss falls. */
  bossDeath: [Line, Line];
  /** Aftermath cutscene: two lines. */
  after: [Line, Line];
  /** Subtitle on the victory screen. */
  victory: string;
  /** The relic of the Great Sage this chapter's boss was hoarding. */
  relic: Relic;
  /** Short summary for the Journal. */
  summary: string;
}

export const PROLOGUE = [
  'Long ago the Great Sage, Equal of Heaven, laid down his staff and walked away from the war with the sky.',
  'Heaven did not forgive him. His spirit was broken into relics and hidden in the high places of the world, and the yaoguai who found them grew fat on their power.',
  'Now a young monkey has left the Mountain of Flowers and Fruit with a borrowed staff and a gourd of wine. The old ones call it the Destined One.',
];

export const STORY: ChapterStory[] = [
  {
    intro: [
      ['', 'For forty days the bells of the Mountain-Sea Temple have been silent. The rain has not.'],
      [KEEPER, 'Something with black wings roosts in the main hall now. It keeps a burning eye in a cage of bone.'],
      [HERO, 'An eye that burns. Then it was his. I will take it back.'],
    ],
    bossIntro: [
      ['', 'Black feathers drift down like ash from a fire that never ends…'],
      ['Blackfeather Lord', 'The Sage\'s eye showed me every lie in this temple. Shall I tell you yours, little monkey?'],
      [HERO, 'Tell me after I take it from you.'],
    ],
    bossDeath: [
      ['Blackfeather Lord', 'It… saw you coming. It always saw you coming…'],
      [HERO, 'Then it was waiting for me.'],
    ],
    after: [
      [HERO, 'The Ember Eye. It is warm, like something still looking out of it.'],
      [KEEPER, 'The temple bells ring again. Go west, to the Yellow Wind. Something there has been listening for you.'],
    ],
    victory: 'The Blackfeather Lord has fallen. The Ember Eye is yours.',
    relic: { id: 'emberEye', name: 'The Ember Eye', boon: 'You see the gaps in every guard: +5% Critical chance.' },
    summary: 'The Mountain-Sea Temple fell silent when a crow-lord came to roost in its hall, feeding on the Ember Eye, a relic of the Great Sage. The Destined One climbed its rain-soaked stairs to take it back.',
  },
  {
    intro: [
      ['', 'West of the temple the mountain turns to sand, and the sand never settles.'],
      [KEEPER, 'The Yellow Wind Sage rules this ridge through his Tiger Vanguard. They say the wind here carries every word ever spoken.'],
      [HERO, 'Then let it carry this: I am coming for the Sage\'s ear.'],
    ],
    bossIntro: [
      ['', 'The wind stops. Every wolf on the ridge falls silent at once.'],
      ['Tiger Vanguard', 'I heard your footsteps from the far side of the dunes. I hear your heartbeat now. It is quick.'],
      [HERO, 'Listen closely, then. It is about to be the last thing you hear.'],
    ],
    bossDeath: [
      ['Tiger Vanguard', 'The wind… it has gone quiet… I cannot hear my brothers…'],
      [HERO, 'They were never your brothers. They were your hunting dogs.'],
    ],
    after: [
      [HERO, 'The Wind Ear. I can hear the snow falling, far to the north.'],
      [KEEPER, 'Then you hear the Bone Sanctum. Go carefully. The last relic is kept by one who has never let anything go.'],
    ],
    victory: 'The Tiger Vanguard has fallen. The Wind Ear is yours.',
    relic: { id: 'windEar', name: 'The Wind Ear', boon: 'You hear blows before they land: perfect dodges are easier to time.' },
    summary: 'On the Yellow Wind Ridge a war-tiger kept the Wind Ear, the Great Sage\'s hearing, and used it to hunt anyone who crossed the dunes. The Destined One crossed anyway.',
  },
  {
    intro: [
      ['', 'Past the ridge, the road climbs into snow, and then into silence.'],
      [KEEPER, 'The Pale Bone Lady was a pilgrim once. She found the Sage\'s heart frozen in the ice and could not stop holding it.'],
      [HERO, 'Two relics hum in my gourd. The third is calling them home.'],
    ],
    bossIntro: [
      ['', 'Frost creeps across the stone, and the bones in the walls begin to turn their heads.'],
      ['Pale Bone Lady', 'Everyone who climbs here wants something. I wanted only to keep one thing warm.'],
      [HERO, 'It was never yours to keep. Let it go.'],
    ],
    bossDeath: [
      ['Pale Bone Lady', 'So cold… it was so cold before I found it…'],
      [HERO, 'Rest now. The heart goes home.'],
    ],
    after: [
      ['', 'The Unbending Heart beats once in the Destined One\'s hand, and the Eye and the Ear answer it.'],
      ['Great Sage', 'You walked a long way for an old monkey\'s leftovers. Keep walking. The road west was never meant to end.'],
    ],
    victory: 'The Pale Bone Lady has fallen. The Unbending Heart is yours.',
    relic: { id: 'unbendingHeart', name: 'The Unbending Heart', boon: 'Your will does not break: +10% maximum Life.' },
    summary: 'In the Frozen Bone Sanctum a pilgrim turned bone-witch clung to the Unbending Heart, the last of the Great Sage\'s relics, and kept the dead standing guard around it.',
  },
];

/** Final words after the last chapter, before the road begins again on a higher Torment. */
export const ENDING = 'Three relics, one spirit. Somewhere above the clouds, Heaven takes note. The road begins again, harder than before.';

/** Flavour for each Torment (NG+) loop. */
export const tormentLine = (ng: number) =>
  ng <= 0 ? '' : ng === 1 ? 'Heaven sends its wardens down the mountain. The yaoguai grow bolder.' : `Torment ${ng}. Heaven will not stop. Neither will you.`;

// ---------------------------------------------------------------------------
// Lore notes: collectables the world places; read in the Journal
// ---------------------------------------------------------------------------

export interface LoreNote { id: string; chapter: number; title: string; text: string }

export const LORE_NOTES: LoreNote[] = [
  // Chapter One — Mountain-Sea Temple
  { id: 'c1-novice', chapter: 0, title: 'A Novice\'s Slate', text: 'Day nine of the rain. Elder Ming says the bells are only rusted. I climbed the tower. The clappers had been bitten through.' },
  { id: 'c1-abbot', chapter: 0, title: 'The Abbot\'s Last Sutra', text: 'Whoever finds this: do not ring the great bell. It wakes the thing in the hall. We sealed the stairs with our prayers. Our prayers are not holding.' },
  { id: 'c1-feather', chapter: 0, title: 'A Black Feather, Inscribed', text: 'Written along the quill in a crow\'s scratching hand: "Every lie burns in the Eye. The monks lied the most. They said they were not afraid."' },
  { id: 'c1-pilgrim', chapter: 0, title: 'Pilgrim\'s Map', text: 'Three peaks marked in red ink: the temple, the ridge, the sanctum. In the margin: "Where the Sage fell, his pieces fell further."' },
  { id: 'c1-keeper', chapter: 0, title: 'Shrine Keeper\'s Tally', text: 'Lamps lit this season: none. Pilgrims passed: none. Monkeys with staves: one. I have relit the shrines. Do not make me regret it.' },
  // Chapter Two — Yellow Wind Ridge
  { id: 'c2-bandit', chapter: 1, title: 'Bandit\'s Wage Slip', text: 'Paid in full: one season of not being eaten. Signed with a tiger\'s paw. The archers do not ask questions. The archers do not get to.' },
  { id: 'c2-wind', chapter: 1, title: 'Words Caught in the Wind', text: 'If you stand very still on the ridge you can hear it: every curse, every prayer, every lullaby ever spoken here. The Ear hears them all. It is very tired.' },
  { id: 'c2-wolf', chapter: 1, title: 'A Wolf-Mother\'s Collar', text: 'Stamped with the Yellow Wind seal. Inside the leather, someone has scratched a name. It is not a wolf\'s name.' },
  { id: 'c2-vanguard', chapter: 1, title: 'Orders of the Vanguard', text: 'Let none pass the Banner Terrace. If the monkey comes, send the pack, then the archers, then me. Tell the Sage nothing until it is done.' },
  { id: 'c2-sage', chapter: 1, title: 'The Yellow Wind Sage\'s Poem', text: 'I borrowed the wind from a greater sage than I. The wind has never once asked for it back. That is what frightens me.' },
  // Chapter Three — Frozen Bone Sanctum
  { id: 'c3-climber', chapter: 2, title: 'A Climber\'s Frozen Letter', text: 'Mother — the path is beautiful. The ice sings at night. The skeletons on the stairs are only decorations, I am sure of it.' },
  { id: 'c3-witch', chapter: 2, title: 'Frost-Witch Litany', text: 'Hold what is warm. Hold it until it is cold. Then hold it longer. Our lady taught us this. Our lady holds the warmest thing of all.' },
  { id: 'c3-soldier', chapter: 2, title: 'Rusted Oath-Plate', text: 'We swore to guard the sanctum until the heart stopped beating. The heart never stopped. Neither, it turns out, did we.' },
  { id: 'c3-lady', chapter: 2, title: 'The Pilgrim\'s Diary', text: 'I came west for scriptures and found a heart in the ice instead. It was so warm. I will only hold it until the storm passes. Only until the storm passes.' },
  { id: 'c3-sage', chapter: 2, title: 'Carved Above the Altar', text: 'Here rests the heart of one who would not bow. It does not rest. It is waiting.' },
];
export const LORE_BY_ID = Object.fromEntries(LORE_NOTES.map((n) => [n.id, n])) as Record<string, LoreNote>;
export const loreNotesForChapter = (chapter: number) => LORE_NOTES.filter((n) => n.chapter === chapter);

// Module-level registration hook so other modules can record a found note without a Game reference.
let loreSink: ((id: string) => boolean) | null = null;
/** Set by the game at boot. */
export function setLoreSink(fn: (id: string) => boolean) {
  loreSink = fn;
}
/** Records that the player found lore note `id`. Returns true the first time. */
export function registerLoreNote(id: string): boolean {
  return loreSink ? loreSink(id) : false;
}
