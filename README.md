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

| | Keyboard & mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | Left joystick | Left stick |
| Aim | Mouse | Auto-aim | Right stick |
| Staff combo | Left click / J (hold) | Big button (hold) | X |
| Dodge | Space / right click | Dodge button | A |
| Skills | 1–4 or Q E R F | Skill buttons | LB RB LT RT |
| Monkey King form | T | Monkey button | Y |
| Inventory / Pause | I / Esc | Top buttons | Back / Start |

## What's in v1

- **Chapter 1** across five areas: Forest Clearing → Temple Courtyard → Stone Stairs → Upper Plaza → boss arena
- **Combat:** 3-hit staff combo with crescent slashes, a dodge with i-frames, hit-stop, screen shake and damage numbers
- **Skills:**
  - Golden Whirlwind
  - Flaming Staff
  - Cloud Slam
  - Jade Gale
  - Monkey King transformation, powered by a Fury meter
- **Enemies:**
  - Spiderlings
  - Armored Broodmothers (they leap; elites are ringed in red)
  - Web Weavers (ranged)
  - **Blackfeather Lord** boss with spear sweeps, leap slams, poison miasma, summons, an enraged phase 2 and feather barrages
- **Telegraphs:** red ground warnings before attacks
- **Loot:**
  - Five rarities (Common, Magic, Rare, Legendary, Mythic) with name plates and light beams
  - Affixes, legendary powers and gold
  - Inventory with equip / compare / salvage
- **Progression:** XP and levels, saved to localStorage; Torment (New Game+) loops after finishing the chapter
- **World:** breakable props that shatter, rain, fog, lantern light pools, a minimap and seal barriers between areas
- **Settings:** graphics quality (Low / Medium / High), volume and damage numbers

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
