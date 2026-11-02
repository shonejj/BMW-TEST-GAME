import type { Action, Input } from '../engine/input';
import type { Player } from '../game/player';
import { ICONS } from './icons';
import { setClass, setStyle, setText } from './dom';

interface Button {
  el: HTMLDivElement;
  icon: HTMLDivElement;
  cd: HTMLDivElement;
  cdText: HTMLDivElement;
  badge: HTMLDivElement;
}

/** Per-control placement offset (px, in its container's unscaled space) and size multiplier. */
interface Place { x: number; y: number; s: number }
interface Layout { opacity: number; items: Record<string, Place> }

const LAYOUT_KEY = 'monkey-king-touch-layout-v1';
const CAMERA_ICON = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22 h12 l5 -7 h14 l5 7 h12 v28 h-48z"/><circle cx="32" cy="35" r="9"/><path d="M46 8 a22 22 0 0 1 10 10 m0 -7 v7 h-7" opacity=".75"/></svg>`;

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const l = JSON.parse(raw) as Partial<Layout>;
      return { opacity: typeof l.opacity === 'number' ? l.opacity : 1, items: l.items ?? {} };
    }
  } catch {
    /* private mode / corrupt: defaults */
  }
  return { opacity: 1, items: {} };
}

/**
 * On-screen controls. On touch devices: a floating joystick on the left and,
 * on the right, a big staff-attack button with heavy attack, dodge, gourd,
 * four spells and the transformation around it (like the reference layout).
 * Dragging on empty screen on the right orbits the camera. The layout can be customised in Settings
 * (drag to move, pinch or −/+ to resize, global opacity), saved per device.
 * On desktop the same buttons render as a compact action bar with key hints.
 * Everything is also playable with a gamepad.
 */
export class Controls {
  readonly root: HTMLDivElement;
  private spells: Button[] = [];
  private spellIds: string[] = ['', '', '', ''];
  private heavy: Button;
  private gourd: Button;
  private transformBtn: Button;
  private furyRing: SVGCircleElement;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private readonly radius = 55;
  private lookId: number | null = null;
  private lookX = 0;
  private lookY = 0;
  /** Customisable controls by key. */
  private readonly ctl = new Map<string, HTMLElement>();
  private layout: Layout;
  private editing = false;
  private editor: HTMLDivElement | null = null;
  private selected: string | null = null;

  constructor(parent: HTMLElement, private readonly input: Input, touch: boolean, onUnlock: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'controls ' + (touch ? 'touch' : 'desktop');
    parent.appendChild(this.root);

    // Camera look: drag on the empty right side of the screen (buttons sit above this layer).
    const look = document.createElement('div');
    look.className = 'look-zone';
    this.root.appendChild(look);
    look.addEventListener('pointerdown', (e) => {
      onUnlock();
      if (this.lookId !== null || this.editing) return;
      this.lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook(e.clientX - this.lookX, e.clientY - this.lookY, 0.0065);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    const lookEnd = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);

    // Floating joystick: appears wherever the left thumb lands.
    const zone = document.createElement('div');
    zone.className = 'stick-zone';
    this.stick = document.createElement('div');
    this.stick.className = 'stick';
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.stick.appendChild(this.knob);
    zone.appendChild(this.stick);
    this.root.appendChild(zone);
    this.ctl.set('stick', this.stick);
    zone.addEventListener('pointerdown', (e) => {
      onUnlock();
      if (this.stickId !== null || this.editing) return;
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stick.style.translate = '';
      this.stick.style.left = e.clientX - r.left + 'px';
      this.stick.style.top = e.clientY - r.top + 'px';
      this.stick.classList.add('active');
      this.moveKnob(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveKnob(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.stick.classList.remove('active');
      this.stick.style.left = '';
      this.stick.style.top = '';
      this.applyPlace('stick');
      this.input.setTouchMove(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const cluster = document.createElement('div');
    cluster.className = 'cluster';
    this.root.appendChild(cluster);

    const press = (el: HTMLElement, down: () => void, up?: () => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onUnlock();
        if (this.editing) return;
        el.classList.add('pressed');
        el.setPointerCapture(e.pointerId);
        down();
      });
      const release = () => {
        if (!el.classList.contains('pressed')) return;
        el.classList.remove('pressed');
        up?.();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };

    const attack = this.button(cluster, 'attack big', ICONS.attack, touch ? '' : 'LMB', 'attack');
    press(attack.el, () => this.input.setTouchAttack(true), () => this.input.setTouchAttack(false));
    this.heavy = this.button(cluster, 'heavy', ICONS.heavy, touch ? '' : 'RMB', 'heavy');
    press(this.heavy.el, () => this.input.setTouchHeavy(true), () => this.input.setTouchHeavy(false));
    const dodge = this.button(cluster, 'dodge', ICONS.dodge, touch ? '' : 'Space', 'dodge');
    press(dodge.el, () => this.input.press('dodge'));
    this.gourd = this.button(cluster, 'gourd', ICONS.gourd, touch ? '' : 'G', 'gourd');
    press(this.gourd.el, () => this.input.press('gourd'));
    const keys = ['1', '2', '3', '4'];
    for (let i = 0; i < 4; i++) {
      const b = this.button(cluster, `skill s${i}`, '', touch ? '' : keys[i], `s${i}`);
      press(b.el, () => this.input.press(`skill${i}` as Action));
      this.spells.push(b);
    }
    this.transformBtn = this.button(cluster, 'transform', ICONS.transform, touch ? '' : 'T', 'transform');
    press(this.transformBtn.el, () => this.input.press('transform'));
    this.furyRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 100 100');
    ring.classList.add('fury-ring');
    this.furyRing.setAttribute('cx', '50');
    this.furyRing.setAttribute('cy', '50');
    this.furyRing.setAttribute('r', '46');
    this.furyRing.setAttribute('pathLength', '100');
    ring.appendChild(this.furyRing);
    this.transformBtn.el.appendChild(ring);

    const top = document.createElement('div');
    top.className = 'top-buttons';
    this.root.appendChild(top);
    const menu = this.button(top, 'small', ICONS.menu, touch ? '' : 'I', 'menu');
    press(menu.el, () => this.input.press('inventory'));
    const pause = this.button(top, 'small', ICONS.pause, touch ? '' : 'Esc', 'pause');
    press(pause.el, () => this.input.press('pause'));
    const cam = this.button(top, 'small cam', CAMERA_ICON, touch ? '' : 'C', 'cam');
    cam.el.title = 'Switch camera';
    press(cam.el, () => this.input.press('camera'));

    this.layout = touch ? loadLayout() : { opacity: 1, items: {} };
    this.applyLayout();

    // Customise mode: capture every touch before the controls see it.
    this.root.addEventListener('pointerdown', (e) => this.editDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.editMove(e));
    window.addEventListener('pointerup', (e) => this.editUp(e));
    window.addEventListener('pointercancel', (e) => this.editUp(e));
  }

  private button(parent: HTMLElement, cls: string, icon: string, key: string, id: string): Button {
    const el = document.createElement('div');
    el.className = 'btn ' + cls;
    el.dataset.ctl = id;
    const ic = document.createElement('div');
    ic.className = 'icon';
    ic.innerHTML = icon;
    const cd = document.createElement('div');
    cd.className = 'cd';
    const cdText = document.createElement('div');
    cdText.className = 'cd-text';
    const badge = document.createElement('div');
    badge.className = 'badge';
    el.append(ic, cd, cdText, badge);
    if (key) {
      const k = document.createElement('div');
      k.className = 'key';
      k.textContent = key;
      el.appendChild(k);
    }
    parent.appendChild(el);
    this.ctl.set(id, el);
    return { el, icon: ic, cd, cdText, badge };
  }

  private moveKnob(x: number, y: number) {
    const radius = this.radius * (this.layout.items.stick?.s ?? 1);
    let dx = x - this.stickOrigin.x, dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / radius, ny = dy / radius;
    if (Math.hypot(nx, ny) < 0.12) this.input.setTouchMove(0, 0);
    else this.input.setTouchMove(nx, ny);
  }

  // -------------------------------------------------------------------------
  // Layout customisation
  // -------------------------------------------------------------------------

  private applyPlace(id: string) {
    const el = this.ctl.get(id);
    if (!el) return;
    const p = this.layout.items[id];
    // Individual `translate`/`scale` properties compose with the pressed-state `transform`.
    el.style.translate = p && (p.x || p.y) && !(id === 'stick' && this.stickId !== null) ? `${p.x}px ${p.y}px` : '';
    el.style.scale = p && p.s !== 1 ? String(p.s) : '';
  }

  private applyLayout() {
    for (const id of this.ctl.keys()) this.applyPlace(id);
    this.root.style.setProperty('--ctl-alpha', String(this.layout.opacity));
  }

  private saveLayout() {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout));
    } catch {
      /* storage blocked: layout lasts for this session */
    }
  }

  private place(id: string): Place {
    return (this.layout.items[id] ??= { x: 0, y: 0, s: 1 });
  }

  /** Enters the touch-layout editor; `onDone` runs when the player taps Done. */
  customize(onDone: () => void) {
    this.editing = true;
    this.root.classList.add('editing');
    this.input.setTouchMove(0, 0);
    this.input.setTouchAttack(false);
    this.input.setTouchHeavy(false);
    const ed = document.createElement('div');
    ed.className = 'ctl-editor';
    ed.innerHTML = `
      <div class="ctl-title">Customize controls</div>
      <div class="ctl-hint">Drag a button or the joystick to move it · pinch or −/+ to resize</div>
      <div class="ctl-row">
        <button class="mbtn sq" data-e="smaller" aria-label="Smaller">−</button>
        <span class="ctl-sel-name">Tap a control</span>
        <button class="mbtn sq" data-e="bigger" aria-label="Bigger">+</button>
      </div>
      <label class="ctl-row">Opacity <input type="range" min="0.2" max="1" step="0.05" data-e="opacity"></label>
      <div class="ctl-row">
        <button class="mbtn" data-e="reset">Reset</button>
        <button class="mbtn primary" data-e="done">Done</button>
      </div>`;
    const opacity = ed.querySelector<HTMLInputElement>('[data-e=opacity]')!;
    opacity.value = String(this.layout.opacity);
    opacity.addEventListener('input', () => {
      this.layout.opacity = +opacity.value;
      this.applyLayout();
    });
    const resize = (k: number) => {
      if (!this.selected) return;
      const p = this.place(this.selected);
      p.s = Math.round(Math.min(1.8, Math.max(0.6, p.s * k)) * 100) / 100;
      this.applyPlace(this.selected);
    };
    ed.querySelector('[data-e=smaller]')!.addEventListener('click', () => resize(1 / 1.1));
    ed.querySelector('[data-e=bigger]')!.addEventListener('click', () => resize(1.1));
    ed.querySelector('[data-e=reset]')!.addEventListener('click', () => {
      this.layout = { opacity: 1, items: {} };
      opacity.value = '1';
      this.applyLayout();
    });
    ed.querySelector('[data-e=done]')!.addEventListener('click', () => {
      this.saveLayout();
      this.select(null);
      ed.remove();
      this.editor = null;
      this.editing = false;
      this.root.classList.remove('editing');
      onDone();
    });
    this.root.appendChild(ed);
    this.editor = ed;
  }

  private select(id: string | null) {
    if (this.selected) this.ctl.get(this.selected)?.classList.remove('ctl-sel');
    this.selected = id;
    if (id) this.ctl.get(id)?.classList.add('ctl-sel');
    const name = this.editor?.querySelector('.ctl-sel-name');
    if (name) name.textContent = id ? CTL_NAMES[id] ?? id : 'Tap a control';
  }

  private drag: { id: string; pointer: number; x: number; y: number; px: number; py: number; k: number } | null = null;
  private pinch: { pointer: number; d0: number; s0: number; x: number; y: number } | null = null;

  private editDown(e: PointerEvent) {
    if (!this.editing) return;
    if (this.editor?.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-ctl], .stick');
    const id = hit ? (hit.classList.contains('stick') ? 'stick' : hit.dataset.ctl!) : null;
    if (this.drag && this.selected) {
      // Second finger: pinch to resize the selected control.
      const p = this.place(this.selected);
      this.pinch = { pointer: e.pointerId, d0: Math.max(20, Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y)), s0: p.s, x: e.clientX, y: e.clientY };
      return;
    }
    if (!id) {
      this.select(null);
      return;
    }
    this.select(id);
    const el = this.ctl.get(id)!;
    const p = this.place(id);
    // Offsets live in the parent's unscaled pixels (the touch cluster is scaled down on short screens).
    const parent = el.parentElement!;
    const k = parent.offsetWidth ? parent.getBoundingClientRect().width / parent.offsetWidth : 1;
    this.drag = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, px: p.x - e.clientX / k, py: p.y - e.clientY / k, k };
  }

  private editMove(e: PointerEvent) {
    if (!this.editing) return;
    if (this.pinch && this.drag && this.selected) {
      if (e.pointerId === this.pinch.pointer) { this.pinch.x = e.clientX; this.pinch.y = e.clientY; }
      else if (e.pointerId === this.drag.pointer) { this.drag.x = e.clientX; this.drag.y = e.clientY; }
      else return;
      const d = Math.hypot(this.pinch.x - this.drag.x, this.pinch.y - this.drag.y);
      const p = this.place(this.selected);
      p.s = Math.round(Math.min(1.8, Math.max(0.6, this.pinch.s0 * (d / this.pinch.d0))) * 100) / 100;
      this.applyPlace(this.selected);
      return;
    }
    const dr = this.drag;
    if (!dr || e.pointerId !== dr.pointer) return;
    dr.x = e.clientX;
    dr.y = e.clientY;
    const p = this.place(dr.id);
    p.x = Math.round(dr.px + e.clientX / dr.k);
    p.y = Math.round(dr.py + e.clientY / dr.k);
    this.applyPlace(dr.id);
  }

  private editUp(e: PointerEvent) {
    if (this.pinch && e.pointerId === this.pinch.pointer) this.pinch = null;
    if (this.drag && e.pointerId === this.drag.pointer) {
      this.drag = null;
      this.pinch = null;
    }
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.input.setTouchMove(0, 0);
      this.input.setTouchAttack(false);
      this.input.setTouchHeavy(false);
      this.lookId = null;
    }
  }

  update(p: Player) {
    for (let i = 0; i < 4; i++) {
      const b = this.spells[i];
      const def = p.spellDef(i);
      if (this.spellIds[i] !== def.id) {
        this.spellIds[i] = def.id;
        b.icon.innerHTML = (ICONS as Record<string, string>)[def.id] ?? ICONS.whirl;
        b.el.title = def.name;
      }
      const max = p.spellCooldown(i);
      const frac = max > 0 ? p.cooldowns[i] / max : 0;
      setStyle(b.cd, '--p', frac.toFixed(3));
      setStyle(b.cd, 'display', frac > 0 ? 'block' : 'none');
      setText(b.cdText, p.cooldowns[i] > 0 ? Math.ceil(p.cooldowns[i]).toString() : '');
      setClass(b.el, 'nomana', p.mana < def.mana);
    }
    setText(this.gourd.badge, String(p.gourd));
    setClass(this.gourd.el, 'empty', p.gourd <= 0);
    const pips = Math.floor(p.focus);
    setText(this.heavy.badge, pips > 0 ? '●'.repeat(pips) : '');
    setClass(this.heavy.el, 'charging', p.state === 'charge');
    setStyle(this.heavy.el, '--charge', String(p.chargeLevel));
    const transformed = p.transformTime > 0;
    const f = transformed ? p.transformTime / p.stats.transformTime : p.fury / 100;
    setStyle(this.furyRing, 'stroke-dasharray', `${(f * 100).toFixed(1)} 100`);
    setClass(this.transformBtn.el, 'ready', p.fury >= 100 && !transformed);
    setClass(this.transformBtn.el, 'active', transformed);
  }
}

const CTL_NAMES: Record<string, string> = {
  stick: 'Joystick', attack: 'Attack', heavy: 'Heavy attack', dodge: 'Dodge', gourd: 'Gourd',
  s0: 'Spell 1', s1: 'Spell 2', s2: 'Spell 3', s3: 'Spell 4', transform: 'Transform', menu: 'Menu', pause: 'Pause', cam: 'Camera',
};
