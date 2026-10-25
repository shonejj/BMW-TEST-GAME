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

/**
 * On-screen controls. On touch devices: a floating joystick on the left and,
 * on the right, a big staff-attack button with heavy attack, dodge, gourd,
 * four spells and the transformation around it (like the reference layout).
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

  constructor(parent: HTMLElement, private readonly input: Input, touch: boolean, onUnlock: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'controls ' + (touch ? 'touch' : 'desktop');
    parent.appendChild(this.root);

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
    zone.addEventListener('pointerdown', (e) => {
      onUnlock();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.stickOrigin = { x: e.clientX, y: e.clientY };
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
        el.classList.add('pressed');
        el.setPointerCapture(e.pointerId);
        down();
      });
      const release = () => {
        el.classList.remove('pressed');
        up?.();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };

    const attack = this.button(cluster, 'attack big', ICONS.attack, touch ? '' : 'LMB');
    press(attack.el, () => this.input.setTouchAttack(true), () => this.input.setTouchAttack(false));
    this.heavy = this.button(cluster, 'heavy', ICONS.heavy, touch ? '' : 'RMB');
    press(this.heavy.el, () => this.input.setTouchHeavy(true), () => this.input.setTouchHeavy(false));
    const dodge = this.button(cluster, 'dodge', ICONS.dodge, touch ? '' : 'Space');
    press(dodge.el, () => this.input.press('dodge'));
    this.gourd = this.button(cluster, 'gourd', ICONS.gourd, touch ? '' : 'G');
    press(this.gourd.el, () => this.input.press('gourd'));
    const keys = ['1', '2', '3', '4'];
    for (let i = 0; i < 4; i++) {
      const b = this.button(cluster, `skill s${i}`, '', touch ? '' : keys[i]);
      press(b.el, () => this.input.press(`skill${i}` as Action));
      this.spells.push(b);
    }
    this.transformBtn = this.button(cluster, 'transform', ICONS.transform, touch ? '' : 'T');
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
    const menu = this.button(top, 'small', ICONS.menu, touch ? '' : 'I');
    press(menu.el, () => this.input.press('inventory'));
    const pause = this.button(top, 'small', ICONS.pause, touch ? '' : 'Esc');
    press(pause.el, () => this.input.press('pause'));
  }

  private button(parent: HTMLElement, cls: string, icon: string, key: string): Button {
    const el = document.createElement('div');
    el.className = 'btn ' + cls;
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
    return { el, icon: ic, cd, cdText, badge };
  }

  private moveKnob(x: number, y: number) {
    let dx = x - this.stickOrigin.x, dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / this.radius, ny = dy / this.radius;
    if (Math.hypot(nx, ny) < 0.12) this.input.setTouchMove(0, 0);
    else this.input.setTouchMove(nx, ny);
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.input.setTouchMove(0, 0);
      this.input.setTouchAttack(false);
      this.input.setTouchHeavy(false);
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
