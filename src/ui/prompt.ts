import type { Interactive, InteractKind, Level } from '../world/level';
import type { Hud } from './hud';

/**
 * Interaction affordances: the world-space "what do I do here" prompt, and the one-off tutorial hints.
 *
 * Everything the hero can act on (chests, collectables, braziers, shrines, shortcut gates, heavy
 * breakables and the seals that bar the way) reports itself through Level.nearestInteractive; this driver
 * turns the nearest one into a prompt above it, with the button glyph for whatever device is in use. The
 * first time the player meets a new mechanic it also shows a single explanatory line, remembered in
 * localStorage so it never nags twice.
 */

export type Device = 'keyboard' | 'pad' | 'touch';

/** Button labels per device. Keep them short: they sit in a key cap. */
const GLYPHS: Record<Device, Record<'attack' | 'heavy', string>> = {
  keyboard: { attack: 'LMB', heavy: 'RMB' },
  pad: { attack: 'X', heavy: 'Y' },
  touch: { attack: 'Attack', heavy: 'Heavy' },
};

export const buttonLabel = (device: Device, action: 'attack' | 'heavy' = 'attack') => GLYPHS[device][action];

/** Prompts for things you hit need a button; the rest you simply walk up to. */
const NEEDS_BUTTON = new Set<InteractKind>(['breakable', 'rubble']);

const HINT_KEY = 'monkey-king-hints-v1';

/** One line per mechanic, shown the first time the player meets it. */
const HINTS: Partial<Record<InteractKind | 'water' | 'deepWater', string>> = {
  rubble: 'Loose rubble blocks a side path. Smash it with your staff to get through.',
  breakable: 'Crates, urns and rocks break open — they often hide coin.',
  chest: 'Walk up to a chest to open it. Ornate and sealed chests hold better gear.',
  chestSealed: 'A seal holds this chest shut. Clear what the seal names and come back.',
  brazier: 'Light every brazier in the area to break the seal on its chest.',
  shrine: "A Keeper's Shrine: rest here to heal, refill the gourd and save. The yaoguai return.",
  doorBarred: 'This gate is barred from the far side. Find the way round and it becomes a shortcut.',
  seal: 'A red seal bars the way on. Defeat the yaoguai in this area to break it.',
  water: 'Shallow water slows you to a wade. Deep water you cannot cross — look for the shore.',
};

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HINT_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Tutorial hints, fired once per mechanic and remembered across sessions. */
export class Hints {
  private seen = loadSeen();

  constructor(private readonly show: (text: string) => void) {}

  /** Fires the hint for `id` if it has never been shown. Returns true if it fired. */
  fire(id: string) {
    const text = HINTS[id as InteractKind];
    if (!text || this.seen.has(id)) return false;
    this.seen.add(id);
    try {
      localStorage.setItem(HINT_KEY, JSON.stringify([...this.seen]));
    } catch { /* storage blocked: the hint just shows again next session */ }
    this.show(text);
    return true;
  }

  /** Settings / new game: show every hint again. */
  reset() {
    this.seen.clear();
    try {
      localStorage.removeItem(HINT_KEY);
    } catch { /* ignore */ }
  }
}

/** Ankle-deep: matches WADE_MIN in world/water.ts. */
const WET = 0.08;

export class Prompts {
  readonly hints: Hints;
  /** Set by the game so the glyph matches the device actually in use. */
  device: Device;
  private hintT = 0;

  constructor(private readonly level: Level, private readonly hud: Hud, touch: boolean) {
    this.device = touch ? 'touch' : 'keyboard';
    this.hints = new Hints((text) => {
      this.hud.showHint(text);
      this.hintT = 7;
    });
  }

  /** Call once a frame while playing. `usingGamepad` comes straight off the Input. */
  update(dt: number, x: number, y: number, z: number, usingGamepad: boolean, touch: boolean) {
    this.device = touch ? 'touch' : usingGamepad ? 'pad' : 'keyboard';
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hud.showHint('');
    }
    if (this.level.waterFx.depth > WET) this.hints.fire('water');
    const it = this.level.nearestInteractive(x, z);
    if (!it || Math.abs(it.y - y) > 7) {
      this.hud.setPrompt(null);
      return;
    }
    this.hud.setPrompt(it.x, it.y, it.z, label(it), NEEDS_BUTTON.has(it.kind) ? buttonLabel(this.device) : '');
    if (it.dist < 3.4) this.hints.fire(it.kind);
  }

  clear() {
    this.hud.setPrompt(null);
    this.hud.showHint('');
    this.hintT = 0;
  }
}

const label = (it: Interactive) => (it.note ? `${it.verb} · ${it.note}` : it.verb);
