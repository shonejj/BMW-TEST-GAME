import * as THREE from 'three';
import { clamp, damp, wrapAngle } from './util';

/** Gameplay camera styles the player can switch between at any time (key C / settings). */
export type CameraMode = 'iso' | 'third' | 'side' | 'cinema';
export const CAMERA_MODES: [CameraMode, string][] = [
  ['iso', 'Isometric'],
  ['third', 'Third person'],
  ['side', 'Side view (2D)'],
  ['cinema', 'Cinematic'],
];

interface Rig { yaw: number; pitch: number; dist: number; lookUp: number; lead: number; follow: boolean }

const RIGS: Record<CameraMode, Rig> = {
  // Hades/Diablo-style 45° three-quarter view.
  iso: { yaw: Math.PI / 4, pitch: 0.78, dist: 13.5, lookUp: 0.9, lead: 1, follow: false },
  // Behind the hero, over the shoulder; swings round slowly as they turn.
  third: { yaw: 0, pitch: 0.34, dist: 7.2, lookUp: 1.5, lead: 0.6, follow: true },
  // Near-flat side-on view down the level: screen-right is "forward", like a 2D brawler.
  side: { yaw: Math.PI / 2, pitch: 0.2, dist: 18, lookUp: 1.6, lead: 1.4, follow: false },
  // Low, wide hero-shot angles that drift as you move, with letterbox bars.
  cinema: { yaw: Math.PI / 5, pitch: 0.24, dist: 9.5, lookUp: 1.4, lead: 1.2, follow: false },
};

/**
 * Follow camera with switchable styles. Yaw/pitch/distance ease towards the active style's targets, so
 * switching modes glides instead of cutting. `yaw` is the direction from the hero to the camera; the input
 * layer reads it to make movement screen-relative.
 */
export class CameraRig {
  readonly target = new THREE.Vector3();
  zoom = 1;
  /** Multiplier for all shake (0 = off), from the "screen shake" setting. */
  shakeScale = 1;
  mode: CameraMode = 'iso';
  yaw = RIGS.iso.yaw;
  private pitch = RIGS.iso.pitch;
  private dist = RIGS.iso.dist;
  private lookUp = RIGS.iso.lookUp;
  private zoomTarget = 1;
  /** Trauma 0..1: hits add to it, it decays, and shake = trauma² (game-feel skill). */
  private trauma = 0;
  private shakeT = 0;
  private readonly lead = new THREE.Vector3();
  private readonly leadTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  setMode(m: CameraMode) {
    this.mode = m;
  }

  snap(focus: THREE.Vector3, heroYaw = 0) {
    this.target.copy(focus);
    this.lead.set(0, 0, 0);
    this.leadTarget.set(0, 0, 0);
    this.trauma = 0;
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

  update(dt: number, focus: THREE.Vector3, heroYaw = 0, time = 0) {
    const r = RIGS[this.mode];
    const first = dt === 0;
    let wantYaw = r.follow ? heroYaw + Math.PI : r.yaw;
    // Cinematic: a slow orbital drift so the framing is never static.
    if (this.mode === 'cinema') wantYaw += Math.sin(time * 0.17) * 0.55;
    const k = first ? 1 : damp(this.mode === 'third' ? 2.2 : 3, dt);
    this.yaw += wrapAngle(wantYaw - this.yaw) * k;
    this.pitch += (r.pitch - this.pitch) * k;
    this.dist += (r.dist - this.dist) * k;
    this.lookUp += (r.lookUp - this.lookUp) * k;

    this.lead.lerp(this.leadTarget, first ? 1 : damp(2.5, dt));
    this.tmp.copy(focus).add(this.lead);
    this.target.lerp(this.tmp, first ? 1 : damp(7, dt));
    this.zoom += (this.zoomTarget - this.zoom) * damp(3, dt);
    const portrait = this.camera.aspect < 1 ? 1.15 : 1;
    const d = this.dist * this.zoom * portrait;
    const ch = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * ch * d,
      this.target.y + Math.sin(this.pitch) * d,
      this.target.z + Math.cos(this.yaw) * ch * d,
    );
    this.camera.lookAt(this.target.x, this.target.y + this.lookUp, this.target.z);

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
