/**
 * Per-chapter exploration state (opened chests, picked-up collectables, opened shortcuts, broken seals), kept
 * apart from the main save so the world track owns it. A fresh game or a new Torment cycle clears it, so the
 * chests fill up again on every playthrough.
 */
export interface ChapterWorld {
  chests: string[];
  items: string[];
  doors: string[];
  seals: string[];
}

const KEY = 'monkey-king-world-v1';
type Store = Record<string, ChapterWorld>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* storage full or blocked: exploration just isn't remembered */ }
}

export function loadChapterWorld(chapter: number): ChapterWorld {
  const s = read()[chapter];
  return { chests: s?.chests ?? [], items: s?.items ?? [], doors: s?.doors ?? [], seals: s?.seals ?? [] };
}

export function markWorld(chapter: number, key: keyof ChapterWorld, id: string) {
  const s = read();
  const c = (s[chapter] ??= { chests: [], items: [], doors: [], seals: [] });
  c[key] ??= [];
  if (!c[key].includes(id)) c[key].push(id);
  write(s);
}

/** Forget all exploration (new game, or the next Torment cycle). */
export function clearWorldSave() {
  write({});
}
