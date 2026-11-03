import manifest from '../assets/audio/manifest.json';

/**
 * Sound: recorded CC0 effects and a sampled score (see tools/build-audio.py for sources).
 *
 * Mix (audio-design skill): sources → category buses (sfx / music / ambience) → master → limiter, with a
 * shared convolution reverb fed by per-bus sends. Effects layer several recordings with random variants
 * and pitch so repeats never sound identical.
 *
 * The score is sequenced live from real instrument samples (Vietnamese dan tranh zither standing in for a
 * guzheng, erhu, ocarina for a xun flute, taiko, frame drums, gongs) in G♯ minor pentatonic.
 *
 * Music is not wall-to-wall: exploring is carried by a per-chapter ambient soundscape (rain and thunder,
 * wind and sand, streams, insects, cave drips — synthesised live from noise and filters, plus the recorded
 * rain), with only a rare, sparse zither phrase. The score fades in when enemies close in (taiko stinger),
 * holds a few seconds after the last one, then fades back out to ambience; bosses and the title screen have
 * their own sections, and shrines/discoveries get short stingers.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'crit' | 'shatter' | 'coin' | 'pickup' | 'levelup'
  | 'skitter' | 'bite' | 'roar' | 'fire' | 'whirl' | 'slam' | 'gale' | 'hurt' | 'dodge'
  | 'transform' | 'seal' | 'web' | 'legendary' | 'death'
  | 'heavyCharge' | 'chargeLevel' | 'heavyHit' | 'drink' | 'perfect' | 'immobilize' | 'ringfire' | 'focus'
  | 'ghoulHurt' | 'ghoulDie' | 'creatureDie' | 'stepGrass' | 'stepStone' | 'windup' | 'dissolve'
  | 'uiMove' | 'uiSelect' | 'uiBack';

type SetName = keyof typeof manifest.sfx;
type InstName = keyof typeof manifest.instruments;

const urls = import.meta.glob('../assets/audio/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (file: string) => urls[`../assets/audio/${file}`];

/** One recorded layer of an effect: a random variant from `set`, at a random rate in `rate`. */
interface Layer { set: SetName; vol: number; rate?: [number, number]; delay?: number }
/** Synth sub-bass thump under big impacts (recordings rarely carry real low end). */
interface Thump { thump: number; vol: number; delay?: number }
/** A note on a score instrument (stingers, chimes). */
interface Tone { inst: InstName; vol: number; midi?: number; delay?: number }
type Part = Layer | Thump | Tone;

const SFX: Record<Sfx, Part[]> = {
  swing: [{ set: 'swing', vol: 0.5, rate: [0.95, 1.15] }],
  swingHeavy: [{ set: 'swingHeavy', vol: 0.65, rate: [0.8, 0.95] }, { set: 'swing', vol: 0.35, rate: [0.7, 0.8] }],
  hit: [{ set: 'hit', vol: 0.7, rate: [0.9, 1.15] }, { set: 'impact', vol: 0.3, rate: [1, 1.2] }],
  crit: [{ set: 'impactHeavy', vol: 0.8, rate: [0.95, 1.1] }, { set: 'clang', vol: 0.3, rate: [1.1, 1.3] }],
  heavyHit: [{ set: 'impactHeavy', vol: 0.9, rate: [0.75, 0.85] }, { set: 'rock', vol: 0.55 }, { thump: 70, vol: 0.7 }],
  slam: [{ set: 'rock', vol: 0.9, rate: [0.8, 0.9] }, { set: 'impactHeavy', vol: 0.8, rate: [0.6, 0.7] }, { inst: 'taiko', vol: 0.7 }, { thump: 55, vol: 0.9 }],
  shatter: [{ set: 'shatter', vol: 0.75, rate: [0.9, 1.1] }],
  coin: [{ set: 'coin', vol: 0.35, rate: [0.95, 1.1] }],
  pickup: [{ set: 'gem', vol: 0.45 }],
  legendary: [{ set: 'gem', vol: 0.5, rate: [0.8, 0.8] }, { inst: 'zitherGliss', vol: 0.6 }, { set: 'bell', vol: 0.35, rate: [1.4, 1.4], delay: 0.15 }],
  levelup: [{ set: 'levelup', vol: 0.6 }, { inst: 'gong', vol: 0.3 }, { inst: 'zitherGliss', vol: 0.5, delay: 0.1 }],
  skitter: [{ set: 'skitter', vol: 0.18, rate: [1.2, 1.5] }],
  bite: [{ set: 'bite', vol: 0.55, rate: [0.9, 1.1] }],
  roar: [{ set: 'roar', vol: 0.9, rate: [0.6, 0.7] }, { set: 'monster', vol: 0.6, rate: [0.65, 0.75], delay: 0.05 }, { thump: 45, vol: 0.5 }],
  fire: [{ set: 'fire', vol: 0.55, rate: [0.9, 1.1] }],
  ringfire: [{ set: 'fireBig', vol: 0.8 }, { inst: 'taiko', vol: 0.4 }],
  whirl: [{ set: 'swingHeavy', vol: 0.4, rate: [1.1, 1.3] }, { set: 'swing', vol: 0.3, rate: [0.8, 0.9], delay: 0.08 }],
  gale: [{ set: 'spell', vol: 0.55, rate: [0.75, 0.85] }, { set: 'swingHeavy', vol: 0.5, rate: [0.65, 0.75] }],
  hurt: [{ set: 'grunt', vol: 0.5, rate: [1.15, 1.3] }, { set: 'impact', vol: 0.45, rate: [0.9, 1] }],
  dodge: [{ set: 'cloth', vol: 0.55, rate: [0.9, 1.1] }, { set: 'swing', vol: 0.25, rate: [1.3, 1.5] }],
  transform: [{ set: 'magic', vol: 0.6, rate: [0.8, 0.8] }, { set: 'roar', vol: 0.5, rate: [0.9, 1] }, { inst: 'gong', vol: 0.6 }, { inst: 'zitherGliss', vol: 0.5 }],
  seal: [{ set: 'bell', vol: 0.6, rate: [0.7, 0.75] }, { inst: 'gong', vol: 0.3, delay: 0.05 }],
  web: [{ set: 'web', vol: 0.55, rate: [0.9, 1.1] }],
  death: [{ set: 'grunt', vol: 0.7, rate: [0.8, 0.85] }, { inst: 'gong', vol: 0.55, delay: 0.2 }, { thump: 40, vol: 0.6 }],
  heavyCharge: [{ set: 'unsheathe', vol: 0.45, rate: [0.8, 0.9] }],
  chargeLevel: [{ set: 'glass', vol: 0.4, rate: [1.0, 1.3] }],
  drink: [{ set: 'drink', vol: 0.6, rate: [0.95, 1.05] }, { set: 'glass', vol: 0.25, rate: [1.5, 1.6], delay: 0.35 }],
  perfect: [{ set: 'bell', vol: 0.5, rate: [1.6, 1.6] }, { inst: 'cymbal', vol: 0.5 }],
  immobilize: [{ set: 'bell', vol: 0.65, rate: [1, 1] }, { set: 'spell', vol: 0.45, rate: [1.1, 1.2] }],
  focus: [{ set: 'glass', vol: 0.4, rate: [1.4, 1.5] }],
  ghoulHurt: [{ set: 'ghoul', vol: 0.35, rate: [0.95, 1.15] }],
  ghoulDie: [{ set: 'ghoul', vol: 0.55, rate: [0.75, 0.85] }],
  creatureDie: [{ set: 'creatureDie', vol: 0.4, rate: [1.3, 1.7] }],
  // Enemy wind-up tell: a low scrape of weight gathering, so a telegraph is heard as well as seen.
  windup: [{ set: 'unsheathe', vol: 0.3, rate: [0.6, 0.72] }, { set: 'cloth', vol: 0.28, rate: [0.7, 0.8] }],
  /** A body coming apart into embers. */
  dissolve: [{ set: 'spell', vol: 0.3, rate: [1.3, 1.5] }, { set: 'cloth', vol: 0.22, rate: [1.2, 1.4] }],
  stepGrass: [{ set: 'stepGrass', vol: 0.12, rate: [0.9, 1.1] }],
  stepStone: [{ set: 'stepStone', vol: 0.14, rate: [0.9, 1.1] }],
  uiMove: [{ set: 'uiMove', vol: 0.3 }],
  uiSelect: [{ set: 'uiSelect', vol: 0.35 }],
  uiBack: [{ set: 'uiBack', vol: 0.3 }],
};

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/** G♯ minor pentatonic (G♯ B C♯ D♯ F♯): the dan tranh's own tuning. Degree 0 = G♯4. */
const PENT = [0, 3, 5, 7, 10];
const TONIC = 68;
const deg = (d: number) => TONIC + PENT[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);

type Phrase = [number | null, number][]; // [degree or rest, beats]
/** Erhu lines for combat, two bars each. */
const ERHU: Phrase[] = [
  [[0, 1], [1, 0.5], [2, 0.5], [3, 1.5], [2, 0.5], [1, 1], [0, 1], [-1, 1], [0, 1]],
  [[3, 1], [4, 0.5], [3, 0.5], [2, 1], [1, 1], [2, 1.5], [1, 0.5], [0, 2]],
  [[5, 1.5], [4, 0.5], [3, 1], [4, 1], [3, 0.5], [2, 0.5], [1, 1], [2, 2]],
  [[0, 0.5], [1, 0.5], [2, 0.5], [3, 0.5], [4, 1], [3, 1], [2, 1], [1, 1], [0, 2]],
];
/** Xun flute lines for exploring, four bars each. */
const FLUTE: Phrase[] = [
  [[0, 2], [1, 1], [2, 1], [3, 3], [2, 1], [1, 2], [0, 2], [null, 4]],
  [[3, 2], [4, 2], [3, 1], [2, 1], [1, 2], [2, 4], [null, 4]],
  [[-1, 2], [0, 2], [1, 2], [2, 1], [1, 1], [0, 4], [null, 4]],
  [[2, 1.5], [3, 0.5], [4, 2], [5, 2], [4, 1], [3, 1], [2, 4], [null, 4]],
];
/** Bar roots (pentatonic degrees): G♯, F♯, B, C♯ — then G♯, F♯, D♯, G♯. */
const ROOTS = [0, -1, 1, 2, 0, -1, 3, 0];
const ARP = [0, 2, 4, 5, 7, 5, 4, 2];

type Mode = 'title' | 'explore' | 'combat' | 'boss';
const BPM: Record<Mode, number> = { title: 70, explore: 76, combat: 112, boss: 124 };

interface Sample { buf: AudioBuffer; midi: number | null }

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------

/** A looping bed: recorded rain, or white/brown noise through a filter. `gust` makes level and colour wander. */
interface Bed { src: 'rain' | 'white' | 'brown'; filter?: BiquadFilterType; freq?: number; q?: number; vol: number; gust?: number }
type AmbEventKind = 'thunder' | 'bird' | 'cricket' | 'plip' | 'drip' | 'hawk' | 'gust' | 'creak' | 'howl' | 'cicada';
/** A one-shot sound repeating at random intervals of `every` seconds. */
interface AmbEvent { kind: AmbEventKind; every: [number, number]; vol: number }
interface Soundscape { beds: Bed[]; events: AmbEvent[] }

/** One soundscape per chapter (index wraps if there are more chapters than entries). */
const SOUNDSCAPES: Soundscape[] = [
  // Mountain-Sea Temple: night rain on stone, a stream, distant thunder, insects and the odd night bird.
  {
    beds: [
      { src: 'rain', vol: 0.22 },
      { src: 'white', filter: 'highpass', freq: 3200, vol: 0.025 },
      { src: 'brown', filter: 'bandpass', freq: 900, q: 0.8, vol: 0.06, gust: 0.25 },
      { src: 'brown', filter: 'lowpass', freq: 260, vol: 0.05, gust: 0.4 },
    ],
    events: [
      { kind: 'thunder', every: [22, 55], vol: 0.55 },
      { kind: 'cricket', every: [1.5, 5], vol: 0.035 },
      { kind: 'bird', every: [9, 24], vol: 0.05 },
      { kind: 'plip', every: [0.25, 1.1], vol: 0.03 },
    ],
  },
  // Yellow Wind Ridge: gusting canyon wind, hissing sand, cicadas, a hawk circling far above.
  {
    beds: [
      { src: 'brown', filter: 'bandpass', freq: 480, q: 0.9, vol: 0.16, gust: 0.8 },
      { src: 'white', filter: 'highpass', freq: 5000, vol: 0.02, gust: 0.9 },
      { src: 'brown', filter: 'lowpass', freq: 120, vol: 0.06 },
    ],
    events: [
      { kind: 'gust', every: [6, 14], vol: 0.14 },
      { kind: 'hawk', every: [20, 45], vol: 0.05 },
      { kind: 'cicada', every: [10, 26], vol: 0.025 },
      { kind: 'bird', every: [18, 40], vol: 0.03 },
    ],
  },
  // Frozen Bone Sanctum: thin whistling ice wind, a cave drone, drips echoing, ice creaking.
  {
    beds: [
      { src: 'white', filter: 'bandpass', freq: 1500, q: 7, vol: 0.035, gust: 0.7 },
      { src: 'brown', filter: 'lowpass', freq: 320, vol: 0.08, gust: 0.5 },
      { src: 'brown', filter: 'lowpass', freq: 85, vol: 0.07 },
    ],
    events: [
      { kind: 'drip', every: [1.2, 4.5], vol: 0.06 },
      { kind: 'howl', every: [9, 20], vol: 0.06 },
      { kind: 'creak', every: [14, 34], vol: 0.05 },
    ],
  },
];

interface LiveBed { def: Bed; src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode | null; nextGust: number }

/** Seconds the score holds after the last enemy leaves before fading out. */
const COMBAT_HOLD = 4;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private reverbIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  /** Fades the sequenced score in and out (combat/boss/title), under the music volume. */
  private scoreBus!: GainNode;
  private ambDuck!: GainNode;
  private beds: LiveBed[] = [];
  private ambEvents: { def: AmbEvent; next: number }[] = [];
  private chapterAmb = 0;
  private lastCombat = -1e9;
  private fadingOut = false;
  private fadeEnd = 0;
  /** Exploring: bars left in the current sparse zither phrase, and when the next may start. */
  private phraseBars = 0;
  private nextPhraseAt = 0;
  private ducked = false;
  private lastPlay = new Map<Sfx, number>();
  private sets = new Map<SetName, AudioBuffer[]>();
  private inst = new Map<InstName, Sample[]>();
  private loaded = false;
  private nextStep = 0;
  private step = 0;
  private bar = 0;
  private mode: Mode = 'title';
  private phrase = 0;
  private lastErhuMidi = 0;
  /** 0 = exploring, 1 = fighting. Set by the game each frame. */
  combatIntensity = 0;
  boss = false;
  /** True on the title screen: plays the slower title theme. */
  title = true;
  volume = 0.8;
  musicVolume = 0.5;

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.gain(this.volume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master.connect(limiter).connect(ctx.destination);

    // Shared reverb (procedural impulse ≈ stone temple courtyard).
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.6, 2.6);
    this.reverbIn = ctx.createGain();
    const revOut = ctx.createGain();
    revOut.gain.value = 0.32;
    this.reverbIn.connect(conv).connect(revOut).connect(this.master);

    this.sfxBus = this.bus(0.14);
    this.musicBus = this.bus(0.45);
    this.musicBus.gain.value = this.gain(this.musicVolume);
    this.scoreBus = ctx.createGain();
    this.scoreBus.gain.value = 0;
    this.scoreBus.connect(this.musicBus);
    this.ambBus = this.bus(0.2);
    this.ambDuck = ctx.createGain();
    this.ambDuck.connect(this.ambBus);

    // Long noise loops (4 s) so beds never audibly repeat; brown noise for wind/water rumble.
    const len = ctx.sampleRate * 4;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0), b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = w;
      last = (last + 0.02 * w) / 1.02;
      b[i] = last * 3.5;
    }
    // Crossfade the loop seam.
    const fade = 2048;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
      b[len - fade + i] = b[len - fade + i] * (1 - k) + b[i] * k;
    }
    this.load();
  }

  /** Decodes every sound (inlined in the build, so this works offline). */
  private async load() {
    const ctx = this.ctx!;
    const decode = async (file: string) => ctx.decodeAudioData(await (await fetch(urlOf(file))).arrayBuffer());
    const jobs: Promise<void>[] = [];
    for (const [name, files] of Object.entries(manifest.sfx)) {
      jobs.push(Promise.all(files.map(decode)).then((bufs) => void this.sets.set(name as SetName, bufs)));
    }
    for (const [name, entries] of Object.entries(manifest.instruments)) {
      jobs.push(Promise.all(entries.map(async (e) => ({ buf: await decode(e.file), midi: e.midi }))).then((s) => void this.inst.set(name as InstName, s)));
    }
    await Promise.allSettled(jobs);
    this.loaded = true;
    this.startAmbience(this.chapterAmb);
    this.nextStep = ctx.currentTime + 0.1;
    // The sequencer runs on its own timer, not the render loop, so slow or hitching frames never
    // starve it (Web Audio "two clocks" scheduling).
    setInterval(() => this.schedule(), 40);
  }

  /** Slider 0..1 → gain. Squared so the slider feels even across its travel. */
  private gain(v: number) {
    return v * v;
  }

  private bus(reverbSend: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = reverbSend;
    g.connect(send).connect(this.reverbIn);
    return g;
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = this.gain(v);
  }
  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.value = this.gain(v);
  }

  /** Switches the ambient soundscape to chapter `i` (crossfades; safe to call before audio is unlocked). */
  setChapterAmbience(i: number) {
    this.chapterAmb = i;
    if (this.ctx && this.loaded) this.startAmbience(i);
  }

  private startAmbience(i: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (const b of this.beds) {
      b.gain.gain.cancelScheduledValues(now);
      b.gain.gain.setValueAtTime(b.gain.gain.value, now);
      b.gain.gain.linearRampToValueAtTime(0, now + 2);
      b.src.stop(now + 2.1);
    }
    this.beds = [];
    const sc = SOUNDSCAPES[((i % SOUNDSCAPES.length) + SOUNDSCAPES.length) % SOUNDSCAPES.length];
    for (const def of sc.beds) {
      const buf = def.src === 'rain' ? this.sets.get('rain')?.[0] : def.src === 'white' ? this.noiseBuf : this.brownBuf;
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      // Random start offsets so layered noise beds never phase together.
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(def.vol, now + 2.5);
      let filter: BiquadFilterNode | null = null;
      if (def.filter) {
        filter = ctx.createBiquadFilter();
        filter.type = def.filter;
        filter.frequency.value = def.freq ?? 1000;
        filter.Q.value = def.q ?? 0.7;
        src.connect(filter).connect(gain);
      } else src.connect(gain);
      gain.connect(this.ambDuck);
      src.start(now, Math.random() * buf.duration);
      this.beds.push({ def, src, gain, filter, nextGust: now + rnd(1, 3) });
    }
    this.ambEvents = sc.events.map((def) => ({ def, next: now + rnd(def.every[0] * 0.3, def.every[1] * 0.6) }));
  }

  /** Gusts on the beds and the random one-shots; runs on the scheduler timer. */
  private ambTick(now: number) {
    for (const b of this.beds) {
      const g = b.def.gust;
      if (!g || now < b.nextGust) continue;
      const dur = rnd(1.5, 4.5);
      b.nextGust = now + dur;
      const level = b.def.vol * (1 - g * 0.6 + Math.random() * g * 1.1);
      b.gain.gain.cancelScheduledValues(now);
      b.gain.gain.setValueAtTime(b.gain.gain.value, now);
      b.gain.gain.linearRampToValueAtTime(level, now + dur);
      if (b.filter && b.def.freq) {
        b.filter.frequency.cancelScheduledValues(now);
        b.filter.frequency.setValueAtTime(b.filter.frequency.value, now);
        b.filter.frequency.linearRampToValueAtTime(b.def.freq * (1 - g * 0.35 + Math.random() * g * 0.9), now + dur);
      }
    }
    for (const e of this.ambEvents) {
      if (now < e.next) continue;
      e.next = now + rnd(e.def.every[0], e.def.every[1]);
      this.ambEvent(e.def.kind, now + 0.05, e.def.vol);
    }
  }

  private noiseSrc(brown: boolean, when: number, dur: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    src.start(when, Math.random() * 3);
    src.stop(when + dur);
    return src;
  }

  private env(when: number, attack: number, peak: number, decay: number, exp = true) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    if (exp) g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    else g.gain.linearRampToValueAtTime(0, when + attack + decay);
    return g;
  }

  private tone(type: OscillatorType, when: number, dur: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.start(when);
    o.stop(when + dur + 0.05);
    return o;
  }

  private ambEvent(kind: AmbEventKind, t: number, vol: number) {
    const ctx = this.ctx!;
    const out = this.ambDuck;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.8, 0.8);
    pan.connect(out);
    switch (kind) {
      case 'thunder': {
        // A crack, then a long rolling rumble.
        const dur = rnd(4, 7);
        const crack = this.noiseSrc(false, t, 0.6);
        const cf = ctx.createBiquadFilter();
        cf.type = 'bandpass';
        cf.frequency.value = rnd(700, 1400);
        crack.connect(cf).connect(this.env(t, 0.01, vol * 0.25, 0.5)).connect(pan);
        const rum = this.noiseSrc(true, t, dur);
        const lf = ctx.createBiquadFilter();
        lf.type = 'lowpass';
        lf.frequency.setValueAtTime(260, t);
        lf.frequency.exponentialRampToValueAtTime(70, t + dur);
        const g = this.env(t + 0.05, rnd(0.2, 0.5), vol, dur - 0.6);
        rum.connect(lf).connect(g).connect(pan);
        break;
      }
      case 'bird': {
        // A short phrase of chirps sweeping up.
        const n = 2 + Math.floor(Math.random() * 4);
        const base = rnd(2200, 3600);
        for (let i = 0; i < n; i++) {
          const at = t + i * rnd(0.09, 0.16);
          const o = this.tone('sine', at, 0.09);
          o.frequency.setValueAtTime(base * rnd(0.9, 1.05), at);
          o.frequency.exponentialRampToValueAtTime(base * rnd(1.3, 1.6), at + 0.06);
          o.connect(this.env(at, 0.008, vol, 0.07)).connect(pan);
        }
        break;
      }
      case 'cricket': {
        const o = this.tone('sine', t, 0.5);
        o.frequency.value = rnd(4200, 5200);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        const pulses = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) {
          const at = t + i * 0.055;
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(vol, at + 0.008);
          g.gain.linearRampToValueAtTime(0, at + 0.03);
        }
        o.connect(g).connect(pan);
        break;
      }
      case 'cicada': {
        const dur = rnd(2, 4);
        const o = this.tone('sawtooth', t, dur);
        o.frequency.value = rnd(110, 160);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(4000, 6000);
        bp.Q.value = 4;
        o.connect(bp).connect(this.env(t, dur * 0.4, vol, dur * 0.6, false)).connect(pan);
        break;
      }
      case 'plip': {
        // Stream bubble: a tiny sine whose pitch rises fast.
        const o = this.tone('sine', t, 0.06);
        const f = rnd(500, 1300);
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * rnd(1.6, 2.4), t + 0.05);
        o.connect(this.env(t, 0.004, vol, 0.05)).connect(pan);
        break;
      }
      case 'drip': {
        const o = this.tone('sine', t, 0.4);
        const f = rnd(900, 2100);
        o.frequency.setValueAtTime(f * 0.7, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
        o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.3);
        const g = this.env(t, 0.003, vol, 0.32);
        o.connect(g).connect(pan);
        // Extra-wet: caves ring.
        const send = ctx.createGain();
        send.gain.value = 1.5;
        g.connect(send).connect(this.reverbIn);
        break;
      }
      case 'hawk': {
        // A distant raptor's scree: falling, with a fast vibrato.
        for (let i = 0; i < 2; i++) {
          const at = t + i * rnd(0.9, 1.4);
          const dur = rnd(0.7, 1.0);
          const o = this.tone('triangle', at, dur);
          o.frequency.setValueAtTime(rnd(2300, 2700), at);
          o.frequency.exponentialRampToValueAtTime(rnd(1500, 1800), at + dur);
          const lfo = this.tone('sine', at, dur);
          lfo.frequency.value = 11;
          const depth = ctx.createGain();
          depth.gain.value = 70;
          lfo.connect(depth).connect(o.frequency);
          o.connect(this.env(at, 0.05, vol, dur, false)).connect(pan);
        }
        break;
      }
      case 'gust':
      case 'howl': {
        const howl = kind === 'howl';
        const dur = rnd(2.5, 5);
        const src = this.noiseSrc(!howl, t, dur);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = howl ? 9 : 1.2;
        const f0 = howl ? rnd(500, 800) : rnd(250, 400);
        bp.frequency.setValueAtTime(f0, t);
        bp.frequency.linearRampToValueAtTime(f0 * rnd(1.6, 2.4), t + dur * 0.5);
        bp.frequency.linearRampToValueAtTime(f0 * 1.1, t + dur);
        src.connect(bp).connect(this.env(t, dur * 0.45, vol * (howl ? 1.6 : 1), dur * 0.55, false)).connect(pan);
        break;
      }
      case 'creak': {
        const dur = rnd(0.5, 1.1);
        const o = this.tone('sawtooth', t, dur);
        o.frequency.setValueAtTime(rnd(60, 90), t);
        o.frequency.linearRampToValueAtTime(rnd(90, 140), t + dur);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(500, 900);
        bp.Q.value = 6;
        o.connect(bp).connect(this.env(t, 0.08, vol, dur, false)).connect(pan);
        break;
      }
    }
  }

  /** A short musical sting (shrine lit, discovery), on top of whatever is playing. */
  stinger(kind: 'shrine' | 'discovery' = 'discovery') {
    if (!this.ctx || !this.loaded) return;
    const t = this.ctx.currentTime + 0.05;
    const L = this.musicBus;
    this.note('zitherGliss', undefined, t, 0.45, L);
    const line = kind === 'shrine' ? [0, 2, 4, 7] : [2, 4, 5];
    line.forEach((d, i) => this.note('zither', deg(d), t + 0.35 + i * 0.22, 0.32 - i * 0.03, L));
    if (kind === 'shrine') this.note('flute', deg(4), t + 1.3, 0.22, L, 1.6, 0.12);
  }

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------

  private buffer(buf: AudioBuffer, when: number, rate: number, vol: number, bus: GainNode, dur = 0, attack = 0.004, release = 0.12) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + attack);
    src.connect(g).connect(bus);
    src.start(when);
    if (dur > 0) {
      g.gain.setValueAtTime(vol, when + dur);
      g.gain.linearRampToValueAtTime(0, when + dur + release);
      src.stop(when + dur + release + 0.02);
    }
    return src;
  }

  /** Plays a note on a sampled instrument, resampling the nearest recorded pitch. */
  private note(name: InstName, midi: number | undefined, when: number, vol: number, bus: GainNode, dur = 0, attack = 0.004) {
    const samples = this.inst.get(name);
    if (!samples?.length) return null;
    let s = samples[Math.floor(Math.random() * samples.length)];
    let rate = 1;
    if (midi !== undefined && s.midi !== null) {
      s = samples.reduce((a, b) => (Math.abs(b.midi! - midi) < Math.abs(a.midi! - midi) ? b : a));
      rate = 2 ** ((midi - s.midi!) / 12);
    }
    const src = this.buffer(s.buf, when, rate, vol, bus, dur, attack, name === 'erhu' || name === 'flute' ? 0.25 : 0.12);
    return { src, rate };
  }

  private thump(freq: number, vol: number, when: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, when);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    o.connect(g).connect(this.sfxBus);
    o.start(when);
    o.stop(when + 0.5);
  }

  play(s: Sfx) {
    if (!this.ctx || !this.loaded) return;
    const now = this.ctx.currentTime;
    const minGap = s === 'hit' || s === 'coin' || s === 'skitter' || s.startsWith('step') ? 0.05 : 0.03;
    if (now - (this.lastPlay.get(s) ?? -1) < minGap) return;
    this.lastPlay.set(s, now);
    if (s === 'seal') this.stinger('shrine');
    for (const p of SFX[s]) {
      const when = now + (p.delay ?? 0);
      if ('set' in p) {
        const bufs = this.sets.get(p.set);
        if (!bufs?.length) continue;
        const [a, b] = p.rate ?? [0.96, 1.04];
        this.buffer(bufs[Math.floor(Math.random() * bufs.length)], when, a + Math.random() * (b - a), p.vol, this.sfxBus);
      } else if ('thump' in p) {
        this.thump(p.thump, p.vol, when);
      } else {
        this.note(p.inst, p.midi, when, p.vol, this.sfxBus);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Adaptive score: a lookahead step sequencer on the audio clock
  // ---------------------------------------------------------------------------

  /** Kept for the game loop; the score is scheduled by its own timer. */
  update(_dt: number) {}

  private schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.ambTick(now);
    this.updateMode(now);
    const ahead = now + 0.3;
    // After a long stall (tab hidden), skip ahead instead of firing a burst of notes.
    if (this.nextStep < now - 1) this.nextStep = now + 0.05;
    while (this.nextStep < ahead) {
      this.playStep(this.nextStep);
      this.nextStep += 60 / BPM[this.mode] / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private wantMode(now: number): Mode {
    if (this.title) return 'title';
    if (this.boss) return 'boss';
    if (this.combatIntensity > 0.45) this.lastCombat = now;
    if ((this.mode === 'combat' || this.mode === 'boss') && now - this.lastCombat < COMBAT_HOLD) return 'combat';
    return this.combatIntensity > 0.45 ? 'combat' : 'explore';
  }

  private fadeScore(to: number, secs: number, now: number) {
    const g = this.scoreBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + secs);
  }

  /**
   * Music sections. Entering a fight (or the boss, or the title) cuts in at once with a stinger and a quick
   * fade-in; leaving one fades the score out over a few seconds, then exploring is ambience only, with a rare
   * sparse zither phrase.
   */
  private updateMode(now: number) {
    const want = this.wantMode(now);
    const ducked = want === 'combat' || want === 'boss';
    if (ducked !== this.ducked) {
      this.ducked = ducked;
      const g = this.ambDuck.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(ducked ? 0.55 : 1, now + 2);
    }
    if (want === this.mode) {
      if (this.fadingOut) {
        // Back into the fight before the fade finished: bring the score back up.
        this.fadingOut = false;
        this.fadeScore(1, 0.8, now);
      }
      return;
    }
    if (want === 'explore') {
      if (!this.fadingOut) {
        this.fadingOut = true;
        this.fadeEnd = now + 3.2;
        this.fadeScore(0, 3.2, now);
      } else if (now >= this.fadeEnd) {
        this.fadingOut = false;
        this.mode = 'explore';
        this.bar = 0;
        this.phraseBars = 0;
        this.nextPhraseAt = now + rnd(40, 80);
      }
      return;
    }
    // Into title / combat / boss: start the section on the next sixteenth.
    const from = this.mode;
    this.fadingOut = false;
    this.mode = want;
    this.step = 0;
    this.bar = 0;
    this.nextStep = now + 0.06;
    const t = this.nextStep;
    if (want === 'combat' || want === 'boss') {
      this.note('taiko', undefined, t, 0.9, this.musicBus);
      if (want === 'boss' || from === 'explore') this.note('gong', undefined, t, want === 'boss' ? 0.8 : 0.4, this.musicBus);
    }
    this.fadeScore(1, from === 'explore' || from === 'title' ? 1.2 : 0.3, now);
  }

  private playStep(t: number) {
    const L = this.scoreBus;
    const s = this.step;
    const beat = 60 / BPM[this.mode];
    const root = ROOTS[this.bar % ROOTS.length];
    const m = this.mode;

    if (m === 'explore') {
      // Mostly silence: now and then a short, sparse zither phrase (sometimes with the xun) over the ambience.
      if (s === 0) {
        if (this.phraseBars > 0) this.phraseBars--;
        else if (t >= this.nextPhraseAt && !this.fadingOut) {
          this.phraseBars = 4;
          this.nextPhraseAt = t + rnd(90, 170);
          this.fadeScore(0.75, 1, this.ctx!.currentTime);
          if (Math.random() < 0.5) this.playPhrase('flute', FLUTE[this.phrase++ % FLUTE.length], t + beat * 4, beat, 0.22, 0);
        }
      }
      if (this.phraseBars > 0) {
        if (s === 0 && this.bar % 2 === 0) this.note('zither', deg(root - 10), t, 0.4, L);
        if (s % 4 === 0 && Math.random() < 0.7) this.note('zither', deg(root - 5 + ARP[(s / 2 + this.bar * 3) % 8]), t, 0.22 + Math.random() * 0.06, L);
      }
      return;
    }
    if (m === 'title') {
      // Zither: bass on the downbeat, a slow rising-falling arpeggio in eighths.
      if (s === 0) this.note('zither', deg(root - 10), t, 0.55, L);
      if (s % 2 === 0) this.note('zither', deg(root - 5 + ARP[s / 2]), t, (s === 0 ? 0.4 : 0.26) + Math.random() * 0.06, L);
      if (s === 0 && this.bar % 4 === 0) this.note('cymbal', undefined, t, 0.35, L);
      if (s === 0 && this.bar % 16 === 0) this.note('gong', undefined, t, 0.35, L);
      // Xun flute phrases every other four bars.
      if (s === 0 && this.bar % 8 === 4) this.playPhrase('flute', FLUTE[this.phrase++ % FLUTE.length], t, beat, 0.32, 0);
      if (s === 0 && this.bar % 8 === 0) this.note('zitherTrem', deg(root - 5), t, 0.3, L, beat * 3.5, 0.3);
    } else {
      const boss = m === 'boss';
      // Taiko groove with frame drums and woodblock.
      const kick = boss ? [0, 3, 6, 8, 10, 11, 14] : [0, 6, 8, 11];
      if (kick.includes(s)) this.note('taiko', undefined, t, s === 0 ? 0.95 : 0.7, L);
      if (s === 4 || s === 12) this.note('drumHigh', undefined, t, 0.6, L);
      if (this.bar % 4 === 3 && s >= 12) this.note('drumHigh', undefined, t, 0.35 + (s - 12) * 0.1, L);
      if (s % 4 === 2) this.note('woodblock', undefined, t, 0.22, L);
      if (s === 3 || s === 9) this.note('logLow', undefined, t, 0.35, L);
      if (boss && s === 0) this.note('timpani', undefined, t, 0.7, L);
      if (s === 0 && this.bar % (boss ? 4 : 8) === 0) this.note('gong', undefined, t, boss ? 0.55 : 0.4, L);
      // Driving zither ostinato in sixteenths.
      const ost = [root - 5, root - 3, root, root - 3];
      this.note('zither', deg(ost[s % 4]), t, s % 4 === 0 ? 0.3 : 0.17, L, 0.25);
      if (s === 0) this.note('zither', deg(root - 10), t, 0.5, L);
      // Erhu phrases, two bars each, an octave up for the boss.
      if (s === 0 && this.bar % 2 === 0) this.playPhrase('erhu', ERHU[this.phrase++ % ERHU.length], t, beat, boss ? 0.42 : 0.36, boss ? 5 : 0);
    }
  }

  private playPhrase(inst: 'erhu' | 'flute', phrase: Phrase, t: number, beat: number, vol: number, shift: number) {
    let at = t;
    for (const [d, beats] of phrase) {
      const dur = beats * beat;
      if (d !== null) {
        const midi = deg(d + shift);
        const v = this.note(inst, midi, at, vol, this.scoreBus, dur * 0.95, inst === 'erhu' ? 0.06 : 0.09);
        // Erhu slides into each note from the previous one (portamento).
        if (v && inst === 'erhu' && this.lastErhuMidi && Math.abs(this.lastErhuMidi - midi) <= 5) {
          v.src.playbackRate.setValueAtTime(v.rate * 2 ** ((this.lastErhuMidi - midi) / 12), at);
          v.src.playbackRate.exponentialRampToValueAtTime(v.rate, at + 0.08);
        }
        if (inst === 'erhu') this.lastErhuMidi = midi;
      }
      at += dur;
    }
  }
}
