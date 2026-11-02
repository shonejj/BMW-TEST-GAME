import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
// The build inlines these as data: URLs, so the single-file offline build carries its models.
import animsUrl from '../assets/models/anims.glb?url';
import maleUrl from '../assets/models/male.glb?url';
import femaleUrl from '../assets/models/female.glb?url';
import natureUrl from '../assets/models/nature.glb?url';

/**
 * Compressed glTF assets made by tools/build-assets.mjs from CC0 packs (credits in README.md):
 * the Quaternius Universal Animation Library clips, the Universal Base Characters bodies (male and female)
 * with every modular outfit piece, hair style and the retargeted KayKit skeletons bound to their skeletons,
 * and the stylized nature props.
 */
export type BodyKind = 'male' | 'female';

/** One base body: its skeleton (without meshes, cloned per character) and every skinned piece by name. */
export interface BodyAsset {
  /** Scene root holding only the armature (no meshes). */
  template: THREE.Group;
  /**
   * Skinned pieces in their rest pose, keyed by node name (Body, Eyes, Brows, Ranger_Body, Hair_Long, Skel_Head...);
   * a piece with several materials loads as several meshes.
   */
  pieces: Map<string, THREE.SkinnedMesh[]>;
  /** The base body mesh: its skeleton and bind matrix define the bind space every baked piece is moved into. */
  body: THREE.SkinnedMesh;
  /**
   * Bone inverses of the rest pose in world units. (The file's own inverse bind matrices also carry each mesh's
   * vertex dequantisation, so they only suit that mesh; baked pieces are stored unquantised in rest world space.)
   */
  restInverses: THREE.Matrix4[];
  /** How far the body's pelvis sits above the animation library's (clips set the pelvis height absolutely). */
  lift: number;
}

export interface Assets {
  bodies: Record<BodyKind, BodyAsset>;
  clips: Map<string, THREE.AnimationClip>;
  nature: Map<string, THREE.Object3D>;
}

let assets: Assets | null = null;

function bodyAsset(scene: THREE.Group, clipPelvis: number): BodyAsset {
  scene.updateMatrixWorld(true);
  const pieces = new Map<string, THREE.SkinnedMesh[]>();
  scene.traverse((o) => {
    if (!(o as THREE.SkinnedMesh).isSkinnedMesh) return;
    // GLTFLoader wraps multi-material meshes in a group named after the node.
    const multi = o.parent && o.parent.type === 'Group' && o.parent.children.every((c) => (c as THREE.SkinnedMesh).isSkinnedMesh);
    const name = multi ? o.parent!.name : o.name;
    if (!pieces.has(name)) pieces.set(name, []);
    pieces.get(name)!.push(o as THREE.SkinnedMesh);
  });
  const body = pieces.get('Body')![0];
  const template = SkeletonUtils.clone(scene) as THREE.Group;
  const drop: THREE.Object3D[] = [];
  template.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  const pelvis = body.skeleton.getBoneByName('pelvis')!.getWorldPosition(new THREE.Vector3());
  const restInverses = body.skeleton.bones.map((b) => b.matrixWorld.clone().invert());
  return { template, pieces, body, restInverses, lift: pelvis.y - clipPelvis };
}

export async function loadAssets(): Promise<Assets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [anims, male, female, nature] = await Promise.all([animsUrl, maleUrl, femaleUrl, natureUrl].map((u) => loader.loadAsync(u)));
  const props = new Map<string, THREE.Object3D>();
  for (const o of nature.scene.children) props.set(o.name, o);
  anims.scene.updateMatrixWorld(true);
  const clipPelvis = anims.scene.getObjectByName('pelvis')!.getWorldPosition(new THREE.Vector3()).y;
  assets = {
    bodies: { male: bodyAsset(male.scene, clipPelvis), female: bodyAsset(female.scene, clipPelvis) },
    clips: new Map(anims.animations.map((c) => [c.name, c])),
    nature: props,
  };
  return assets;
}

export function getAssets(): Assets {
  if (!assets) throw new Error('Assets not loaded');
  return assets;
}

/** A fresh, independently animatable skeleton of a body (no meshes; the caller binds baked meshes to it). */
export function cloneSkeleton(kind: BodyKind) {
  const a = getAssets().bodies[kind];
  const root = SkeletonUtils.clone(a.template) as THREE.Group;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
  });
  const skeleton = new THREE.Skeleton(a.body.skeleton.bones.map((b) => bones.get(b.name)!), a.restInverses);
  return { root, bones, skeleton, asset: a };
}

/** Returns the clip, failing loudly if the asset build dropped it. */
export function clip(name: string): THREE.AnimationClip {
  const c = getAssets().clips.get(name);
  if (!c) throw new Error(`Missing animation clip ${name}`);
  return c;
}
