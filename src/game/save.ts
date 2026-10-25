import type { Item, Slot } from './loot';
import type { Quality } from '../engine/renderer';

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
}

export interface Settings {
  quality: Quality;
  volume: number;
  music: number;
  damageNumbers: boolean;
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

export function loadSettings(defaultQuality: Quality): Settings {
  return { quality: defaultQuality, volume: 0.8, music: 0.5, damageNumbers: true, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}
export const writeSettings = (s: Settings) => write(SETTINGS_KEY, s);
