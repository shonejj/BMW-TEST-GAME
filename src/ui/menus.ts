import type { Game } from '../game/game';
import {
  BAG_SIZE, POWER_TEXT, RARITY_COLORS, RARITY_NAMES, SLOTS, SLOT_NAMES, STAT_LABELS, itemScore, salvageValue,
  type Item, type Slot, type StatKey,
} from '../game/loot';
import {
  SPELLS, SPELL_IDS, TALENTS, canLearn, pointsAvailable, rank, spellUnlocked, type Branch, type SpellId, type TalentId,
} from '../game/progression';
import { KINDS } from '../game/enemies';
import { ICONS, SLOT_ICONS, STAT_ICONS } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Tab = 'advance' | 'spells' | 'equipment' | 'inventory' | 'journal' | 'settings';
const TABS: [Tab, string][] = [
  ['advance', 'Self-Advance'], ['spells', 'Spells'], ['equipment', 'Equipment'],
  ['inventory', 'Inventory'], ['journal', 'Journal'], ['settings', 'Settings'],
];

const LORE: Record<string, string> = {
  spiderling: 'Hatchlings of the temple brood. Alone they are a nuisance; in the dark they come by the dozen.',
  armored: 'Broodmothers grow shells of temple stone. Watch for the red circle — they leap before they bite.',
  ghoul: 'The temple monks who never fled. The brood\'s venom keeps them walking long after death; they rise from the soil and rake with broken nails.',
  weaver: 'Once pilgrims, now spider-women bound to the brood. They keep their distance, circle, and spit binding silk.',
  boss: 'A yaoguai lord who nested in the Mountain-Sea Temple after the monks fled. His jade miasma rots stone and flesh alike.',
};

/**
 * Full-screen menus in the style of the reference: tab bar across the top,
 * content on the left, character art and stats on the right. Every screen is
 * navigable with mouse/touch, keyboard (arrows / Enter / Q E / Backspace) and
 * gamepad (stick / D-pad, A, B, LB RB).
 */
export class Menus {
  readonly root: HTMLDivElement;
  private screen: HTMLDivElement | null = null;
  current: 'none' | 'start' | 'game' | 'dead' | 'victory' | 'help' | 'confirm' = 'none';
  private tab: Tab = 'equipment';
  private equipSlot: Slot = 'weapon';
  private selectedItem: number | null = null;
  private spellSlot = 0;
  private journalKind = 'spiderling';
  private back: (() => void) | null = null;
  private padPrev: boolean[] = [];
  private navRepeat = 0;
  /** Title "press any button" stage. */
  private splash = false;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'menus';
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointermove', () => document.body.classList.remove('using-pad'));
  }

  get open() {
    return this.current !== 'none';
  }

  close() {
    this.screen?.remove();
    this.screen = null;
    this.current = 'none';
    this.back = null;
  }

  private show(kind: Menus['current'], cls: string, html: string, back: (() => void) | null = null) {
    const keepFocus = this.current === kind ? this.focusedKey() : '';
    this.screen?.remove();
    this.current = kind;
    this.back = back;
    const s = document.createElement('div');
    s.className = 'screen ' + cls;
    s.innerHTML = html;
    this.root.appendChild(s);
    this.screen = s;
    // Restore focus to the same control after a re-render (keeps gamepad position).
    const target = (keepFocus && s.querySelector<HTMLElement>(`[data-key="${keepFocus}"]`)) || s.querySelector<HTMLElement>('[data-nav].default') || s.querySelector<HTMLElement>('[data-nav]');
    target?.focus({ preventScroll: true });
    return s;
  }

  private focusedKey() {
    const el = document.activeElement as HTMLElement | null;
    return el?.dataset?.key ?? '';
  }

  private on(s: HTMLElement, sel: string, fn: (el: HTMLElement) => void) {
    s.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.audio.unlock();
        this.game.audio.play('uiSelect');
        fn(el);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Keyboard / gamepad navigation (spatial: move focus to the nearest control)
  // -------------------------------------------------------------------------

  private onKey(e: KeyboardEvent) {
    if (!this.open || !this.screen) return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
    if (dirs[e.code] && !(e.target instanceof HTMLInputElement && e.target.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight'))) {
      e.preventDefault();
      this.move(...dirs[e.code]);
    } else if (e.code === 'KeyQ' || e.code === 'PageUp') this.switchTab(-1);
    else if (e.code === 'KeyE' || e.code === 'PageDown') this.switchTab(1);
    else if (e.code === 'Backspace') this.goBack();
  }

  private move(dx: number, dy: number) {
    const items = [...this.screen!.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement;
    if (!items.includes(cur)) {
      items[0].focus();
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = (bx - ax) * dx + (by - ay) * dy;
      if (along <= 4) continue;
      const across = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.game.audio.play('uiMove');
    }
  }

  private goBack() {
    if (this.back) {
      this.game.audio.play('uiBack');
      this.back();
    }
  }

  private switchTab(d: number) {
    if (this.current !== 'game') return;
    const i = TABS.findIndex(([t]) => t === this.tab);
    this.tab = TABS[(i + d + TABS.length) % TABS.length][0];
    this.game.audio.play('uiMove');
    this.showGameMenu(this.tab);
  }

  /** Polled every frame while a menu is open. */
  update(dt: number) {
    if (!this.open || !this.screen) return;
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p);
    if (!pad) return;
    if (pad.buttons.some((b) => b.pressed) || Math.abs(pad.axes[0]) > 0.5 || Math.abs(pad.axes[1]) > 0.5) document.body.classList.add('using-pad');
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => pressed(i) && !this.padPrev[i];
    if (this.splash && this.current === 'start') {
      if (pad.buttons.some((b, i) => b.pressed && !this.padPrev[i])) this.beginSplash?.();
      pad.buttons.forEach((b, i) => (this.padPrev[i] = b.pressed));
      return;
    }
    let dx = 0, dy = 0;
    if (pressed(12) || pad.axes[1] < -0.5) dy = -1;
    else if (pressed(13) || pad.axes[1] > 0.5) dy = 1;
    else if (pressed(14) || pad.axes[0] < -0.5) dx = -1;
    else if (pressed(15) || pad.axes[0] > 0.5) dx = 1;
    this.navRepeat -= dt;
    if ((dx || dy) && this.navRepeat <= 0) {
      this.move(dx, dy);
      this.navRepeat = 0.18;
    } else if (!dx && !dy) this.navRepeat = 0;
    if (edge(0)) (document.activeElement as HTMLElement | null)?.click();
    if (edge(1)) this.goBack();
    if (edge(4)) this.switchTab(-1);
    if (edge(5)) this.switchTab(1);
    pad.buttons.forEach((b, i) => (this.padPrev[i] = b.pressed));
  }

  // -------------------------------------------------------------------------
  // Title, help, confirm
  // -------------------------------------------------------------------------

  /**
   * Title: an in-engine shot of the hero (see Game.titleShot) behind a brushed wordmark. First a "press any
   * button" splash, then a left-aligned text menu with an ink-stroke highlight on the focused entry.
   */
  showStart(hasSave: boolean, skipSplash = false) {
    this.splash = !skipSplash;
    const s = this.show('start', 'start ' + (this.splash ? 'splash' : 'ready'), `
      <div class="title-shade"></div>
      <div class="title-block">
        <div class="t-kicker"><i></i>Chapter One<i></i></div>
        <div class="t-word">
          <svg class="t-ink" viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="inkEdge" x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.5" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter>
              <linearGradient id="inkFill" x1="0" x2="1"><stop offset="0" stop-color="#6a0e08" stop-opacity="0"/><stop offset="0.1" stop-color="#8a160c" stop-opacity="0.95"/><stop offset="0.65" stop-color="#4a0806" stop-opacity="0.9"/><stop offset="1" stop-color="#1a0403" stop-opacity="0"/></linearGradient>
            </defs>
            <path filter="url(#inkEdge)" fill="url(#inkFill)" d="M8 84 C 110 46, 300 40, 592 58 L 588 92 C 400 98, 220 112, 18 110 Z"/>
          </svg>
          <h1>Monkey King</h1>
          <svg class="t-seal" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="3" fill="#b0221a"/><g fill="#f4e6d0"><rect x="8" y="9" width="24" height="3"/><rect x="10" y="19" width="20" height="3"/><rect x="6" y="29" width="28" height="3"/><rect x="18.5" y="9" width="3" height="23"/></g><rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#f4e6d0" stroke-width="1.2"/></svg>
        </div>
        <div class="t-sub">Mountain-Sea Temple</div>
      </div>
      <div class="press">${this.game.touch ? 'Tap to begin' : 'Press any button'}</div>
      <nav class="title-menu">
        ${hasSave ? '<button class="tm default" data-nav data-a="continue">Continue</button>' : ''}
        <button class="tm ${hasSave ? '' : 'default'}" data-nav data-a="new">New Game</button>
        <button class="tm" data-nav data-a="help">How to Play</button>
        <button class="tm" data-nav data-a="credits">Credits</button>
      </nav>
      <div class="title-foot"><span>Works offline · Install from the browser menu</span><span>${this.game.touch ? '' : '<b>Enter / A</b> Select'}</span></div>`);
    const begin = () => {
      if (!this.splash) return;
      this.splash = false;
      this.game.audio.unlock();
      this.game.audio.play('seal');
      s.classList.replace('splash', 'ready');
      s.querySelector<HTMLElement>('.tm.default')?.focus({ preventScroll: true });
    };
    s.addEventListener('pointerdown', begin);
    const key = (e: KeyboardEvent) => {
      if (this.screen !== s) return window.removeEventListener('keydown', key);
      if (this.splash) { e.preventDefault(); begin(); }
    };
    window.addEventListener('keydown', key);
    this.beginSplash = begin;
    this.on(s, '[data-a=continue]', () => this.game.startGame(false));
    this.on(s, '[data-a=new]', () => {
      if (!hasSave) return this.game.startGame(true);
      this.confirm('Start a new game?', 'Your current progress will be replaced.', () => this.game.startGame(true), () => this.showStart(hasSave, true));
    });
    this.on(s, '[data-a=help]', () => this.showHelp(() => this.showStart(hasSave, true)));
    this.on(s, '[data-a=credits]', () => this.showCredits(() => this.showStart(hasSave, true)));
  }

  private beginSplash: (() => void) | null = null;

  showCredits(back: () => void) {
    const s = this.show('help', 'panel-screen', `
      <div class="panel credits">
        <h2>Credits</h2>
        <p class="hint">A fan-made action RPG inspired by Black Myth: Wukong. Code, VFX, music and sound are made in the game itself.</p>
        <h3>Free (CC0) art used</h3>
        <ul class="skill-list">
          <li><b>Quaternius</b>: Universal Animation Library 1 &amp; 2 (mannequin and motion-captured animations), Stylized Nature MegaKit</li>
          <li>Character costumes, temple architecture and effects are built in code on top of these.</li>
        </ul>
        <h3>Tools</h3>
        <ul class="skill-list"><li>three.js, glTF-Transform, meshoptimizer, Vite · Cinzel typeface (OFL)</li></ul>
        <button class="mbtn primary default" data-nav data-a="back">Back</button>
      </div>`, back);
    this.on(s, '[data-a=back]', back);
  }

  private confirm(title: string, body: string, yes: () => void, no: () => void) {
    const s = this.show('confirm', 'panel-screen', `
      <div class="panel confirm"><h2>${title}</h2><p class="hint">${body}</p>
        <div class="row-buttons"><button class="mbtn primary" data-nav data-a="yes">Confirm</button><button class="mbtn default" data-nav data-a="no">Cancel</button></div>
      </div>`, no);
    this.on(s, '[data-a=yes]', yes);
    this.on(s, '[data-a=no]', no);
  }

  showHelp(back: () => void) {
    const s = this.show('help', 'panel-screen', `
      <div class="panel help">
        <h2>How to Play</h2>
        <div class="help-grid">
          <div><h3>Keyboard &amp; Mouse</h3>
            <p><b>WASD</b> move · <b>Mouse</b> aim<br><b>Left click</b> staff combo (hold)<br><b>Right click</b> heavy attack (hold to charge)<br><b>Space</b> dodge roll<br><b>1–4</b> spells · <b>G</b> healing gourd<br><b>T</b> Monkey King · <b>I</b> menu · <b>Esc</b> pause</p></div>
          <div><h3>Gamepad / Joystick</h3>
            <p><b>Left stick</b> move · <b>Right stick</b> aim<br><b>X</b> combo · <b>Y</b> heavy (hold)<br><b>A</b> dodge · <b>B</b> gourd<br><b>LB RB LT RT</b> spells<br><b>R3 / D-pad ↑</b> Monkey King<br><b>Start</b> menu · menus: stick + A/B, LB/RB tabs</p></div>
          <div><h3>Touch</h3>
            <p>Left thumb: <b>joystick</b> (appears where you touch)<br>Big button: <b>combo</b> · hammer: <b>heavy</b> (hold)<br>Small buttons: <b>dodge</b>, <b>gourd</b>, <b>spells</b>, <b>Monkey King</b><br>Attacks auto-aim at nearby enemies</p></div>
        </div>
        <h3>Combat</h3>
        <ul class="skill-list">
          <li>Light hits build <b>Focus</b> (the three pips under your health). A charged <b>heavy smash</b> spends all Focus for a huge blow that staggers enemies and breaks bosses.</li>
          <li>Dodge just before a hit for a <b>Perfect Dodge</b>: slow motion and +1 Focus.</li>
          <li>Red circles warn of attacks. Clear each area to break the red seal. Your gourd refills at every cleared area.</li>
          <li>Each level gives a talent point — spend it in <b>Self-Advance</b>. New spells are learned there and equipped in <b>Spells</b>.</li>
        </ul>
        <button class="mbtn primary default" data-nav data-a="back">Back</button>
      </div>`, back);
    this.on(s, '[data-a=back]', back);
  }

  // -------------------------------------------------------------------------
  // Game menu (tabs)
  // -------------------------------------------------------------------------

  showGameMenu(tab: Tab = this.tab) {
    this.tab = tab;
    const g = this.game;
    const p = g.player;
    const st = p.stats;
    const pts = pointsAvailable(p.level, p.talents);
    let body = '';
    switch (tab) {
      case 'advance': body = this.advanceTab(); break;
      case 'spells': body = this.spellsTab(); break;
      case 'equipment': body = this.equipmentTab(); break;
      case 'inventory': body = this.inventoryTab(); break;
      case 'journal': body = this.journalTab(); break;
      case 'settings': body = this.settingsTab(); break;
    }
    const stat = (icon: string, label: string, v: string) => `<div class="stat" title="${label}">${STAT_ICONS[icon] ?? ''}<span>${label}</span><b>${v}</b></div>`;
    const s = this.show('game', 'game-menu', `
      <div class="gm-top">
        <div class="gm-tabs">
          <span class="tab-hint">Q / LB</span>
          ${TABS.map(([t, n]) => `<button class="gm-tab ${t === tab ? 'active' : ''}" data-tab="${t}" data-nav data-key="tab-${t}">${n}${t === 'advance' && pts > 0 ? `<i class="dot">${pts}</i>` : ''}</button>`).join('<span class="sep"></span>')}
          <span class="tab-hint">E / RB</span>
        </div>
        <div class="gm-currency"><span class="gold-icon">◈</span>${g.inventory.gold.toLocaleString()}<span class="pts-icon">✦</span>${pts}</div>
        <button class="close" data-nav data-a="close" data-key="close">${ICONS.close}</button>
      </div>
      <div class="gm-body">
        <div class="gm-content">${body}</div>
        <div class="gm-char">
          <div class="char-level"><span>Lv</span>${p.level}</div>
          <div class="char-stats-col">
            ${stat('hp', 'Life', String(Math.round(st.maxHp)))}
            ${stat('mana', 'Mana', String(Math.round(st.maxMana)))}
            ${stat('damage', 'Damage', String(Math.round(st.damage * (1 + st.damagePct))))}
            ${stat('armor', 'Armor', String(Math.round(st.armor)))}
            ${stat('crit', 'Critical', (st.crit * 100).toFixed(1) + '%')}
            ${stat('speed', 'Attack speed', '+' + Math.round(st.attackSpeed * 100) + '%')}
            ${stat('spell', 'Spell damage', '+' + Math.round(st.skillDamage * 100) + '%')}
            ${stat('cdr', 'Cooldowns', '-' + Math.round(st.cdr * 100) + '%')}
            ${stat('gourd', 'Gourd', `${p.gourd}/${st.gourdCharges}`)}
          </div>
          <div class="char-quote">"Seventy-two transformations, one staff, and a temple full of yaoguai."</div>
        </div>
      </div>
      <div class="gm-foot"><span>${g.touch ? 'Tap to select' : '<b>Enter / A</b> Select'}</span><span><b>Esc / B</b> Return</span></div>`, () => g.resume());
    this.on(s, '[data-a=close]', () => g.resume());
    this.on(s, '[data-tab]', (el) => this.showGameMenu(el.dataset.tab as Tab));
    this.bindTab(s);
  }

  private bindTab(s: HTMLElement) {
    const g = this.game;
    const p = g.player;
    // Self-Advance
    this.on(s, '[data-talent]', (el) => {
      const id = el.dataset.talent as TalentId;
      const def = TALENTS.find((t) => t.id === id)!;
      if (canLearn(def, p.talents, p.level)) {
        this.game.audio.play('uiBack');
        return;
      }
      g.learnTalent(id);
      this.showGameMenu('advance');
    });
    this.on(s, '[data-a=reset-talents]', () => {
      g.resetTalents();
      this.showGameMenu('advance');
    });
    const detail = s.querySelector<HTMLElement>('.t-detail');
    if (detail) {
      const showTalent = (el: HTMLElement) => {
        detail.querySelector('.td-name')!.textContent = el.dataset.name!;
        detail.querySelector('.td-rank')!.textContent = 'Rank ' + el.dataset.rank;
        detail.querySelector('.td-desc')!.textContent = el.dataset.desc!;
        const req = detail.querySelector<HTMLElement>('.td-req')!;
        req.textContent = el.dataset.req!;
        req.className = 'td-req ' + (el.classList.contains('can') ? 'ok' : '');
      };
      s.querySelectorAll<HTMLElement>('[data-talent]').forEach((el) => {
        el.addEventListener('focus', () => showTalent(el));
        el.addEventListener('mouseenter', () => showTalent(el));
      });
      const f = document.activeElement as HTMLElement | null;
      if (f?.dataset.talent) showTalent(f);
    }
    // Spells
    this.on(s, '[data-slot]', (el) => {
      this.spellSlot = +el.dataset.slot!;
      this.showGameMenu('spells');
    });
    this.on(s, '[data-spell]', (el) => {
      const id = el.dataset.spell as SpellId;
      if (!spellUnlocked(id, p.talents)) return;
      g.setSpell(this.spellSlot, id);
      this.showGameMenu('spells');
    });
    // Equipment / inventory
    this.on(s, '[data-eqslot]', (el) => {
      this.equipSlot = el.dataset.eqslot as Slot;
      this.selectedItem = null;
      this.showGameMenu('equipment');
    });
    this.on(s, '[data-item]', (el) => {
      this.selectedItem = +el.dataset.item!;
      this.showGameMenu(this.tab);
    });
    this.on(s, '[data-a=equip]', () => {
      const it = this.findItem(this.selectedItem);
      if (it) g.equip(it);
      this.showGameMenu(this.tab);
    });
    this.on(s, '[data-a=unequip]', () => {
      const it = this.findItem(this.selectedItem);
      if (it) g.unequip(it.slot);
      this.showGameMenu(this.tab);
    });
    this.on(s, '[data-a=salvage]', () => {
      const it = this.findItem(this.selectedItem);
      if (it) g.salvage([it]);
      this.selectedItem = null;
      this.showGameMenu(this.tab);
    });
    this.on(s, '[data-a=salvage-low]', () => {
      g.salvage(g.inventory.bag.filter((i) => i.rarity <= 1));
      this.selectedItem = null;
      this.showGameMenu(this.tab);
    });
    // Journal
    this.on(s, '[data-journal]', (el) => {
      this.journalKind = el.dataset.journal!;
      this.showGameMenu('journal');
    });
    // Settings
    this.on(s, '[data-a=help]', () => this.showHelp(() => this.showGameMenu('settings')));
    this.on(s, '[data-a=restart]', () => g.restartFromCheckpoint());
    this.on(s, '[data-a=mainmenu]', () => this.confirm('Return to the title screen?', 'Progress is saved at the last cleared area.', () => g.toMainMenu(), () => this.showGameMenu('settings')));
    s.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-setting]').forEach((el) => {
      el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
        const k = el.dataset.setting!;
        const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.type === 'range' || k === 'fpsCap' || k === 'screenShake' ? +el.value : el.value;
        g.applySettings({ [k]: v });
      });
    });
    // Cycle-buttons for settings (work with A on a gamepad, unlike <select>)
    this.on(s, '[data-cycle]', (el) => {
      const k = el.dataset.cycle!;
      const opts = JSON.parse(el.dataset.opts!) as [string | number | boolean, string][];
      const cur = (g.settings as unknown as Record<string, unknown>)[k];
      const i = opts.findIndex(([v]) => v === cur);
      g.applySettings({ [k]: opts[(i + 1) % opts.length][0] });
      this.showGameMenu('settings');
    });
    this.on(s, '[data-step]', (el) => {
      const [k, d] = el.dataset.step!.split(':');
      const cur = (g.settings as unknown as Record<string, number>)[k];
      g.applySettings({ [k]: Math.round(Math.max(0, Math.min(1, cur + +d)) * 20) / 20 });
      this.showGameMenu('settings');
    });
  }

  private findItem(id: number | null): Item | undefined {
    if (id === null) return undefined;
    const inv = this.game.inventory;
    return inv.bag.find((i) => i.id === id) ?? Object.values(inv.equipped).find((i) => i?.id === id);
  }

  private advanceTab() {
    const p = this.game.player;
    const branches: [Branch, string][] = [['Body', 'hp'], ['Staff', 'damage'], ['Spells', 'spell'], ['Gourd', 'gourd'], ['Great Sage', 'crit']];
    return `
      <div class="tab-title"><h2>Self-Advance</h2><span class="hint">Sparks: <b>${pointsAvailable(p.level, p.talents)}</b> · one per level</span>
        <button class="mini-btn" data-nav data-a="reset-talents" data-key="reset">Reset</button></div>
      <div class="adv-layout">
        <div class="talent-tree">
          ${branches.map(([b, icon]) => `<div class="branch"><h3>${b}</h3><div class="nodes">${TALENTS.filter((t) => t.branch === b).map((t) => {
            const r = rank(p.talents, t.id);
            const why = canLearn(t, p.talents, p.level);
            const locked = why && why !== 'Maxed' && why !== 'No points';
            const esc = (x: string) => x.replace(/"/g, '&quot;');
            return `<button class="tnode ${r > 0 ? 'learned' : ''} ${r >= t.max ? 'max' : ''} ${locked ? 'locked' : ''} ${!why ? 'can' : ''}" data-nav data-talent="${t.id}" data-key="t-${t.id}"
                data-name="${esc(t.name)}" data-desc="${esc(t.desc(Math.max(1, r + (r < t.max ? 1 : 0))))}" data-rank="${r} / ${t.max}" data-req="${locked ? esc(why) : !why ? 'Ready to learn' : why === 'Maxed' ? 'Mastered' : 'No sparks left'}">
              <span class="tn-gem">${STAT_ICONS[icon] ?? ''}</span>
              <span class="tn-name">${t.name}</span>
              <span class="t-pips">${Array.from({ length: t.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</span>
            </button>`;
          }).join('')}</div></div>`).join('')}
        </div>
        <div class="t-detail"><h3 class="td-name">Self-Advance</h3><div class="td-rank"></div><p class="td-desc">Select a talent to read about it.</p><p class="td-req"></p></div>
      </div>`;
  }

  private spellsTab() {
    const p = this.game.player;
    const slotKeys = this.game.touch ? ['', '', '', ''] : ['1', '2', '3', '4'];
    return `
      <div class="tab-title"><h2>Spells</h2><span class="hint">Pick a slot, then a spell. Learn new spells in Self-Advance.</span></div>
      <div class="spell-slots">${p.spells.map((id, i) => `
        <button class="spell-slot ${i === this.spellSlot ? 'active' : ''}" data-nav data-slot="${i}" data-key="slot-${i}">
          <span class="ic">${(ICONS as Record<string, string>)[id]}</span><span>${SPELLS[id].name}</span>${slotKeys[i] ? `<kbd>${slotKeys[i]}</kbd>` : ''}
        </button>`).join('')}</div>
      <div class="spell-list">${SPELL_IDS.map((id) => {
        const d = SPELLS[id];
        const ok = spellUnlocked(id, p.talents);
        const eq = p.spells.indexOf(id);
        return `<button class="spell-card ${ok ? '' : 'locked'} ${eq >= 0 ? 'equipped' : ''}" data-nav data-spell="${id}" data-key="sp-${id}">
          <span class="ic">${(ICONS as Record<string, string>)[id]}</span>
          <span class="sc-body"><b>${d.name}</b><span class="sc-meta">${d.mana} mana · ${d.cd}s cooldown${eq >= 0 ? ` · slot ${eq + 1}` : ''}</span><span class="sc-desc">${d.desc}</span>
          ${ok ? '' : `<span class="t-req">Learn in Self-Advance</span>`}</span>
        </button>`;
      }).join('')}</div>`;
  }

  private itemCard(it: Item, extraCls = '') {
    return `<button class="item-card r${it.rarity} ${this.selectedItem === it.id ? 'selected' : ''} ${extraCls}" style="--rc:${RARITY_COLORS[it.rarity]}" data-nav data-item="${it.id}" data-key="it-${it.id}">
      <span class="ic">${SLOT_ICONS[it.slot]}</span><span class="lvl">${it.level}</span>${extraCls.includes('is-equipped') ? '<span class="eq-mark">✦</span>' : ''}</button>`;
  }

  private detail(it: Item | undefined, compare?: Item) {
    if (!it) return `<div class="detail-card empty">Select an item to see its details.</div>`;
    const lines = Object.entries(it.stats).map(([k, v]) => `<li>${STAT_LABELS[k as StatKey](v!)}</li>`).join('');
    const diff = compare && compare.id !== it.id ? itemScore(it) - itemScore(compare) : null;
    const equipped = this.game.inventory.equipped[it.slot]?.id === it.id;
    return `<div class="detail-card" style="--rc:${RARITY_COLORS[it.rarity]}">
      <div class="dc-head"><span class="dc-rarity">${RARITY_NAMES[it.rarity]}</span><span class="dc-ic">${SLOT_ICONS[it.slot]}</span></div>
      <div class="dc-name">${esc(it.name)}</div>
      <div class="dc-type">${SLOT_NAMES[it.slot]} · Level ${it.level}</div>
      <ul class="dc-stats">${lines}</ul>
      ${it.power ? `<div class="dc-power"><h4>Legendary Power</h4><p>${POWER_TEXT[it.power]}</p></div>` : ''}
      ${diff !== null ? `<div class="dc-compare ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲ Better' : '▼ Worse'} than equipped</div>` : ''}
      <div class="dc-actions">${equipped
        ? `<button class="mbtn wide" data-nav data-a="unequip" data-key="act-unequip">Equipped · Unequip</button>`
        : `<button class="mbtn primary wide" data-nav data-a="equip" data-key="act-equip">Equip</button><button class="mbtn wide" data-nav data-a="salvage" data-key="act-salvage">Salvage +${salvageValue(it)}g</button>`}</div>
    </div>`;
  }

  private equipmentTab() {
    const inv = this.game.inventory;
    const slot = this.equipSlot;
    const eq = inv.equipped[slot];
    const items = [...(eq ? [eq] : []), ...inv.bag.filter((i) => i.slot === slot).sort((a, b) => itemScore(b) - itemScore(a))];
    const sel = this.findItem(this.selectedItem) ?? eq ?? items[0];
    if (sel) this.selectedItem = sel.id;
    return `
      <div class="slot-tabs">${SLOTS.map((s) => `<button class="slot-tab ${s === slot ? 'active' : ''}" data-nav data-eqslot="${s}" data-key="slot-${s}" title="${SLOT_NAMES[s]}">${SLOT_ICONS[s]}</button>`).join('')}</div>
      <div class="equip-layout">
        <div class="equip-list"><h3>${SLOT_NAMES[slot]}</h3>
          <div class="item-grid">${items.length ? items.map((i) => this.itemCard(i, i.id === eq?.id ? 'is-equipped' : '')).join('') : '<p class="hint">No items for this slot yet — loot enemies and breakables.</p>'}</div>
        </div>
        ${this.detail(sel, sel && sel.id !== eq?.id ? eq : undefined)}
      </div>`;
  }

  private inventoryTab() {
    const inv = this.game.inventory;
    const sel = this.findItem(this.selectedItem);
    return `
      <div class="tab-title"><h2>Inventory</h2><span class="hint">${inv.bag.length}/${BAG_SIZE}</span>
        <button class="mini-btn" data-nav data-a="salvage-low" data-key="salvage-low">Salvage Common &amp; Magic</button></div>
      <div class="equip-layout">
        <div class="equip-list"><div class="item-grid bag">${Array.from({ length: BAG_SIZE }, (_, i) => (inv.bag[i] ? this.itemCard(inv.bag[i]) : '<span class="item-card empty"></span>')).join('')}</div></div>
        ${this.detail(sel, sel ? inv.equipped[sel.slot] : undefined)}
      </div>`;
  }

  private journalTab() {
    const b = this.game.bestiary;
    const kinds = Object.keys(KINDS);
    const k = this.journalKind;
    const seen = (b[k] ?? 0) > 0;
    return `
      <div class="tab-title"><h2>Journal · Yaoguai</h2></div>
      <div class="journal">
        <div class="j-list">${kinds.map((id) => `<button class="j-entry ${id === k ? 'active' : ''}" data-nav data-journal="${id}" data-key="j-${id}">${(b[id] ?? 0) > 0 ? KINDS[id as keyof typeof KINDS].name : '???'}<small>${b[id] ?? 0} slain</small></button>`).join('')}</div>
        <div class="j-page">${seen ? `<h3>${KINDS[k as keyof typeof KINDS].name}</h3><p>${LORE[k]}</p>` : '<h3>???</h3><p class="hint">Defeat this yaoguai to record it.</p>'}
          <h3>Chapter One</h3><p>The Mountain-Sea Temple fell silent when the brood came. Little Monkey climbs its rain-soaked stairs to face what nests in the main hall.</p>
        </div>
      </div>`;
  }

  private settingsTab() {
    const st = this.game.settings;
    const cyc = (key: string, label: string, opts: [string | number | boolean, string][]) => {
      const cur = (st as unknown as Record<string, unknown>)[key];
      const name = opts.find(([v]) => v === cur)?.[1] ?? opts[0][1];
      return `<div class="set-row"><span>${label}</span><button class="mbtn cycle" data-nav data-cycle="${key}" data-key="c-${key}" data-opts='${JSON.stringify(opts)}'>‹ ${name} ›</button></div>`;
    };
    const step = (key: 'volume' | 'music', label: string) => `<div class="set-row"><span>${label}</span><span class="stepper">
      <button class="mbtn sq" data-nav data-step="${key}:-0.1" data-key="s-${key}-">−</button><b>${Math.round(st[key] * 100)}</b><button class="mbtn sq" data-nav data-step="${key}:0.1" data-key="s-${key}+">+</button></span></div>`;
    return `
      <div class="tab-title"><h2>Settings</h2></div>
      <div class="settings-list">
        ${cyc('quality', 'Graphics', [['low', 'Low (coolest)'], ['medium', 'Medium'], ['high', 'High']])}
        ${cyc('fpsCap', 'Frame rate', [[30, '30 fps · battery saver'], [60, '60 fps'], [0, 'Unlimited']])}
        ${cyc('dynamicRes', 'Auto resolution', [[true, 'On'], [false, 'Off']])}
        ${cyc('screenShake', 'Screen shake & rumble', [[1, 'Full'], [0.5, 'Reduced'], [0, 'Off']])}
        ${cyc('damageNumbers', 'Damage numbers', [[true, 'On'], [false, 'Off']])}
        ${cyc('cutscenes', 'Cutscenes', [[true, 'Play'], [false, 'Skip']])}
        ${step('volume', 'Sound')}
        ${step('music', 'Music')}
      </div>
      <div class="row-buttons">
        <button class="mbtn" data-nav data-a="help" data-key="help">How to Play</button>
        <button class="mbtn" data-nav data-a="restart" data-key="restart">Restart from Checkpoint</button>
        <button class="mbtn" data-nav data-a="mainmenu" data-key="mainmenu">Main Menu</button>
      </div>`;
  }

  // -------------------------------------------------------------------------

  showDeath() {
    const s = this.show('dead', 'death', `
      <div class="death-text">You Have Fallen</div>
      <div class="death-sub">The mountain spirits carry you back to the last shrine.</div>
      <button class="mbtn primary default" data-nav data-a="revive">Rise Again</button>`);
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
      <p class="hint">Play again on <b>Torment ${stats.ng + 1}</b>: stronger enemies, better loot. You keep your level, talents and gear.</p>
      <div class="menu-buttons">
        <button class="mbtn primary default" data-nav data-a="ng">Continue to Torment ${stats.ng + 1}</button>
        <button class="mbtn" data-nav data-a="menu">Main Menu</button>
      </div>`);
    this.on(s, '[data-a=ng]', () => this.game.newGamePlus());
    this.on(s, '[data-a=menu]', () => this.game.toMainMenu());
  }
}
