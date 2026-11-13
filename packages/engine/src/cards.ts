import type { Card, CardId, Element, FusionRule, Tag } from "./types";

function card(
  id: CardId,
  name: string,
  element: Element,
  tags: Tag[],
  atk: number,
  def: number,
  fusionOnly = false,
): Card {
  return { id, name, element, tags, atk, def, fusionOnly };
}

const BASE: Card[] = [
  card("ember-fox", "Ember Fox", "flame", ["beast"], 1200, 800),
  card("cinder-whelp", "Cinder Whelp", "flame", ["dragon"], 1400, 1000),
  card("ash-duelist", "Ash Duelist", "flame", ["warrior"], 1500, 1100),
  card("pyre-adept", "Pyre Adept", "flame", ["mage"], 1300, 1200),
  card("furnace-drone", "Furnace Drone", "flame", ["machine"], 1100, 1500),
  card("flare-hawk", "Flare Hawk", "flame", ["bird"], 1000, 700),

  card("moss-boar", "Moss Boar", "forest", ["beast"], 1300, 1300),
  card("thorn-sprite", "Thorn Sprite", "forest", ["plant"], 900, 1100),
  card("vine-archer", "Vine Archer", "forest", ["warrior", "plant"], 1400, 900),
  card("grove-sage", "Grove Sage", "forest", ["mage"], 1200, 1600),
  card("bramble-wyrm", "Bramble Wyrm", "forest", ["dragon", "plant"], 1600, 1200),
  card("seedling", "Seedling", "forest", ["plant"], 600, 900),
  card("canopy-owl", "Canopy Owl", "forest", ["bird"], 1100, 1200),

  card("gale-falcon", "Gale Falcon", "wind", ["bird"], 1500, 800),
  card("zephyr-monk", "Zephyr Monk", "wind", ["warrior"], 1300, 1400),
  card("cloud-serpent", "Cloud Serpent", "wind", ["dragon"], 1700, 1000),
  card("breeze-wisp", "Breeze Wisp", "wind", ["mage"], 800, 800),
  card("kite-glider", "Kite Glider", "wind", ["machine", "bird"], 1200, 1000),
  card("dust-jackal", "Dust Jackal", "wind", ["beast"], 1100, 900),
  card("storm-crow", "Storm Crow", "wind", ["bird"], 1300, 900),

  card("stone-ram", "Stone Ram", "earth", ["beast"], 1400, 1500),
  card("clay-sentinel", "Clay Sentinel", "earth", ["warrior"], 1000, 1800),
  card("quarry-golem", "Quarry Golem", "earth", ["machine"], 1600, 1700),
  card("root-shaman", "Root Shaman", "earth", ["mage", "plant"], 1100, 1300),
  card("burrow-drake", "Burrow Drake", "earth", ["dragon"], 1500, 1400),
  card("pebble-tortoise", "Pebble Tortoise", "earth", ["beast"], 500, 1700),
  card("iron-digger", "Iron Digger", "earth", ["machine"], 1300, 1400),

  card("spark-ferret", "Spark Ferret", "thunder", ["beast"], 1000, 600),
  card("volt-lancer", "Volt Lancer", "thunder", ["warrior"], 1600, 900),
  card("storm-caller", "Storm Caller", "thunder", ["mage"], 1500, 1000),
  card("tesla-turret", "Tesla Turret", "thunder", ["machine"], 1400, 1600),
  card("thunder-roc", "Thunder Roc", "thunder", ["bird"], 1700, 1100),
  card("static-drakeling", "Static Drakeling", "thunder", ["dragon"], 1300, 900),

  card("tide-otter", "Tide Otter", "water", ["beast", "aqua"], 1100, 1000),
  card("reef-guard", "Reef Guard", "water", ["warrior", "aqua"], 1300, 1500),
  card("brine-serpent", "Brine Serpent", "water", ["dragon", "aqua"], 1600, 1300),
  card("mist-oracle", "Mist Oracle", "water", ["mage"], 1200, 1400),
  card("kelp-lurker", "Kelp Lurker", "water", ["plant", "aqua"], 1000, 1500),
  card("harbor-gull", "Harbor Gull", "water", ["bird"], 900, 800),
  card("pearl-clam", "Pearl Clam", "water", ["aqua"], 400, 1800),
];

const FUSIONS: Card[] = [
  card("beast-rider", "Beast Rider", "earth", ["beast", "warrior"], 1900, 1500, true),
  card("briar-stag", "Briar Stag", "forest", ["beast", "plant"], 1900, 1700, true),
  card("sky-lancer", "Sky Lancer", "wind", ["bird", "warrior"], 1900, 1400, true),
  card("twin-fang-chimera", "Twin-Fang Chimera", "flame", ["beast"], 2000, 1600, true),
  card("bloom-witch", "Bloom Witch", "forest", ["mage", "plant"], 2000, 1800, true),
  card("tide-sorcerer", "Tide Sorcerer", "water", ["mage", "aqua"], 2000, 1900, true),
  card("griffin", "Griffin", "wind", ["bird", "beast"], 2100, 1700, true),
  card("iron-vanguard", "Iron Vanguard", "earth", ["machine", "warrior"], 2100, 2200, true),
  card("storm-archmage", "Storm Archmage", "thunder", ["mage"], 2100, 2000, true),
  card("dragon-knight", "Dragon Knight", "flame", ["dragon", "warrior"], 2200, 1800, true),
  card("storm-phoenix", "Storm Phoenix", "thunder", ["bird"], 2200, 1600, true),
  card("rune-automaton", "Rune Automaton", "earth", ["machine", "mage"], 2200, 2300, true),
  card("tidal-behemoth", "Tidal Behemoth", "water", ["beast", "aqua"], 2300, 2100, true),
  card("elder-treant", "Elder Treant", "forest", ["plant"], 2300, 2500, true),
  card("arcane-wyvern", "Arcane Wyvern", "wind", ["dragon", "mage"], 2400, 1900, true),
  card("steel-wyrm", "Steel Wyrm", "thunder", ["dragon", "machine"], 2400, 2400, true),
  card("thorn-hydra", "Thorn Hydra", "forest", ["dragon", "plant"], 2500, 2000, true),
  card("siege-colossus", "Siege Colossus", "earth", ["machine"], 2600, 2600, true),
  card("abyss-leviathan", "Abyss Leviathan", "water", ["dragon", "aqua"], 2700, 2300, true),
  card("ancient-tyrant", "Ancient Tyrant", "flame", ["dragon"], 3000, 2500, true),
];

export const CARDS: readonly Card[] = [...BASE, ...FUSIONS];

export const FUSION_RULES: readonly FusionRule[] = [
  { a: "beast", b: "warrior", results: ["beast-rider"] },
  { a: "beast", b: "plant", results: ["briar-stag"] },
  { a: "bird", b: "warrior", results: ["sky-lancer"] },
  { a: "beast", b: "beast", results: ["twin-fang-chimera"] },
  { a: "mage", b: "plant", results: ["bloom-witch"] },
  { a: "aqua", b: "mage", results: ["tide-sorcerer"] },
  { a: "beast", b: "bird", results: ["griffin"] },
  { a: "machine", b: "warrior", results: ["iron-vanguard"] },
  { a: "mage", b: "mage", results: ["storm-archmage"] },
  { a: "dragon", b: "warrior", results: ["dragon-knight"] },
  { a: "bird", b: "bird", results: ["storm-phoenix"] },
  { a: "machine", b: "mage", results: ["rune-automaton"] },
  { a: "aqua", b: "beast", results: ["tidal-behemoth"] },
  { a: "plant", b: "plant", results: ["elder-treant"] },
  { a: "dragon", b: "mage", results: ["arcane-wyvern"] },
  { a: "dragon", b: "machine", results: ["steel-wyrm"] },
  { a: "dragon", b: "plant", results: ["thorn-hydra"] },
  { a: "machine", b: "machine", results: ["siege-colossus"] },
  { a: "aqua", b: "dragon", results: ["abyss-leviathan"] },
  { a: "dragon", b: "dragon", results: ["ancient-tyrant"] },
];

const BY_ID = new Map<CardId, Card>(CARDS.map((c) => [c.id, c]));

export function findCard(id: CardId): Card | undefined {
  return BY_ID.get(id);
}

/** Use when the id is known to be valid; throws on a programming error. */
export function getCard(id: CardId): Card {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown card id: ${id}`);
  return found;
}
