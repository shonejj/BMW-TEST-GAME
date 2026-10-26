import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Keeper's Shrine: the checkpoint. A stepped stone plinth, a bronze incense cauldron with live embers,
 * and a stele carved with a gold glyph. Lighting one sets the respawn point, heals and refills the gourd.
 * Glow is emissive only: adding a real light would recompile every lit shader.
 */
export interface Shrine {
  group: THREE.Group;
  pos: THREE.Vector3;
  lit: boolean;
  /** Re-arms once the player walks away, so resting needs a fresh visit. */
  armed: boolean;
  setLit(on: boolean): void;
  update(time: number): void;
}

const stone = new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 0.9 });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.95 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x5a4628, roughness: 0.45, metalness: 0.8 });

function glyphTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ffd27a';
  g.font = 'bold 50px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // "Earth" and "Keeper" (土地), the shrine's patron.
  g.fillText('土', 32, 36);
  g.fillText('地', 32, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let glyph: THREE.CanvasTexture | null = null;

export function buildShrine(x: number, y: number, z: number, facing: number): Shrine {
  glyph ??= glyphTexture();
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = facing;

  const plinth = mergeGeometries([
    new THREE.CylinderGeometry(1.25, 1.35, 0.22, 8).translate(0, 0.11, 0),
    new THREE.CylinderGeometry(1.0, 1.08, 0.2, 8).translate(0, 0.32, 0),
  ])!;
  const base = new THREE.Mesh(plinth, darkStone);
  base.receiveShadow = true;
  group.add(base);

  // Bronze ding: bowl on three legs with two handles, full of embers.
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(1, 0.75, 1), bronze);
  bowl.position.y = 0.95;
  group.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 24).rotateX(Math.PI / 2), bronze);
  rim.position.y = 1.0;
  group.add(rim);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.6, 8), bronze);
    leg.position.set(Math.sin(a) * 0.25, 0.62, Math.cos(a) * 0.25);
    group.add(leg);
  }
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), bronze);
    handle.position.set(s * 0.4, 1.05, 0);
    handle.rotation.y = Math.PI / 2;
    group.add(handle);
  }
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20).rotateX(-Math.PI / 2), emberMat);
  embers.position.y = 0.98;
  group.add(embers);
  // Incense sticks.
  for (let i = 0; i < 3; i++) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0x8a2a1a }));
    stick.position.set((i - 1) * 0.08, 1.2, 0.02 * i);
    stick.rotation.z = (i - 1) * 0.12;
    group.add(stick);
  }

  // Stele behind, with the glowing glyph.
  const stele = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.9, 0.22, 1, 1, 1), stone);
  stele.position.set(0, 1.35, -0.75);
  stele.castShadow = true;
  group.add(stele);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.16, 4, 1).rotateY(Math.PI / 4).scale(1.2, 1, 0.55), darkStone);
  cap.position.set(0, 2.38, -0.75);
  group.add(cap);
  const glyphMat = new THREE.MeshBasicMaterial({ map: glyph, color: 0x806040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.8), glyphMat);
  plate.position.set(0, 1.45, -0.63);
  group.add(plate);

  // Soft additive halo and drifting smoke wisps.
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2), haloMat);
  halo.position.y = 0.44;
  group.add(halo);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xb8b0a8, transparent: true, opacity: 0.18, depthWrite: false });
  const wisps: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), smokeMat);
    group.add(w);
    wisps.push(w);
  }

  const shrine: Shrine = {
    group,
    pos: new THREE.Vector3(x, y, z),
    lit: false,
    armed: true,
    setLit(on) {
      shrine.lit = on;
      emberMat.color.setHex(on ? 0xffb050 : 0x6a2a14);
      glyphMat.color.setHex(on ? 0xffffff : 0x504030);
      haloMat.opacity = on ? 0.16 : 0.04;
    },
    update(time) {
      const lit = shrine.lit;
      emberMat.color.setRGB(1, (lit ? 0.62 : 0.3) + Math.sin(time * 7) * 0.05, lit ? 0.3 : 0.1);
      haloMat.opacity = (lit ? 0.14 : 0.03) + Math.sin(time * 2.3) * 0.03;
      wisps.forEach((w, i) => {
        const u = (time * 0.25 + i / wisps.length) % 1;
        w.position.set(Math.sin(time * 0.8 + i * 2) * 0.12 * u, 1.3 + u * 1.6, Math.cos(time * 0.6 + i) * 0.1 * u);
        w.scale.setScalar(0.6 + u * 2.2);
      });
      smokeMat.opacity = lit ? 0.16 : 0.08;
    },
  };
  shrine.setLit(false);
  return shrine;
}
