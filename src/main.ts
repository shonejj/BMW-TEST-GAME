import './style.css';
import { loadFonts } from './ui/fonts';
import { Game } from './game/game';

loadFonts();
const game = new Game(document.getElementById('app')!);
game.boot();
(window as unknown as { game: Game }).game = game;

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
