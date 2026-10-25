import * as THREE from 'three';
import { damp } from './util';

/** Fixed-yaw, high three-quarter camera that follows the player (Diablo-style). */
export class CameraRig {
  readonly target = new THREE.Vector3();
  zoom = 1;
  private zoomTarget = 1;
  private shakeTime = 0;
  private shakeAmp = 0;
  private readonly offset = new THREE.Vector3(0, 17.5, 12.5);
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snap(focus: THREE.Vector3) {
    this.target.copy(focus);
    this.update(0, focus);
  }

  setZoom(z: number) {
    this.zoomTarget = z;
  }

  shake(amp: number, duration = 0.25) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.target.lerp(focus, dt === 0 ? 1 : damp(7, dt));
    this.zoom += (this.zoomTarget - this.zoom) * damp(3, dt);
    const portrait = this.camera.aspect < 1 ? 1.15 : 1;
    this.tmp.copy(this.offset).multiplyScalar(this.zoom * portrait);
    this.camera.position.copy(this.target).add(this.tmp);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeTime * 5);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z - 0.5);
  }
}
