import * as THREE from 'three';
import { clamp, damp, wrapAngle } from './util';
import { occlusion } from './occlusion';

/** Gameplay camera styles the player can switch between at any time (key C / settings). */
export type CameraMode = 'iso' | 'third' | 'side' | 'cinema';
export const CAMERA_MODES: [CameraMode, string][] = [
  ['iso', 'Isometric'],
  ['third', 'Third person'],
  ['side', 'Side view (2D)'],
  ['cinema', 'Cinematic'],
];

interface Rig {
  yaw: number; pitch: number; dist: number; lookUp: number; lead: number; follow: boolean;
  /** Whether the player may orbit this style (the 2D side view stays locked). */
  orbit: boolean;
  /** Pull the camera in when terrain rises between it and the hero. */
  collide: boolean;
  /** Occlusion: cone radius round the camera→hero line, and the side-view foreground slab (0 = off). */
  occR: number; slab: number;
}

const RIGS: Record<CameraMode, Rig> = {
  // Hades/Diablo-style 45° three-quarter view.
  iso: { yaw: Math.PI / 4, pitch: 0.78, dist: 13.5, lookUp: 0.9, lead: 1, follow: false, orbit: true, collide: false, occR: 1.5, slab: 0 },
  // Behind the hero, over the shoulder; swings round slowly as they turn (unless the player is looking around).
  third: { yaw: 0, pitch: 0.34, dist: 7.2, lookUp: 1.5, lead: 0.6, follow: true, orbit: true, collide: true, occR: 1.1, slab: 0 },
  // Near-flat side-on view down the level: screen-right is "forward", like a 2D brawler.
  side: { yaw: Math.PI / 2, pitch: 0.2, dist: 18, lookUp: 1.6, lead: 1.4, follow: false, orbit: false, collide: false, occR: 2, slab: 3 },
  // Low, wide hero-shot angles that drift as you move, with letterbox bars.
  cinema: { yaw: Math.PI / 5, pitch: 0.24, dist: 9.5, lookUp: 1.4, lead: 1.2, follow: false, orbit: true, collide: true, occR: 1.3, slab: 0 },
};

/** Look input for free orbit: per-frame deltas (mouse/touch drag, radians) plus stick rates (-1..1). */
export interface LookInput {
  lookX: number; lookY: number; lookRateX: number; lookRateY: number;
  /** Written back: whether the right stick orbits (third person / cinematic) or aims (isometric / side). */
  rightStickLook: boolean;
}

/** Seconds without look input before the camera eases back (when auto-recenter is on). */
const RECENTER_DELAY = 3;
const PAD_LOOK_SPEED = 2.6; // rad/s at full stick
const PITCH_MIN = 0.06, PITCH_MAX = 1.3;

/**
 * Follow camera with switchable styles. Yaw/pitch/distance ease towards the active style's targets, so
 * switching modes glides instead of cutting. `yaw` is the direction from the hero to the camera; the input
 * layer reads it to make movement screen-relative. The player can orbit freely (stick, mouse or touch drag);
 * with auto-recenter on, the view eases back after a few seconds without look input.
 */
export class CameraRig {
  readonly target = new THREE.Vector3();
  zoom = 1;
  /** Multiplier for all shake (0 = off), from the "screen shake" setting. */
  shakeScale = 1;
  mode: CameraMode = 'iso';
  yaw = RIGS.iso.yaw;
  /** Ease back to the style's default angle after a few idle seconds. */
  autoRecenter = true;
  /** Ground height for camera pull-in (so it never sinks into hills); optional. */
  groundAt: ((x: number, z: number) => number) | null = null;
  private pitch = RIGS.iso.pitch;
  private dist = RIGS.iso.dist;
  private lookUp = RIGS.iso.lookUp;
  private zoomTarget = 1;
  /** Player orbit offsets from the style's default angle. */
  private orbitYaw = 0;
  private orbitPitch = 0;
  private lookIdle = 1e9;
  /** 0..1 fraction of the distance kept after ground pull-in (smoothed). */
  private pull = 1;
  /** Trauma 0..1: hits add to it, it decays, and shake = trauma² (game-feel skill). */
  private trauma = 0;
  private shakeT = 0;
  private readonly lead = new THREE.Vector3();
  private readonly leadTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  setMode(m: CameraMode) {
    this.mode = m;
    this.orbitYaw = this.orbitPitch = 0;
    this.lookIdle = 1e9;
  }

  snap(focus: THREE.Vector3, heroYaw = 0) {
    this.target.copy(focus);
    this.lead.set(0, 0, 0);
    this.leadTarget.set(0, 0, 0);
    this.trauma = 0;
    this.orbitYaw = this.orbitPitch = 0;
    this.lookIdle = 1e9;
    this.pull = 1;
    const r = RIGS[this.mode];
    this.yaw = r.follow ? heroYaw + Math.PI : r.yaw;
    this.pitch = r.pitch;
    this.dist = r.dist;
    this.lookUp = r.lookUp;
    this.update(0, focus, heroYaw);
  }

  setZoom(z: number) {
    this.zoomTarget = z;
  }

  /**
   * Adds shake trauma. `amp` keeps the old call-site scale (≈0.1 light hit … 1 boss slam);
   * `duration` is folded into how much trauma is added.
   */
  shake(amp: number, duration = 0.25) {
    this.trauma = clamp(this.trauma + amp * (0.6 + duration), 0, 1);
  }

  /** Look-ahead: lead the camera a little in the direction of movement / aim (world XZ). */
  setLead(x: number, z: number) {
    const k = RIGS[this.mode].lead;
    this.leadTarget.set(x * k, 0, z * k);
  }

  /** Free look: applies this frame's orbit input. Call once per frame before update(). */
  orbit(look: LookInput, dt: number) {
    const r = RIGS[this.mode];
    look.rightStickLook = r.orbit && this.mode !== 'iso';
    const dx = look.lookX + look.lookRateX * PAD_LOOK_SPEED * dt;
    const dy = look.lookY + look.lookRateY * PAD_LOOK_SPEED * 0.6 * dt;
    if (!r.orbit || (dx === 0 && dy === 0)) {
      this.lookIdle += dt;
      return;
    }
    this.lookIdle = 0;
    // Dragging right swings the view right: the camera moves the other way round the hero.
    this.yaw = wrapAngle(this.yaw - dx);
    if (!r.follow) this.orbitYaw = wrapAngle(this.orbitYaw - dx);
    const p = clamp(this.pitch + dy, PITCH_MIN, PITCH_MAX);
    this.orbitPitch += p - this.pitch;
    this.pitch = p;
  }

  update(dt: number, focus: THREE.Vector3, heroYaw = 0, time = 0) {
    const r = RIGS[this.mode];
    const first = dt === 0;
    const recenter = this.autoRecenter && this.lookIdle > RECENTER_DELAY;
    if (recenter || !r.orbit) {
      const kr = first ? 1 : damp(1.4, dt);
      this.orbitYaw -= this.orbitYaw * kr;
      this.orbitPitch -= this.orbitPitch * kr;
    }
    const looking = this.lookIdle < RECENTER_DELAY;
    let wantYaw: number;
    let k = first ? 1 : damp(this.mode === 'third' ? 2.2 : 3, dt);
    if (r.follow) {
      // Hold the player's chosen angle; swing back behind the hero only when recentering is allowed.
      if (recenter) wantYaw = heroYaw + Math.PI;
      else {
        wantYaw = this.yaw;
        if (!looking && !this.autoRecenter) k = 0;
      }
      if (recenter && this.lookIdle < RECENTER_DELAY + 1.5) k *= 0.5; // gentle start to the swing back
    } else {
      wantYaw = r.yaw + this.orbitYaw;
      // Cinematic: a slow orbital drift so the framing is never static.
      if (this.mode === 'cinema') wantYaw += Math.sin(time * 0.17) * 0.55;
    }
    this.yaw = wrapAngle(this.yaw + wrapAngle(wantYaw - this.yaw) * k);
    const kp = first ? 1 : damp(3, dt);
    this.pitch += (clamp(r.pitch + this.orbitPitch, PITCH_MIN, PITCH_MAX) - this.pitch) * (looking ? 1 : kp);
    this.dist += (r.dist - this.dist) * kp;
    this.lookUp += (r.lookUp - this.lookUp) * kp;

    this.lead.lerp(this.leadTarget, first ? 1 : damp(2.5, dt));
    this.tmp.copy(focus).add(this.lead);
    this.target.lerp(this.tmp, first ? 1 : damp(7, dt));
    this.zoom += (this.zoomTarget - this.zoom) * damp(3, dt);
    const portrait = this.camera.aspect < 1 ? 1.15 : 1;
    let d = this.dist * this.zoom * portrait;
    const ch = Math.cos(this.pitch);
    const sx = Math.sin(this.yaw) * ch, sy = Math.sin(this.pitch), sz = Math.cos(this.yaw) * ch;

    // Ground pull-in: walk the boom out from the hero and stop before it would dip under a hill.
    let want = 1;
    if (this.groundAt && r.collide) {
      const ty = this.target.y + this.lookUp;
      for (let i = 1; i <= 6; i++) {
        const f = i / 6;
        const x = this.target.x + sx * d * f, z = this.target.z + sz * d * f;
        if (ty + (this.target.y + sy * d - ty) * f < this.groundAt(x, z) + 0.45) {
          want = Math.max(0.25, (i - 1) / 6);
          break;
        }
      }
    }
    this.pull += (want - this.pull) * (first ? 1 : damp(want < this.pull ? 12 : 2, dt));
    d *= this.pull;

    this.camera.position.set(this.target.x + sx * d, this.target.y + sy * d, this.target.z + sz * d);
    this.camera.lookAt(this.target.x, this.target.y + this.lookUp, this.target.z);

    occlusion.focus.copy(focus);
    occlusion.radius = r.occR;
    occlusion.slab = r.slab;
    occlusion.fresh = true;

    // Smooth, self-ending shake on the camera only (never the simulated player).
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.6 * dt);
      this.shakeT += dt * 32;
      const s = this.trauma * this.trauma * this.shakeScale;
      const t = this.shakeT;
      this.camera.position.x += 0.9 * s * Math.sin(t * 1.7);
      this.camera.position.y += 0.6 * s * Math.sin(t * 2.3 + 1.3);
      this.camera.position.z += 0.6 * s * Math.sin(t * 1.9 + 2.1);
      this.camera.rotateZ(0.025 * s * Math.sin(t * 1.1));
    }
  }
}
