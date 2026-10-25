/**
 * All sound is synthesised with the Web Audio API at runtime, so the game
 * needs no audio files and works fully offline.
 *
 * Mix (audio-design skill): sources → category buses (sfx / music / ambience)
 * → master → compressor (safety limiter). A shared convolution reverb is fed
 * by per-bus sends. Music is adaptive: explore, combat and boss layers
 * crossfade with game intensity instead of looping one track.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'crit' | 'shatter' | 'coin' | 'pickup' | 'levelup'
  | 'skitter' | 'bite' | 'roar' | 'fire' | 'whirl' | 'slam' | 'gale' | 'hurt' | 'dodge'
  | 'transform' | 'seal' | 'web' | 'legendary' | 'death'
  | 'heavyCharge' | 'chargeLevel' | 'heavyHit' | 'drink' | 'perfect' | 'immobilize' | 'ringfire' | 'focus'
  | 'uiMove' | 'uiSelect' | 'uiBack';

// D minor pentatonic-ish (D F G A C) — gives the score its "ancient temple" colour.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const ROOT = 146.83; // D3

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private reverbIn!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPlay = new Map<Sfx, number>();
  private layers!: { explore: GainNode; combat: GainNode; boss: GainNode };
  private musicTimer = 0;
  private beat = 0;
  private bar = 0;
  private chord = 0;
  /** 0 = exploring, 1 = fighting. Set by the game each frame. */
  combatIntensity = 0;
  boss = false;
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
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master.connect(limiter).connect(ctx.destination);

    // Shared reverb (procedural impulse: decaying stereo noise ≈ stone temple courtyard)
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.4, 2.8);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.35;
    this.reverbIn.connect(conv).connect(revOut).connect(this.master);

    this.sfxBus = this.bus(0.16);
    this.musicBus = this.bus(0.4);
    this.musicBus.gain.value = this.gain(this.musicVolume);
    this.ambBus = this.bus(0.25);
    this.ambBus.gain.value = 0.9;

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.layers = {
      explore: this.layer(1),
      combat: this.layer(0),
      boss: this.layer(0),
    };
    this.startAmbience();
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

  private layer(v: number) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(this.musicBus);
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
    // Rain: band-passed noise with a slow gust LFO
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 0.35;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    // Low wind
    const w = ctx.createBufferSource();
    w.buffer = this.noiseBuf;
    w.loop = true;
    w.playbackRate.value = 0.5;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 300;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    w.connect(wf).connect(wg).connect(this.ambBus);
    w.start();
  }

  // ---------------------------------------------------------------------------
  // Synth voices
  // ---------------------------------------------------------------------------

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1, delay = 0, bus?: GainNode) {
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
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random(), dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: GainNode, attack = 0.01) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Plucked string (guzheng-like): bright attack through a closing low-pass. */
  private pluck(freq: number, dur: number, vol: number, bus: GainNode, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2.003;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  /** Bowed lead (erhu-like): sawtooth with delayed vibrato through a band-pass. */
  private bowed(freq: number, dur: number, vol: number, bus: GainNode, slideFrom?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(slideFrom ?? freq, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.5);
    vib.connect(vibG).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 2.5;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** Warm pad chord (two detuned saws per note, low-passed). */
  private pad(notes: number[], dur: number, vol: number, bus: GainNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(bus);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private drum(freq: number, vol: number, bus: GainNode, delay = 0) {
    this.tone('sine', freq, freq * 0.4, 0.35, vol, delay, bus, 0.003);
    this.noise(0.08, 'lowpass', 900, 200, vol * 0.4, 1, delay, bus);
  }

  // ---------------------------------------------------------------------------

  play(s: Sfx) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const minGap = s === 'hit' || s === 'coin' || s === 'skitter' ? 0.04 : 0.02;
    if (now - (this.lastPlay.get(s) ?? -1) < minGap) return;
    this.lastPlay.set(s, now);
    // Variation: every one-shot gets a slightly different pitch so repeats don't sound robotic.
    const v = 0.92 + Math.random() * 0.16;
    switch (s) {
      case 'swing': this.noise(0.17, 'bandpass', 900 * v, 3200 * v, 0.32, 1.6); break;
      case 'swingHeavy':
        this.noise(0.32, 'bandpass', 420 * v, 2200 * v, 0.5, 1.2);
        this.tone('sine', 90 * v, 60, 0.25, 0.15);
        break;
      case 'hit':
        this.noise(0.11, 'lowpass', 2600 * v, 300, 0.5);
        this.tone('sine', 150 * v, 50, 0.14, 0.5);
        this.tone('square', 900 * v, 400, 0.04, 0.04);
        break;
      case 'crit':
        this.noise(0.18, 'lowpass', 4200, 300, 0.6);
        this.tone('triangle', 230 * v, 60, 0.25, 0.5);
        this.tone('sine', 1500 * v, 900, 0.14, 0.12);
        break;
      case 'heavyHit':
        this.tone('sine', 110 * v, 35, 0.45, 0.85);
        this.noise(0.35, 'lowpass', 1800, 120, 0.6);
        this.tone('square', 600 * v, 200, 0.06, 0.06);
        break;
      case 'shatter':
        for (let i = 0; i < 4; i++) this.noise(0.12 + Math.random() * 0.1, 'highpass', 1500 + Math.random() * 2000, 800, 0.3, 1, i * 0.03);
        this.tone('sine', 90, 40, 0.2, 0.4);
        break;
      case 'coin':
        this.tone('square', 1320 * v, 1320 * v, 0.06, 0.05);
        this.tone('square', 1760 * v, 1760 * v, 0.12, 0.05, 0.05);
        break;
      case 'pickup': this.tone('triangle', 600 * v, 900 * v, 0.15, 0.2); break;
      case 'legendary':
        [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', 440 * 2 ** (n / 12), 440 * 2 ** (n / 12), 0.6, 0.15, i * 0.08));
        break;
      case 'levelup':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone('triangle', 392 * 2 ** (n / 12), 392 * 2 ** (n / 12), 0.5, 0.18, i * 0.07));
        this.noise(1.2, 'highpass', 6000, 3000, 0.08);
        break;
      case 'skitter': this.noise(0.08, 'highpass', 5000 * v, 3000, 0.07); break;
      case 'bite':
        this.tone('sawtooth', 700 * v, 200, 0.12, 0.12);
        this.noise(0.08, 'bandpass', 2000, 1000, 0.2, 2);
        break;
      case 'roar':
        this.tone('sawtooth', 110, 55, 1.4, 0.35);
        this.tone('sawtooth', 113, 50, 1.4, 0.25);
        this.noise(1.2, 'lowpass', 900, 200, 0.4);
        break;
      case 'fire': this.noise(0.5, 'lowpass', 1800 * v, 400, 0.4, 0.8); break;
      case 'whirl': this.noise(0.5, 'bandpass', 600 * v, 1800 * v, 0.32, 2); break;
      case 'slam':
        this.tone('sine', 120, 30, 0.55, 0.95);
        this.noise(0.5, 'lowpass', 1200, 100, 0.7);
        this.noise(0.8, 'lowpass', 400, 60, 0.3, 1, 0.05);
        break;
      case 'gale': this.noise(0.6, 'bandpass', 3000, 600, 0.35, 3); break;
      case 'hurt':
        this.tone('square', 220 * v, 110, 0.15, 0.12);
        this.noise(0.1, 'lowpass', 1500, 300, 0.3);
        break;
      case 'dodge': this.noise(0.18, 'highpass', 1400 * v, 4200, 0.22); break;
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
      case 'heavyCharge': this.noise(0.6, 'bandpass', 300, 1400, 0.18, 3); break;
      case 'chargeLevel':
        this.tone('triangle', 520 * v, 780 * v, 0.18, 0.18);
        this.tone('sine', 1040 * v, 1040 * v, 0.25, 0.06, 0.04);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 40, 200, 0.12, 0.12, i * 0.12);
        this.tone('triangle', 660, 990, 0.5, 0.1, 0.4);
        break;
      case 'perfect':
        this.tone('sine', 1760, 880, 0.5, 0.18);
        this.tone('triangle', 2640, 2640, 0.3, 0.06, 0.03);
        this.noise(0.4, 'highpass', 4000, 9000, 0.12);
        break;
      case 'immobilize':
        [0, 5, 12].forEach((n, i) => this.tone('triangle', 587 * 2 ** (n / 12), 587 * 2 ** (n / 12), 0.9, 0.12, i * 0.04));
        this.noise(0.5, 'highpass', 5000, 9000, 0.1);
        this.tone('sine', 80, 50, 0.6, 0.4);
        break;
      case 'ringfire':
        this.noise(1.2, 'lowpass', 2500, 300, 0.5, 0.7);
        this.tone('sawtooth', 70, 50, 0.8, 0.2);
        break;
      case 'focus': this.tone('triangle', 1175 * v, 1175 * v, 0.3, 0.1); break;
      case 'uiMove': this.tone('triangle', 880, 880, 0.05, 0.05); break;
      case 'uiSelect': this.tone('triangle', 660, 990, 0.12, 0.09); break;
      case 'uiBack': this.tone('triangle', 660, 440, 0.12, 0.07); break;
    }
  }

  /** Adaptive score. Layers crossfade by intensity; phrases follow a slow chord cycle. */
  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const fight = this.combatIntensity;
    this.layers.explore.gain.setTargetAtTime(1 - fight * 0.6, t, 0.8);
    this.layers.combat.gain.setTargetAtTime(this.boss ? 0.5 : fight, t, 0.6);
    this.layers.boss.gain.setTargetAtTime(this.boss ? 1 : 0, t, 0.6);

    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const tempo = this.boss ? 0.2 : 0.25; // seconds per 8th note
    this.musicTimer += tempo;
    this.beat = (this.beat + 1) % 16;
    if (this.beat === 0) {
      this.bar++;
      if (this.bar % 2 === 0) this.chord = (this.chord + 1) % 4;
    }
    const chordRoots = [0, -4, -2, 3]; // Dm, Bb, C, F (in semitones from D)
    const cr = ROOT * 2 ** (chordRoots[this.chord] / 12);
    const L = this.layers;

    // Explore: pad + sparse guzheng plucks
    if (this.beat === 0 && this.bar % 2 === 0) this.pad([cr / 2, cr * 0.75, cr], tempo * 32, 0.035, L.explore);
    if (Math.random() < (this.beat % 4 === 0 ? 0.5 : 0.18)) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)];
      this.pluck(ROOT * 2 * 2 ** (n / 12), 1.4, 0.05, L.explore);
    }
    // Combat: taiko pattern + erhu phrases
    if (this.beat % 8 === 0) this.drum(70, 0.45, L.combat);
    if (this.beat % 8 === 3 || this.beat % 8 === 6) this.drum(95, 0.25, L.combat);
    if (this.beat % 2 === 1 && Math.random() < 0.4) this.noise(0.05, 'highpass', 3000, 2000, 0.05, 1, 0, L.combat);
    if (this.beat % 8 === 0 && Math.random() < 0.7) {
      const n = SCALE[Math.floor(Math.random() * 5)];
      const f = ROOT * 2 * 2 ** (n / 12);
      this.bowed(f, tempo * (Math.random() < 0.5 ? 6 : 3), 0.05, L.combat, f * 0.94);
    }
    // Boss: driving low drums + octave stabs
    if (this.beat % 2 === 0) this.drum(55, 0.35, L.boss);
    if (this.beat % 4 === 2) this.drum(110, 0.2, L.boss);
    if (this.beat === 0 || this.beat === 6 || this.beat === 12) this.tone('sawtooth', cr / 2, cr / 2, 0.4, 0.06, 0, L.boss);
  }
}
