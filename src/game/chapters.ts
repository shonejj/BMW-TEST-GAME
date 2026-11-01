import type { SpawnKind, WaveDef } from '../world/level';

export type Weather = 'rain' | 'dust' | 'snow';

export interface ChapterTheme {
  bg: number;
  fog: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  moon: number;
  moonIntensity: number;
  /** Multiplier on the nature kit's leaf/bark colours. */
  foliage: number;
  /** Multiplier on the terrain colours. */
  ground: number;
  /** Final colour grade (multiplier per channel) and saturation, applied in the pixel pass. */
  grade: [number, number, number];
  saturation: number;
  weather: Weather;
  weatherColor: number;
  /** Rain falls fast and straight, dust drifts sideways, snow falls slowly. */
  weatherCount: number;
}

export interface ChapterZone {
  name: string;
  level: number;
  waves: WaveDef[];
}

export interface ChapterDef {
  id: number;
  title: string;
  place: string;
  bossKind: 'boss' | 'tiger' | 'bonelady';
  bossName: string;
  objective: string;
  intro: [string, string][];
  bossIntro: [string, string][];
  victory: string;
  theme: ChapterTheme;
  zones: ChapterZone[];
}

const w = (kinds: [SpawnKind, number][], elite = false): WaveDef => ({ kinds, elite });

export const CHAPTERS: ChapterDef[] = [
  {
    id: 0,
    title: 'Chapter One',
    place: 'Mountain-Sea Temple',
    bossKind: 'boss',
    bossName: 'Blackfeather Lord',
    objective: 'Explore the temple grounds',
    intro: [
      ['', 'For forty days the bells of the Mountain-Sea Temple have been silent.'],
      ['', 'The monks fled. Something crawled up from beneath the stairs, and stayed.'],
      ['Little Monkey', 'Something foul nests in the main hall. Let us see what it is made of.'],
    ],
    bossIntro: [
      ['', 'Black feathers fall like rain…'],
      ['Blackfeather Lord', 'Another little monkey, come to die in my temple?'],
      ['Little Monkey', 'Your temple? I will be taking it back.'],
    ],
    victory: 'The Blackfeather Lord has fallen',
    theme: {
      bg: 0x0a1316, fog: 0x0d191c, fogDensity: 0.02, hemiSky: 0x9ab8bc, hemiGround: 0x34402a, hemiIntensity: 2.0, moon: 0xd2dce6, moonIntensity: 1.9,
      foliage: 0xffffff, ground: 0xffffff, grade: [1, 1, 1], saturation: 1, weather: 'rain', weatherColor: 0x9fb4c4, weatherCount: 650,
    },
    zones: [
      { name: 'Forest Clearing', level: 1, waves: [w([['ghoul', 3], ['spiderling', 3]]), w([['spiderling', 4], ['ghoul', 2], ['weaver', 1]])] },
      { name: 'Temple Courtyard', level: 2, waves: [w([['ghoul', 4], ['spiderling', 4], ['weaver', 1]]), w([['armored', 1], ['spiderling', 6]], true), w([['ghoul', 4], ['spiderling', 4], ['weaver', 2]])] },
      { name: 'Stone Stairs', level: 3, waves: [w([['ghoul', 5], ['spiderling', 4]]), w([['armored', 1], ['ghoul', 3]])] },
      { name: 'Upper Plaza', level: 4, waves: [w([['ghoul', 6], ['spiderling', 6], ['weaver', 2]]), w([['armored', 2], ['spiderling', 6]]), w([['ghoul', 5], ['spiderling', 5], ['weaver', 2], ['armored', 1]], true)] },
      { name: 'Hall of Black Feathers', level: 6, waves: [w([['boss', 1]])] },
    ],
  },
  {
    id: 1,
    title: 'Chapter Two',
    place: 'Yellow Wind Ridge',
    bossKind: 'tiger',
    bossName: 'Tiger Vanguard',
    objective: 'Cross the wind-scoured ridge',
    intro: [
      ['', 'Beyond the temple, the mountain gives way to the Yellow Wind Ridge.'],
      ['', 'The wind carries sand and the howling of wolves that were never wolves.'],
      ['Little Monkey', 'Another peak, another monster. At least the view is better.'],
    ],
    bossIntro: [
      ['', 'The wind stops. Every wolf falls silent.'],
      ['Tiger Vanguard', 'The Yellow Wind Sage will hear of your trespass. Hear it from me first.'],
      ['Little Monkey', 'Gladly. I have a staff, and plenty of time.'],
    ],
    victory: 'The Tiger Vanguard has fallen',
    theme: {
      bg: 0x2a1c0e, fog: 0x4a3418, fogDensity: 0.024, hemiSky: 0xffc27a, hemiGround: 0x6a4a22, hemiIntensity: 2.1, moon: 0xffd8a0, moonIntensity: 2.1,
      foliage: 0xe0b070, ground: 0xd8b078, grade: [1.1, 1.0, 0.82], saturation: 1.08, weather: 'dust', weatherColor: 0xe8c890, weatherCount: 500,
    },
    zones: [
      { name: 'Wind-Scoured Ridge', level: 7, waves: [w([['wolf', 5]]), w([['wolf', 4], ['archer', 2]])] },
      { name: 'Dune Courtyard', level: 8, waves: [w([['wolf', 5], ['archer', 2]]), w([['ghoul', 3], ['wolf', 4]], true), w([['archer', 3], ['wolf', 5], ['armored', 1]])] },
      { name: 'Sandstone Stairs', level: 9, waves: [w([['wolf', 6], ['archer', 2]]), w([['armored', 2], ['wolf', 4]])] },
      { name: 'Banner Terrace', level: 10, waves: [w([['wolf', 6], ['archer', 3]]), w([['armored', 2], ['ghoul', 4], ['archer', 2]]), w([['wolf', 6], ['archer', 3], ['armored', 1]], true)] },
      { name: 'Tiger Hall', level: 12, waves: [w([['tiger', 1]])] },
    ],
  },
  {
    id: 2,
    title: 'Chapter Three',
    place: 'Frozen Bone Sanctum',
    bossKind: 'bonelady',
    bossName: 'Pale Bone Lady',
    objective: 'Climb into the frozen sanctum',
    intro: [
      ['', 'Past the ridge, the road climbs into snow and silence.'],
      ['', 'Here the dead do not rest. They stand guard over a sanctum of ice and bone.'],
      ['Little Monkey', 'Cold, quiet, and full of skeletons. Wonderful.'],
    ],
    bossIntro: [
      ['', 'Frost creeps across the stone.'],
      ['Pale Bone Lady', 'So many have climbed here. None have left.'],
      ['Little Monkey', 'I am not one of them.'],
    ],
    victory: 'The Pale Bone Lady has fallen',
    theme: {
      bg: 0x0c1a2a, fog: 0x1a2c42, fogDensity: 0.026, hemiSky: 0xa8d0ff, hemiGround: 0x3a4a62, hemiIntensity: 2.2, moon: 0xcfe4ff, moonIntensity: 2.2,
      foliage: 0xb8d4f0, ground: 0xc8dcf4, grade: [0.88, 1.0, 1.18], saturation: 0.9, weather: 'snow', weatherColor: 0xeaf4ff, weatherCount: 520,
    },
    zones: [
      { name: 'Snowbound Path', level: 13, waves: [w([['bone', 5]]), w([['bone', 4], ['frost', 2]])] },
      { name: 'Frozen Courtyard', level: 14, waves: [w([['bone', 5], ['frost', 2]]), w([['wolf', 4], ['bone', 4]], true), w([['frost', 3], ['bone', 5], ['armored', 1]])] },
      { name: 'Ice Stairs', level: 15, waves: [w([['bone', 6], ['frost', 2]]), w([['armored', 2], ['bone', 4]])] },
      { name: 'Ossuary Plaza', level: 16, waves: [w([['bone', 6], ['frost', 3]]), w([['armored', 2], ['wolf', 4], ['frost', 2]]), w([['bone', 6], ['frost', 3], ['armored', 1]], true)] },
      { name: 'Sanctum of Bone', level: 18, waves: [w([['bonelady', 1]])] },
    ],
  },
];
