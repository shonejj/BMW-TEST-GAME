import * as THREE from 'three';
import type { Game } from './game';
import type { Label } from '../ui/hud';
import {
  BOSS_CURIO, BUFF_NAMES, CURIOS, DRINKS, GOURD_MAX, PILLS, SOAKS, gourdUpgradeCost, rewardName, rollChestLoot,
  type BuffId, type ChestKind, type CurioId, type DrinkId, type PillId, type Reward, type SoakId,
} from './items';
import { BAG_SIZE, CHAPTER_SET, MAX_TEMPER, RARITY_COLORS, SET_COLOR, generateSetItem, temperCost, type Item } from './loot';
import { rank } from './progression';
import { LORE_BY_ID, STORY, setLoreSink } from './story';
import type { StanceId } from './stances';

/** Will (currency) left where the Destined One fell, waiting to be recovered. */
export interface WillDrop { chapter: number; x: number; y: number; z: number; amount: number }

/** Everything the journey systems persist (stored under `journey` in the save). */
export interface JourneySave {
  curios: CurioId[];
  curioSlots: (CurioId | null)[];
  drinks: DrinkId[];
  soaks: SoakId[];
  drink: DrinkId;
  soak: SoakId | null;
  gourdLevel: number;
  dew: number;
  pills: Partial<Record<PillId, number>>;
  lore: string[];
  relics: string[];
  bonusSparks: number;
  willDrop: WillDrop | null;
  incense: boolean;
  stance: StanceId;
}

export const freshJourney = (): JourneySave => ({
  curios: [], curioSlots: [null, null, null], drinks: ['coconutWine'], soaks: [], drink: 'coconutWine', soak: null, gourdLevel: 0, dew: 0,
  pills: { lotusPill: 1 }, lore: [], relics: [], bonusSparks: 0, willDrop: null, incense: false, stance: 'smash',
});

/**
 * Souls-like loop and collectables: curios, gourd drinks/soaks/upgrades, medicines and their buffs, lore,
 * relics of the Great Sage, Will dropped on death and its recovery, chest rewards and shrine offerings.
 */
export class Journey {
  s: JourneySave = freshJourney();
  /** Active timed buffs (seconds left). */
  buffs: Partial<Record<BuffId, number>> = {};
  private marker: { label: Label | null; beam: { remove: () => void } | null; pulse: number } = { label: null, beam: null, pulse: 0 };
  private tmp = new THREE.Vector3();

  constructor(private readonly game: Game) {
    setLoreSink((id) => this.findLore(id));
  }

  reset() {
    this.load(undefined);
  }

  load(s: Partial<JourneySave> | undefined) {
    this.clearMarker();
    this.s = { ...freshJourney(), ...(s ?? {}) };
    while (this.s.curioSlots.length < 3) this.s.curioSlots.push(null);
    this.buffs = {};
  }

  toSave(): JourneySave {
    return { ...this.s, pills: { ...this.s.pills }, curios: [...this.s.curios], curioSlots: [...this.s.curioSlots], lore: [...this.s.lore], relics: [...this.s.relics] };
  }

  /** Ids of curios, drinks and soaks already owned (chests prefer new ones). */
  get owned(): Set<string> {
    return new Set<string>([...this.s.curios, ...this.s.drinks, ...this.s.soaks]);
  }

  // -------------------------------------------------------------------------
  // Curios
  // -------------------------------------------------------------------------

  get curioSlotCount() {
    return 2 + (this.game.player ? rank(this.game.player.talents, 'curioSlot') : 0);
  }
  /** True when curio `id` is worn in an active slot. */
  has(id: CurioId) {
    const n = this.curioSlotCount;
    for (let i = 0; i < n; i++) if (this.s.curioSlots[i] === id) return true;
    return false;
  }
  equipCurio(slot: number, id: CurioId | null) {
    if (id && !this.s.curios.includes(id)) return;
    const other = id ? this.s.curioSlots.indexOf(id) : -1;
    if (other >= 0) this.s.curioSlots[other] = this.s.curioSlots[slot];
    this.s.curioSlots[slot] = id;
    this.game.player.computeStats(this.game.inventory);
    this.game.requestSave();
  }

  setDrink(id: DrinkId) {
    if (!this.s.drinks.includes(id)) return;
    this.s.drink = id;
    this.game.requestSave();
  }
  setSoak(id: SoakId | null) {
    if (id && !this.s.soaks.includes(id)) return;
    this.s.soak = id;
    this.game.requestSave();
  }

  // -------------------------------------------------------------------------
  // Rewards, chests, lore, relics
  // -------------------------------------------------------------------------

  /** Grants rewards to the player, with toasts. Items go to the bag (or are salvaged into Will if it is full). */
  grant(rewards: Reward[], quiet = false) {
    const g = this.game;
    for (const r of rewards) {
      let color = '#ffe3a0';
      switch (r.kind) {
        case 'will': g.inventory.gold += r.amount; break;
        case 'item':
          if (g.inventory.bag.length >= BAG_SIZE) {
            g.inventory.gold += 50;
            g.hud.toast(`Bag full — ${r.item.name} offered to the shrine (+50 Will)`, '#ff9a6a');
            continue;
          }
          g.inventory.bag.push(r.item);
          color = r.item.set ? SET_COLOR : RARITY_COLORS[r.item.rarity];
          break;
        case 'curio': if (!this.s.curios.includes(r.id)) this.s.curios.push(r.id); color = '#ffd46a'; this.autoSlotCurio(r.id); break;
        case 'drink': if (!this.s.drinks.includes(r.id)) this.s.drinks.push(r.id); color = '#8affb0'; break;
        case 'soak': if (!this.s.soaks.includes(r.id)) this.s.soaks.push(r.id); color = '#8affb0'; if (!this.s.soak) this.s.soak = r.id; break;
        case 'pill': this.s.pills[r.id] = (this.s.pills[r.id] ?? 0) + r.count; color = '#9ad8ff'; break;
        case 'dew': this.s.dew += r.count; color = '#bfe8ff'; break;
      }
      if (!quiet) g.hud.toast(`Found ${rewardName(r)}`, color);
    }
    g.audio.play('pickup');
    g.requestSave();
  }

  private autoSlotCurio(id: CurioId) {
    const n = this.curioSlotCount;
    for (let i = 0; i < n; i++) if (!this.s.curioSlots[i]) {
      this.s.curioSlots[i] = id;
      this.game.player.computeStats(this.game.inventory);
      return;
    }
  }

  /**
   * Opens a chest: rolls its loot for the current chapter and grants it. World track: call
   * `game.journey.openChest(kind, pos)` when the player opens a chest. Returns what was granted.
   */
  openChest(kind: ChestKind, pos?: THREE.Vector3): Reward[] {
    const g = this.game;
    const level = g.lootLevel();
    const loot = rollChestLoot(kind, level, g.chapter, this.owned);
    this.grant(loot);
    if (pos) {
      const col = kind === 'normal' ? 0xffd27a : kind === 'legendary' ? 0xffa424 : 0x7ad8ff;
      g.vfx.beam(pos, col, kind === 'normal' ? 4 : 8, 1.2, kind === 'normal' ? 0.6 : 1);
      g.vfx.twinkle(pos, 1.2, kind === 'normal' ? 6 : 14);
    }
    if (kind !== 'normal') g.audio.play('legendary');
    return loot;
  }

  /** Records a found lore note. Returns true the first time. */
  findLore(id: string): boolean {
    const note = LORE_BY_ID[id];
    if (!note || this.s.lore.includes(id)) return false;
    this.s.lore.push(id);
    this.game.hud.toast(`Lore found: ${note.title} — read it in the Journal`, '#e8d8b0');
    this.game.audio.play('pickup');
    this.game.requestSave();
    return true;
  }

  /** First defeat of a chapter boss: the relic (a passive and a bonus spark), a curio and a set piece. */
  onBossDefeated(chapter: number, level: number) {
    const st = STORY[chapter];
    const g = this.game;
    const rewards: Reward[] = [{ kind: 'dew', count: 1 }, { kind: 'item', item: generateSetItem(level, CHAPTER_SET[Math.min(chapter, CHAPTER_SET.length - 1)]) }];
    if (st && !this.s.relics.includes(st.relic.id)) {
      this.s.relics.push(st.relic.id);
      this.s.bonusSparks++;
      rewards.push({ kind: 'curio', id: BOSS_CURIO[chapter] ?? 'lotusSeed' });
      g.hud.toast(`Relic recovered: ${st.relic.name} · +1 Spark`, '#ffd46a');
      g.player.computeStats(g.inventory);
    }
    this.grant(rewards);
  }

  // -------------------------------------------------------------------------
  // Medicines and buffs
  // -------------------------------------------------------------------------

  usePill(id: PillId) {
    const n = this.s.pills[id] ?? 0;
    const p = this.game.player;
    if (n <= 0 || !p.alive) return false;
    this.s.pills[id] = n - 1;
    const def = PILLS[id];
    if (id === 'incense') {
      this.s.incense = true;
      this.game.hud.toast('Keeper\'s incense burns: your Will is safe if you fall', '#ffd27a');
    } else if (def.buff) {
      this.addBuff(def.buff, def.dur ?? 30);
      if (id === 'clearMind') p.focus = 3;
      this.game.hud.toast(`${def.name}: ${def.desc}`, '#9ad8ff');
    }
    this.game.audio.play('drink');
    this.game.requestSave();
    return true;
  }

  addBuff(id: BuffId, dur: number) {
    this.buffs[id] = Math.max(this.buffs[id] ?? 0, dur);
    this.game.player.computeStats(this.game.inventory);
  }
  buff(id: BuffId) {
    return (this.buffs[id] ?? 0) > 0;
  }
  activeBuffs(): [string, number][] {
    return (Object.entries(this.buffs) as [BuffId, number][]).filter(([, t]) => t > 0).map(([id, t]) => [BUFF_NAMES[id], t]);
  }

  /** Called when the gourd's sip lands: drink extras and the soak. */
  onDrink() {
    const p = this.game.player;
    const d = DRINKS[this.s.drink];
    if (d.fury) p.fury = Math.min(100, p.fury + d.fury);
    if (d.buff) this.addBuff(d.buff, 12);
    if (this.has('cinnabar')) {
      p.mana = Math.min(p.stats.maxMana, p.mana + 30);
      p.fury = Math.min(100, p.fury + 15);
    }
    switch (this.s.soak) {
      case 'gojiBerry': this.addBuff('gojiBerry', 20); break;
      case 'ginseng': p.mana = Math.min(p.stats.maxMana, p.mana + 40); break;
      case 'boneSnow': this.addBuff('boneSnow', 15); break;
      case 'tigerBone': p.focus = Math.min(3, Math.floor(p.focus) + 1); break;
    }
  }

  // -------------------------------------------------------------------------
  // Shrine offerings (only while standing at a lit Keeper's Shrine)
  // -------------------------------------------------------------------------

  atShrine(): boolean {
    const p = this.game.player.pos;
    return this.game.level.shrines.some((s) => s.lit && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 6);
  }

  pillPrice(id: PillId) {
    return Math.round(PILLS[id].price * (1 + this.game.ngLevel * 0.5));
  }
  buyPill(id: PillId) {
    const price = this.pillPrice(id);
    if (!this.atShrine() || this.game.inventory.gold < price) return false;
    this.game.inventory.gold -= price;
    this.s.pills[id] = (this.s.pills[id] ?? 0) + 1;
    this.game.audio.play('coin');
    this.game.requestSave();
    return true;
  }

  upgradeGourd() {
    const lvl = this.s.gourdLevel;
    const cost = gourdUpgradeCost(lvl);
    if (!this.atShrine() || lvl >= GOURD_MAX || this.s.dew < cost.dew || this.game.inventory.gold < cost.will) return false;
    this.s.dew -= cost.dew;
    this.game.inventory.gold -= cost.will;
    this.s.gourdLevel++;
    this.game.player.computeStats(this.game.inventory);
    this.game.player.refillGourd();
    this.game.audio.play('levelup');
    this.game.requestSave();
    return true;
  }

  temper(it: Item) {
    const cost = temperCost(it);
    if (!this.atShrine() || (it.plus ?? 0) >= MAX_TEMPER || this.game.inventory.gold < cost) return false;
    this.game.inventory.gold -= cost;
    it.plus = (it.plus ?? 0) + 1;
    this.game.player.computeStats(this.game.inventory);
    this.game.audio.play('seal');
    this.game.requestSave();
    return true;
  }

  // -------------------------------------------------------------------------
  // Death and recovery of Will
  // -------------------------------------------------------------------------

  /** On death: carried Will drops at the spot (an older unrecovered drop is lost), unless incense burns. */
  onDeath(at: THREE.Vector3) {
    const g = this.game;
    const carried = g.inventory.gold;
    if (this.s.incense) {
      this.s.incense = false;
      g.hud.toast('The Keeper\'s incense guarded your Will', '#ffd27a');
    } else {
      const lost = this.s.willDrop?.amount ?? 0;
      if (lost > 0) g.hud.toast(`${lost} Will was lost forever`, '#ff6a5a');
      this.clearMarker();
      this.s.willDrop = carried > 0 ? { chapter: g.chapter, x: at.x, y: at.y, z: at.z, amount: carried } : null;
      g.inventory.gold = 0;
    }
    this.buffs = {};
    g.requestSave();
  }

  private clearMarker() {
    this.marker.label?.remove();
    this.marker.beam?.remove();
    this.marker.label = null;
    this.marker.beam = null;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.player;
    // Buffs
    let changed = false;
    for (const k of Object.keys(this.buffs) as BuffId[]) {
      const t = this.buffs[k]!;
      this.buffs[k] = t - dt;
      if (t > 0 && t - dt <= 0) changed = true;
    }
    if (this.buff('lotusPill') && p.alive) p.heal(p.stats.maxHp * 0.02 * dt);
    if (changed) p.computeStats(g.inventory);

    // Will drop marker and recovery
    const d = this.s.willDrop;
    if (!d || d.chapter !== g.chapter) {
      if (this.marker.label || this.marker.beam) this.clearMarker();
      return;
    }
    this.tmp.set(d.x, d.y, d.z);
    if (!this.marker.label || !this.marker.label.el.isConnected) {
      this.marker.label?.remove();
      this.marker.label = g.hud.addLabel(this.tmp, `Lost Will · ${d.amount}`, '#9ad8ff', 'will-label');
    }
    if (!this.marker.beam) this.marker.beam = g.vfx.beam(this.tmp, 0x7ad8ff, 5, 1e6, 0.55);
    this.marker.pulse -= dt;
    const dist = Math.hypot(p.pos.x - d.x, p.pos.z - d.z);
    if (this.marker.pulse <= 0 && dist < 40) {
      this.marker.pulse = 1.4;
      g.vfx.twinkle(this.tmp, 0.8, 4, 0x9ad8ff);
    }
    if (p.alive && dist < 1.8) {
      g.inventory.gold += d.amount;
      g.hud.toast(`Recovered ${d.amount} Will`, '#9ad8ff');
      g.vfx.shockwave(this.tmp, 3, 0x7ad8ff, 0.5);
      g.vfx.twinkle(this.tmp, 1.4, 12, 0x9ad8ff);
      g.audio.play('legendary');
      this.s.willDrop = null;
      this.clearMarker();
      g.requestSave();
    }
  }

  /** Short line of the active stance, buffs and incense for the stance HUD. */
  get curioNames() {
    return this.s.curioSlots.slice(0, this.curioSlotCount).filter((c): c is CurioId => !!c).map((c) => CURIOS[c].name);
  }
}

export { DRINKS, SOAKS };
