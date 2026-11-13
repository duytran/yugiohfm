export const ELEMENTS = ["flame", "forest", "wind", "earth", "thunder", "water"] as const;
export type Element = (typeof ELEMENTS)[number];

export const TAGS = ["beast", "dragon", "warrior", "mage", "plant", "machine", "aqua", "bird"] as const;
export type Tag = (typeof TAGS)[number];

export type CardId = string;

export type Card = {
  id: CardId;
  name: string;
  element: Element;
  tags: Tag[];
  atk: number;
  def: number;
  /** true: reachable only by fusion, never legal in a deck */
  fusionOnly: boolean;
};

export type FusionRule = { a: Tag; b: Tag; results: CardId[] };

/** Rule settings of one match. Chosen in createMatch and never changed afterwards. */
export type Rules = {
  /** ATK and DEF added for one battle to the creature whose element beats the other's */
  elementBonus: number;
};

export type PlayerId = 0 | 1;
export type Position = "attack" | "defense";

export type Creature = {
  cardId: CardId;
  position: Position;
  hasAttacked: boolean;
  positionChanged: boolean;
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
  /** whether the active player has used their PLAY this turn */
  hasPlayed: boolean;
  result: MatchResult | null;
  rules: Rules;
};

export type PlayAction = { type: "PLAY"; handIndexes: number[]; slot: number; position: Position };
export type SetPositionAction = { type: "SET_POSITION"; slot: number; position: Position };
export type AttackAction = { type: "ATTACK"; attackerSlot: number; target: number | "direct" };
export type EndTurnAction = { type: "END_TURN" };
export type SurrenderAction = { type: "SURRENDER" };
export type Action = PlayAction | SetPositionAction | AttackAction | EndTurnAction | SurrenderAction;

export type GameEvent =
  | { type: "drew"; player: PlayerId; count: number }
  | { type: "fused"; player: PlayerId; a: CardId; b: CardId; result: CardId }
  | { type: "fusion-failed"; player: PlayerId; a: CardId; b: CardId }
  | { type: "played"; player: PlayerId; slot: number; cardId: CardId; position: Position }
  | { type: "position-set"; player: PlayerId; slot: number; position: Position }
  | { type: "attacked"; player: PlayerId; attackerSlot: number; target: number | "direct" }
  | { type: "destroyed"; player: PlayerId; slot: number; cardId: CardId }
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
  hasPlayed: boolean;
  result: MatchResult | null;
  rules: Rules;
  self: { hand: CardId[]; deckCount: number; field: (Creature | null)[]; lifePoints: number };
  opponent: { handCount: number; deckCount: number; field: (Creature | null)[]; lifePoints: number };
};
