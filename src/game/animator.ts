import * as THREE from 'three';
import { clip } from './assets';

export interface Locomotion {
  idle: string;
  /** Looping move clips and the ground speed (units/s) each was authored at, slowest first. */
  moves: { name: string; speed: number }[];
  /** Occasional idle break clips (look around, fold arms); played when standing still for a while. */
  breaks?: string[];
}

interface Layer {
  action: THREE.AnimationAction;
  weight: number;
  /** Own fade rate (1 / fade seconds), captured when the layer was pushed or started. */
  rate: number;
}

/** Smoothstep: eases the ends of every crossfade so clips slide into each other instead of popping. */
const ease = (w: number) => w * w * (3 - 2 * w);

/** Bones the procedural overlay bends, outermost last, with how much of the bend each one takes. */
const SPINE: [string, number][] = [['spine_01', 0.3], ['spine_02', 0.3], ['spine_03', 0.25], ['neck_01', 0.15]];

/**
 * Drives a skinned character from motion-captured clips.
 *
 * Locomotion clips loop and blend by ground speed. Actions are "posed": the game sets the clip time
 * every frame from its own state timer, so hit frames, cancels and holds (e.g. a charged wind-up) stay
 * exactly in sync with gameplay. Switching clips crossfades on an eased curve, so nothing pops.
 *
 * On top of the sampled pose sits a cheap procedural overlay (`bias`): breathing, leaning into a turn or
 * a sprint, and a recoil kick when hit. It is applied to the spine after the mixer has written the pose,
 * so it layers onto any clip without a second animation track.
 */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: Layer | null = null;
  private fading: Layer[] = [];
  private locoBlend = 0;
  private phase = 0;
  private idleTime = 0;
  private breakT = 0;
  private breakClip: string | null = null;
  private spine: { bone: THREE.Bone; k: number }[] = [];
  /**
   * Procedural pose offsets, in radians, set by the owner each frame and eased back by it.
   * `lean` bends forward (+) / back (−), `side` banks left/right, `twist` turns the chest,
   * `breathe` is the idle rise and fall.
   */
  readonly bias = { lean: 0, side: 0, twist: 0, breathe: 0 };
  /** Locomotion cycle position, 0..1 (two footfalls per cycle). */
  get stridePhase() {
    return this.phase;
  }
  /** Seconds spent standing still in locomotion (used for idle breaks). */
  get standingTime() {
    return this.idleTime;
  }

  constructor(readonly root: THREE.Object3D, private readonly loco: Locomotion) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const n of [loco.idle, ...loco.moves.map((m) => m.name)]) this.action(n).setEffectiveWeight(0);
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      const hit = SPINE.find(([n]) => n === b.name);
      if (hit) this.spine.push({ bone: b, k: hit[1] });
    });
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

  /** Starts `a` as the current layer, pushing whatever played before into the fade-out list. */
  private switchTo(a: THREE.AnimationAction, fade: number) {
    const rate = fade > 0 ? 1 / fade : 1000;
    if (this.current) {
      this.current.rate = rate;
      this.fading.push(this.current);
    }
    this.fading = this.fading.filter((l) => l.action !== a);
    // Keep at most two outgoing layers: a long chain of stale clips muddies the pose and costs CPU.
    while (this.fading.length > 2) {
      const l = this.fading.shift()!;
      l.action.setEffectiveWeight(0);
    }
    this.current = { action: a, weight: 0, rate };
    return this.current;
  }

  /** Shows `name` at clip time `t` (seconds), crossfading from whatever played before over `fade` seconds. */
  pose(name: string, t: number, fade = 0.08) {
    const a = this.action(name);
    if (this.current?.action !== a) {
      this.switchTo(a, fade);
      a.timeScale = 0;
      a.enabled = true;
    } else if (fade > 0) {
      this.current.rate = 1 / fade;
    }
    a.time = Math.min(Math.max(t, 0), a.getClip().duration - 1e-3);
  }

  /** Lets an action play on its own clock (loops, idles in cutscenes). */
  loop(name: string, speed = 1, fade = 0.2) {
    const a = this.action(name);
    if (this.current?.action !== a) {
      this.switchTo(a, fade);
      a.reset().play();
    }
    a.timeScale = speed;
  }

  /** Returns to locomotion. */
  release(fade = 0.15) {
    if (this.current) {
      this.current.rate = fade > 0 ? 1 / fade : 1000;
      this.fading.push(this.current);
    }
    this.current = null;
  }

  get playing() {
    return this.current ? this.current.action.getClip().name : null;
  }

  /** Advances clocks and blends. `speed` is the character's ground speed (units/s). */
  update(dt: number, speed: number) {
    if (this.current) this.current.weight = Math.min(1, this.current.weight + dt * this.current.rate);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const l = this.fading[i];
      l.weight -= dt * l.rate;
      if (l.weight <= 0) {
        l.action.setEffectiveWeight(0);
        this.fading.splice(i, 1);
      }
    }

    // Each layer only takes the share left by the layers above it, so weights always sum to one.
    let left = 1;
    if (this.current) {
      const w = ease(this.current.weight);
      this.current.action.setEffectiveWeight(w);
      left -= w;
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const w = Math.min(left, ease(Math.max(0, this.fading[i].weight)));
      this.fading[i].action.setEffectiveWeight(w);
      left -= w;
    }
    this.blendLocomotion(dt, speed, Math.max(0, left));
    this.mixer.update(dt);
    this.applyBias();
  }

  /** Bends the spine on top of the sampled pose (the mixer has just overwritten it). */
  private applyBias() {
    const { lean, side, twist, breathe } = this.bias;
    if (!lean && !side && !twist && !breathe) return;
    for (const s of this.spine) {
      s.bone.rotation.x += (lean + breathe) * s.k;
      s.bone.rotation.z += side * s.k;
      s.bone.rotation.y += twist * s.k;
    }
  }

  private blendLocomotion(dt: number, speed: number, weight: number) {
    const { idle, moves } = this.loco;
    // Smoothed blend position: 0 = idle, i + 1 = moves[i] (fractions blend neighbours).
    // Below the slowest clip's authored speed we blend idle→walk by the *ratio*, so a creeping
    // character doesn't play a full-speed stride with sliding feet.
    let target = 0;
    if (speed > 0.05) {
      if (speed < moves[0].speed) target = speed / moves[0].speed;
      else {
        target = 1;
        for (let i = 0; i < moves.length - 1; i++) {
          if (speed > moves[i].speed) target = 1 + i + Math.min(1, (speed - moves[i].speed) / (moves[i + 1].speed - moves[i].speed));
        }
      }
    }
    this.locoBlend += (target - this.locoBlend) * Math.min(1, dt * 12);
    const b = this.locoBlend;
    const idleW = weight * Math.max(0, 1 - b);
    this.action(idle).setEffectiveWeight(idleW);
    // One shared stride phase keeps the feet of blended cycles in step; its rate follows the real
    // ground speed (not a clamped guess), so feet plant instead of skating.
    const dom = moves[Math.min(moves.length - 1, Math.max(0, Math.round(b) - 1))];
    const rate = Math.min(2.0, Math.max(0.25, speed / dom.speed)) / this.duration(dom.name);
    this.phase = (this.phase + dt * rate) % 1;
    moves.forEach((m, i) => {
      const a = this.action(m.name);
      a.setEffectiveWeight(weight * Math.max(0, 1 - Math.abs(b - (i + 1))));
      a.timeScale = 0;
      a.time = this.phase * this.duration(m.name);
    });
    this.idleBreaks(dt, weight, idleW, speed);
  }

  /**
   * Idle breaks: after a while standing still the character looks around or folds its arms, then
   * settles back into the idle. Any movement or action cancels it instantly.
   */
  private idleBreaks(dt: number, weight: number, idleW: number, speed: number) {
    const breaks = this.loco.breaks;
    if (speed > 0.1 || weight < 0.95) {
      this.idleTime = 0;
      if (this.breakClip) {
        this.action(this.breakClip).setEffectiveWeight(0);
        this.breakClip = null;
      }
      return;
    }
    this.idleTime += dt;
    if (!breaks || !breaks.length) return;
    if (this.breakClip) {
      const a = this.action(this.breakClip);
      this.breakT += dt;
      const dur = a.getClip().duration;
      // Fade the break in over 0.35 s, hold, then fade out; the idle shows through underneath.
      const w = Math.min(1, this.breakT / 0.35, Math.max(0, (dur - this.breakT) / 0.4));
      a.time = Math.min(this.breakT, dur - 1e-3);
      a.timeScale = 0;
      a.setEffectiveWeight(ease(Math.max(0, w)) * idleW);
      this.action(this.loco.idle).setEffectiveWeight(idleW * (1 - ease(Math.max(0, w)) * 0.85));
      if (this.breakT >= dur) {
        a.setEffectiveWeight(0);
        this.breakClip = null;
        this.idleTime = 0;
      }
    } else if (this.idleTime > 6 && Math.random() < dt * 0.35) {
      this.breakClip = breaks[Math.floor(Math.random() * breaks.length)];
      this.breakT = 0;
      this.action(this.breakClip).enabled = true;
    }
  }
}
