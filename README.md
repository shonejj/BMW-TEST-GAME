# Monkey King: Mountain-Sea Temple

An isometric action-RPG for the web, inspired by the "Black Myth: Wukong Mobile" gameplay footage
(see [PLAN.md](PLAN.md) for the frame analysis). It runs on PC and mobile and works fully offline.

All art, animation and audio are **original and generated in code**: low-poly procedural models,
shader VFX and Web Audio synthesis. No assets were taken from the reference video.

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

- **Chapter 1:** five areas (Forest Clearing → Temple Courtyard → Stone Stairs → Upper Plaza → boss arena), plus
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
- **Audio:** fully synthesised. A bus mixer with reverb, varied sound effects, and adaptive explore/combat/boss music.
- **Performance and comfort:**
  - Frame cap (30/60), auto resolution, pooled effects and prewarmed shaders so nothing stutters mid-fight
  - Gamepad rumble and a reduced-shake option

### Using real 3D models

All characters are procedural low-poly models built in code, so the game stays small and works offline.
To get the look of a hand-crafted game, the next step is artist-made, rigged `.glb` characters and environment
props, for example from an artist or licensed asset stores. The renderer already uses three.js, so glTF assets
can be loaded with `GLTFLoader` and played back with `AnimationMixer` (see the `threejs-gltf-loading` skill in
`.claude/skills`).

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
