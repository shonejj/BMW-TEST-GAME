import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
// The build inlines these as data: URLs, so the single-file offline build carries its models.
import charactersUrl from '../assets/models/characters.glb?url';
import natureUrl from '../assets/models/nature.glb?url';

/**
 * Compressed glTF assets made by tools/build-assets.mjs from CC0 packs (see CREDITS.md):
 * the Quaternius mannequin with its motion-captured clips, and stylized nature props.
 */
export interface Assets {
  character: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  nature: Map<string, THREE.Object3D>;
}

let assets: Assets | null = null;

export async function loadAssets(): Promise<Assets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [chars, nature] = await Promise.all([loader.loadAsync(charactersUrl), loader.loadAsync(natureUrl)]);
  const props = new Map<string, THREE.Object3D>();
  for (const o of nature.scene.children) props.set(o.name, o);
  assets = {
    character: chars.scene,
    clips: new Map(chars.animations.map((c) => [c.name, c])),
    nature: props,
  };
  return assets;
}

export function getAssets(): Assets {
  if (!assets) throw new Error('Assets not loaded');
  return assets;
}

/** A fresh, independently animatable copy of the mannequin (shares geometry with the source). */
export function cloneCharacter() {
  const root = SkeletonUtils.clone(getAssets().character) as THREE.Group;
  const bones = new Map<string, THREE.Bone>();
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  return { root, bones, skinned };
}

/** Returns the clip, failing loudly if the asset build dropped it. */
export function clip(name: string): THREE.AnimationClip {
  const c = getAssets().clips.get(name);
  if (!c) throw new Error(`Missing animation clip ${name}`);
  return c;
}
