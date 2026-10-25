import type { Game } from '../game/game';
import {
  BAG_SIZE, POWER_TEXT, RARITY_COLORS, RARITY_NAMES, SLOTS, SLOT_NAMES, STAT_LABELS, itemScore, salvageValue,
  type Item, type StatKey,
} from '../game/loot';
import { SKILLS } from '../game/player';
import { ICONS } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Menus {
  readonly root: HTMLDivElement;
  private screen: HTMLDivElement | null = null;
  current: 'none' | 'start' | 'pause' | 'inventory' | 'dead' | 'victory' | 'help' = 'none';
  private selected: { item: Item; equipped: boolean } | null = null;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'menus';
    parent.appendChild(this.root);
  }

  get open() {
    return this.current !== 'none';
  }

  close() {
    this.screen?.remove();
    this.screen = null;
    this.current = 'none';
    this.selected = null;
  }

  private show(kind: Menus['current'], cls: string, html: string) {
    this.close();
    this.current = kind;
    const s = document.createElement('div');
    s.className = 'screen ' + cls;
    s.innerHTML = html;
    this.root.appendChild(s);
    this.screen = s;
    return s;
  }

  private on(s: HTMLElement, sel: string, fn: () => void) {
    s.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.audio.unlock();
        fn();
      }),
    );
  }

  showStart(hasSave: boolean) {
    const s = this.show('start', 'start', `
      <div class="start-bg"></div>
      <div class="logo">
        <div class="logo-small">Chapter One</div>
        <div class="logo-big">Monkey King</div>
        <div class="logo-sub">Mountain-Sea Temple</div>
      </div>
      <div class="menu-buttons">
        ${hasSave ? '<button class="mbtn primary" data-a="continue">Continue</button>' : ''}
        <button class="mbtn ${hasSave ? '' : 'primary'}" data-a="new">New Game</button>
        <button class="mbtn" data-a="help">How to Play</button>
      </div>
      <div class="footer">Works offline · Install from your browser menu to play like an app</div>`);
    this.on(s, '[data-a=continue]', () => this.game.startGame(false));
    this.on(s, '[data-a=new]', () => {
      if (hasSave && !confirm('Start a new game? Your current progress will be replaced.')) return;
      this.game.startGame(true);
    });
    this.on(s, '[data-a=help]', () => this.showHelp(() => this.showStart(hasSave)));
  }

  showHelp(back: () => void) {
    const s = this.show('help', 'panel-screen', `
      <div class="panel help">
        <h2>How to Play</h2>
        <div class="help-grid">
          <div><h3>Keyboard &amp; Mouse</h3>
            <p><b>WASD</b> move · <b>Mouse</b> aim<br><b>Left click</b> / <b>J</b> staff combo<br><b>Space</b> / <b>Right click</b> dodge<br><b>1–4</b> (or Q E R F) skills<br><b>T</b> Monkey King transformation<br><b>I</b> inventory · <b>Esc</b> pause</p></div>
          <div><h3>Touch</h3>
            <p>Left thumb: <b>joystick</b><br>Big button: <b>staff combo</b> (hold)<br>Small buttons: <b>skills</b>, <b>dodge</b>, <b>transform</b><br>Attacks auto-aim at nearby enemies</p></div>
          <div><h3>Gamepad</h3>
            <p>Left stick move · Right stick aim<br><b>X</b> attack · <b>A</b> dodge · <b>Y</b> transform<br><b>LB RB LT RT</b> skills · <b>Start</b> pause</p></div>
        </div>
        <h3>Skills</h3>
        <ul class="skill-list">${SKILLS.map((k) => `<li><b>${k.name}</b> (${k.mana} mana) — ${k.desc}</li>`).join('')}
          <li><b>Monkey King</b> — fill the Fury ring by dealing damage, then transform for 15 seconds of devastating fire attacks.</li></ul>
        <p class="hint">Red circles on the ground warn of incoming attacks — dodge out of them! Clear each area to break the red seal and move on.</p>
        <button class="mbtn primary" data-a="back">Back</button>
      </div>`);
    this.on(s, '[data-a=back]', back);
  }

  showPause() {
    const g = this.game;
    const s = this.show('pause', 'panel-screen', `
      <div class="panel pause">
        <h2>Paused</h2>
        <div class="menu-buttons">
          <button class="mbtn primary" data-a="resume">Resume</button>
          <button class="mbtn" data-a="inv">Inventory</button>
          <button class="mbtn" data-a="help">How to Play</button>
        </div>
        <div class="settings">
          <label>Graphics
            <select data-s="quality">
              ${(['low', 'medium', 'high'] as const).map((q) => `<option value="${q}" ${g.settings.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
            </select></label>
          <label>Sound <input type="range" min="0" max="1" step="0.05" value="${g.settings.volume}" data-s="volume"></label>
          <label>Music <input type="range" min="0" max="1" step="0.05" value="${g.settings.music}" data-s="music"></label>
          <label>Frame rate
            <select data-s="fps">
              ${[[30, '30 fps (battery saver)'], [60, '60 fps'], [0, 'Unlimited']].map(([v, n]) => `<option value="${v}" ${g.settings.fpsCap === v ? 'selected' : ''}>${n}</option>`).join('')}
            </select></label>
          <label class="check"><input type="checkbox" data-s="dynres" ${g.settings.dynamicRes ? 'checked' : ''}> Auto resolution (keeps it smooth)</label>
          <label>Screen shake
            <select data-s="shake">
              ${[[1, 'Full'], [0.5, 'Reduced'], [0, 'Off']].map(([v, n]) => `<option value="${v}" ${g.settings.screenShake === v ? 'selected' : ''}>${n}</option>`).join('')}
            </select></label>
          <label class="check"><input type="checkbox" data-s="numbers" ${g.settings.damageNumbers ? 'checked' : ''}> Damage numbers</label>
        </div>
        <div class="menu-buttons">
          <button class="mbtn" data-a="restart">Restart from Checkpoint</button>
          <button class="mbtn" data-a="menu">Main Menu</button>
        </div>
      </div>`);
    this.on(s, '[data-a=resume]', () => g.resume());
    this.on(s, '[data-a=inv]', () => this.showInventory());
    this.on(s, '[data-a=help]', () => this.showHelp(() => this.showPause()));
    this.on(s, '[data-a=restart]', () => g.restartFromCheckpoint());
    this.on(s, '[data-a=menu]', () => g.toMainMenu());
    s.querySelector<HTMLSelectElement>('[data-s=quality]')!.addEventListener('change', (e) => g.applySettings({ quality: (e.target as HTMLSelectElement).value as 'low' }));
    s.querySelector<HTMLInputElement>('[data-s=volume]')!.addEventListener('input', (e) => g.applySettings({ volume: +(e.target as HTMLInputElement).value }));
    s.querySelector<HTMLInputElement>('[data-s=music]')!.addEventListener('input', (e) => g.applySettings({ music: +(e.target as HTMLInputElement).value }));
    s.querySelector<HTMLSelectElement>('[data-s=fps]')!.addEventListener('change', (e) => g.applySettings({ fpsCap: +(e.target as HTMLSelectElement).value }));
    s.querySelector<HTMLInputElement>('[data-s=dynres]')!.addEventListener('change', (e) => g.applySettings({ dynamicRes: (e.target as HTMLInputElement).checked }));
    s.querySelector<HTMLSelectElement>('[data-s=shake]')!.addEventListener('change', (e) => g.applySettings({ screenShake: +(e.target as HTMLSelectElement).value }));
    s.querySelector<HTMLInputElement>('[data-s=numbers]')!.addEventListener('change', (e) => g.applySettings({ damageNumbers: (e.target as HTMLInputElement).checked }));
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  private itemTile(it: Item | undefined, attrs: string, placeholder = '') {
    if (!it) return `<div class="tile empty" ${attrs}><span>${placeholder}</span></div>`;
    const sel = this.selected?.item.id === it.id ? ' selected' : '';
    return `<div class="tile r${it.rarity}${sel}" ${attrs} style="--rc:${RARITY_COLORS[it.rarity]}">
      <span class="tile-slot">${SLOT_NAMES[it.slot]}</span><span class="tile-lvl">${it.level}</span></div>`;
  }

  private itemDetail(it: Item, compare?: Item) {
    const lines = Object.entries(it.stats).map(([k, v]) => `<li>${STAT_LABELS[k as StatKey](v!)}</li>`).join('');
    const diff = compare && compare.id !== it.id ? itemScore(it) - itemScore(compare) : null;
    return `<div class="detail" style="--rc:${RARITY_COLORS[it.rarity]}">
      <div class="d-name">${esc(it.name)}</div>
      <div class="d-type">${RARITY_NAMES[it.rarity]} ${SLOT_NAMES[it.slot]} · Level ${it.level}</div>
      <ul class="d-stats">${lines}</ul>
      ${it.power ? `<div class="d-power">✦ ${POWER_TEXT[it.power]}</div>` : ''}
      ${diff !== null ? `<div class="d-compare ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲ Better' : '▼ Worse'} than equipped</div>` : ''}
    </div>`;
  }

  showInventory() {
    const g = this.game;
    const inv = g.inventory;
    const st = g.player.stats;
    const sel = this.selected;
    const bag = Array.from({ length: BAG_SIZE }, (_, i) => this.itemTile(inv.bag[i], `data-bag="${i}"`)).join('');
    const eq = SLOTS.map((s) => this.itemTile(inv.equipped[s], `data-eq="${s}"`, SLOT_NAMES[s])).join('');
    let detail = '<div class="detail empty-detail">Tap an item to see its stats.</div>';
    let actions = '';
    if (sel) {
      detail = this.itemDetail(sel.item, sel.equipped ? undefined : inv.equipped[sel.item.slot]);
      actions = sel.equipped
        ? `<button class="mbtn" data-a="unequip">Unequip</button>`
        : `<button class="mbtn primary" data-a="equip">Equip</button><button class="mbtn" data-a="salvage">Salvage (+${salvageValue(sel.item)}g)</button>`;
    }
    const s = this.show('inventory', 'panel-screen', `
      <div class="panel inventory">
        <button class="close" data-a="close">${ICONS.close}</button>
        <h2>Inventory <span class="gold-inline">${inv.gold.toLocaleString()}g</span></h2>
        <div class="inv-layout">
          <div class="inv-left">
            <h3>Equipped</h3>
            <div class="equip-grid">${eq}</div>
            <div class="char-stats">
              <div>Level <b>${g.player.level}</b></div>
              <div>Life <b>${Math.round(st.maxHp)}</b></div>
              <div>Damage <b>${Math.round(st.damage * (1 + st.damagePct))}</b></div>
              <div>Armor <b>${Math.round(st.armor)}</b></div>
              <div>Crit <b>${(st.crit * 100).toFixed(1)}%</b></div>
              <div>Atk Speed <b>+${Math.round(st.attackSpeed * 100)}%</b></div>
              <div>Skill Dmg <b>+${Math.round(st.skillDamage * 100)}%</b></div>
              <div>Cooldowns <b>-${Math.round(st.cdr * 100)}%</b></div>
            </div>
          </div>
          <div class="inv-right">
            <h3>Bag <small>${inv.bag.length}/${BAG_SIZE}</small> <button class="mini-btn" data-a="salvage-low">Salvage Common &amp; Magic</button></h3>
            <div class="bag-grid">${bag}</div>
            <div class="detail-box">${detail}<div class="detail-actions">${actions}</div></div>
          </div>
        </div>
      </div>`);
    this.on(s, '[data-a=close]', () => g.resume());
    s.querySelectorAll<HTMLElement>('[data-bag]').forEach((el) =>
      el.addEventListener('click', () => {
        const it = inv.bag[+el.dataset.bag!];
        this.selected = it ? { item: it, equipped: false } : null;
        this.showInventory();
      }),
    );
    s.querySelectorAll<HTMLElement>('[data-eq]').forEach((el) =>
      el.addEventListener('click', () => {
        const it = inv.equipped[el.dataset.eq as Item['slot']];
        this.selected = it ? { item: it, equipped: true } : null;
        this.showInventory();
      }),
    );
    this.on(s, '[data-a=equip]', () => {
      if (sel) g.equip(sel.item);
      this.selected = null;
      this.showInventory();
    });
    this.on(s, '[data-a=unequip]', () => {
      if (sel) g.unequip(sel.item.slot);
      this.selected = null;
      this.showInventory();
    });
    this.on(s, '[data-a=salvage]', () => {
      if (sel) g.salvage([sel.item]);
      this.selected = null;
      this.showInventory();
    });
    this.on(s, '[data-a=salvage-low]', () => {
      g.salvage(inv.bag.filter((i) => i.rarity <= 1));
      this.selected = null;
      this.showInventory();
    });
  }

  showDeath() {
    const s = this.show('dead', 'death', `
      <div class="death-text">You Have Fallen</div>
      <div class="death-sub">The mountain spirits carry you back to the last shrine.</div>
      <button class="mbtn primary" data-a="revive">Rise Again</button>`);
    this.on(s, '[data-a=revive]', () => this.game.restartFromCheckpoint());
  }

  showVictory(stats: { time: string; kills: number; gold: number; level: number; ng: number }) {
    const s = this.show('victory', 'victory', `
      <div class="logo">
        <div class="logo-small">Chapter One Complete</div>
        <div class="logo-big">Victory</div>
        <div class="logo-sub">The Blackfeather Lord has fallen</div>
      </div>
      <div class="victory-stats">
        <div><span>Time</span><b>${stats.time}</b></div>
        <div><span>Enemies slain</span><b>${stats.kills}</b></div>
        <div><span>Gold</span><b>${stats.gold.toLocaleString()}g</b></div>
        <div><span>Level</span><b>${stats.level}</b></div>
      </div>
      <p class="hint">Play again on <b>Torment ${stats.ng + 1}</b>: stronger enemies, better loot. You keep your level and gear.</p>
      <div class="menu-buttons">
        <button class="mbtn primary" data-a="ng">Continue to Torment ${stats.ng + 1}</button>
        <button class="mbtn" data-a="menu">Main Menu</button>
      </div>`);
    this.on(s, '[data-a=ng]', () => this.game.newGamePlus());
    this.on(s, '[data-a=menu]', () => this.game.toMainMenu());
  }
}
