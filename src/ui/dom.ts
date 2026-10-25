/**
 * Cached DOM writes. The HUD is refreshed every frame, but writing a style or
 * text node that hasn't changed still costs a style recalc / layout on mobile.
 * These helpers only touch the DOM when the value actually changes.
 */
const cache = new WeakMap<Element, Map<string, string>>();

function changed(el: Element, key: string, value: string) {
  let m = cache.get(el);
  if (!m) cache.set(el, (m = new Map()));
  if (m.get(key) === value) return false;
  m.set(key, value);
  return true;
}

export function setText(el: HTMLElement, text: string) {
  if (changed(el, 'text', text)) el.textContent = text;
}

export function setStyle(el: HTMLElement | SVGElement, prop: string, value: string) {
  if (changed(el, 's:' + prop, value)) el.style.setProperty(prop, value);
}

export function setClass(el: Element, cls: string, on: boolean) {
  if (changed(el, 'c:' + cls, on ? '1' : '0')) el.classList.toggle(cls, on);
}

/** scaleX() with the fraction rounded so tiny changes don't trigger writes. */
export const scaleX = (f: number) => `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
