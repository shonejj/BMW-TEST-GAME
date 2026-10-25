export type Action = 'dodge' | 'skill0' | 'skill1' | 'skill2' | 'skill3' | 'transform' | 'inventory' | 'pause' | 'attack' | 'gourd' | 'heavy';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyK: 'dodge',
  Digit1: 'skill0', KeyQ: 'skill0',
  Digit2: 'skill1', KeyE: 'skill1',
  Digit3: 'skill2', KeyR: 'skill2',
  Digit4: 'skill3', KeyF: 'skill3',
  KeyT: 'transform', KeyV: 'transform',
  KeyI: 'inventory', Tab: 'inventory',
  Escape: 'pause', KeyP: 'pause',
  KeyJ: 'attack',
  KeyG: 'gourd', KeyH: 'gourd',
  KeyL: 'heavy',
};

// Standard gamepad: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 11 R3, 12 D-pad up.
// X = light attack (held), Y = heavy attack (held).
const PAD_ACTIONS: [number, Action][] = [
  [0, 'dodge'], [1, 'gourd'], [4, 'skill0'], [5, 'skill1'], [6, 'skill2'], [7, 'skill3'],
  [11, 'transform'], [12, 'transform'], [8, 'inventory'], [9, 'pause'],
];

/**
 * Unifies keyboard + mouse, gamepad and on-screen touch controls into one
 * per-frame state. Movement is in screen space: x right, y down (towards camera).
 */
export class Input {
  moveX = 0;
  moveY = 0;
  attackHeld = false;
  /** Heavy attack is charged while held and released to strike. */
  heavyHeld = false;
  /** Mouse position in normalised device coordinates, when the mouse is being used to aim. */
  mouseNdc: { x: number; y: number } | null = null;
  /** Right-stick aim from a gamepad, screen space. */
  padAim: { x: number; y: number } | null = null;
  usingGamepad = false;
  /** While true (cutscenes), gameplay input reads as idle. */
  suppressed = false;
  /** Set by any key / click / touch / gamepad button; used to skip cutscenes. */
  anyPress = false;

  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private touchMove = { x: 0, y: 0 };
  private touchAttack = false;
  private touchHeavy = false;
  private mouseHeavy = false;
  private keyHeavy = false;
  private mouseAttack = false;
  private keyAttack = false;
  private padAttack = false;
  private padPrev: boolean[] = [];
  private lastMouseMove = -1e9;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.anyPress = true;
      this.keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a === 'attack') this.keyAttack = true;
      else if (a === 'heavy') this.keyHeavy = true;
      else if (a) this.pressed.add(a);
      this.usingGamepad = false;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (KEY_ACTIONS[e.code] === 'attack') this.keyAttack = false;
      if (KEY_ACTIONS[e.code] === 'heavy') this.keyHeavy = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseAttack = this.keyAttack = this.touchAttack = false;
      this.mouseHeavy = this.keyHeavy = this.touchHeavy = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouseNdc = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 };
      this.lastMouseMove = performance.now();
      this.usingGamepad = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseAttack = true;
      if (e.button === 2) this.mouseHeavy = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseAttack = false;
      if (e.button === 2) this.mouseHeavy = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => (this.anyPress = true));
  }

  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }
  setTouchAttack(held: boolean) {
    this.touchAttack = held;
  }
  setTouchHeavy(held: boolean) {
    this.touchHeavy = held;
  }
  press(a: Action) {
    this.pressed.add(a);
  }

  /** Consumes a one-shot action press. */
  consume(a: Action) {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }
  clearPresses() {
    this.pressed.clear();
  }

  get mouseAiming() {
    return this.mouseNdc !== null && performance.now() - this.lastMouseMove < 4000 && !this.usingGamepad;
  }

  update() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    x += this.touchMove.x;
    y += this.touchMove.y;

    this.padAttack = false;
    let padHeavy = false;
    this.padAim = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0;
      if (Math.hypot(lx, ly) > 0.2) {
        x += lx;
        y += ly;
        this.usingGamepad = true;
      }
      const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.35) this.padAim = { x: rx, y: ry };
      pad.buttons.forEach((b, i) => {
        if (b.pressed) this.usingGamepad = true;
        if (b.pressed && !this.padPrev[i]) {
          this.anyPress = true;
          for (const [idx, a] of PAD_ACTIONS) if (idx === i) this.pressed.add(a);
        }
        this.padPrev[i] = b.pressed;
      });
      if (pad.buttons[2]?.pressed) this.padAttack = true;
      if (pad.buttons[3]?.pressed) padHeavy = true;
      break;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (this.suppressed) {
      x = y = 0;
      this.pressed.clear();
    }
    this.moveX = x;
    this.moveY = y;
    this.attackHeld = this.mouseAttack || this.keyAttack || this.touchAttack || this.padAttack || this.consume('attack');
    this.heavyHeld = this.mouseHeavy || this.keyHeavy || this.touchHeavy || padHeavy;
    if (this.suppressed) this.attackHeld = this.heavyHeld = false;
  }
}
