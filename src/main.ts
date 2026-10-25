import './style.css';
import { loadFonts } from './ui/fonts';
import { Game } from './game/game';

function showFatal(title: string, body: string) {
  const boot = document.getElementById('boot') ?? document.body.appendChild(document.createElement('div'));
  boot.id = 'boot';
  boot.innerHTML = `<div class="fatal"><h1>${title}</h1>${body}</div>`;
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const WEBGL_HELP = `
  <p>This game needs 3D graphics (WebGL 2), but your browser has it turned off or blocked.</p>
  <ol>
    <li><b>Chrome / Edge:</b> open <code>chrome://settings/system</code>, turn on
      <b>"Use graphics acceleration when available"</b>, then click <b>Relaunch</b>.</li>
    <li>Check <code>chrome://gpu</code>: "WebGL2" should say <b>Hardware accelerated</b>.
      If it says disabled, update your graphics driver, or open <code>chrome://flags</code>
      and enable <b>"Override software rendering list"</b>.</li>
    <li>Close other tabs running this game, then fully restart the browser.
      Browsers turn WebGL off after the graphics process crashes too often.</li>
    <li>Or try a different browser (Firefox, Edge, Safari).</li>
  </ol>
  <button onclick="location.reload()">Try again</button>`;

loadFonts();
if (!hasWebGL2()) {
  showFatal('3D graphics unavailable', WEBGL_HELP);
} else {
  try {
    const game = new Game(document.getElementById('app')!);
    game.boot();
    (window as unknown as { game: Game }).game = game;
  } catch (e) {
    console.error(e);
    const msg = String((e as Error)?.message ?? e);
    if (/webgl/i.test(msg)) showFatal('3D graphics unavailable', WEBGL_HELP);
    else showFatal('Something went wrong', `<p>${msg.replace(/</g, '&lt;')}</p><button onclick="location.reload()">Reload</button>`);
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
