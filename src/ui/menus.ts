import type { Game } from '../game/game';
import {
  BAG_SIZE, BASE_TRAITS, MAX_TEMPER, POWER_TEXT, RARITY_COLORS, RARITY_NAMES, SETS, SET_COLOR, SLOTS, SLOT_NAMES, baseIndex, itemScore, itemStats,
  salvageValue, setCounts, statIsGood, statLine, temperCost,
  type Item, type Slot, type StatKey,
} from '../game/loot';
import {
  BRANCHES, SPELLS, SPELL_IDS, TALENTS, canLearn, pointsAvailable, rank, spellUnlocked, type SpellId, type TalentId,
} from '../game/progression';
import { STANCES } from '../game/stances';
import {
  CURIOS, CURIO_IDS, DRINKS, DRINK_IDS, GOURD_MAX, PILLS, PILL_IDS, SOAKS, SOAK_IDS, gourdUpgradeCost,
  type CurioId, type DrinkId, type PillId, type SoakId,
} from '../game/items';
import { LORE_NOTES, PROLOGUE, STORY } from '../game/story';
import './journey.css';
import { KINDS } from '../game/enemies';
import { CHAPTERS } from '../game/chapters';
import { ICONS, STAT_ICONS } from './icons';
import { itemImg } from './itemart';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Tab = 'advance' | 'spells' | 'equipment' | 'inventory' | 'gourd' | 'travel' | 'journal' | 'settings';
const TABS: [Tab, string][] = [
  ['advance', 'Self-Advance'], ['spells', 'Spells'], ['equipment', 'Equipment'],
  ['inventory', 'Inventory'], ['gourd', 'Gourd & Curios'], ['travel', 'Travel'], ['journal', 'Journal'], ['settings', 'Settings'],
];
type JournalPage = 'story' | 'lore' | 'yaoguai';

const LORE: Record<string, string> = {
  spiderling: 'Hatchlings of the temple brood. Alone they are a nuisance; in the dark they come by the dozen.',
  armored: 'Broodmothers grow shells of temple stone. Watch for the red circle — they leap before they bite.',
  ghoul: 'The temple monks who never fled. The brood\'s venom keeps them walking long after death; they rise from the soil and rake with broken nails.',
  wolf: 'Hill wolves twisted by the Yellow Wind. They run down anything that flees and pounce from range.',
  archer: 'Desert bandits who sold their bows to the Tiger Vanguard. They shoot a fan of arrows from a distance.',
  bone: 'Guardians of the frozen sanctum, still holding rusted swords. Heavy blows barely chip their bones; stagger them.',
  frost: 'Ice-crowned witches who weave binding frost from afar. Close the distance quickly.',
  tiger: 'A war-lord in gilded armour who commands the ridge, and summons the pack when he is wounded.',
  bonelady: 'Mistress of the frozen sanctum. Her frost wings and bone gale bring the dead to her side.',
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
  private journalPage: JournalPage = 'story';
  private loreId = '';
  private curioSlot = 0;
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
            <p><b>WASD</b> move · <b>Mouse</b> aim<br><b>Left click</b> staff combo (hold)<br><b>Right click</b> heavy attack (hold to charge)<br><b>Space</b> dodge roll<br><b>1–4</b> spells · <b>G</b> healing gourd<br><b>X</b> switch stance<br><b>T</b> Monkey King · <b>I</b> menu · <b>Esc</b> pause</p></div>
          <div><h3>Gamepad / Joystick</h3>
            <p><b>Left stick</b> move · <b>Right stick</b> aim<br><b>X</b> combo · <b>Y</b> heavy (hold)<br><b>A</b> dodge · <b>B</b> gourd<br><b>LB RB LT RT</b> spells<br><b>R3 / D-pad ↑</b> Monkey King · <b>D-pad ←</b> stance<br><b>Start</b> menu · menus: stick + A/B, LB/RB tabs</p></div>
          <div><h3>Touch</h3>
            <p>Left thumb: <b>joystick</b> (appears where you touch)<br>Big button: <b>combo</b> · hammer: <b>heavy</b> (hold)<br>Small buttons: <b>dodge</b>, <b>gourd</b>, <b>spells</b>, <b>Monkey King</b><br>Attacks auto-aim at nearby enemies</p></div>
        </div>
        <h3>Combat</h3>
        <ul class="skill-list">
          <li>Light hits build <b>Focus</b> (the three pips under your health). A charged <b>heavy smash</b> spends all Focus for a huge blow that staggers enemies and breaks bosses.</li>
          <li>Dodge just before a hit for a <b>Perfect Dodge</b>: slow motion and +1 Focus.</li>
          <li>Red circles warn of attacks. Clear each area to break the red seal. Your gourd refills at every cleared area.</li>
          <li><b>Stances</b> (X / D-pad ← / tap the HUD): Smash, Pillar and Thrust each have their own combo, charged heavy and special (tap Heavy mid-combo). Learn them in <b>Self-Advance</b>.</li>
          <li>Each level gives a spark — spend it in <b>Self-Advance</b> on stances, combo strikes, specials, spells and the Monkey King form.</li>
          <li>Gear has trade-offs: heavy armour protects but slows your dodge, a spear crits but leaves you frail. Sets, curios, drinks and soaks change how you play.</li>
          <li>Falling drops your <b>Will</b> where you fell — walk back to it to recover it. Fall again first and it is lost. Resting at a shrine refills the gourd and wakes the yaoguai.</li>
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
    const pts = pointsAvailable(p.level, p.talents, g.journey.s.bonusSparks);
    let body = '';
    switch (tab) {
      case 'advance': body = this.advanceTab(); break;
      case 'spells': body = this.spellsTab(); break;
      case 'equipment': body = this.equipmentTab(); break;
      case 'inventory': body = this.inventoryTab(); break;
      case 'gourd': body = this.gourdTab(); break;
      case 'journal': body = this.journalTab(); break;
      case 'travel': body = this.travelTab(); break;
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
        <div class="gm-currency" title="Will · Sparks"><span class="gold-icon">◈</span>${g.inventory.gold.toLocaleString()} Will<span class="pts-icon">✦</span>${pts}</div>
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
            ${stat('damage', 'Stance', STANCES[p.stance].name)}
          </div>
          <div class="char-quote">"Three relics scattered across three peaks. A staff, a gourd, and a long road west."</div>
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
      if (canLearn(def, p.talents, p.level, g.journey.s.bonusSparks)) {
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
        detail.querySelector('.td-kind')!.textContent = el.dataset.kind!;
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
    this.on(s, '[data-a=temper]', () => {
      const it = this.findItem(this.selectedItem);
      if (!it || !g.journey.temper(it)) { g.audio.play('uiBack'); if (!g.journey.atShrine()) g.hud.toast('Temper gear at a lit Keeper\'s Shrine', '#c8b89a'); }
      this.showGameMenu(this.tab);
    });
    // Gourd & curios
    this.on(s, '[data-cslot]', (el) => { this.curioSlot = +el.dataset.cslot!; this.showGameMenu('gourd'); });
    this.on(s, '[data-curio]', (el) => {
      const id = el.dataset.curio as CurioId;
      if (!g.journey.s.curios.includes(id)) return;
      const cur = g.journey.s.curioSlots[this.curioSlot];
      g.journey.equipCurio(this.curioSlot, cur === id ? null : id);
      this.showGameMenu('gourd');
    });
    this.on(s, '[data-drink]', (el) => { g.journey.setDrink(el.dataset.drink as DrinkId); g.player.computeStats(g.inventory); this.showGameMenu('gourd'); });
    this.on(s, '[data-soak]', (el) => {
      const id = el.dataset.soak as SoakId;
      g.journey.setSoak(g.journey.s.soak === id ? null : id);
      this.showGameMenu('gourd');
    });
    this.on(s, '[data-a=gourd-up]', () => { if (!g.journey.upgradeGourd()) g.audio.play('uiBack'); this.showGameMenu('gourd'); });
    this.on(s, '[data-use]', (el) => { if (!g.journey.usePill(el.dataset.use as PillId)) g.audio.play('uiBack'); this.showGameMenu('gourd'); });
    this.on(s, '[data-buy]', (el) => { if (!g.journey.buyPill(el.dataset.buy as PillId)) g.audio.play('uiBack'); this.showGameMenu('gourd'); });
    // Journal pages
    this.on(s, '[data-jpage]', (el) => { this.journalPage = el.dataset.jpage as JournalPage; this.showGameMenu('journal'); });
    this.on(s, '[data-lore]', (el) => { if (g.journey.s.lore.includes(el.dataset.lore!)) { this.loreId = el.dataset.lore!; this.showGameMenu('journal'); } });
    this.on(s, '[data-a=salvage-low]', () => {
      g.salvage(g.inventory.bag.filter((i) => i.rarity <= 1));
      this.selectedItem = null;
      this.showGameMenu(this.tab);
    });
    // Travel
    this.on(s, '[data-travel]', (el) => g.travelTo(+el.dataset.travel!));
    this.on(s, '[data-chapter]', (el) => {
      const n = +el.dataset.chapter!;
      if (n >= g.unlocked) return;
      if (n === g.chapter) { g.resume(); return; }
      this.confirm(`Journey to ${CHAPTERS[n].place}?`, 'Your progress here is saved. You will resume at the furthest shrine you lit there.', () => g.startChapter(n), () => this.showGameMenu('travel'));
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
    const g = this.game;
    const p = g.player;
    const bonus = g.journey.s.bonusSparks;
    const KIND_NAME: Record<string, string> = { stat: 'Attribute', stance: 'Stance', combo: 'Combo', special: 'Stance special', spell: 'Spell', passive: 'Passive' };
    const st = STANCES[p.stance];
    return `
      <div class="tab-title"><h2>Self-Advance</h2><span class="hint">Sparks: <b>${pointsAvailable(p.level, p.talents, bonus)}</b> · one per level${bonus ? `, +${bonus} from relics` : ''}</span>
        <button class="mini-btn" data-nav data-a="reset-talents" data-key="reset">Reset</button></div>
      <div class="adv-layout">
        <div class="talent-tree tree7">
          ${BRANCHES.map(([b, icon]) => `<div class="branch"><h3>${b}</h3><div class="nodes">${TALENTS.filter((t) => t.branch === b).map((t) => {
            const r = rank(p.talents, t.id);
            const why = canLearn(t, p.talents, p.level, bonus);
            const locked = why && why !== 'Maxed' && why !== 'No points';
            const q = (x: string) => x.replace(/"/g, '&quot;');
            return `<button class="tnode k-${t.kind} ${r > 0 ? 'learned' : ''} ${r >= t.max ? 'max' : ''} ${locked ? 'locked' : ''} ${!why ? 'can' : ''}" data-nav data-talent="${t.id}" data-key="t-${t.id}"
                data-name="${q(t.name)}" data-kind="${KIND_NAME[t.kind]}" data-desc="${q(t.desc(Math.max(1, r + (r < t.max ? 1 : 0))))}" data-rank="${r} / ${t.max}" data-req="${locked ? q(why) : !why ? 'Ready to learn' : why === 'Maxed' ? 'Mastered' : 'No sparks left'}">
              <span class="tn-gem">${STAT_ICONS[icon] ?? STAT_ICONS.damage ?? ''}</span>
              <span class="tn-name">${t.name}</span>
              <span class="t-pips">${Array.from({ length: t.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</span>
            </button>`;
          }).join('')}</div></div>`).join('')}
        </div>
        <div class="t-detail"><div class="td-kind"></div><h3 class="td-name">Self-Advance</h3><div class="td-rank"></div><p class="td-desc">Select a node. Most nodes unlock something: stances, combo strikes, stance specials, spells and the Monkey King form.</p><p class="td-req"></p>
          <div class="stance-card" style="--sc:${st.color}"><b>${st.name} Stance</b> (active)<br>${st.blurb}<br>Combo: ${p.chain().length} strikes${p.specialKnown ? ` · Special: ${st.specialName} (tap Heavy mid-combo)` : ''}<br><small>${g.touch ? 'Tap a stance on the HUD' : 'X / D-pad ←'} to switch stance.</small></div>
        </div>
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
    const col = it.set ? SET_COLOR : RARITY_COLORS[it.rarity];
    return `<button class="item-card r${it.rarity} ${it.set ? 'set' : ''} ${this.selectedItem === it.id ? 'selected' : ''} ${extraCls}" style="--rc:${col}" data-nav data-item="${it.id}" data-key="it-${it.id}">
      <span class="ic">${itemImg(this.game.renderer.renderer, it)}</span><span class="lvl">${it.level}</span>${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}${extraCls.includes('is-equipped') ? '<span class="eq-mark">✦</span>' : ''}</button>`;
  }

  /** Stat lines with plus in green and minus in red; base trade-off lines are marked. */
  private statLines(it: Item) {
    const rolled = itemStats({ ...it, implicit: {} });
    const imp = it.implicit ?? {};
    const li = (k: StatKey, v: number, cls = '') => `<li class="${statIsGood(k, v) ? 'good' : 'bad'} ${cls}">${statLine(k, v)}</li>`;
    return (Object.entries(imp) as [StatKey, number][]).map(([k, v]) => li(k, v, 'implicit')).join('') +
      (Object.entries(rolled) as [StatKey, number][]).map(([k, v]) => li(k, v)).join('');
  }

  /** Per-stat difference against what is equipped in the slot. */
  private compareLines(it: Item, other: Item | undefined) {
    const a = itemStats(it);
    const b = other ? itemStats(other) : {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)] as StatKey[]);
    const parts: string[] = [];
    for (const k of keys) {
      const d = (a[k] ?? 0) - (b[k] ?? 0);
      if (Math.abs(d) < 1e-3) continue;
      parts.push(`<span class="${statIsGood(k, d) ? 'up' : 'down'}">${statLine(k, d)}</span>`);
    }
    if (it.power !== other?.power) {
      if (it.power) parts.push(`<span class="up">+ ${esc(POWER_TEXT[it.power])}</span>`);
      if (other?.power) parts.push(`<span class="down">− ${esc(POWER_TEXT[other.power])}</span>`);
    }
    return parts.length ? parts.join('') : '<span>No change</span>';
  }

  private detail(it: Item | undefined, compare?: Item) {
    if (!it) return `<div class="detail-card empty">Select an item to see its details.</div>`;
    const g = this.game;
    const equipped = g.inventory.equipped[it.slot]?.id === it.id;
    const trait = BASE_TRAITS[it.slot][baseIndex(it)];
    const col = it.set ? SET_COLOR : RARITY_COLORS[it.rarity];
    let setHtml = '';
    if (it.set) {
      const def = SETS[it.set];
      const n = setCounts(g.inventory.equipped)[it.set] ?? 0;
      setHtml = `<div class="dc-set"><h4>${def.name} (${n}/4)</h4>
        <p class="${n >= 2 ? 'on' : ''}">(2) ${def.two}</p><p class="${n >= 4 ? 'on' : ''}">(4) ${def.four}</p>
        <p>${def.pieces.map((pc) => pc.name).join(' · ')}</p></div>`;
    }
    const showCompare = !equipped;
    const atShrine = g.journey.atShrine();
    const canTemper = (it.plus ?? 0) < MAX_TEMPER;
    return `<div class="detail-card" style="--rc:${col}">
      <div class="dc-head"><span class="dc-rarity">${it.set ? 'Set' : RARITY_NAMES[it.rarity]}</span><span class="dc-ic">${itemImg(g.renderer.renderer, it)}</span></div>
      <div class="dc-name">${esc(it.name)}${it.plus ? ` <span class="dc-plus">+${it.plus}</span>` : ''}</div>
      <div class="dc-type">${SLOT_NAMES[it.slot]} · Level ${it.level}</div>
      <div class="dc-trait">${trait.note}</div>
      <ul class="dc-stats">${this.statLines(it)}</ul>
      ${it.power ? `<div class="dc-power"><h4>Legendary Power</h4><p>${POWER_TEXT[it.power]}</p></div>` : ''}
      ${setHtml}
      ${showCompare ? `<div class="dc-diff"><h4>${compare ? 'If equipped instead of ' + esc(compare.name) : 'If equipped (slot empty)'}</h4>${this.compareLines(it, compare)}</div>` : ''}
      <div class="dc-actions">${equipped
        ? `<button class="mbtn wide" data-nav data-a="unequip" data-key="act-unequip">Equipped · Unequip</button>`
        : `<button class="mbtn primary wide" data-nav data-a="equip" data-key="act-equip">Equip</button><button class="mbtn wide" data-nav data-a="salvage" data-key="act-salvage">Offer +${salvageValue(it)} Will</button>`}
        ${canTemper ? `<button class="mbtn wide" data-nav data-a="temper" data-key="act-temper" ${atShrine ? '' : 'aria-disabled="true"'}>${atShrine ? `Temper +${(it.plus ?? 0) + 1} · ${temperCost(it)} Will` : 'Temper at a Keeper\'s Shrine'}</button>` : ''}</div>
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
      <div class="slot-tabs">${SLOTS.map((s) => `<button class="slot-tab ${s === slot ? 'active' : ''}" data-nav data-eqslot="${s}" data-key="slot-${s}" title="${SLOT_NAMES[s]}">${itemImg(this.game.renderer.renderer, this.game.inventory.equipped[s] ?? { slot: s, base: 0, rarity: 0 }, this.game.inventory.equipped[s] ? 'item-img' : 'item-img empty-slot')}</button>`).join('')}</div>
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

  /** Fast travel between lit shrines in this chapter, and the road map of every chapter. */
  private travelTab() {
    const g = this.game;
    const lit = g.progress[g.chapter] ?? 0;
    const zones = g.level.zones;
    return `
      <div class="tab-title"><h2>Travel</h2><span class="hint">Light Keeper's Shrines by reaching them, then return to any lit shrine.</span></div>
      <h3 class="tv-h">${CHAPTERS[g.chapter].title} · ${CHAPTERS[g.chapter].place}</h3>
      <div class="tv-list">${zones.map((z, i) => `<button class="tv-row ${i <= lit ? 'lit' : 'dark'}" data-nav data-travel="${i}" data-key="tv-${i}" ${i > lit ? 'aria-disabled="true"' : ''}>
        <span class="tv-dot"></span><span class="tv-name">${esc(z.name)}</span><small>${i <= lit ? 'Travel' : 'Not yet reached'}</small></button>`).join('')}</div>
      <h3 class="tv-h">Chapters</h3>
      <div class="tv-list">${CHAPTERS.map((c, i) => `<button class="tv-row ${i < g.unlocked ? 'lit' : 'dark'} ${i === g.chapter ? 'here' : ''}" data-nav data-chapter="${i}" data-key="ch-${i}" ${i >= g.unlocked ? 'aria-disabled="true"' : ''}>
        <span class="tv-dot"></span><span class="tv-name">${c.title}<em>${c.place}</em></span><small>${i === g.chapter ? 'You are here' : i < g.unlocked ? 'Journey' : 'Locked'}</small></button>`).join('')}</div>`;
  }

  /** Gourd (upgrade, drink, soak), curios and medicines; buying and upgrading need a Keeper's Shrine. */
  private gourdTab() {
    const g = this.game;
    const j = g.journey;
    const s = j.s;
    const at = j.atShrine();
    const slots = j.curioSlotCount;
    if (this.curioSlot >= slots) this.curioSlot = 0;
    const cost = gourdUpgradeCost(s.gourdLevel);
    const pill = (id: PillId) => {
      const d = PILLS[id];
      const n = s.pills[id] ?? 0;
      return `<div class="cg-card ${n ? '' : 'locked'}"><b>${d.name} ×${n}</b><small>${d.desc}</small>
        <span class="row-buttons"><button class="mini-btn" data-nav data-use="${id}" data-key="use-${id}" ${n ? '' : 'aria-disabled="true"'}>Use</button>
        <button class="mini-btn" data-nav data-buy="${id}" data-key="buy-${id}" ${at ? '' : 'aria-disabled="true"'}>Buy · ${j.pillPrice(id)} Will</button></span></div>`;
    };
    return `
      <div class="tab-title"><h2>Gourd &amp; Curios</h2><span class="hint">Celestial Dew: <b>${s.dew}</b> · Will: <b>${g.inventory.gold}</b></span></div>
      <div class="shrine-note ${at ? '' : 'off'}">${at ? 'You stand at a Keeper\'s Shrine: upgrade the gourd, buy medicines, temper gear (Equipment tab).' : 'Offerings (gourd upgrades, medicines, tempering) are made at a lit Keeper\'s Shrine. Resting there refills the gourd — and wakes the yaoguai again.'}</div>
      <div class="cg-layout">
        <div>
          <h3>Gourd · Level ${s.gourdLevel} / ${GOURD_MAX}</h3>
          <div class="cg-meta">Heals <b>${Math.round(g.player.stats.gourdHeal * 100)}%</b> Life · <b>${g.player.stats.gourdCharges}</b> charges</div>
          ${s.gourdLevel < GOURD_MAX ? `<button class="mbtn" data-nav data-a="gourd-up" data-key="gourd-up" ${at && s.dew >= cost.dew && g.inventory.gold >= cost.will ? '' : 'aria-disabled="true"'}>Upgrade · ${cost.dew} Dew + ${cost.will} Will</button>` : '<div class="cg-meta">The gourd is fully refined.</div>'}
          <h3>Drink</h3>
          ${DRINK_IDS.map((id: DrinkId) => {
            const own = s.drinks.includes(id);
            return `<button class="cg-card ${s.drink === id ? 'on' : ''} ${own ? '' : 'locked'}" data-nav data-drink="${id}" data-key="dr-${id}"><b>${own ? DRINKS[id].name : '???'}</b><small>${own ? DRINKS[id].desc : 'Not yet found'}</small></button>`;
          }).join('')}
          <h3>Soak</h3>
          ${SOAK_IDS.map((id: SoakId) => {
            const own = s.soaks.includes(id);
            return `<button class="cg-card ${s.soak === id ? 'on' : ''} ${own ? '' : 'locked'}" data-nav data-soak="${id}" data-key="so-${id}"><b>${own ? SOAKS[id].name : '???'}</b><small>${own ? SOAKS[id].desc : 'Not yet found'}</small></button>`;
          }).join('')}
        </div>
        <div>
          <h3>Curios · ${slots} slots</h3>
          <div class="cg-slots">${Array.from({ length: slots }, (_, i) => {
            const c = s.curioSlots[i];
            return `<button class="cg-slot ${i === this.curioSlot ? 'active' : ''}" data-nav data-cslot="${i}" data-key="cs-${i}"><b>${c ? CURIOS[c].name : 'Empty'}</b><small>Slot ${i + 1}</small></button>`;
          }).join('')}</div>
          ${CURIO_IDS.map((id: CurioId) => {
            const own = s.curios.includes(id);
            const worn = s.curioSlots.slice(0, slots).indexOf(id);
            return `<button class="cg-card ${worn >= 0 ? 'on' : ''} ${own ? '' : 'locked'}" data-nav data-curio="${id}" data-key="cu-${id}"><b>${own ? CURIOS[id].name : '???'}${worn >= 0 ? ` · slot ${worn + 1}` : ''}</b><small>${own ? CURIOS[id].desc : 'Not yet found — bosses, elites and chests hold curios'}</small>${own ? `<em>${CURIOS[id].lore}</em>` : ''}</button>`;
          }).join('')}
          <h3>Medicines</h3>
          ${PILL_IDS.map(pill).join('')}
        </div>
      </div>`;
  }

  private journalTab() {
    const g = this.game;
    const page = this.journalPage;
    const tabs = `<div class="j-tabs">${(['story', 'lore', 'yaoguai'] as JournalPage[]).map((pg) => `<button class="mini-btn ${pg === page ? 'active' : ''}" data-nav data-jpage="${pg}" data-key="jp-${pg}">${pg === 'story' ? 'Story' : pg === 'lore' ? `Lore notes (${g.journey.s.lore.length}/${LORE_NOTES.length})` : 'Yaoguai'}</button>`).join('')}</div>`;
    if (page === 'story') {
      const relics = g.journey.s.relics;
      const seen = Math.max(g.unlocked, g.chapter + 1);
      return `<div class="tab-title"><h2>Journal · The Road West</h2></div>${tabs}
        <div class="j-page">${PROLOGUE.map((t) => `<p class="lore-text">${t}</p>`).join('')}
          ${STORY.slice(0, seen).map((st, i) => `<h3>${CHAPTERS[i].title} · ${CHAPTERS[i].place}</h3><p>${st.summary}</p>
            <p class="relic">${relics.includes(st.relic.id) ? `✦ ${st.relic.name} — ${st.relic.boon}` : '✧ The relic of this land is still lost.'}</p>`).join('')}
        </div>`;
    }
    if (page === 'lore') {
      const found = LORE_NOTES.filter((n) => g.journey.s.lore.includes(n.id));
      const cur = found.find((n) => n.id === this.loreId) ?? found[0];
      return `<div class="tab-title"><h2>Journal · Lore</h2></div>${tabs}
        <div class="journal">
          <div class="j-list">${LORE_NOTES.map((n) => {
            const has = g.journey.s.lore.includes(n.id);
            return `<button class="j-entry ${cur?.id === n.id ? 'active' : ''}" data-nav data-lore="${n.id}" data-key="lo-${n.id}" ${has ? '' : 'aria-disabled="true"'}>${has ? esc(n.title) : '???'}<small>${CHAPTERS[n.chapter].place}</small></button>`;
          }).join('')}</div>
          <div class="j-page">${cur ? `<h3>${esc(cur.title)}</h3><p class="lore-text">${esc(cur.text)}</p>` : '<h3>No notes yet</h3><p class="hint">Scraps of writing lie hidden around each land. Explore off the main path.</p>'}</div>
        </div>`;
    }
    const b = g.bestiary;
    const kinds = Object.keys(KINDS);
    const k = this.journalKind;
    const seen = (b[k] ?? 0) > 0;
    return `
      <div class="tab-title"><h2>Journal · Yaoguai</h2></div>${tabs}
      <div class="journal">
        <div class="j-list">${kinds.map((id) => `<button class="j-entry ${id === k ? 'active' : ''}" data-nav data-journal="${id}" data-key="j-${id}">${(b[id] ?? 0) > 0 ? KINDS[id as keyof typeof KINDS].name : '???'}<small>${b[id] ?? 0} slain</small></button>`).join('')}</div>
        <div class="j-page">${seen ? `<h3>${KINDS[k as keyof typeof KINDS].name}</h3><p>${LORE[k]}</p>` : '<h3>???</h3><p class="hint">Defeat this yaoguai to record it.</p>'}</div>
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
        ${cyc('look', 'Visual style', [['pixel', 'Retro pixel'], ['smooth', 'Smooth']])}
        ${cyc('camera', 'Camera', [['iso', 'Isometric'], ['third', 'Third person'], ['side', 'Side view (2D)'], ['cinema', 'Cinematic']])}
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
      <div class="death-sub">The mountain spirits carry you back to the last shrine.${this.game.journey.s.willDrop?.amount ? ` Your Will (${this.game.journey.s.willDrop.amount}) lies where you fell — recover it before you fall again.` : ''}</div>
      <button class="mbtn primary default" data-nav data-a="revive">Rise Again</button>`);
    this.on(s, '[data-a=revive]', () => this.game.restartFromCheckpoint());
  }

  showVictory(stats: { time: string; kills: number; gold: number; level: number; ng: number; title: string; text: string; next: string | null }) {
    const s = this.show('victory', 'victory', `
      <div class="logo">
        <div class="logo-small">${stats.title} Complete</div>
        <div class="logo-big">Victory</div>
        <div class="logo-sub">${stats.text}</div>
      </div>
      <div class="victory-stats">
        <div><span>Time</span><b>${stats.time}</b></div>
        <div><span>Enemies slain</span><b>${stats.kills}</b></div>
        <div><span>Gold</span><b>${stats.gold.toLocaleString()}g</b></div>
        <div><span>Level</span><b>${stats.level}</b></div>
      </div>
      <p class="hint">${stats.next ? `The road continues to <b>${stats.next}</b>. Your level, talents and gear come with you.` : `Play again on <b>Torment ${stats.ng + 1}</b>: stronger enemies, better loot. You keep your level, talents and gear.`}</p>
      <div class="menu-buttons">
        <button class="mbtn primary default" data-nav data-a="ng">${stats.next ? `Journey to ${stats.next}` : `Continue to Torment ${stats.ng + 1}`}</button>
        <button class="mbtn" data-nav data-a="menu">Main Menu</button>
      </div>`);
    this.on(s, '[data-a=ng]', () => this.game.nextChapter());
    this.on(s, '[data-a=menu]', () => this.game.toMainMenu());
  }
}
