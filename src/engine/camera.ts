import * as THREE from 'three';
import { clamp, damp } from './util';

/** Fixed-yaw, high three-quarter camera that follows the player (Diablo-style). */
export class CameraRig {
  readonly target = new THREE.Vector3();
  zoom = 1;
  /** Multiplier for all shake (0 = off), from the "screen shake" setting. */
  shakeScale = 1;
  private zoomTarget = 1;
  /** Trauma 0..1: hits add to it, it decays, and shake = trauma² (game-feel skill). */
  private trauma = 0;
  private shakeT = 0;
  private readonly lead = new THREE.Vector3();
  private readonly leadTarget = new THREE.Vector3();
  private readonly offset = new THREE.Vector3(0, 17.5, 12.5);
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snap(focus: THREE.Vector3) {
    this.target.copy(focus);
    this.lead.set(0, 0, 0);
    this.leadTarget.set(0, 0, 0);
    this.trauma = 0;
    this.update(0, focus);
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
    this.leadTarget.set(x, 0, z);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.lead.lerp(this.leadTarget, dt === 0 ? 1 : damp(2.5, dt));
    this.tmp.copy(focus).add(this.lead);
    this.target.lerp(this.tmp, dt === 0 ? 1 : damp(7, dt));
    this.zoom += (this.zoomTarget - this.zoom) * damp(3, dt);
    const portrait = this.camera.aspect < 1 ? 1.15 : 1;
    this.tmp.copy(this.offset).multiplyScalar(this.zoom * portrait);
    this.camera.position.copy(this.target).add(this.tmp);
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z - 0.5);

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
