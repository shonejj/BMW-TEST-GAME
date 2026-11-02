import type { Game } from '../game/game';
import { STANCES, STANCE_IDS, type StanceId } from '../game/stances';
import './journey.css';

/**
 * Stance indicator (Track D's own HUD element, kept out of hud.ts): the three stances with the active one
 * lit, the light-combo position, the stance special's cooldown, active medicine buffs and the distance to
 * Will lost at the last death. Tapping a stance switches to it (touch players have no stance key).
 */
export class StanceHud {
  private readonly el: HTMLDivElement;
  private readonly badges = new Map<StanceId, HTMLButtonElement>();
  private readonly pips: HTMLDivElement;
  private readonly special: HTMLDivElement;
  private readonly buffs: HTMLDivElement;
  private readonly will: HTMLDivElement;
  private last = '';
  private timer = 0;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.el = document.createElement('div');
    this.el.className = 'stance-hud';
    const row = document.createElement('div');
    row.className = 'sh-row';
    for (const id of STANCE_IDS) {
      const b = document.createElement('button');
      b.className = 'sh-badge';
      b.style.setProperty('--sc', STANCES[id].color);
      b.innerHTML = `<i></i><span>${STANCES[id].name}</span>`;
      b.title = `${STANCES[id].name} Stance — ${STANCES[id].blurb}`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.game.player.cycleStance(id);
      });
      row.appendChild(b);
      this.badges.set(id, b);
    }
    const key = document.createElement('kbd');
    key.className = 'sh-key';
    key.textContent = game.touch ? '' : 'X';
    row.appendChild(key);
    this.pips = document.createElement('div');
    this.pips.className = 'sh-pips';
    this.special = document.createElement('div');
    this.special.className = 'sh-special';
    this.buffs = document.createElement('div');
    this.buffs.className = 'sh-buffs';
    this.will = document.createElement('div');
    this.will.className = 'sh-will';
    this.el.append(row, this.pips, this.special, this.buffs, this.will);
    parent.appendChild(this.el);
  }

  update(dt: number) {
    const g = this.game;
    const show = g.isPlaying && g.hud.root.style.display !== 'none' && !g.hud.root.classList.contains('hidden');
    this.el.classList.toggle('on', show);
    if (!show) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    const p = g.player;
    const chain = p.chain();
    const st = STANCES[p.stance];
    const j = g.journey;
    const d = j.s.willDrop;
    const willTxt = d && d.chapter === g.chapter ? `Lost Will · ${d.amount} · ${Math.round(Math.hypot(p.pos.x - d.x, p.pos.z - d.z))}m` : '';
    const buffTxt = j.activeBuffs().map(([n, t]) => `${n} ${Math.ceil(t)}s`).join(' · ') + (j.s.incense ? `${j.activeBuffs().length ? ' · ' : ''}Incense` : '');
    const spTxt = p.specialKnown ? (p.specialCd > 0 ? `${st.specialName} ${p.specialCd.toFixed(1)}s` : `${st.specialName} ready`) : '';
    const key = [p.stance, ...STANCE_IDS.map((id) => (p.knowsStance(id) ? 1 : 0)), chain.length, p.comboIndex, spTxt, buffTxt, willTxt].join('|');
    if (key === this.last) return;
    this.last = key;
    for (const id of STANCE_IDS) {
      const b = this.badges.get(id)!;
      b.classList.toggle('active', id === p.stance);
      b.classList.toggle('locked', !p.knowsStance(id));
    }
    this.el.style.setProperty('--sc', st.color);
    this.pips.innerHTML = chain.map((_, i) => `<i class="${i < p.comboIndex ? 'done' : i === p.comboIndex ? 'next' : ''}"></i>`).join('');
    this.special.textContent = spTxt;
    this.special.classList.toggle('ready', p.specialKnown && p.specialCd <= 0);
    this.buffs.textContent = buffTxt;
    this.will.textContent = willTxt;
  }
}
