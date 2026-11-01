import manifest from '../assets/audio/manifest.json';

/**
 * Sound: recorded CC0 effects and a sampled score (see tools/build-audio.py for sources).
 *
 * Mix (audio-design skill): sources → category buses (sfx / music / ambience) → master → limiter, with a
 * shared convolution reverb fed by per-bus sends. Effects layer several recordings with random variants
 * and pitch so repeats never sound identical.
 *
 * The score is sequenced live from real instrument samples (Vietnamese dan tranh zither standing in for a
 * guzheng, erhu, ocarina for a xun flute, taiko, frame drums, gongs) in G♯ minor pentatonic. It is
 * adaptive by horizontal re-sequencing: explore, combat and boss sections switch on bar lines, with a
 * drum or gong stinger, as the fight heats up.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'crit' | 'shatter' | 'coin' | 'pickup' | 'levelup'
  | 'skitter' | 'bite' | 'roar' | 'fire' | 'whirl' | 'slam' | 'gale' | 'hurt' | 'dodge'
  | 'transform' | 'seal' | 'web' | 'legendary' | 'death'
  | 'heavyCharge' | 'chargeLevel' | 'heavyHit' | 'drink' | 'perfect' | 'immobilize' | 'ringfire' | 'focus'
  | 'ghoulHurt' | 'ghoulDie' | 'creatureDie' | 'stepGrass' | 'stepStone'
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

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private reverbIn!: GainNode;
  private noiseBuf!: AudioBuffer;
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
    this.ambBus = this.bus(0.2);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
    this.startAmbience();
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

  private startAmbience() {
    const ctx = this.ctx!;
    const rain = this.sets.get('rain')?.[0];
    if (rain) {
      const src = ctx.createBufferSource();
      src.buffer = rain;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      src.connect(g).connect(this.ambBus);
      src.start();
    }
    // Low wind under the rain.
    const w = ctx.createBufferSource();
    w.buffer = this.noiseBuf;
    w.loop = true;
    w.playbackRate.value = 0.4;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 260;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    w.connect(wf).connect(wg).connect(this.ambBus);
    w.start();
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
    const ahead = this.ctx.currentTime + 0.3;
    // After a long stall (tab hidden), skip ahead instead of firing a burst of notes.
    if (this.nextStep < this.ctx.currentTime - 1) this.nextStep = this.ctx.currentTime + 0.05;
    while (this.nextStep < ahead) {
      this.playStep(this.nextStep);
      this.nextStep += 60 / BPM[this.mode] / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private chooseMode(): Mode {
    if (this.title) return 'title';
    if (this.boss) return 'boss';
    if (this.mode === 'combat') return this.combatIntensity > 0.15 ? 'combat' : 'explore';
    return this.combatIntensity > 0.45 ? 'combat' : 'explore';
  }

  private playStep(t: number) {
    const L = this.musicBus;
    const s = this.step;
    if (s === 0) {
      const next = this.chooseMode();
      if (next !== this.mode) {
        // Stinger on the downbeat of a new section.
        if (next === 'combat' || next === 'boss') this.note('taiko', undefined, t, 0.9, L);
        if (next === 'boss') this.note('gong', undefined, t, 0.8, L);
        if (next === 'explore' && this.mode !== 'title') this.note('zitherGliss', undefined, t, 0.5, L);
        this.mode = next;
        this.bar = 0;
      }
    }
    const beat = 60 / BPM[this.mode];
    const root = ROOTS[this.bar % ROOTS.length];
    const m = this.mode;

    if (m === 'title' || m === 'explore') {
      // Zither: bass on the downbeat, a slow rising-falling arpeggio in eighths.
      if (s === 0) this.note('zither', deg(root - 10), t, 0.55, L);
      if (s % 2 === 0) this.note('zither', deg(root - 5 + ARP[s / 2]), t, (s === 0 ? 0.4 : 0.26) + Math.random() * 0.06, L);
      if (s === 0 && this.bar % 4 === 0) this.note('cymbal', undefined, t, 0.35, L);
      if (s === 0 && this.bar % 16 === 0) this.note('gong', undefined, t, 0.35, L);
      if (m === 'explore' && (s === 0 || s === 8) && this.bar % 2 === 1) this.note('drumLow', undefined, t, s === 0 ? 0.4 : 0.25, L);
      // Xun flute phrases every other four bars.
      if (s === 0 && this.bar % 8 === 4) this.playPhrase('flute', FLUTE[this.phrase++ % FLUTE.length], t, beat, 0.32, 0);
      if (m === 'title' && s === 0 && this.bar % 8 === 0) this.note('zitherTrem', deg(root - 5), t, 0.3, L, beat * 3.5, 0.3);
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
        const v = this.note(inst, midi, at, vol, this.musicBus, dur * 0.95, inst === 'erhu' ? 0.06 : 0.09);
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
