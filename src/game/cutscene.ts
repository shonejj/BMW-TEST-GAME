import * as THREE from 'three';
import { clamp } from '../engine/util';

/**
 * In-engine cutscenes: a camera track of shots with eased moves, letterbox
 * bars and subtitles. Rendering the real scene (instead of shipping video
 * files) keeps the download tiny, works offline, and matches the player's
 * graphics settings.
 */
export interface Shot {
  dur: number;
  from: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number };
  to: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number };
  subtitle?: [string, string];
  title?: [string, string];
  /** Called when the shot starts (spawn effects, play sounds…). */
  onStart?: () => void;
}

export interface CutsceneHost {
  camera: THREE.PerspectiveCamera;
  setCinematic(on: boolean): void;
  setSubtitle(speaker: string, text: string): void;
  showTitle(small: string, big: string): void;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

export class Cutscene {
  private i = -1;
  private t = 0;
  private done = false;
  private readonly look = new THREE.Vector3();
  private readonly baseFov: number;

  constructor(private readonly host: CutsceneHost, private readonly shots: Shot[], private readonly onEnd: () => void) {
    this.baseFov = host.camera.fov;
    host.setCinematic(true);
    this.next();
  }

  get elapsed() {
    let t = this.t;
    for (let j = 0; j < this.i; j++) t += this.shots[j].dur;
    return t;
  }

  get finished() {
    return this.done;
  }

  private next() {
    this.i++;
    this.t = 0;
    const s = this.shots[this.i];
    if (!s) return this.end();
    s.onStart?.();
    if (s.subtitle) this.host.setSubtitle(s.subtitle[0], s.subtitle[1]);
    else this.host.setSubtitle('', '');
    if (s.title) this.host.showTitle(s.title[0], s.title[1]);
  }

  skip() {
    if (this.done) return;
    // Fire any remaining shot hooks so the game state ends up the same as watching it.
    for (let j = this.i + 1; j < this.shots.length; j++) this.shots[j].onStart?.();
    this.end();
  }

  private end() {
    if (this.done) return;
    this.done = true;
    this.host.camera.fov = this.baseFov;
    this.host.camera.updateProjectionMatrix();
    this.host.setCinematic(false);
    this.onEnd();
  }

  update(dt: number) {
    if (this.done) return;
    const s = this.shots[this.i];
    this.t += dt;
    const u = smooth(clamp(this.t / s.dur, 0, 1));
    const cam = this.host.camera;
    cam.position.lerpVectors(s.from.pos, s.to.pos, u);
    this.look.lerpVectors(s.from.look, s.to.look, u);
    cam.lookAt(this.look);
    const f0 = s.from.fov ?? this.baseFov, f1 = s.to.fov ?? f0;
    const fov = f0 + (f1 - f0) * u;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.t >= s.dur) this.next();
  }
}

export const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
