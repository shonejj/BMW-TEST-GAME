import * as THREE from 'three';
import { isTouchDevice } from './util';

export type Quality = 'low' | 'medium' | 'high';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  quality: Quality = 'medium';

  constructor(container: HTMLElement) {
    const touch = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Shader error checks call getProgramInfoLog synchronously (a stall); keep them for dev only.
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0a1316);
    this.scene.fog = new THREE.FogExp2(0x0d191c, 0.02);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 160);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  /** Dynamic resolution multiplier (0.5–1), lowered automatically when frames run long. */
  dynamicScale = 1;

  setQuality(q: Quality) {
    this.quality = q;
    this.dynamicScale = 1;
    this.applyPixelRatio();
  }

  /** Max pixel ratio per quality. Phones have 3x screens; rendering all of those pixels is what heats them up. */
  private get pixelCap() {
    const touch = isTouchDevice();
    if (this.quality === 'low') return touch ? 0.8 : 1;
    if (this.quality === 'medium') return touch ? 1.1 : 1.5;
    return 2;
  }

  applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.max(0.5, Math.min(dpr, this.pixelCap) * this.dynamicScale));
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // Keep a similar horizontal view on narrow (portrait) screens.
    this.camera.fov = this.camera.aspect < 1 ? 55 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Milliseconds spent in the last render() call (CPU submit time). */
  lastRenderMs = 0;

  render() {
    const t = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.lastRenderMs = performance.now() - t;
  }
}
