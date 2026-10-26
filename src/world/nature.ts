import * as THREE from 'three';
import { getAssets } from '../game/assets';

/** Shared clock for wind on every foliage material. */
export const windUniform = { value: 0 };
/** Point the camera follows; tall foliage between it and the camera dissolves so it never hides the fight. */
export const focusUniform = { value: new THREE.Vector3() };

export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform of the part relative to the prop's origin. */
  matrix: THREE.Matrix4;
}

const materialCache = new Map<string, THREE.Material>();
const partCache = new Map<string, PropPart[]>();

/**
 * Converts the kit's PBR materials to Lambert (much cheaper per pixel on phones, and our night lighting
 * has no reflections to show anyway). Alpha-cut leaves get a vertex-shader wind sway, stronger higher up.
 */
function convert(src: THREE.Material, sway: number, fade: boolean): THREE.Material {
  const key = src.uuid + ':' + sway + ':' + fade;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const s = src as THREE.MeshStandardMaterial;
  const leafy = s.alphaTest > 0 || s.transparent;
  const m = new THREE.MeshLambertMaterial({
    map: s.map,
    color: s.color,
    alphaTest: leafy ? 0.45 : 0,
    transparent: false,
    side: leafy ? THREE.DoubleSide : THREE.FrontSide,
  });
  const wind = leafy && sway > 0;
  if (wind || fade) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = windUniform;
      shader.uniforms.uFocus = focusUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform vec3 uFocus;\nvarying float vFade;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 origin = (modelMatrix * instanceMatrix[3]).xyz;
          #else
            vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #endif
          vFade = 0.0;
          ${wind ? `
          float h = max(transformed.y, 0.0) * ${sway.toFixed(3)};
          float w = sin(uWind * 1.3 + origin.x * 0.37 + origin.z * 0.21 + transformed.y * 0.4) + 0.4 * sin(uWind * 3.1 + origin.z + transformed.x * 2.0);
          transformed.x += w * h;
          transformed.z += w * h * 0.6;` : ''}
          ${fade ? `
          // The camera sits up and to the south-east (+X, +Z) of the focus (see CameraRig.yaw).
          vec2 rel = origin.xz - uFocus.xz;
          float along = dot(rel, vec2(0.7071, 0.7071));
          float perp = abs(dot(rel, vec2(0.7071, -0.7071)));
          vFade = smoothstep(4.8, 2.2, perp) * smoothstep(-1.5, 1.0, along) * smoothstep(15.0, 10.0, along) * 0.88;` : ''}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // Screen-door dissolve (interleaved gradient noise): no sorting, no transparency cost.
          if (vFade > 0.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < vFade) discard;`,
        );
    };
    m.customProgramCacheKey = () => 'nature' + sway + fade;
  }
  materialCache.set(key, m);
  return m;
}

/** Meshes making up a nature prop, ready for instancing. */
export function propParts(name: string, sway = 0.02, fade = false): PropPart[] {
  const key = name + ':' + sway + ':' + fade;
  const hit = partCache.get(key);
  if (hit) return hit;
  const prop = getAssets().nature.get(name);
  if (!prop) throw new Error(`Missing nature prop ${name}`);
  prop.updateMatrixWorld(true);
  const toOrigin = new THREE.Matrix4().makeTranslation(-prop.position.x, -prop.position.y, -prop.position.z);
  const parts: PropPart[] = [];
  prop.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    parts.push({ geometry: mesh.geometry, material: convert(mats[0], sway, fade), matrix: toOrigin.clone().multiply(mesh.matrixWorld) });
  });
  partCache.set(key, parts);
  return parts;
}
