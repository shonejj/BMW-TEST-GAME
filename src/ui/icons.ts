/** Inline SVG icons (no image files needed). */
const svg = (body: string, vb = '0 0 64 64') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  attack: svg(`
    <circle cx="32" cy="32" r="27" stroke-width="2" opacity=".5"/>
    <circle cx="32" cy="32" r="21" stroke-width="1.5" opacity=".35" stroke-dasharray="3 4"/>
    <path d="M14 50 L50 14 M50 14 l-9 1 m9 -1 l-1 9" stroke-width="4"/>
    <path d="M14 14 L50 50 M50 50 l-9 -1 m9 1 l-1 -9" stroke-width="4"/>
    <circle cx="32" cy="32" r="5" fill="currentColor"/>`),
  whirl: svg(`<path d="M32 32 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 0 1 10 -10 a16 16 0 0 1 16 16 a22 22 0 0 1 -22 22"/><path d="M10 30 a22 22 0 0 1 10 -16" opacity=".7"/>`),
  flame: svg(`<path d="M32 56 c-12 0 -18 -9 -16 -19 c2 -9 10 -12 9 -24 c8 5 12 12 11 19 c3 -2 5 -5 5 -9 c6 6 9 13 8 19 c-1 9 -7 14 -17 14z"/><path d="M32 56 c-5 0 -8 -4 -7 -9 c1 -4 5 -6 5 -11 c5 4 9 8 8 13 c0 4 -2 7 -6 7z" opacity=".7"/>`),
  slam: svg(`<path d="M32 6 v28 m-9 -9 l9 9 l9 -9"/><ellipse cx="32" cy="48" rx="24" ry="7"/><ellipse cx="32" cy="48" rx="12" ry="3" opacity=".6"/>`),
  gale: svg(`<path d="M8 22 h30 a7 7 0 1 0 -7 -7"/><path d="M8 34 h42 a7 7 0 1 1 -7 7"/><path d="M8 46 h22 a6 6 0 1 1 -6 6" opacity=".7"/>`),
  transform: svg(`
    <circle cx="32" cy="34" r="16"/><circle cx="14" cy="30" r="5"/><circle cx="50" cy="30" r="5"/>
    <path d="M18 24 q14 -10 28 0" stroke-width="4"/><path d="M26 33 h3 M35 33 h3"/><path d="M26 42 q6 4 12 0"/>
    <path d="M32 4 v6 M12 10 l4 4 M52 10 l-4 4" opacity=".8"/>`),
  heavy: svg(`<path d="M18 52 L46 12" stroke-width="5"/><path d="M40 8 l10 2 l-2 10" /><ellipse cx="22" cy="54" rx="16" ry="4" opacity=".7"/><path d="M8 44 l6 4 M10 36 l7 2 M36 50 l8 -2" opacity=".8"/>`),
  gourd: svg(`<circle cx="32" cy="42" r="14"/><circle cx="32" cy="22" r="8"/><path d="M29 12 h6 v-5 h-6z" fill="currentColor"/><path d="M20 30 q-8 -6 -6 -16" opacity=".6"/>`),
  immobilize: svg(`<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="14" opacity=".7"/><path d="M32 10 v44 M10 32 h44 M16 16 l32 32 M48 16 l-32 32" opacity=".55"/><circle cx="32" cy="32" r="4" fill="currentColor"/>`),
  ringfire: svg(`<ellipse cx="32" cy="42" rx="24" ry="10"/><path d="M14 40 q2 -10 6 -14 q0 8 4 10 M28 34 q0 -12 6 -18 q0 10 4 14 M42 38 q2 -8 6 -10 q0 8 2 10"/>`),
  menu: svg(`<path d="M12 18 h40 M12 32 h40 M12 46 h40" stroke-width="5"/>`),
  dodge: svg(`<path d="M36 14 l14 18 l-14 18"/><path d="M8 24 h20 M4 32 h26 M8 40 h20" opacity=".7"/>`),
  bag: svg(`<path d="M14 24 h36 l-4 32 h-28z"/><path d="M24 24 v-6 a8 8 0 0 1 16 0 v6"/><path d="M26 36 h12" opacity=".7"/>`),
  pause: svg(`<path d="M24 16 v32 M40 16 v32" stroke-width="6"/>`),
  close: svg(`<path d="M16 16 L48 48 M48 16 L16 48" stroke-width="5"/>`),
};

export const PORTRAIT = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="pbg" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#6e5a8a"/><stop offset="1" stop-color="#241a30"/></radialGradient></defs>
  <circle cx="50" cy="50" r="48" fill="url(#pbg)"/>
  <circle cx="22" cy="48" r="9" fill="#5b3a24"/><circle cx="78" cy="48" r="9" fill="#5b3a24"/>
  <circle cx="22" cy="48" r="5" fill="#c99a72"/><circle cx="78" cy="48" r="5" fill="#c99a72"/>
  <circle cx="50" cy="48" r="27" fill="#5b3a24"/>
  <path d="M30 36 q20 -16 40 0 l-2 6 q-18 -12 -36 0z" fill="#3e2616"/>
  <ellipse cx="50" cy="56" rx="17" ry="14" fill="#c99a72"/>
  <ellipse cx="41" cy="46" rx="5" ry="4" fill="#ffd9c0"/><ellipse cx="59" cy="46" rx="5" ry="4" fill="#ffd9c0"/>
  <circle cx="41" cy="46" r="2.4" fill="#d02010"/><circle cx="59" cy="46" r="2.4" fill="#d02010"/>
  <path d="M44 63 q6 4 12 0" stroke="#5a2c14" stroke-width="2" fill="none"/>
  <path d="M26 34 q24 -14 48 0" stroke="#e0a830" stroke-width="4" fill="none"/>
</svg>`;

const slotSvg = (body: string) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Equipment slot icons, drawn like inked item silhouettes. */
export const SLOT_ICONS: Record<'weapon' | 'chest' | 'gloves' | 'boots' | 'relic', string> = {
  weapon: slotSvg(`<path d="M14 54 L50 10" stroke-width="5"/><path d="M12 56 l6 -1 l1 -6 M46 9 l6 -1 l-1 6" stroke-width="3"/><path d="M28 36 l8 -10" stroke-width="7" opacity=".35"/>`),
  chest: slotSvg(`<path d="M20 12 l-10 8 l4 12 l6 -3 v23 h24 v-23 l6 3 l4 -12 l-10 -8 q-6 6 -12 6 q-6 0 -12 -6z" fill="currentColor" fill-opacity=".18"/><path d="M32 18 v34 M24 30 h16 M24 40 h16" opacity=".7"/>`),
  gloves: slotSvg(`<path d="M22 54 v-12 l-6 -12 q-2 -5 3 -6 l5 8 v-18 q0 -4 4 -4 q4 0 4 4 v-2 q0 -4 4 -4 q4 0 4 4 v4 q0 -3 3 -3 q3 0 3 4 v20 l-6 17z" fill="currentColor" fill-opacity=".18"/><path d="M22 46 h20" opacity=".7"/>`),
  boots: slotSvg(`<path d="M22 8 h14 v28 l14 8 q4 3 2 8 h-32 z" fill="currentColor" fill-opacity=".18"/><path d="M22 20 h14 M22 30 h14" opacity=".7"/>`),
  relic: slotSvg(`<circle cx="32" cy="40" r="13" fill="currentColor" fill-opacity=".18"/><circle cx="32" cy="22" r="8"/><path d="M29 12 h6 v-4 h-6z" fill="currentColor"/><path d="M26 40 q6 -6 12 0 q-6 6 -12 0z" opacity=".8"/>`),
};

const statSvg = (body: string) =>
  `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none">${body}</svg>`;
export const STAT_ICONS: Record<string, string> = {
  hp: statSvg(`<path d="M12 21 l-8 -8 a5 5 0 0 1 8 -6 a5 5 0 0 1 8 6z"/>`),
  mana: statSvg(`<path d="M12 2 q7 9 7 13 a7 7 0 0 1 -14 0 q0 -4 7 -13z"/>`),
  damage: statSvg(`<path d="M4 20 l12 -12 l-1 -4 l5 1 l1 5 l-4 -1 l-12 12z"/>`),
  armor: statSvg(`<path d="M12 2 l8 3 v6 q0 7 -8 11 q-8 -4 -8 -11 v-6z"/>`),
  crit: statSvg(`<path d="M12 2 l2.5 7 h7 l-5.7 4.3 l2.2 7 l-6 -4.4 l-6 4.4 l2.2 -7 l-5.7 -4.3 h7z"/>`),
  speed: statSvg(`<path d="M13 2 l-8 12 h6 l-2 8 l9 -13 h-6z"/>`),
  spell: statSvg(`<circle cx="12" cy="12" r="4"/><path d="M12 1 v4 M12 19 v4 M1 12 h4 M19 12 h4 M4 4 l3 3 M17 17 l3 3 M20 4 l-3 3 M7 17 l-3 3" stroke="currentColor" stroke-width="2"/>`),
  cdr: statSvg(`<path d="M12 3 a9 9 0 1 0 9 9 h-9z"/>`),
  gourd: statSvg(`<circle cx="12" cy="16" r="6"/><circle cx="12" cy="7" r="3.5"/>`),
};

/** Character art for the menu: an ink-and-gold painting of Little Monkey. */
export const CHARACTER_ART = `<svg viewBox="0 0 400 560" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
  <defs>
    <radialGradient id="ca-bg" cx="55%" cy="35%" r="70%"><stop offset="0" stop-color="#3a2a1c" stop-opacity=".9"/><stop offset="1" stop-color="#0c0a08" stop-opacity="0"/></radialGradient>
    <linearGradient id="ca-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".5" stop-color="#d19a3a"/><stop offset="1" stop-color="#6b4512"/></linearGradient>
    <linearGradient id="ca-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c3a22"/><stop offset="1" stop-color="#2a1a10"/></linearGradient>
    <linearGradient id="ca-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7a57c"/><stop offset="1" stop-color="#9a6a46"/></linearGradient>
    <linearGradient id="ca-armor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e3e30"/><stop offset="1" stop-color="#1c1510"/></linearGradient>
    <linearGradient id="ca-cape" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e2b2b"/><stop offset="1" stop-color="#3a0e0e"/></linearGradient>
  </defs>
  <ellipse cx="220" cy="230" rx="230" ry="300" fill="url(#ca-bg)"/>
  <!-- staff -->
  <path d="M330 40 L120 560" stroke="#1d130c" stroke-width="16" stroke-linecap="round"/>
  <path d="M330 40 L120 560" stroke="url(#ca-gold)" stroke-width="5" stroke-linecap="round" opacity=".5"/>
  <path d="M318 70 l26 -62" stroke="url(#ca-gold)" stroke-width="22" stroke-linecap="round"/>
  <!-- cape -->
  <path d="M90 300 Q60 430 70 560 H340 Q350 420 320 300 Z" fill="url(#ca-cape)"/>
  <!-- body armour -->
  <path d="M110 300 Q200 250 300 300 L310 560 H100 Z" fill="url(#ca-armor)"/>
  <path d="M150 330 Q205 300 260 330 L255 440 Q205 470 155 440 Z" fill="none" stroke="url(#ca-gold)" stroke-width="4"/>
  <path d="M175 360 Q205 345 235 360 M172 390 Q205 375 238 390 M175 420 Q205 405 235 420" stroke="url(#ca-gold)" stroke-width="3" fill="none" opacity=".8"/>
  <!-- shoulder pauldrons -->
  <path d="M70 320 Q90 260 160 268 Q150 320 120 350 Q90 360 70 320Z" fill="url(#ca-gold)"/>
  <path d="M340 320 Q320 260 250 268 Q260 320 290 350 Q320 360 340 320Z" fill="url(#ca-gold)"/>
  <path d="M90 315 Q110 285 150 282 M320 315 Q300 285 260 282" stroke="#6b4512" stroke-width="3" fill="none"/>
  <!-- neck fur -->
  <path d="M140 280 Q205 320 270 280 Q260 250 205 245 Q150 250 140 280Z" fill="url(#ca-fur)"/>
  <!-- head -->
  <ellipse cx="205" cy="180" rx="78" ry="86" fill="url(#ca-fur)"/>
  <ellipse cx="128" cy="180" rx="22" ry="26" fill="#5c3a22"/><ellipse cx="128" cy="182" rx="12" ry="15" fill="#b98760"/>
  <ellipse cx="282" cy="180" rx="22" ry="26" fill="#5c3a22"/><ellipse cx="282" cy="182" rx="12" ry="15" fill="#b98760"/>
  <path d="M150 150 Q205 120 260 150 Q262 215 245 238 Q205 262 165 238 Q148 215 150 150Z" fill="url(#ca-face)"/>
  <path d="M150 150 Q205 135 260 150" stroke="#3a2416" stroke-width="10" fill="none"/>
  <ellipse cx="180" cy="178" rx="13" ry="8" fill="#fff1dd"/><ellipse cx="230" cy="178" rx="13" ry="8" fill="#fff1dd"/>
  <circle cx="182" cy="178" r="5" fill="#c21a10"/><circle cx="228" cy="178" r="5" fill="#c21a10"/>
  <path d="M164 165 l30 6 M246 165 l-30 6" stroke="#2a180c" stroke-width="5" stroke-linecap="round"/>
  <path d="M195 200 q10 6 20 0" stroke="#5a2c14" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M182 222 q23 12 46 0" stroke="#4a220e" stroke-width="4" fill="none" stroke-linecap="round"/>
  <!-- golden circlet -->
  <path d="M128 140 Q205 98 282 140" stroke="url(#ca-gold)" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="205" cy="112" r="9" fill="#c21a10" stroke="url(#ca-gold)" stroke-width="4"/>
  <!-- fur tuft -->
  <path d="M160 110 Q190 60 205 92 Q222 50 250 108" fill="url(#ca-fur)"/>
  <!-- rain streaks -->
  <g stroke="#cdd8e0" stroke-width="1" opacity=".12">${Array.from({ length: 24 }, (_, i) => `<path d="M${(i * 37) % 400} ${(i * 53) % 300} l-6 40"/>`).join('')}</g>
</svg>`;
