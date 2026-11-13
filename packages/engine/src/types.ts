export const ELEMENTS = ["flame", "forest", "wind", "earth", "thunder", "water"] as const;
export type Element = (typeof ELEMENTS)[number];

export const TAGS = ["beast", "dragon", "warrior", "mage", "plant", "machine", "aqua", "bird"] as const;
export type Tag = (typeof TAGS)[number];

/** Keywords printed on some cards: answers (R4) and synergy (R5). A creature has exactly the traits of its card. */
export const TRAITS = ["venom", "guard", "pierce", "banner", "pack", "rally"] as const;
export type Trait = (typeof TRAITS)[number];

export type CardId = string;

export type Card = {
  id: CardId;
  name: string;
  element: Element;
  tags: Tag[];
  atk: number;
  def: number;
  /** printed on the card; a fusion result has its own and inherits none */
  traits: Trait[];
  /** true: reachable only by fusion, never legal in a deck */
  fusionOnly: boolean;
};

export type FusionRule = { a: Tag; b: Tag; results: CardId[] };

/** Rule settings of one match. Chosen in createMatch and never changed afterwards. */
export type Rules = {
  /** ATK and DEF added for one battle to the creature whose element beats the other's */
  elementBonus: number;
  /** PLAY actions allowed per turn, 1 to HAND_SIZE */
  playsPerTurn: number;
  /** PLAY actions allowed on turn 1, which is always the first player's; 1 to playsPerTurn */
  firstTurnPlays: number;
  /** Share of a withstood attack value that a surviving target loses from ATK and DEF until the turn ends (R3), 0 to 1 */
  wearRatio: number;
  /** ATK and DEF a Banner gives each neighbouring creature that shares a tag or its element (R5) */
  bannerBonus: number;
  /** ATK and DEF a Pack creature gets per other own creature sharing a tag or its element (R5) */
  packBonus: number;
  /** ATK and DEF a Rally creature gets while its owner has fewer life points than the opponent (R5) */
  rallyBonus: number;
};

export type PlayerId = 0 | 1;
export type Position = "attack" | "defense";

export type Creature = {
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  /** ATK and DEF lost to battles survived this turn (R3); cleared at the start of every turn */
  wear: number;
  /** R6: the opponent sees only that a creature is here and its position */
  faceDown: boolean;
};

/**
 * A creature as a player sees it. `atk` and `def` are its current values,
 * worked out by the engine; consumers never calculate them (DDR-0010).
 */
export type ViewCreature = {
  hidden: false;
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  wear: number;
  faceDown: boolean;
  atk: number;
  def: number;
};

export type PlayerState = {
  /** top of the deck is index 0 */
  deck: CardId[];
  hand: CardId[];
  /** always FIELD_SLOTS entries; null is an empty slot */
  field: (Creature | null)[];
  lifePoints: number;
};

export type EndReason = "life-points" | "deck-out" | "surrender" | "timeout";
export type MatchResult = { winner: PlayerId; reason: EndReason };

export type MatchState = {
  players: [PlayerState, PlayerState];
  active: PlayerId;
  firstPlayer: PlayerId;
  /** 1 on the first turn of the match, +1 on every END_TURN */
  turn: number;
  /** PLAY actions the active player has made this turn */
  playsUsed: number;
  result: MatchResult | null;
  rules: Rules;
};

/** Face-up unless `faceDown` is true (R6). */
export type PlayAction = { type: "PLAY"; handIndexes: number[]; slot: number; position: Position; faceDown?: boolean };
export type SetPositionAction = { type: "SET_POSITION"; slot: number; position: Position };
export type AttackAction = { type: "ATTACK"; attackerSlot: number; target: number | "direct" };
export type RevealAction = { type: "REVEAL"; slot: number };
export type EndTurnAction = { type: "END_TURN" };
export type SurrenderAction = { type: "SURRENDER" };
export type Action = PlayAction | SetPositionAction | AttackAction | RevealAction | EndTurnAction | SurrenderAction;

export type GameEvent =
  | { type: "drew"; player: PlayerId; count: number }
  | { type: "fused"; player: PlayerId; a: CardId; b: CardId; result: CardId }
  | { type: "fusion-failed"; player: PlayerId; a: CardId; b: CardId }
  /** cardId is null only in the opponent's copy of a face-down play (eventsFor) */
  | { type: "played"; player: PlayerId; slot: number; cardId: CardId | null; position: Position; faceDown: boolean; handCards: number }
  | { type: "revealed"; player: PlayerId; slot: number; cardId: CardId }
  | { type: "position-set"; player: PlayerId; slot: number; position: Position }
  | { type: "attacked"; player: PlayerId; attackerSlot: number; target: number | "direct" }
  | { type: "destroyed"; player: PlayerId; slot: number; cardId: CardId }
  | { type: "worn"; player: PlayerId; slot: number; amount: number }
  | { type: "damage"; player: PlayerId; amount: number }
  | { type: "turn-ended"; player: PlayerId }
  | { type: "match-ended"; winner: PlayerId; reason: EndReason };

export type ApplyResult =
  | { ok: true; state: MatchState; events: GameEvent[] }
  | { ok: false; error: string };

export type PlayerView = {
  you: PlayerId;
  active: PlayerId;
  firstPlayer: PlayerId;
  turn: number;
  playsUsed: number;
  result: MatchResult | null;
  rules: Rules;
  self: { hand: CardId[]; deckCount: number; field: (ViewCreature | null)[]; lifePoints: number };
  opponent: { handCount: number; deckCount: number; field: (ViewCreature | null)[]; lifePoints: number };
};
