import * as THREE from 'three';
import { isTouchDevice } from './util';

export type Quality = 'low' | 'medium' | 'high';
/** 'pixel' renders at low resolution through a retro palette/dither/outline pass; 'smooth' renders natively. */
export type Look = 'pixel' | 'smooth';

const POST_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uRes;      // low-res target size in pixels
  uniform float uLevels;  // colour steps per channel
  uniform vec3 uGrade;    // chapter colour grade multiplier
  uniform float uSat;
  varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main() {
    vec2 px = 1.0 / uRes;
    vec3 c = texture2D(uTex, vUv).rgb;
    // Pixel-art outline: darken where neighbouring pixels differ sharply in brightness.
    float l = lum(c);
    float e = abs(l - lum(texture2D(uTex, vUv + vec2(px.x, 0.0)).rgb)) + abs(l - lum(texture2D(uTex, vUv + vec2(0.0, px.y)).rgb))
            + abs(l - lum(texture2D(uTex, vUv - vec2(px.x, 0.0)).rgb)) + abs(l - lum(texture2D(uTex, vUv - vec2(0.0, px.y)).rgb));
    c *= 1.0 - smoothstep(0.35, 1.2, e) * 0.35;
    c = mix(vec3(lum(c)), c, uSat) * uGrade;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Ordered 4x4 Bayer dither, then posterise to a limited palette.
    vec2 p = floor(vUv * uRes);
    int bx = int(mod(p.x, 4.0)), by = int(mod(p.y, 4.0));
    float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    float d = (m[by * 4 + bx] + 0.5) / 16.0 - 0.5;
    vec3 q = floor(gl_FragColor.rgb * uLevels + 0.5 + d * 0.9) / uLevels;
    // Slight warm/cool split-tone for that hand-graded pixel-art mood.
    float g = lum(q);
    q += vec3(0.03, 0.0, -0.025) * smoothstep(0.4, 1.0, g) + vec3(-0.02, 0.0, 0.035) * (1.0 - smoothstep(0.0, 0.4, g));
    gl_FragColor = vec4(clamp(q, 0.0, 1.0), 1.0);
  }`;

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  quality: Quality = 'medium';
  look: Look = 'pixel';
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
  /** Whether half-float render targets work here (needed for HDR lighting before tone mapping). */
  private readonly hdrOk: boolean;

  constructor(container: HTMLElement) {
    const touch = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Shader error checks call getProgramInfoLog synchronously (a stall); keep them for dev only.
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.hdrOk = this.renderer.extensions.has('EXT_color_buffer_float') || this.renderer.extensions.has('EXT_color_buffer_half_float');
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
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyPixelRatio();
  }

  /** Max pixel ratio per quality. Phones have 3x screens; rendering all of those pixels is what heats them up. */
  private get pixelCap() {
    const touch = isTouchDevice();
    if (this.quality === 'low') return touch ? 0.7 : 1;
    if (this.quality === 'medium') return touch ? 1.0 : 1.5;
    return 2;
  }

  setLook(l: Look) {
    this.look = l === 'pixel' && this.hdrOk ? 'pixel' : 'smooth';
    this.applyPixelRatio();
  }

  /** Chapter colour grade for the pixel pass. */
  setGrade(rgb: [number, number, number], sat: number) {
    this.grade = { rgb, sat };
    if (this.post) {
      this.post.mat.uniforms.uGrade.value.set(...rgb);
      this.post.mat.uniforms.uSat.value = sat;
    }
  }
  private grade = { rgb: [1, 1, 1] as [number, number, number], sat: 1 };

  get activeTarget() {
    return this.look === 'pixel' ? this.rt : null;
  }

  get pixelMode() {
    return this.look === 'pixel' && !!this.rt;
  }

  /** Target height in low-res pixels per quality: chunky enough to read as pixel art, light enough for phones. */
  private get pixelHeight() {
    const touch = isTouchDevice();
    return this.quality === 'low' ? (touch ? 170 : 216) : this.quality === 'medium' ? (touch ? 210 : 270) : 300;
  }

  applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (this.look === 'pixel') {
      // The canvas only receives a cheap upscale, so keep it near native; the world is drawn small.
      this.renderer.setPixelRatio(Math.min(dpr, isTouchDevice() ? 1.5 : 2));
    } else {
      this.renderer.setPixelRatio(Math.max(0.5, Math.min(dpr, this.pixelCap) * this.dynamicScale));
    }
    this.resize();
  }

  private buildPost(w: number, h: number) {
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true, samples: 0 });
      const mat = new THREE.ShaderMaterial({
        vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
        uniforms: { uTex: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(w, h) }, uLevels: { value: 22 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 } },
      });
      const scene = new THREE.Scene();
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      scene.add(quad);
      mat.uniforms.uGrade.value.set(...this.grade.rgb);
      mat.uniforms.uSat.value = this.grade.sat;
      this.post = { scene, cam: new THREE.Camera(), mat };
    }
    this.rt.setSize(w, h);
    this.post!.mat.uniforms.uRes.value.set(w, h);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    if (this.look === 'pixel') {
      // Integer device-pixels per art pixel keeps every art pixel the same size on screen.
      const devH = h * this.renderer.getPixelRatio();
      const scale = Math.max(2, Math.round(devH / this.pixelHeight));
      this.buildPost(Math.max(64, Math.round((w * this.renderer.getPixelRatio()) / scale)), Math.max(64, Math.round(devH / scale)));
    }
    this.camera.aspect = w / h;
    // Keep a similar horizontal view on narrow (portrait) screens.
    this.camera.fov = this.camera.aspect < 1 ? 55 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Milliseconds spent in the last render() call (CPU submit time). */
  lastRenderMs = 0;

  render() {
    const t = performance.now();
    if (this.look === 'pixel' && this.rt && this.post) {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.post.scene, this.post.cam);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.lastRenderMs = performance.now() - t;
  }
}
