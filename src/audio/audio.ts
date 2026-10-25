/**
 * All sound is synthesised with the Web Audio API at runtime, so the game
 * needs no audio files and works fully offline.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'crit' | 'shatter' | 'coin' | 'pickup' | 'levelup'
  | 'skitter' | 'bite' | 'roar' | 'fire' | 'whirl' | 'slam' | 'gale' | 'hurt' | 'dodge'
  | 'transform' | 'seal' | 'web' | 'legendary' | 'death';

const PENTA = [0, 2, 4, 7, 9];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPlay = new Map<Sfx, number>();
  private musicTimer = 0;
  private beat = 0;
  combatIntensity = 0;
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
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startRain();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }
  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.value = v;
  }

  private startRain() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    src.connect(f).connect(g).connect(this.musicBus);
    src.start();
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random(), dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: GainNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(s: Sfx) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const minGap = s === 'hit' || s === 'coin' || s === 'skitter' ? 0.04 : 0.02;
    if (now - (this.lastPlay.get(s) ?? -1) < minGap) return;
    this.lastPlay.set(s, now);
    switch (s) {
      case 'swing': this.noise(0.18, 'bandpass', 900, 3000, 0.35, 1.5); break;
      case 'swingHeavy': this.noise(0.3, 'bandpass', 500, 2200, 0.5, 1.2); break;
      case 'hit':
        this.noise(0.12, 'lowpass', 2500, 300, 0.5);
        this.tone('sine', 140, 50, 0.15, 0.5);
        break;
      case 'crit':
        this.noise(0.18, 'lowpass', 4000, 300, 0.6);
        this.tone('triangle', 220, 60, 0.25, 0.5);
        this.tone('sine', 1400, 900, 0.12, 0.12);
        break;
      case 'shatter':
        for (let i = 0; i < 4; i++) this.noise(0.12 + Math.random() * 0.1, 'highpass', 1500 + Math.random() * 2000, 800, 0.3, 1, i * 0.03);
        this.tone('sine', 90, 40, 0.2, 0.4);
        break;
      case 'coin':
        this.tone('square', 1320, 1320, 0.06, 0.06);
        this.tone('square', 1760, 1760, 0.12, 0.06, 0.05);
        break;
      case 'pickup': this.tone('triangle', 600, 900, 0.15, 0.2); break;
      case 'legendary':
        [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', 440 * 2 ** (n / 12), 440 * 2 ** (n / 12), 0.6, 0.15, i * 0.08));
        break;
      case 'levelup':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone('triangle', 392 * 2 ** (n / 12), 392 * 2 ** (n / 12), 0.5, 0.18, i * 0.07));
        this.noise(1.2, 'highpass', 6000, 3000, 0.08);
        break;
      case 'skitter': this.noise(0.08, 'highpass', 5000, 3000, 0.08); break;
      case 'bite':
        this.tone('sawtooth', 700, 200, 0.12, 0.12);
        this.noise(0.08, 'bandpass', 2000, 1000, 0.2, 2);
        break;
      case 'roar':
        this.tone('sawtooth', 110, 55, 1.4, 0.35);
        this.tone('sawtooth', 113, 50, 1.4, 0.25);
        this.noise(1.2, 'lowpass', 900, 200, 0.4);
        break;
      case 'fire': this.noise(0.5, 'lowpass', 1800, 400, 0.4, 0.8); break;
      case 'whirl': this.noise(0.6, 'bandpass', 600, 1800, 0.35, 2); break;
      case 'slam':
        this.tone('sine', 120, 30, 0.5, 0.9);
        this.noise(0.5, 'lowpass', 1200, 100, 0.7);
        break;
      case 'gale': this.noise(0.6, 'bandpass', 3000, 600, 0.35, 3); break;
      case 'hurt':
        this.tone('square', 220, 110, 0.15, 0.12);
        this.noise(0.1, 'lowpass', 1500, 300, 0.3);
        break;
      case 'dodge': this.noise(0.15, 'highpass', 1500, 4000, 0.2); break;
      case 'transform':
        this.tone('sawtooth', 80, 320, 1.2, 0.3);
        this.noise(1.2, 'bandpass', 300, 4000, 0.4, 1);
        [0, 7, 12, 19].forEach((n, i) => this.tone('triangle', 262 * 2 ** (n / 12), 262 * 2 ** (n / 12), 0.8, 0.15, 0.3 + i * 0.1));
        break;
      case 'seal':
        this.tone('sine', 880, 220, 0.8, 0.2);
        this.noise(0.6, 'highpass', 3000, 8000, 0.15);
        break;
      case 'web': this.noise(0.2, 'bandpass', 1200, 400, 0.2, 4); break;
      case 'death':
        this.tone('sawtooth', 300, 40, 1.5, 0.3);
        this.noise(1.5, 'lowpass', 800, 60, 0.4);
        break;
    }
  }

  /** Generative score: pentatonic plucks over a drone, drums with combat intensity. */
  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const fight = this.combatIntensity > 0.3;
    const step = fight ? 0.25 : 0.5;
    this.musicTimer += step;
    this.beat++;
    const root = 146.83; // D3
    if (this.beat % (fight ? 16 : 8) === 0) this.tone('triangle', root / 2, root / 2, step * 8, 0.12, 0, this.musicBus);
    if (Math.random() < (fight ? 0.55 : 0.35)) {
      const n = PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.3 ? 12 : 0);
      const f = root * 2 * 2 ** (n / 12);
      this.tone('triangle', f, f * 0.995, fight ? 0.35 : 0.9, 0.06, 0, this.musicBus);
    }
    if (fight) {
      if (this.beat % 4 === 0) this.tone('sine', 90, 40, 0.3, 0.35, 0, this.musicBus);
      if (this.beat % 8 === 6) this.tone('sine', 70, 35, 0.3, 0.3, 0, this.musicBus);
      if (this.beat % 2 === 1 && Math.random() < 0.5) this.tone('sine', 180, 90, 0.08, 0.08, 0, this.musicBus);
    }
  }
}
