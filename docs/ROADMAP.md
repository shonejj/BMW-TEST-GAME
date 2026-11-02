# Roadmap — round 4 (player feedback, 2026-11-02)

Each track is owned by one agent working in its own worktree. Tracks are merged one by one,
built, checked in the browser and deployed to GitHub Pages after each merge.

## Track A — Camera, controls, HUD, audio
- [ ] 2D side view: foreground trees/roofs/props between camera and hero must fade or be culled (screen is blocked)
- [ ] Minimap is upside down / mirrored — match world orientation and rotate with the camera
- [ ] Floating collectable labels show through walls / in the boss arena — only show near the player, in range and line of sight
- [ ] 3rd-person camera: free orbit (right stick, mouse drag, touch drag on the right half), collision pull-in
- [ ] Mobile: customise the gamepad — drag to rearrange, resize, opacity, reset; saved per device
- [ ] Music: no wall-to-wall score. Ambient beds per chapter (rain, wind, birds, water, cave), music only for combat/boss/story beats, silence between

## Track B — Characters and enemies
- [ ] Research free/CC0 rigged characters (Quaternius Universal Base Characters / modular outfits, KayKit, etc.) compatible with the UAL rig
- [ ] Hero: real skinned body with proper armour pieces, cloth, hair/fur; no box-built limbs
- [ ] Enemies and bosses: real skinned models per kind; no box primitives
- [ ] Equipment visibly changes the model (head, chest, hands, legs, feet, weapon)

## Track C — World and level design
- [ ] One hand-planned map per chapter (not one map re-tinted): distinct layout, paths, elevation (climb up ridges, stairs, cliffs)
- [ ] Chapter 1 forest: lush, dense, mountain ridges, pond/stream water, less bare floor
- [ ] Chapter 2 Yellow Wind Ridge: canyon, sand dunes, wind-carved rock, cave
- [ ] Chapter 3 Frozen Bone Sanctum: frozen lake, ice cliffs, bone halls
- [ ] Larger maps, side paths and secrets; more shrines placed at real choke points
- [ ] Per-chapter enemy rosters (no spiders outside chapter 1)
- [ ] GoW-style chests (normal, legendary, sealed) and collectables placed for exploration

## Track D — Combat, progression, items, story
- [ ] Stances (Smash / Pillar / Thrust) with their own light combos, heavy attacks and charge levels
- [ ] Skill tree that unlocks stance moves and spells, not only stat bumps
- [ ] Items with trade-offs (plus and minus), set bonuses, rarities; curios and relics that change play
- [ ] Souls-like loop: drop essence on death and recover it, enemies respawn on rest, NG+ scaling
- [ ] Story: proper narrative per chapter, lore notes as collectables, boss intros and endings
