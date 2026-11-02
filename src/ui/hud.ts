import * as THREE from 'three';
import { PORTRAIT } from './icons';
import { scaleX, setClass, setStyle, setText } from './dom';

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  dur: number;
  active: boolean;
  dx: number;
}

export interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  remove(): void;
}

/** Pickup labels show only within this many metres of the hero. */
const LABEL_RANGE = 6;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export class Hud {
  readonly root: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private mpFill: HTMLDivElement;
  private xpFill: HTMLDivElement;
  private lvl: HTMLDivElement;
  private gold: HTMLDivElement;
  private loc: HTMLDivElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private bossBox: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private title: HTMLDivElement;
  private toasts: HTMLDivElement;
  private floatLayer: HTMLDivElement;
  private labelLayer: HTMLDivElement;
  private vignette: HTMLDivElement;
  private objective: HTMLDivElement;
  private floaters: Floater[] = [];
  private labels: Label[] = [];
  private tmp = new THREE.Vector3();
  private vignetteT = 0;
  private focusPips!: HTMLDivElement;
  private letterbox!: HTMLDivElement;
  private subtitle!: HTMLDivElement;
  private skipHint!: HTMLDivElement;
  weatherName = 'Rain';

  constructor(parent: HTMLElement) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);

    const ptl = h('div', 'hud-tl');
    const portrait = h('div', 'portrait', PORTRAIT);
    this.lvl = h('div', 'lvl', '1');
    portrait.appendChild(this.lvl);
    const bars = h('div', 'bars');
    bars.appendChild(h('div', 'name', 'Little Monkey'));
    const hp = h('div', 'bar hp');
    this.hpFill = h('div', 'fill');
    this.hpText = h('div', 'bar-text');
    hp.append(this.hpFill, this.hpText);
    const mp = h('div', 'bar mp');
    this.mpFill = h('div', 'fill');
    mp.appendChild(this.mpFill);
    const xp = h('div', 'bar xp');
    this.xpFill = h('div', 'fill');
    xp.appendChild(this.xpFill);
    this.focusPips = h('div', 'focus-pips');
    for (let i = 0; i < 3; i++) this.focusPips.appendChild(h('div', 'pip'));
    bars.append(hp, mp, xp, this.focusPips);
    ptl.append(portrait, bars);

    const ptr = h('div', 'hud-tr');
    this.mini = h('canvas', 'minimap');
    this.mini.width = 150;
    this.mini.height = 150;
    this.miniCtx = this.mini.getContext('2d')!;
    this.loc = h('div', 'loc', 'Mountain-Sea Temple · Rain');
    this.gold = h('div', 'gold', '0');
    ptr.append(this.mini, this.loc, this.gold);

    this.bossBox = h('div', 'boss-bar hidden');
    this.bossName = h('div', 'boss-name');
    const bb = h('div', 'bar boss');
    this.bossFill = h('div', 'fill');
    bb.appendChild(this.bossFill);
    this.bossBox.append(this.bossName, bb);

    this.title = h('div', 'title-card');
    this.toasts = h('div', 'toasts');
    this.objective = h('div', 'objective');
    this.floatLayer = h('div', 'floaters');
    this.labelLayer = h('div', 'labels');
    this.vignette = h('div', 'hurt-vignette');
    this.letterbox = h('div', 'letterbox', '<div class="bar-top"></div><div class="bar-bottom"></div>');
    this.subtitle = h('div', 'subtitle');
    this.skipHint = h('div', 'skip-hint', 'Tap or press any button to skip');
    this.letterbox.append(this.subtitle, this.skipHint);
    this.root.append(this.labelLayer, this.floatLayer, this.vignette, ptl, ptr, this.bossBox, this.title, this.toasts, this.objective);
    parent.appendChild(this.letterbox);

    for (let i = 0; i < 60; i++) {
      const el = h('div', 'floater');
      this.floatLayer.appendChild(el);
      this.floaters.push({ el, pos: new THREE.Vector3(), t: 0, dur: 1, active: false, dx: 0 });
    }
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setStats(hp: number, maxHp: number, mp: number, maxMp: number, xp: number, xpNext: number, level: number, gold: number) {
    setStyle(this.hpFill, 'transform', scaleX(hp / maxHp));
    setText(this.hpText, `${Math.ceil(hp)} / ${Math.round(maxHp)}`);
    setStyle(this.mpFill, 'transform', scaleX(mp / maxMp));
    setStyle(this.xpFill, 'transform', scaleX(xp / xpNext));
    setText(this.lvl, String(level));
    setText(this.gold, gold.toLocaleString() + 'g');
  }

  setFocus(f: number) {
    const pips = this.focusPips.children;
    for (let i = 0; i < 3; i++) {
      const el = pips[i] as HTMLDivElement;
      const fill = Math.max(0, Math.min(1, f - i));
      setStyle(el, '--f', fill.toFixed(2));
      setClass(el, 'full', fill >= 1);
    }
  }

  /** Letterbox bars only (cinematic camera style), HUD stays. */
  setLetterbox(on: boolean) {
    this.letterbox.classList.toggle('on', on);
    this.skipHint.style.display = on ? 'none' : '';
  }

  /** Cinematic mode: letterbox bars, gameplay HUD hidden. */
  setCinematic(on: boolean) {
    this.letterbox.classList.toggle('on', on);
    this.skipHint.style.display = '';
    this.root.classList.toggle('cinematic', on);
    if (!on) this.subtitle.classList.remove('show');
  }

  setSubtitle(speaker: string, text: string) {
    if (!text) {
      this.subtitle.classList.remove('show');
      return;
    }
    this.subtitle.innerHTML = speaker ? `<span class="speaker">${speaker}</span>${text}` : text;
    this.subtitle.classList.remove('show');
    void this.subtitle.offsetWidth;
    this.subtitle.classList.add('show');
  }

  setLocation(name: string) {
    this.loc.textContent = `${name} · ${this.weatherName}`;
  }

  setObjective(text: string) {
    this.objective.textContent = text;
    this.objective.classList.toggle('hidden', !text);
  }

  setBoss(name: string | null, frac = 1) {
    this.bossBox.classList.toggle('hidden', !name);
    if (name) {
      setText(this.bossName, name);
      setStyle(this.bossFill, 'transform', scaleX(frac));
    }
  }

  showTitle(small: string, big: string) {
    this.title.innerHTML = `<div class="small">${small}</div><div class="big">${big}</div>`;
    this.title.classList.remove('show');
    void this.title.offsetWidth;
    this.title.classList.add('show');
  }

  toast(text: string, color = '#fff') {
    const el = h('div', 'toast');
    el.textContent = text;
    el.style.color = color;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => el.classList.add('out'), 1800);
    setTimeout(() => el.remove(), 2400);
  }

  damageFlash() {
    this.vignetteT = 0.35;
  }

  floatText(pos: THREE.Vector3, text: string, cls: string, dur = 0.9) {
    const f = this.floaters.find((x) => !x.active) ?? this.floaters.reduce((a, b) => (a.t > b.t ? a : b));
    f.active = true;
    f.t = 0;
    f.dur = dur;
    f.pos.copy(pos);
    f.dx = (Math.random() - 0.5) * 40;
    f.el.className = 'floater ' + cls;
    f.el.textContent = text;
    f.el.style.display = 'block';
  }

  addLabel(pos: THREE.Vector3, text: string, color: string, cls = ''): Label {
    const el = h('div', 'loot-label ' + cls);
    setStyle(el, 'display', 'none');
    el.textContent = text;
    el.style.color = color;
    el.style.borderColor = color;
    this.labelLayer.appendChild(el);
    const label: Label = {
      el,
      pos: pos.clone(),
      remove: () => {
        el.remove();
        this.labels = this.labels.filter((l) => l !== label);
      },
    };
    this.labels.push(label);
    return label;
  }

  clearLabels() {
    for (const l of [...this.labels]) l.remove();
  }

  /** Projects to screen pixels into `px`/`py`/`onScreen` (no allocation). */
  private project(pos: THREE.Vector3, camera: THREE.Camera, yOff: number) {
    this.tmp.set(pos.x, pos.y + yOff, pos.z).project(camera);
    this.px = (this.tmp.x * 0.5 + 0.5) * window.innerWidth;
    this.py = (-this.tmp.y * 0.5 + 0.5) * window.innerHeight;
    this.onScreen = this.tmp.z < 1 && this.tmp.x > -1.05 && this.tmp.x < 1.05 && this.tmp.y > -1.05 && this.tmp.y < 1.05;
  }
  private px = 0;
  private py = 0;
  private onScreen = false;
  /** Label slots already placed this frame (for de-overlapping), reused between frames. */
  private placedX: number[] = [];
  private placedY: number[] = [];

  /**
   * `focus` is the hero: pickup labels only show within LABEL_RANGE of it (on screen, roughly the same
   * level), so loot and collectables never shout through walls or across the boss arena.
   */
  update(dt: number, camera: THREE.Camera, focus?: THREE.Vector3) {
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }
      const k = f.t / f.dur;
      this.project(f.pos, camera, 1.8);
      const rise = 30 + k * 50;
      const scale = k < 0.15 ? 1.6 - k * 4 : 1;
      f.el.style.transform = `translate(${this.px + f.dx * k}px, ${this.py - rise}px) translate(-50%, -50%) scale(${scale})`;
      f.el.style.opacity = String(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    }
    // Loot labels: near the hero only, stacked so they don't overlap too much.
    let n = 0;
    for (const l of this.labels) {
      let alpha = 1;
      if (focus) {
        const d = Math.hypot(l.pos.x - focus.x, l.pos.z - focus.z);
        alpha = Math.abs(l.pos.y - focus.y) > 2.5 ? 0 : clamp01((LABEL_RANGE - d) / 1.2);
      }
      if (alpha > 0) {
        this.project(l.pos, camera, 0.9);
        if (!this.onScreen) alpha = 0;
      }
      if (alpha <= 0) {
        setStyle(l.el, 'display', 'none');
        continue;
      }
      setStyle(l.el, 'display', 'block');
      const x = this.px;
      let y = this.py;
      for (let i = 0; i < n; i++) if (Math.abs(this.placedX[i] - x) < 110 && Math.abs(this.placedY[i] - y) < 20) y = this.placedY[i] - 22;
      this.placedX[n] = x;
      this.placedY[n] = y;
      n++;
      setStyle(l.el, 'opacity', alpha >= 1 ? '1' : alpha.toFixed(2));
      l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    this.vignetteT = Math.max(0, this.vignetteT - dt);
    this.vignette.style.opacity = String(this.vignetteT * 2.5);
  }

  /**
   * Draws the local area of the pre-rendered map, plus markers. The map turns with the camera (heading-up):
   * "up" on the minimap is always "into the screen" in the game view, so it matches what the player sees.
   * `camYaw` is the camera's yaw round the hero; `yaw` is the hero's facing.
   */
  drawMinimap(map: HTMLCanvasElement, bounds: { x0: number; z1: number }, px: number, pz: number, yaw: number, dots: { x: number; z: number; boss?: boolean }[], gates: { x0: number; x1: number; z: number; active: boolean }[], camYaw = 0) {
    const ctx = this.miniCtx;
    const W = this.mini.width, H = this.mini.height;
    const scale = 2; // map px per metre
    const view = 1.4; // zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141513';
    ctx.fillRect(0, 0, W, H);
    // World (dx, dz) relative to the hero → screen, matching Input.toWorld's camera basis:
    // screen x = dx·cos − dz·sin, screen y = dx·sin + dz·cos, i.e. a rotation by the camera yaw.
    ctx.translate(W / 2, H / 2);
    ctx.scale(view, view);
    ctx.rotate(camYaw);
    // The baked map has image y = (z1 − z)·scale, so flip it back into world z.
    ctx.save();
    ctx.translate((bounds.x0 - px) * scale, (bounds.z1 - pz) * scale);
    ctx.scale(1, -1);
    ctx.drawImage(map, 0, 0);
    ctx.restore();
    ctx.strokeStyle = '#ff3a2a';
    ctx.lineWidth = 2;
    for (const g of gates) {
      if (!g.active) continue;
      ctx.beginPath();
      ctx.moveTo((g.x0 - px) * scale, (g.z - pz) * scale);
      ctx.lineTo((g.x1 - px) * scale, (g.z - pz) * scale);
      ctx.stroke();
    }
    for (const d of dots) {
      ctx.fillStyle = d.boss ? '#7dff9a' : '#ff3030';
      ctx.beginPath();
      ctx.arc((d.x - px) * scale, (d.z - pz) * scale, d.boss ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow: tip along the hero's facing (sin yaw, cos yaw) in world X/Z.
    ctx.rotate(Math.PI - yaw);
    ctx.scale(1 / view, 1 / view);
    ctx.fillStyle = '#ff4a2a';
    ctx.strokeStyle = '#2a0a05';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // North tick (world −Z, the way the journey runs) on the rim.
    ctx.setTransform(1, 0, 0, 1, W / 2, H / 2);
    const nx = Math.sin(camYaw), ny = -Math.cos(camYaw);
    const R = W / 2 - 10;
    ctx.fillStyle = '#e2b25a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx * R, ny * R);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
