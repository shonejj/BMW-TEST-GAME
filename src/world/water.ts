import * as THREE from 'three';
import type { Terrain } from './terrain';

/**
 * Stylised water: flat surface meshes built from the terrain grid wherever the ground dips below a water body's
 * level. Colour comes from depth (shallow → deep), with scrolling ripple bands, a sparkle and animated shore foam
 * where the depth runs out. Unlit and cheap (no reflections, no extra passes), banded so it reads well through
 * the pixel pass. Frozen water uses the same mesh builder with a cracked-ice look.
 */

export interface WaterLook {
  shallow: number;
  deep: number;
  foam: number;
  /** Ice instead of moving water. */
  frozen?: boolean;
}

export const waterTime = { value: 0 };

function waterMaterial(look: WaterLook) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uShallow: { value: new THREE.Color(look.shallow) },
      uDeep: { value: new THREE.Color(look.deep) },
      uFoam: { value: new THREE.Color(look.foam) },
    }]) as Record<string, THREE.IUniform>,
    vertexShader: `
      attribute float depth;
      attribute vec2 flow;
      varying float vDepth;
      varying vec2 vFlow;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vDepth = depth;
        vFlow = flow;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform float uTime;
      varying float vDepth; varying vec2 vFlow; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float d = clamp(vDepth, 0.0, 3.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.6, d));
        ${look.frozen ? `
        // Ice: frosty blotches and dark crack lines from a cell pattern.
        vec2 p = vW.xz * 0.45;
        vec2 cell = floor(p); vec2 f = fract(p); float m1 = 9.0, m2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 c = o + vec2(hash(cell + o), hash(cell + o + 17.0)) - f;
          float l = dot(c, c);
          if (l < m1) { m2 = m1; m1 = l; } else if (l < m2) m2 = l;
        }
        float crack = 1.0 - smoothstep(0.0, 0.06, sqrt(m2) - sqrt(m1));
        col = mix(col, uFoam, vnoise(vW.xz * 0.3) * 0.35 + smoothstep(0.6, 0.0, d) * 0.4);
        col = mix(col, uDeep * 0.6, crack * 0.6);
        float glint = step(0.985, hash(floor(vW.xz * 3.0))) * 0.5;
        col += glint * uFoam;
        gl_FragColor = vec4(col, 1.0);` : `
        vec2 p = vW.xz + vFlow * uTime;
        float r1 = vnoise(p * vec2(0.9, 0.6) + vec2(uTime * 0.15, 0.0));
        float r2 = vnoise(p * vec2(0.5, 1.1) - vec2(0.0, uTime * 0.12) + 5.0);
        float bands = smoothstep(0.62, 0.7, r1 * 0.6 + r2 * 0.4);
        col = mix(col, mix(uShallow, uFoam, 0.45), bands * 0.35);
        // Shore foam: a line that breathes in and out with the waves.
        float edge = 0.12 + 0.18 * (0.5 + 0.5 * sin(uTime * 1.7 + vW.x * 0.9 + vW.z * 0.7)) + vnoise(vW.xz * 2.0 + uTime * 0.3) * 0.12;
        float foam = 1.0 - smoothstep(edge * 0.6, edge, d);
        float flowFoam = smoothstep(0.75, 0.85, vnoise(p * 1.6)) * clamp(length(vFlow), 0.0, 1.0) * 0.6;
        col = mix(col, uFoam, max(foam * 0.85, flowFoam));
        float sparkle = step(0.93, vnoise(vW.xz * 3.0 + vec2(uTime * 0.7, -uTime * 0.5))) * step(0.5, vnoise(vW.xz * 0.7 + uTime * 0.2));
        col += sparkle * uFoam * 0.35;
        gl_FragColor = vec4(col, mix(0.72, 0.92, smoothstep(0.0, 1.2, d)));`}
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: !look.frozen,
    depthWrite: !!look.frozen,
  });
}

/**
 * Builds the water surface for every coarse terrain cell that holds water (1 m quads at the water level).
 * Vertices carry the water depth (for colour and foam) and a flow direction for streams.
 */
export function buildWater(t: Terrain, look: WaterLook, flowAt: (x: number, z: number) => [number, number]): THREE.Mesh | null {
  const { gnx, gnz, gx0, gz0, waterLevel, ground } = t;
  const pos: number[] = [], depth: number[] = [], flow: number[] = [], idx: number[] = [];
  const vid = new Int32Array(gnx * gnz).fill(-1);
  const vert = (i: number, j: number, lv: number) => {
    const k = j * gnx + i;
    if (vid[k] >= 0) return vid[k];
    const x = gx0 + i, z = gz0 + j;
    vid[k] = pos.length / 3;
    pos.push(x, lv, z);
    depth.push(lv - ground[k]);
    const [fx, fz] = flowAt(x, z);
    flow.push(fx, fz);
    return vid[k];
  };
  for (let j = 0; j < gnz - 1; j++) {
    for (let i = 0; i < gnx - 1; i++) {
      const ks = [j * gnx + i, j * gnx + i + 1, (j + 1) * gnx + i, (j + 1) * gnx + i + 1];
      let lv = -Infinity;
      for (const k of ks) lv = Math.max(lv, waterLevel[k]);
      if (lv === -Infinity) continue;
      if (!ks.some((k) => ground[k] < lv)) continue;
      const a = vert(i, j, lv), b = vert(i + 1, j, lv), c = vert(i, j + 1, lv), d = vert(i + 1, j + 1, lv);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = waterMaterial(look);
  mat.uniforms.uTime = waterTime;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

/** A flat ice sheet over a frozen lake shape (walkable; drawn just above the ground). */
export function buildIce(t: Terrain, inside: (x: number, z: number) => boolean, level: number, look: WaterLook): THREE.Mesh | null {
  const { gnx, gnz, gx0, gz0 } = t;
  const pos: number[] = [], depth: number[] = [], flow: number[] = [], idx: number[] = [];
  const vid = new Map<number, number>();
  const vert = (i: number, j: number) => {
    const k = j * gnx + i;
    const hit = vid.get(k);
    if (hit !== undefined) return hit;
    const x = gx0 + i, z = gz0 + j;
    vid.set(k, pos.length / 3);
    pos.push(x, level + 0.02, z);
    // Fake depth: deeper towards the middle of the lake, for the colour gradient.
    let n = 0;
    for (let r = 1; r <= 6; r++) if (inside(x + r, z) && inside(x - r, z) && inside(x, z + r) && inside(x, z - r)) n = r;
    depth.push(n * 0.3);
    flow.push(0, 0);
    return vid.get(k)!;
  };
  for (let j = 0; j < gnz - 1; j++) {
    for (let i = 0; i < gnx - 1; i++) {
      const x = gx0 + i + 0.5, z = gz0 + j + 0.5;
      if (!inside(x, z)) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = waterMaterial({ ...look, frozen: true });
  mat.uniforms.uTime = waterTime;
  return new THREE.Mesh(geo, mat);
}
