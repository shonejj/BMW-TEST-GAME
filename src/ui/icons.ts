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
