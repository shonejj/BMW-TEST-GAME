export type Action = 'dodge' | 'skill0' | 'skill1' | 'skill2' | 'skill3' | 'transform' | 'inventory' | 'pause' | 'attack' | 'gourd' | 'heavy' | 'camera' | 'stance';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyK: 'dodge',
  Digit1: 'skill0', KeyQ: 'skill0',
  Digit2: 'skill1', KeyE: 'skill1',
  Digit3: 'skill2', KeyR: 'skill2',
  Digit4: 'skill3', KeyF: 'skill3',
  KeyT: 'transform', KeyV: 'transform', KeyC: 'camera',
  KeyI: 'inventory', Tab: 'inventory',
  Escape: 'pause', KeyP: 'pause',
  KeyJ: 'attack',
  KeyG: 'gourd', KeyH: 'gourd',
  KeyL: 'heavy',
  KeyX: 'stance',
};

// Standard gamepad: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 11 R3, 12 D-pad up.
// X = light attack (held), Y = heavy attack (held).
const PAD_ACTIONS: [number, Action][] = [
  [0, 'dodge'], [1, 'gourd'], [4, 'skill0'], [5, 'skill1'], [6, 'skill2'], [7, 'skill3'],
  [11, 'transform'], [12, 'transform'], [8, 'inventory'], [9, 'pause'], [13, 'camera'], [14, 'stance'],
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
  /**
   * Yaw of the camera around the player (radians). Stick/keys are screen-relative; moveX/moveY and
   * padAim are reported in world X/Z so "up" always means "away from the camera".
   */
  camYaw = 0;
  usingGamepad = false;
  /** While true (cutscenes), gameplay input reads as idle. */
  suppressed = false;
  /** Set by any key / click / touch / gamepad button; used to skip cutscenes. */
  anyPress = false;
  /**
   * Free camera look for this frame: drag deltas in radians (mouse middle-drag, touch drag on the right of
   * the screen) and stick/key rates in -1..1 (right stick, Z/X). Read by CameraRig.orbit().
   */
  lookX = 0;
  lookY = 0;
  lookRateX = 0;
  lookRateY = 0;
  /** When true the right stick orbits the camera instead of aiming (set by the camera rig per style). */
  rightStickLook = false;
  /** Look sensitivity multiplier (settings). */
  lookSensitivity = 1;
  private lookAccX = 0;
  private lookAccY = 0;
  private dragId = -1;
  private dragX = 0;
  private dragY = 0;

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
      if (e.button === 1) {
        // Middle-button drag orbits the camera (no pointer lock needed).
        e.preventDefault();
        this.dragId = 1;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragId !== 1) return;
      this.addLook(e.clientX - this.dragX, e.clientY - this.dragY, 0.005);
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseAttack = false;
      if (e.button === 2) this.mouseHeavy = false;
      if (e.button === 1) this.dragId = -1;
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
  /** Adds a drag in screen pixels to this frame's camera look (`k` = radians per pixel). */
  addLook(dxPx: number, dyPx: number, k = 0.006) {
    this.lookAccX += dxPx * k * this.lookSensitivity;
    this.lookAccY += dyPx * k * this.lookSensitivity;
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
    this.lookX = this.lookAccX;
    this.lookY = this.lookAccY;
    this.lookAccX = this.lookAccY = 0;
    let lrx = 0, lry = 0;
    if (this.keys.has('KeyZ')) lrx -= 1;
    if (this.keys.has('KeyX')) lrx += 1;
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
      if (this.rightStickLook) {
        // Radial deadzone, then a squared response curve for fine aim near the centre.
        const m = Math.hypot(rx, ry);
        if (m > 0.18) {
          const s = ((m - 0.18) / 0.82) ** 2 / m;
          lrx += rx * s;
          lry += ry * s;
        }
      } else if (Math.hypot(rx, ry) > 0.35) {
        const w = this.toWorld(rx, ry);
        this.padAimV.x = w.x;
        this.padAimV.y = w.y;
        this.padAim = this.padAimV;
      }
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
    this.lookRateX = lrx * this.lookSensitivity;
    this.lookRateY = lry * this.lookSensitivity;
    if (this.suppressed) {
      x = y = 0;
      this.pressed.clear();
      this.lookX = this.lookY = this.lookRateX = this.lookRateY = 0;
    }
    const w = this.toWorld(x, y);
    this.moveX = w.x;
    this.moveY = w.y;
    this.attackHeld = this.mouseAttack || this.keyAttack || this.touchAttack || this.padAttack || this.consume('attack');
    this.heavyHeld = this.mouseHeavy || this.keyHeavy || this.touchHeavy || padHeavy;
    if (this.suppressed) this.attackHeld = this.heavyHeld = false;
  }

  /** Screen-space (x right, y down) to world X/Z for the current camera yaw. */
  toWorld(x: number, y: number) {
    const c = Math.cos(this.camYaw), sn = Math.sin(this.camYaw);
    const w = this.worldV;
    w.x = x * c + y * sn;
    w.y = -x * sn + y * c;
    return w;
  }
  /** Scratch results (no per-frame allocation); copy the values if you need to keep them. */
  private readonly worldV = { x: 0, y: 0 };
  private readonly padAimV = { x: 0, y: 0 };
}
