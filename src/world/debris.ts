import * as THREE from 'three';
import { rand } from '../engine/util';

interface Chunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  ground: number;
  resting: boolean;
}

const chunkGeo = new THREE.DodecahedronGeometry(1, 0);

/** Shatter chunks with simple ballistic physics; they settle and fade. */
export class Debris {
  private chunks: Chunk[] = [];
  private mats = new Map<number, THREE.MeshLambertMaterial>();
  max = 160;

  constructor(private readonly scene: THREE.Scene, private readonly heightAt: (x: number, z: number) => number) {}

  private mat(color: number) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true });
      this.mats.set(color, m);
    }
    return m;
  }

  burst(pos: THREE.Vector3, color: number, count: number, size: number, power = 1) {
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= this.max) {
        const old = this.chunks.shift()!;
        this.scene.remove(old.mesh);
      }
      const mesh = new THREE.Mesh(chunkGeo, this.mat(color));
      const s = size * rand(0.5, 1.2);
      mesh.scale.set(s, s * rand(0.5, 1), s);
      mesh.position.set(pos.x + rand(-0.3, 0.3), pos.y + rand(0.3, 0.9), pos.z + rand(-0.3, 0.3));
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.5, 5) * power;
      this.chunks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * sp, rand(3, 7) * power, Math.sin(a) * sp),
        spin: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
        life: rand(6, 9),
        ground: 0,
        resting: false,
      });
      this.scene.add(mesh);
    }
  }

  update(dt: number) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.chunks.splice(i, 1);
        continue;
      }
      if (!c.resting) {
        c.vel.y -= 18 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        const g = this.heightAt(c.mesh.position.x, c.mesh.position.z) + c.mesh.scale.y * 0.6;
        if (c.mesh.position.y < g) {
          c.mesh.position.y = g;
          c.vel.y *= -0.35;
          c.vel.x *= 0.6;
          c.vel.z *= 0.6;
          c.spin.multiplyScalar(0.5);
          if (Math.abs(c.vel.y) < 1) c.resting = true;
        }
      }
      if (c.life < 1) c.mesh.scale.multiplyScalar(1 - dt * 2);
    }
  }
}
