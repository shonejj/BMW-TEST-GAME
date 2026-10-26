import * as THREE from 'three';
import { clip } from './assets';

export interface Locomotion {
  idle: string;
  /** Looping move clips and the ground speed (units/s) each was authored at, slowest first. */
  moves: { name: string; speed: number }[];
}

interface Layer {
  action: THREE.AnimationAction;
  weight: number;
}

/**
 * Drives a skinned character from motion-captured clips.
 *
 * Locomotion clips loop and blend by ground speed. Actions are "posed": the game sets the clip time
 * every frame from its own state timer, so hit frames, cancels and holds (e.g. a charged wind-up) stay
 * exactly in sync with gameplay. Switching clips crossfades, so nothing pops.
 */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: Layer | null = null;
  private fading: Layer[] = [];
  private fadeRate = 10;
  private locoBlend = 0;
  private phase = 0;

  constructor(readonly root: THREE.Object3D, private readonly loco: Locomotion) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const n of [loco.idle, ...loco.moves.map((m) => m.name)]) this.action(n).setEffectiveWeight(0);
  }

  private action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      a = this.mixer.clipAction(clip(name));
      a.play();
      a.setEffectiveWeight(0);
      this.actions.set(name, a);
    }
    return a;
  }

  duration(name: string) {
    return clip(name).duration;
  }

  /** Shows `name` at clip time `t` (seconds), crossfading from whatever played before over `fade` seconds. */
  pose(name: string, t: number, fade = 0.08) {
    const a = this.action(name);
    if (this.current?.action !== a) {
      if (this.current) this.fading.push(this.current);
      this.fading = this.fading.filter((l) => l.action !== a);
      this.current = { action: a, weight: 0 };
      a.timeScale = 0;
      a.enabled = true;
    }
    this.fadeRate = fade > 0 ? 1 / fade : 1000;
    a.time = Math.min(Math.max(t, 0), a.getClip().duration - 1e-3);
  }

  /** Lets an action play on its own clock (loops, idles in cutscenes). */
  loop(name: string, speed = 1, fade = 0.2) {
    const a = this.action(name);
    if (this.current?.action !== a) {
      if (this.current) this.fading.push(this.current);
      this.fading = this.fading.filter((l) => l.action !== a);
      this.current = { action: a, weight: 0 };
      a.reset().play();
    }
    a.timeScale = speed;
    this.fadeRate = fade > 0 ? 1 / fade : 1000;
  }

  /** Returns to locomotion. */
  release(fade = 0.15) {
    if (this.current) this.fading.push(this.current);
    this.current = null;
    this.fadeRate = fade > 0 ? 1 / fade : 1000;
  }

  get playing() {
    return this.current ? this.current.action.getClip().name : null;
  }

  /** Advances clocks and blends. `speed` is the character's ground speed (units/s). */
  update(dt: number, speed: number) {
    const step = dt * this.fadeRate;
    if (this.current) this.current.weight = Math.min(1, this.current.weight + step);
    for (const l of this.fading) l.weight -= step;
    for (const l of this.fading) if (l.weight <= 0) l.action.setEffectiveWeight(0);
    this.fading = this.fading.filter((l) => l.weight > 0);

    // Each layer only takes the share left by the layers above it, so weights always sum to one.
    let left = 1;
    if (this.current) {
      this.current.action.setEffectiveWeight(this.current.weight);
      left -= this.current.weight;
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const w = Math.min(left, this.fading[i].weight);
      this.fading[i].action.setEffectiveWeight(w);
      left -= w;
    }
    this.blendLocomotion(dt, speed, Math.max(0, left));
    this.mixer.update(dt);
  }

  private blendLocomotion(dt: number, speed: number, weight: number) {
    const { idle, moves } = this.loco;
    // Smoothed blend position: 0 = idle, i + 1 = moves[i] (fractions blend neighbours).
    let target = 0;
    if (speed > 0.15) {
      target = 1;
      for (let i = 0; i < moves.length - 1; i++) {
        if (speed > moves[i].speed) target = 1 + i + Math.min(1, (speed - moves[i].speed) / (moves[i + 1].speed - moves[i].speed));
      }
    }
    this.locoBlend += (target - this.locoBlend) * Math.min(1, dt * 10);
    const b = this.locoBlend;
    this.action(idle).setEffectiveWeight(weight * Math.max(0, 1 - b));
    // One shared stride phase keeps the feet of blended cycles in step; its rate follows ground speed
    // so feet don't skate.
    const dom = moves[Math.min(moves.length - 1, Math.max(0, Math.round(b) - 1))];
    const rate = Math.min(1.6, Math.max(0.6, speed / dom.speed)) / this.duration(dom.name);
    this.phase = (this.phase + dt * rate) % 1;
    moves.forEach((m, i) => {
      const a = this.action(m.name);
      a.setEffectiveWeight(weight * Math.max(0, 1 - Math.abs(b - (i + 1))));
      a.timeScale = 0;
      a.time = this.phase * this.duration(m.name);
    });
  }
}
