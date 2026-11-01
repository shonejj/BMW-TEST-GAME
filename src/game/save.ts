import type { Item, Slot } from './loot';
import type { Look, Quality } from '../engine/renderer';
import type { CameraMode } from '../engine/camera';
import type { SpellId, Talents } from './progression';

export interface SaveData {
  version: 1;
  level: number;
  xp: number;
  gold: number;
  bag: Item[];
  equipped: Partial<Record<Slot, Item>>;
  cleared: number;
  ng: number;
  nextItemId: number;
  kills: number;
  playTime: number;
  talents?: Talents;
  spells?: SpellId[];
  bestiary?: Record<string, number>;
}

export interface Settings {
  quality: Quality;
  volume: number;
  music: number;
  damageNumbers: boolean;
  /** 1 = full, 0.5 = reduced, 0 = off (accessibility). */
  screenShake: number;
  /** Frame cap: 30 (battery saver), 60, or 0 (match display). */
  fpsCap: number;
  /** Lower resolution automatically when the device can't keep up. */
  dynamicRes: boolean;
  cutscenes: boolean;
  /** Set once phone defaults (30 fps cap) have been applied to an older saved profile. */
  mobileTuned?: boolean;
  /** Retro pixel-art render pass, or native-resolution smooth rendering. */
  look: Look;
  camera: CameraMode;
}

const SAVE_KEY = 'monkey-king-save-v1';
const SETTINGS_KEY = 'monkey-king-settings-v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked (private mode): the game still runs */
  }
}

export const loadSave = () => {
  const s = read<SaveData>(SAVE_KEY);
  return s && s.version === 1 ? s : null;
};
export const writeSave = (s: SaveData) => write(SAVE_KEY, s);

export function loadSettings(defaultQuality: Quality, defaultFps = 60): Settings {
  return { quality: defaultQuality, volume: 0.8, music: 0.5, damageNumbers: true, screenShake: 1, fpsCap: defaultFps, dynamicRes: true, cutscenes: true, look: 'pixel', camera: 'iso', ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}
export const writeSettings = (s: Settings) => write(SETTINGS_KEY, s);
