# Monkey King ARPG (web, offline-first) — Analysis & Build Plan

Source: 48 frames (1280×720) from a "Black Myth: Wukong Mobile" gameplay video.
Subtitles in the frames are the video creator's commentary, not game UI.

---

## 1. Frame analysis

### 1.1 Genre & camera
- **Genre:** isometric action-RPG with loot. It plays far more like **Diablo** than Hades: enemies drop
  gear with rarity-coloured name plates, plus gold piles, XP and level-ups. Fights are big hordes
  cleared with sweeping AoE, not one-on-one duels.
- **Camera:** fixed-yaw, high 3/4 perspective at a **~55° pitch** and a fairly long distance, so the player
  sits a little below screen centre. It never rotates; it follows smoothly with slight lag and
  shakes on heavy hits. Perspective (not orthographic) with a moderate FOV (~35–40°).
  Nearby rooftops and foliage crowd the screen edges for depth.
- **Pacing:** a linear path through a mountain temple: forest clearing → stone courtyard → stairs → pavilion
  → large plaza arena (horde + boss).

### 1.2 Level / environment (Chapter 1)
- Title card on entry: **"第一章 / 山海观"** ("Chapter 1 / Mountain-Sea Temple"), large brush-calligraphy text that fades in and out.
- Location label under the minimap: **"五庄·雨 (140年)"** (Wuzhuang · Rain).
- Mood: night with rain, dark blue-green fog, low-contrast ambient light, warm pools of light around lanterns.
- Set dressing seen:
  - Chinese temple architecture: curved dark-grey tile roofs with upturned eaves, red wooden pillars, paper lanterns
  - Long stone staircases; flagstone courtyards with cracked tiles and rubble
  - Stone guardian/lion statues, a stone pagoda lantern, large rock outcrops (with a white dragon/beast rock carving)
  - Dense ferns, grass, bushes, pine and bamboo
  - Wooden barrels, an incense urn / bronze bell (breakable)
  - Scattered broken stones and debris that stay on the ground after fights
- **Destruction:** rocks, barrels and props shatter into chunks when hit (the video calls this out as "真实的破碎打击系统", a realistic shatter/impact system).

### 1.3 Player character: "小猴子" (Little Monkey)
- Monkey warrior with a **red/maroon cloak**, light armour and a long **staff**.
- Moveset seen:
  | # | Ability | Visual |
  |---|---------|--------|
  | 1 | Basic staff combo (3–4 hits) | Wide **orange/gold crescent slash arcs**, sparks, small white damage numbers |
  | 2 | Spin / whirlwind | **Golden circular ground shockwave** (big translucent ring) hitting everything around the player; can be used while moving |
  | 3 | Flaming staff | Staff wrapped in **fire and golden chains**; long sweeping fire swipes and thrusts |
  | 4 | Ground slam | Leap and smash; **yellow impact ring**, cracks, upward debris |
  | 5 | Jade/poison wind | **Green energy blast or cloud** cone ahead of the player |
  | 6 | **Transform: Monkey King** ("变身猴王") | White-haired, glowing **golden armoured form** with a large flaming staff; bigger, faster attacks; the skill icon changes while active |
  | – | Dodge/dash | Short burst with a dust puff (implied by movement) |
- Level up: a golden light pillar plus **"LvL Up ⬆"** floating text.

### 1.4 Enemies
- **Spiderlings:** small, fast, in swarms, with a pale skull-like head. Red ground circle under them = aggro/attack telegraph.
- **Armoured spider:** large, grey armoured abdomen with a **glowing red back**, slow, tanky, leaps and stabs.
- **Spider-human hybrid** (pale torso on a spider body): mid-tier.
- **Boss: winged yaoguai lord:** tall dark figure with **black feather wings**, wielding an ornate **golden spear/staff**.
  Casts **green aura spells** (green pillar or cloud). A large red telegraph circle under it shows where it will slam.
- All enemies: a small **red HP bar** above them; **red ground circles** to telegraph attacks; elites are also ringed in red.

### 1.5 Loot & economy
- Drops burst out on kill: gear name plates hover above the item, colour-coded by rarity:
  - white (common) → blue (magic) → **purple** (rare) → **orange/gold** (legendary) → **red** (set/mythic).
  - Names are affix chains, e.g. "碧石的 灼热之 神话 末日胸甲" ("Jade Searing Mythic Doom Chestplate").
  - Item slots seen: chest armour, gauntlets/gloves ("护手"), boots, relic/heart ("火之开心").
- **Gold** piles labelled "89g", "1,264g", "3,360g", "7,350g".
- Legendary drops shoot a tall **light beam** in the rarity colour.
- Gear changes the playstyle ("装备…不同的打法", "gear gives… different playstyles"), Diablo-style legendary effects.

### 1.6 HUD (mobile layout, landscape)
- **Top-left:** circular monkey portrait, name plate on a parchment strip, **red HP bar**, **blue mana bar**.
- **Top-right:** square minimap (stone/paper texture, red player arrow) with the location text below it.
- **Bottom-left:** floating **virtual joystick** (white knob, faint ring).
- **Bottom-right:** big circular **attack button** (crossed-blades sigil inside a runic ring), with
  **4 round skill buttons** arranged in an arc around it (face/mask icons, rune icons). Skills dim on cooldown,
  and the transform icon swaps while transformed.
- Floating combat text: white damage numbers, item name plates, gold amounts.

### 1.7 Audio (implied)
Heavy staff impacts, rock shatter, fire whoosh, spider screech, coin pickup, a level-up chime, rain ambience,
plus a Chinese traditional + orchestral score (erhu, drums).

---

## 2. Assets

**We will not rip assets from the video.** The footage is copyrighted, and frames from compressed video can't
be turned into usable models or animations anyway. The frames are **reference only**, for camera, palette, layout and timing.
All shipped assets are original (made by us or generated procedurally) or **CC0** licensed.

| Category | Source plan |
|----------|-------------|
| Player (monkey + staff + cape), Monkey King form | Original low-poly model (Blender), rigged; or a stylised procedural rig built in code for the prototype |
| Animations (idle, run, 4-hit combo, spin, slam, dodge, hit, die, transform) | Hand-keyed in Blender, or retargeted from CC0 packs (e.g. Quaternius animation library) |
| Spiders (3 sizes), boss | Original low-poly models; spider legs driven by procedural IK in code (cheap and looks great) |
| Environment kit (roof modules, pillars, stairs, flagstones, statues, lanterns, rocks, barrels, ferns, pines, bamboo) | Original modular low-poly kit + CC0 nature packs (Quaternius / Kenney) |
| Pre-fractured props | Pre-broken pieces exported per prop (or Voronoi-fractured in code at load) |
| VFX (slash arcs, golden ring, fire, chains, green blast, light beams, sparks, debris, rain) | Custom shaders + GPU particles, made in code with a few CC0 noise/gradient textures |
| UI (portrait, bars, minimap frame, skill icons, buttons, calligraphy title) | Original SVG/PNG art; free-licence fonts (e.g. Ma Shan Zheng / ZCOOL, both OFL) |
| Audio | CC0 SFX (freesound CC0, Kenney) + original or CC0 music |

---

## 3. Tech stack

- **Engine:** Three.js (WebGL2), plain TypeScript, built with **Vite**.
- **Physics/collision:** our own lightweight system: circle-vs-circle for actors and a navmesh/grid for walls
  (no heavy physics engine needed). Rapier (WASM) only for debris, and only if needed.
- **Models:** glTF/GLB with Draco/meshopt compression and KTX2 textures.
- **Offline:**
  1. **PWA:** a service worker precaches every asset, so after the first visit the game is installable on phone and PC and runs with no connection.
  2. **Single-folder build:** `dist/` can be zipped and served by any static server or opened from a local server; we'll also try a
     single-file `index.html` build for the smallest prototype.
- **Saves:** IndexedDB (character, inventory, unlocked chapters), with localStorage as a fallback.
- **Input:** one action layer fed by:
  - Keyboard + mouse: WASD to move, LMB to attack, Space to dodge, 1–4 for skills, R to transform, mouse aim optional
  - Gamepad API
  - Touch: floating joystick + attack button + skill arc, matching the reference layout, with multitouch

## 4. Performance budget (mobile-first)
- Target: 60 fps on mid-range phones (with a 30 fps fallback mode).
- Cap devicePixelRatio at 1.5 on mobile; automatic quality tiers (shadows, particles, render scale).
- ≤150k triangles on screen, ≤100 draw calls: InstancedMesh for grass, ferns, rocks and spiders; merged static level chunks.
- Lighting: one directional "moon" light + baked ambient occlusion/lightmaps; lanterns as cheap fake point lights (emissive + light decals).
- Height fog + vignette + light bloom (half-res) for the moody look; rain as one instanced particle system.
- Object pools for enemies, projectiles, damage numbers and loot.
- Total download goal: **< 40 MB** for Chapter 1.

---

## 5. Game systems

1. **Camera rig:** fixed 55° pitch, smooth follow, impact shake, slight zoom-out when transformed or during the boss fight.
2. **Character controller:** movement with acceleration, snap-to-input facing, dodge with i-frames, soft auto-aim to the nearest enemy in a cone.
3. **Combat core:**
   - Hitboxes per animation frame (arc/circle/cone shapes)
   - Hit-stop (40–80 ms), knockback, enemy flash, damage numbers, crit colour
   - Combo buffer windows
4. **Skills:** data-driven definitions (mana cost, cooldown, shape, VFX, damage scaling): whirlwind, flaming staff, slam, jade wind.
5. **Transformation:** a meter fills from dealing damage; 15 s of Monkey King form with a swapped moveset and stats.
6. **Enemy AI:** state machines (idle → aggro → approach → telegraph → attack → recover); swarm separation; spawn waves triggered by zone volumes.
7. **Boss:** a multi-phase pattern script: spear sweep, leap slam with a red circle, green poison zone, summons spiderlings; flies away at 50% HP.
8. **Loot:** drop tables; rarity roll; affix generator (prefix + suffix + base item); beams and name plates; walk-over gold pickup; tap or click to pick up gear.
9. **Progression:** XP and levels, stat points, 5 equipment slots (weapon, chest, gloves, boots, relic), a few legendary effects that change skills
   (e.g. "whirlwind leaves fire trail").
10. **Destruction:** breakable props swap to fractured pieces and get an impulse; debris persists, then fades.
11. **UI:** HUD, inventory/equipment screen, pause/settings (quality, control layout, volume), chapter title card, death/respawn screen, minimap rendered from level layout.
12. **Audio:** Web Audio with pooled SFX, music layers (explore and combat crossfade), and audio unlocked on first touch.

---

## 6. Project structure
```
/index.html
/src
  main.ts             boot, loop, quality tiers
  core/               ecs-lite entities, time, pools, events
  render/             renderer, camera rig, post-fx, shaders/
  input/              keyboard, mouse, gamepad, touch-ui
  game/
    player/           controller, combat, skills, transform
    enemies/          spider, spiderling, boss, ai/
    combat/           hitboxes, damage, hitstop, numbers
    loot/             tables, affixes, drops, inventory
    world/            level loader, zones, spawners, breakables
  ui/                 hud, inventory, menus (DOM/CSS over canvas)
  audio/
  save/
/public/assets        models/, textures/, audio/, fonts/, ui/
/public/sw.js         (generated by vite-plugin-pwa)
```

---

## 7. Milestones

| M | Goal | Done when |
|---|------|-----------|
| **M0 Setup** | Vite + TS + Three.js, PWA config, deploy to GitHub Pages | Blank scene loads offline after the first visit on phone and PC |
| **M1 Graybox** | Camera rig, capsule player, joystick + keyboard, a graybox courtyard with collision | Moving feels right on both devices |
| **M2 Combat core** | Staff combo, dodge, hitboxes, hit-stop, damage numbers, dummy enemies | Hitting things feels punchy |
| **M3 Enemies** | Spiderling + armoured spider with AI, telegraphs, HP bars, waves | Can clear a horde fight |
| **M4 Skills + VFX** | Whirlwind ring, flaming staff, slam, jade wind, mana; skill-button arc UI | All 4 skills playable with cooldowns |
| **M5 Loot & progression** | Drops, rarity beams, name plates, gold, inventory, XP/level-up | The Diablo loop works |
| **M6 Art pass** | Player and enemy models + animations, temple environment kit, rain/fog/lantern lighting, breakables | Chapter 1 looks like the reference mood |
| **M7 Transform + Boss** | Monkey King form, winged yaoguai boss with phases | Full Chapter 1 playthrough (~10–15 min) |
| **M8 Polish** | Audio, title card, menus, save/load, quality tiers, perf on low-end phones | 60 fps mid-range, installable, works fully offline |

## 8. Open questions for you
1. Chinese UI text like the reference, English, or both (toggle)?
2. Hosting: GitHub Pages (simplest for PWA install) OK?
3. Art direction: stylised low-poly (fast, light on mobile) or as close to realistic as the browser allows (heavier)?
4. Scope: one polished chapter first, then more chapters and bosses?

---

## 9. Status

**v1 is implemented.** It covers M0–M5 and M7 for Chapter 1, with a first art pass (M6) using stylised
procedural low-poly art. Decisions taken:

- English UI
- GitHub Pages hosting
- Stylised low-poly art, which runs well on both PC and mobile
- Chapter 1 first

See the README for the feature list.

Next candidates:

- Hand-made rigged models and keyframed animations
- A merchant/shrine to spend gold
- More legendary powers
- Chapter 2
- Optional bloom on High quality
