import type { Action, Input } from '../engine/input';
import { ICONS } from './icons';

interface SkillButton {
  el: HTMLDivElement;
  cd: HTMLDivElement;
  cdText: HTMLDivElement;
}

/**
 * On-screen controls. On touch devices: a floating joystick on the left and
 * an attack button with an arc of skill buttons on the right (matching the
 * reference layout). On desktop the same buttons render as a compact skill bar
 * with key hints.
 */
export class Controls {
  readonly root: HTMLDivElement;
  private skills: SkillButton[] = [];
  private transformBtn: SkillButton;
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

    // Joystick
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

    // Action cluster
    const cluster = document.createElement('div');
    cluster.className = 'cluster';
    this.root.appendChild(cluster);

    const attack = this.button(cluster, 'attack big', ICONS.attack, touch ? '' : 'LMB');
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
    press(attack.el, () => this.input.setTouchAttack(true), () => this.input.setTouchAttack(false));

    const icons = [ICONS.whirl, ICONS.flame, ICONS.slam, ICONS.gale];
    const keys = ['1', '2', '3', '4'];
    for (let i = 0; i < 4; i++) {
      const b = this.button(cluster, `skill s${i}`, icons[i], touch ? '' : keys[i]);
      press(b.el, () => this.input.press(`skill${i}` as Action));
      this.skills.push(b);
    }
    const dodge = this.button(cluster, 'dodge', ICONS.dodge, touch ? '' : 'Space');
    press(dodge.el, () => this.input.press('dodge'));
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

    // Top buttons
    const top = document.createElement('div');
    top.className = 'top-buttons';
    this.root.appendChild(top);
    const bag = this.button(top, 'small', ICONS.bag, touch ? '' : 'I');
    press(bag.el, () => this.input.press('inventory'));
    const pause = this.button(top, 'small', ICONS.pause, touch ? '' : 'Esc');
    press(pause.el, () => this.input.press('pause'));
  }

  private button(parent: HTMLElement, cls: string, icon: string, key: string): SkillButton {
    const el = document.createElement('div');
    el.className = 'btn ' + cls;
    el.innerHTML = `<div class="icon">${icon}</div>`;
    const cd = document.createElement('div');
    cd.className = 'cd';
    const cdText = document.createElement('div');
    cdText.className = 'cd-text';
    el.append(cd, cdText);
    if (key) {
      const k = document.createElement('div');
      k.className = 'key';
      k.textContent = key;
      el.appendChild(k);
    }
    parent.appendChild(el);
    return { el, cd, cdText };
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
    const m = Math.hypot(nx, ny);
    if (m < 0.12) this.input.setTouchMove(0, 0);
    else this.input.setTouchMove(nx, ny);
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.input.setTouchMove(0, 0);
      this.input.setTouchAttack(false);
    }
  }

  update(cooldowns: number[], maxCds: number[], mana: number, costs: number[], fury: number, transformLeft: number, transformMax: number) {
    for (let i = 0; i < 4; i++) {
      const b = this.skills[i];
      const frac = maxCds[i] > 0 ? cooldowns[i] / maxCds[i] : 0;
      b.cd.style.setProperty('--p', String(frac));
      b.cd.style.display = frac > 0 ? 'block' : 'none';
      b.cdText.textContent = cooldowns[i] > 0 ? Math.ceil(cooldowns[i]).toString() : '';
      b.el.classList.toggle('nomana', mana < costs[i]);
    }
    const transformed = transformLeft > 0;
    const f = transformed ? transformLeft / transformMax : fury / 100;
    this.furyRing.style.strokeDasharray = `${f * 100} 100`;
    this.transformBtn.el.classList.toggle('ready', fury >= 100 && !transformed);
    this.transformBtn.el.classList.toggle('active', transformed);
  }
}
