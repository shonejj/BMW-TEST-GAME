import * as THREE from 'three';

/**
 * Pixel-art flipbook effects: hand-feel sprite animations (hit bursts, slash streaks, dust, flames, souls)
 * drawn procedurally into a 256×256 atlas with hard pixels, limited palettes and ordered dithering, then
 * played as camera-facing quads that step frame by frame like classic sprite effects. Nearest filtering
 * keeps every pixel crisp however big the sprite is on screen. Everything is one instanced draw call.
 */

export type PixelFxName = 'impact' | 'slash' | 'dust' | 'fire' | 'spark' | 'soul' | 'miasma' | 'ring';
const ROWS: PixelFxName[] = ['impact', 'slash', 'dust', 'fire', 'spark', 'soul', 'miasma', 'ring'];
const FRAMES = 8;
const PX = 32;

type RGB = [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const PAL = {
  hot: [0xffffff, 0xfff4b0, 0xffd04a, 0xff8a1e, 0xc8401a, 0x5a1a10].map(hex),
  slash: [0xffffff, 0xfff2c0, 0xffd27a, 0xe0902a, 0x8a4a14].map(hex),
  dust: [0xb8ac98, 0x9a8e7a, 0x7a705e, 0x5a5244, 0x3a3428].map(hex),
  jade: [0xf0fff0, 0xa8ffc8, 0x5ae890, 0x22a860, 0x0e5a34].map(hex),
  miasma: [0xc8a8ff, 0x8a5ad0, 0x5a2a8a, 0x2a1440, 0x120a1c].map(hex),
};
/** 4×4 Bayer matrix for ordered-dither fades. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hash = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

function drawAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = PX * FRAMES;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  const put = (row: number, frame: number, x: number, y: number, col: RGB) => {
    if (x < 0 || y < 0 || x >= PX || y >= PX) return;
    const i = ((row * PX + y) * c.width + frame * PX + x) * 4;
    img.data[i] = col[0];
    img.data[i + 1] = col[1];
    img.data[i + 2] = col[2];
    img.data[i + 3] = 255;
  };
  const fade = (x: number, y: number, amount: number) => BAYER[(y & 3) * 4 + (x & 3)] < amount;
  const cx = 15.5, cy = 15.5;

  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        // impact: hot core collapsing, eight rays shooting out, shards flying.
        {
          const core = 7 * (1 - t) ** 1.5;
          const ray = Math.abs(Math.sin(a * 4)) > 0.92 - t * 0.05 && r < 6 + 12 * Math.sqrt(t) && r > 2 + 10 * t;
          const shard = hash(Math.floor(a * 5), 0, 1) > 0.5 && Math.abs(r - (5 + 13 * t)) < 1 && Math.abs(Math.sin(a * 6)) > 0.8;
          if (r < core) put(0, f, x, y, PAL.hot[Math.min(5, Math.floor((r / Math.max(core, 0.1)) * 3))]);
          else if ((ray || shard) && !fade(x, y, t * 0.9)) put(0, f, x, y, PAL.hot[Math.min(5, 1 + Math.floor(t * 4 + r / 12))]);
        }
        // slash: a crescent streak whose bright edge sweeps across, then thins away.
        {
          const ox = x - 16, oy = y - 30;
          const rr = Math.hypot(ox, oy);
          const ang = Math.atan2(-oy, ox); // 0 right .. π left
          const sweep = Math.min(1, t * 2.4) * Math.PI;
          const thick = 5 * (1 - t) + 1;
          if (ang > 0.25 && ang < Math.PI - 0.25 && ang < sweep + 0.3 && Math.abs(rr - 20) < thick && !fade(x, y, Math.max(0, t - 0.35) * 1.6)) {
            const edge = Math.abs(rr - 20) / thick;
            put(1, f, x, y, PAL.slash[Math.min(4, Math.floor(edge * 3 + t * 2))]);
          }
        }
        // dust: three puffs swelling and dissolving, with a darker rim.
        {
          for (const [px, py, pr] of [[12, 18, 6], [20, 17, 7], [16, 12, 6]]) {
            const R = pr * (0.5 + t * 0.8);
            const d = Math.hypot(x - px, y - py + t * 3);
            if (d < R && !fade(x, y, t * 1.1)) {
              put(2, f, x, y, PAL.dust[d > R - 1.2 ? 3 : Math.floor((y / PX) * 2 + t * 2)]);
              break;
            }
          }
        }
        // fire: tongues of flame flickering upward, burning out.
        {
          const fx = Math.abs(dx) / 11;
          const h = (1 - fx) * (24 * (1 - t * 0.7)) * (0.7 + 0.5 * hash(Math.floor(x / 2), f, 3));
          const fromBottom = PX - 1 - y;
          if (fx < 1 && fromBottom < h && !fade(x, y, Math.max(0, t - 0.5) * 2)) {
            const k = fromBottom / Math.max(h, 1);
            put(3, f, x, y, PAL.hot[Math.min(5, Math.floor(k * 4 + fx * 1.5))]);
          }
        }
        // spark: four-point twinkle.
        {
          const L = 2 + 12 * Math.sin(Math.PI * t);
          const arm = (Math.abs(dx) < 1 && Math.abs(dy) < L) || (Math.abs(dy) < 1 && Math.abs(dx) < L);
          const diag = Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.8 && r < L * 0.45;
          if (r < 2.5 * (1 - t) + 0.8 || arm || diag) put(4, f, x, y, PAL.hot[Math.min(4, Math.floor(r / 4))]);
        }
        // soul: a jade wisp rising, trailing a tail.
        {
          const sy = 22 - t * 16;
          const sway = Math.sin(t * 6 + y * 0.3) * 2;
          const d = Math.hypot(x - 16 - sway * 0.3, (y - sy) * 0.8);
          const tail = y > sy && y < sy + 10 && Math.abs(x - 16 - sway) < 2.5 - (y - sy) * 0.2;
          if ((d < 4.5 || tail) && !fade(x, y, Math.max(0, t - 0.4) * 1.7)) put(5, f, x, y, PAL.jade[Math.min(4, Math.floor(d / 1.5) + (tail ? 2 : 0))]);
        }
        // miasma: violet-black puffs.
        {
          for (const [px, py, pr] of [[11, 17, 6], [21, 16, 6], [16, 11, 7]]) {
            const R = pr * (0.4 + t * 0.9);
            const d = Math.hypot(x - px, y - py + t * 4);
            if (d < R && !fade(x, y, t * 1.05)) {
              put(6, f, x, y, PAL.miasma[Math.min(4, Math.floor((d / R) * 2) + Math.floor(t * 3))]);
              break;
            }
          }
        }
        // ring: shock ring expanding, thinning and cooling.
        {
          const R = 3 + 12.5 * Math.sqrt(t);
          const w = 2.4 * (1 - t) + 0.7;
          if (Math.abs(r - R) < w && !fade(x, y, Math.max(0, t - 0.5) * 1.6)) put(7, f, x, y, PAL.hot[Math.min(5, Math.floor(t * 4))]);
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aFx;    // row, start time, duration, size
  attribute vec4 aExtra; // rotation, flip x, tint r, tint g
  attribute float aTintB;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    float k = (uTime - aFx.y) / aFx.z;
    float alive = step(0.0, k) * step(k, 1.0);
    float frame = floor(clamp(k, 0.0, 0.999) * ${FRAMES.toFixed(1)});
    vec2 c = position.xy;
    float r = aExtra.x;
    c = mat2(cos(r), sin(r), -sin(r), cos(r)) * c;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = aPos + (right * c.x + up * c.y) * aFx.w * alive;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vec2 local = position.xy + 0.5;
    local.x = mix(local.x, 1.0 - local.x, aExtra.y);
    vUv = (vec2(frame, ${(FRAMES - 1).toFixed(1)} - aFx.x) + local) / ${FRAMES.toFixed(1)};
    vTint = vec3(aExtra.z, aExtra.w, aTintB);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.5) discard;
    gl_FragColor = vec4(t.rgb * vTint, 1.0);
  }`;

export class PixelFx {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private next = 0;
  private time = 0;
  private dirty = false;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aFx: THREE.InstancedBufferAttribute;
  private readonly aExtra: THREE.InstancedBufferAttribute;
  private readonly aTintB: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private readonly tint = new THREE.Color();

  constructor(scene: THREE.Scene, max = 192) {
    this.max = max;
    const tex = new THREE.CanvasTexture(drawAtlas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aFx = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-100), 4);
    this.aExtra = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aTintB = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.aPos, this.aFx, this.aExtra, this.aTintB]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aFx', this.aFx);
    geo.setAttribute('aExtra', this.aExtra);
    geo.setAttribute('aTintB', this.aTintB);
    geo.instanceCount = max;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uAtlas: { value: tex }, uTime: { value: 0 } },
      depthWrite: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
  }

  /** Plays effect `name` at `pos`, `size` world units wide, for `dur` seconds. */
  spawn(name: PixelFxName, pos: THREE.Vector3, size: number, dur: number, opts: { tint?: number; rot?: number; delay?: number } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.aPos.setXYZ(i, pos.x, pos.y, pos.z);
    this.aFx.setXYZW(i, ROWS.indexOf(name), this.time + (opts.delay ?? 0), dur, size);
    this.tint.set(opts.tint ?? 0xffffff);
    this.aExtra.setXYZW(i, opts.rot ?? (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? 1 : 0, this.tint.r, this.tint.g);
    this.aTintB.setX(i, this.tint.b);
    this.dirty = true;
  }

  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.dirty) {
      for (const a of [this.aPos, this.aFx, this.aExtra, this.aTintB]) a.needsUpdate = true;
      this.dirty = false;
    }
  }
}
