import * as THREE from 'three';

/**
 * Camera occlusion for the whole world: anything that stands between the camera and the hero dissolves
 * (screen-door dither, no sorting or transparency cost), whatever the camera style.
 *
 *  - a cone around the camera → hero line (widening towards the camera),
 *  - a near-camera fade so nothing ever fills the screen,
 *  - in the 2D side view, a slab: everything more than a few metres in front of the hero's plane is cut away,
 *    so foreground trees, roofs, pillars and giant leaves never cover the action.
 *
 * It works by extending three.js' built-in clipping chunks (present in every built-in mesh material), gated
 * behind an `OCCLUDE` define that `markOccluders()` sets on world materials only, so characters, pickups and
 * effects are never cut. Values are computed once per render in view space (no per-fragment matrix work).
 */

// Plain objects (not THREE.Vector4): three.js clones THREE math objects when it copies ShaderLib uniforms per
// material, but shares plain values, so every material reads these live.
const occA = { x: 0, y: 0, z: 0, w: 0 }; // view-space hero feet, w = enabled
const occB = { x: 0, y: 1, z: 0, w: 0 }; // view-space world up, w = side-view slab depth (0 = off)
const occC = { x: 1.4, y: 2.6, z: 0.5, w: 0 }; // cone radius, near-fade distance, min height above feet

for (const key of ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon', 'matcap'] as const) {
  const lib = (THREE.ShaderLib as Record<string, THREE.ShaderLibShader | undefined>)[key];
  if (!lib) continue;
  lib.uniforms.occA = { value: occA };
  lib.uniforms.occB = { value: occB };
  lib.uniforms.occC = { value: occC };
}

const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
chunks.clipping_planes_pars_vertex += '\n#ifdef OCCLUDE\nvarying vec3 vOccP;\n#endif\n';
chunks.clipping_planes_vertex += '\n#ifdef OCCLUDE\nvOccP = mvPosition.xyz;\n#endif\n';
chunks.clipping_planes_pars_fragment += '\n#ifdef OCCLUDE\nvarying vec3 vOccP;\nuniform vec4 occA;\nuniform vec4 occB;\nuniform vec4 occC;\n#endif\n';
chunks.clipping_planes_fragment += /* glsl */ `
#ifdef OCCLUDE
if (occA.w > 0.5) {
  vec3 P = vOccP;
  vec3 fn = normalize(cross(dFdx(P), dFdy(P))); // flat face normal (outside any per-fragment branch)
  float hgt = dot(P - occA.xyz, occB.xyz);
  float occF = 0.0;
  if (hgt > occC.z) {
    float depth = -P.z;
    occF = 1.0 - smoothstep(occC.y * 0.45, occC.y, depth);
    vec3 T = occA.xyz + occB.xyz * 1.1;
    float tl = dot(T, T);
    float t = dot(P, T) / tl;
    float r = occC.x * (1.0 + 1.3 * (1.0 - t));
    float perp = length(P - T * t);
    float endT = 1.0 - 0.9 / sqrt(tl);
    occF = max(occF, smoothstep(r, r * 0.55, perp) * step(0.0, t) * smoothstep(endT + 0.03, endT - 0.08, t) * 0.93);
  }
  if (occB.w > 0.0 && hgt > 0.05) {
    // Side-view slab. Floors/terrain (upward faces near the hero's height) stay, so the ground is never holed;
    // everything else in front of the hero plane goes, down to the ground, leaving no stumps.
    bool ground = abs(dot(fn, occB.xyz)) > 0.75 && hgt < 0.7;
    if (!ground) occF = max(occF, smoothstep(-occA.z - occB.w + 0.9, -occA.z - occB.w - 0.9, -P.z));
  }
  if (occF > 0.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < occF) discard;
}
#endif
`;

/** Per-mode tuning set by the camera rig every frame. */
export const occlusion = {
  /** Hero feet, world space. */
  focus: new THREE.Vector3(),
  /** Cone radius around the camera → hero line (m). */
  radius: 1.4,
  /** Side view: cut everything more than this many metres in front of the hero plane (0 = off). */
  slab: 0,
  /** Set by the camera rig each frame it drives the camera; cutscenes/menu shots leave it false. */
  fresh: false,
};

const tmpV = new THREE.Vector3();

/** Enables occlusion on every world material under `root`, and hooks the scene to feed the uniforms. */
export function markOccluders(root: THREE.Object3D, scene: THREE.Scene) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.transparent) continue;
      const defs = (mat.defines ??= {}) as Record<string, unknown>;
      if ('OCCLUDE' in defs) continue;
      defs.OCCLUDE = '';
      mat.needsUpdate = true;
    }
  });
  if (scene.onBeforeRender === THREE.Object3D.prototype.onBeforeRender) {
    scene.onBeforeRender = (_r, _s, camera) => {
      const on = occlusion.fresh;
      occlusion.fresh = false;
      occA.w = on ? 1 : 0;
      if (!on) return;
      const inv = camera.matrixWorldInverse;
      tmpV.copy(occlusion.focus).applyMatrix4(inv);
      occA.x = tmpV.x; occA.y = tmpV.y; occA.z = tmpV.z;
      tmpV.set(0, 1, 0).transformDirection(inv);
      occB.x = tmpV.x; occB.y = tmpV.y; occB.z = tmpV.z;
      occB.w = occlusion.slab;
      occC.x = occlusion.radius;
    };
  }
}
