# Monkey King: Mountain-Sea Temple

An isometric action-RPG for the web, inspired by the "Black Myth: Wukong Mobile" gameplay footage
(see [PLAN.md](PLAN.md) for the frame analysis). It runs on PC and mobile and works fully offline.

Characters are animated with motion-captured clips from free **CC0** asset packs, dressed with costumes built
in code. Foliage uses a CC0 nature kit. VFX and Web Audio sound are made in code. No assets were taken
from the reference video. See *Credits* below.

## Play

- **Online:** GitHub Pages. After the first visit, the service worker caches everything so it works offline.
  You can also install it as an app from the browser menu ("Install app" / "Add to Home Screen").
- **Fully offline:** the build is a single self-contained `index.html`. Download it (or the
  `monkey-king-offline` artifact from the Actions run) and open it directly in a browser. No server is needed.

### Controls

| | Keyboard & mouse | Touch | Gamepad / joystick |
|---|---|---|---|
| Move | WASD / arrows | Left joystick | Left stick |
| Aim | Mouse | Auto-aim | Right stick |
| Staff combo (4 hits) | Left click (hold) | Big button (hold) | X |
| Heavy smash (hold to charge, spends Focus) | Right click (hold) | Hammer button (hold) | Y |
| Dodge roll (perfect dodge = slow-mo + Focus) | Space | Dodge button | A |
| Healing gourd | G | Gourd button | B |
| Spells (4 slots) | 1–4 | Spell buttons | LB RB LT RT |
| Monkey King form | T | Monkey button | R3 / D-pad up |
| Menu / pause | I / Esc | Top buttons | Back / Start |
| Menus | Arrows, Enter, Q/E tabs | Tap | Stick/D-pad, A, B, LB/RB |

## What's in the game

- **Look:** a retro pixel render (low-res world, dithered limited palette, outlines) or smooth, in Settings.
- **Camera styles:** Isometric, Third person, Side view (2D) and Cinematic. Switch any time with **C** (or Settings, or d-pad down).
  Tall props and foliage between the camera and the hero dissolve in every style.
- **Three chapters, three hand-designed maps:** the **Black Wind Forest** (lush forest valley, mountain ridges, Mirror Pond and a
  stream crossed by a plank bridge, a ruined temple up two flights of stairs), the **Yellow Wind Ridge** (dunes, a sandstone canyon,
  a wind cave, a switchback climb to a ruined fort and wind-carved arches) and the **Frozen Bone Sanctum** (a walkable frozen lake,
  ice cliffs, snowy pines, rib-vaulted bone halls). Each has its own terrain, elevation, paths, palette, weather, enemy roster
  (no spiders outside chapter one), boss and story beats.
- **Travel and save:** every Keeper's Shrine you light can be fast-travelled to from the **Travel** tab; chapters you unlock can be revisited.
  Progress is saved per chapter.
- **Gear you can see:** equipped staffs, armour, gloves, boots and relics change the hero, and every item has its own 3D pixel icon.
- **Checkpoints:** a Keeper's Shrine in every area. Walk up to it to heal, refill the gourd, save and set your respawn point.
- **Exploration:** side paths, hidden groves and ledges off the critical path, one-way shortcut gates, secrets behind breakable
  rubble, spirit herbs, relic shards and lore notes, and chests in three kinds — normal, **ornate** (more and better loot) and
  **sealed** ones that open only once you beat the elite guarding them or light every brazier of their puzzle. Opened chests and
  taken collectables stay that way, saved per chapter.
- **Chapter 1:** six areas (Black Wind Forest → Mirror Pond Glade → Old Pine Hollow → Temple Courtyard → Upper Terrace → boss arena), plus
  in-engine **cutscenes** for the chapter intro, the boss entrance and the victory. Cutscenes can be skipped with any button.
- **Combat:**
  - Keyframed animations with wind-up, strike and follow-through, and weapon motion trails
  - A 4-hit staff combo; a charged heavy smash that spends Focus to stagger enemies and break bosses
  - Dodge roll with perfect-dodge slow motion; a healing gourd that refills at cleared areas
- **Spells:** Golden Whirlwind, Flaming Staff, Cloud Slam, Jade Gale, Immobilize and Ring of Fire (four slots).
  The Monkey King transformation is powered by a Fury meter.
- **Self-Advance talent tree:** one point per level, across Body, Staff, Spells, Gourd and Great Sage.
- **Enemies:**
  - Spiderlings, Armored Broodmothers (they leap; elites are ringed in red), and Web Weavers
  - The **Blackfeather Lord**, with telegraphed sweeps, leaps, miasma, summons, a feather barrage and poise breaks
- **Loot:** five rarities with beams and name plates, affixes and legendary powers.
- **Menu:** Black Myth-style full-screen tabs (Self-Advance, Spells, Equipment, Inventory, Journal, Settings), with
  character art and a stat column. All of it is navigable by gamepad.
- **Visuals:**
  - Generated stone, ground, lacquer and roof-tile textures with surface relief; moonlight shadows (High); rain, mist, lantern glow
- **Audio:** recorded CC0 sound effects and a score sequenced live from real instrument samples (zither, erhu, flute, taiko, gongs), adaptive between explore, combat and boss.
- **Performance and comfort:**
  - Frame cap (30/60), auto resolution, pooled effects and prewarmed shaders so nothing stutters mid-fight
  - Gamepad rumble and a reduced-shake option

### Credits

- **Quaternius** (CC0): Universal Animation Library 1 & 2 (mannequin and mocap clips), Stylized Nature MegaKit
  (trees, rocks, ferns, grass, mushrooms and flowers for every chapter).
- **flo-bit** — *Low Poly Nature Pack* (CC0): snow-capped pines and firs, bare trees and stumps for the Frozen Bone Sanctum.
- **Kay Lousberg (KayKit)** — *Dungeon Remastered* (CC0): chests (normal and gold), pillars and rubble.
- **Kenney** and **OpenGameArt** authors incl. rubberduck, artisticdude, qubodup, LokiF, SubspaceAudio (CC0): sound effects, via
  `Legerdo/open-game-sfx-index`.
- **Versilian Community Sample Library** (CC0): dan tranh zither, drums, gong, ocarina; **aliexpress-erhu** sample set (CC0).
  `tools/build-audio.py` trims, normalises and encodes them.
- `tools/build-assets.mjs` picks the clips and props, simplifies them and compresses them with meshopt into
  `src/assets/models/*.glb`. The build inlines those files, so the single-file offline version still works.

## Develop

```bash
npm install
npm run dev      # local dev server (also reachable from your phone on the same Wi-Fi)
npm run build    # type-check + single-file production build in dist/
npm run preview  # serve the production build
```

The code is organised as:

| Path | Contents |
|---|---|
| `src/engine` | Renderer, camera, input, helpers |
| `src/game` | Player, enemies and boss, VFX, loot, save, main `Game` loop |
| `src/world` | Level layout, props, debris, rain |
| `src/ui` | HUD, touch controls, menus |
| `src/audio` | Synthesised sound and music |

## Deploy

`.github/workflows/deploy.yml` builds and deploys on every push to the default branch.
Turn it on once with **Settings → Pages → Build and deployment → Source: GitHub Actions**.
