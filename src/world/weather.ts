import * as THREE from 'three';

/** Rain streaks in a box that follows the camera target. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly count: number;
  private readonly box = { w: 44, h: 24, d: 44 };

  constructor(count: number) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.reset(i, Math.random() * this.box.h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0.28, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
  }

  private reset(i: number, y: number) {
    const x = (Math.random() - 0.5) * this.box.w;
    const z = (Math.random() - 0.5) * this.box.d;
    const o = i * 6;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.pos[o + 3] = x + 0.08; this.pos[o + 4] = y - 0.7; this.pos[o + 5] = z + 0.05;
  }

  setVisibleCount(n: number) {
    this.lines.geometry.setDrawRange(0, Math.min(n, this.count) * 2);
  }

  update(dt: number, center: THREE.Vector3) {
    this.lines.position.set(center.x, center.y, center.z);
    const fall = 22 * dt;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      this.pos[o + 1] -= fall;
      this.pos[o + 4] -= fall;
      this.pos[o] += fall * 0.1;
      this.pos[o + 3] += fall * 0.1;
      if (this.pos[o + 4] < -2) this.reset(i, this.box.h);
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
