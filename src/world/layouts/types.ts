import type { BreakableKind } from '../props';
import type { Shape, TerrainDef } from '../terrain';
import type { WaterLook } from '../water';

/** Enemy kinds a layout can place (mirrors SpawnKind in level.ts). */
export type LayoutKind = 'spiderling' | 'armored' | 'weaver' | 'ghoul' | 'wolf' | 'archer' | 'bone' | 'frost';

export type XZ = [number, number];

/**
 * One chapter's hand-designed map. Coordinates are metres; +Z points towards the default isometric camera
 * (south), so the critical path mostly climbs northwards (-Z), away from the camera.
 */
export interface LayoutDef {
  id: string;
  terrain: TerrainDef;
  /** Ground palette: walkable floors and the wild slopes. */
  palette: {
    grass: number; moss: number; dirt: number; rock: number; sand?: number; snow?: number; ice?: number;
    /** Colour the wild ground fades to with height (ridge tops). */
    high: number;
    /** Wild ground right next to the walkable regions. */
    wild: number;
  };
  water: WaterLook;
  /** Main-line areas, one per chapter zone (same order and count as ChapterDef.zones). */
  zones: LayoutZone[];
  /** Seal gates across north-south choke points (crossing is blocked while active). */
  gates: { z: number; x0: number; x1: number }[];
  /** Boss spawn point and the direction it faces. */
  boss: XZ;
  /** Critical path waypoints from the first shrine to the boss (bots, debug, cutscenes). */
  route: XZ[];
  /** Named places for the location banner (first match wins), beyond the zone names. */
  regions: { name: string; shape: Shape }[];
  props: PropPlace[];
  foliage: Biome;
  breakables: [BreakableKind, number, number][];
  chests: ChestDef[];
  collectables: CollectDef[];
  encounters: EncounterDef[];
  doors: DoorDef[];
  /** Brazier puzzles: light every brazier (walk past it) to break the seal on `chest`. */
  puzzles: { id: string; chest: string; braziers: XZ[] }[];
}

export interface LayoutZone {
  checkpoint: XZ;
  /** Shrine position (defaults to beside the checkpoint). */
  shrine?: XZ;
  /** Entering this shape starts the fight. */
  trigger: Shape;
  /** Enemies spawn at walkable points in this rectangle. */
  area: { x0: number; x1: number; z0: number; z1: number };
  opensGate?: number;
  closesGate?: number;
}

export type PropKind =
  | 'pavilion' | 'pavilionSmall' | 'hall' | 'statue' | 'lantern' | 'pillar' | 'balustrade' | 'paifang'
  | 'rockArch' | 'hoodoo' | 'boulder' | 'ribArch' | 'skull' | 'bonePile' | 'iceSpire' | 'banner' | 'stele'
  | 'tent' | 'overhang' | 'kayPillar' | 'rubble' | 'brazierStand'
  /** Any nature.glb prop by `name` (instanced); `r` adds a collider of that radius. */
  | 'nature';

export interface PropPlace {
  kind: PropKind;
  at: XZ;
  rot?: number;
  /** Scale (for rocks and arches) or length (balustrade). */
  s?: number;
  /** Explicit base height (defaults to the standing height there). */
  y?: number;
  /** nature.glb prop name for kind 'nature'. */
  name?: string;
  /** Collider radius (kind 'nature'). */
  r?: number;
  /** Second size parameter (overhang depth). */
  d?: number;
}

/** Foliage palettes and densities for the scatter pass. Names are nature.glb props. */
export interface Biome {
  trees: [string, number][];
  /** Tree density 0..1 per scatter point in the forest band. */
  treeDensity: number;
  /** Distance band (from walkable ground) where trees grow. */
  treeBand: [number, number];
  /** Bushes, ferns, rocks along the edges of the walkable ground. */
  under: [string, number][];
  underDensity: number;
  /** Ground cover on grassy walkable floors (no collision). */
  cover: [string, number][];
  coverDensity: number;
  /** Rocks scattered on steep wild slopes. */
  slopeRocks: [string, number][];
  /** Cheap silhouettes on the far ridges. */
  far: 'pine' | 'snowpine' | 'none';
  /** Scale range for trees. */
  treeScale: [number, number];
}

export type ChestKind = 'normal' | 'ornate' | 'sealed';
export interface ChestDef {
  id: string;
  at: XZ;
  rot?: number;
  kind: ChestKind;
  /** Sealed chests: the encounter whose defeat (or puzzle whose completion) breaks the seal. */
  sealedBy?: string;
}

export interface CollectDef {
  id: string;
  at: XZ;
  kind: 'herb' | 'relic' | 'lore';
  /** Lore text shown on pickup. */
  text?: string;
}

export interface EncounterDef {
  id: string;
  at: XZ;
  /** Trigger radius around `at`. */
  r: number;
  kinds: [LayoutKind, number][];
  /** First enemy of this kind is an elite. */
  elite?: LayoutKind;
  /** Level offset from the surrounding zone. */
  level?: number;
}

/** A one-way shortcut: a barred gate that opens only from the `from` side. */
export interface DoorDef {
  id: string;
  a: XZ;
  b: XZ;
  from: XZ;
  /** 'gate' (wooden barred gate) or 'slab' (stone slab that sinks). */
  look?: 'gate' | 'slab';
}
