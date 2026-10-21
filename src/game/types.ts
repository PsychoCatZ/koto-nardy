// ============================================================
// KotoNardy — core game types
// ============================================================

export type PlayerId = 0 | 1;

export type PointIndex = number; // 0..23 logical point index

export type MoveSource = PointIndex | 'bar';
export type MoveTarget = PointIndex | 'off';

export interface Move {
  player: PlayerId;
  from: MoveSource;
  to: MoveTarget;
  die: number;
  /** short backgammon: this move hits an enemy blot */
  hit?: boolean;
}

/** A complete legal turn: full sequence of moves + dice used (ТЗ §18) */
export interface TurnSequence {
  moves: Move[];
  usedDice: number[];
}

export type GameMode = 'long' | 'short';
export type GamePhase = 'roll' | 'move' | 'over';

export interface GameState {
  mode: GameMode;
  /** points[player][point 0..23] — count of checkers */
  points: [number[], number[]];
  /** checkers on the bar (short mode only, always 0 in long mode) */
  bar: [number, number];
  /** checkers borne off */
  off: [number, number];
  currentPlayer: PlayerId;
  dice: [number, number] | null;
  /** dice values still usable this turn (4 for doubles) */
  remainingDice: number[];
  phase: GamePhase;
  winner: PlayerId | null;
  /** gammon / Марс (любой результат дороже оина) */
  mars: boolean;
  /** точный результат партии (длинные нарды; короткие — oin/mars) */
  outcome: OutcomeType;
  /** number of completed turns per player */
  turnsTaken: [number, number];
  /** who starts the game (won the opening roll) */
  firstPlayer: PlayerId;
  turnNumber: number;
}

/** Per-turn context for rules that depend on the turn's history */
export interface TurnContext {
  /** how many checkers were already taken off the head this turn */
  headMovesUsed: number;
  /** max checkers allowed off the head this turn */
  headLimit: number;
}

/** Результат партии: оин / марс / кокс / домашний (ТЗ счёта) */
export type OutcomeType = 'oin' | 'mars' | 'koks' | 'home';

export interface OutcomeResult {
  outcome: OutcomeType;
  /** очков победителю (до куба удвоения) */
  points: number;
}

/** Конфигурация варианта длинных нард (ТЗ §12) */
export interface LongNardyVariant {
  scoring: 'official-rf-2025' | 'classic-online';
  /** классический кокс = 3 очка (шашка проигравшего на базе) */
  enableKoks: boolean;
  /** «домашний» = 4 очка (все 15 в доме, 0 снято) */
  enableHomeMars: boolean;
}

export interface BackgammonRules {
  readonly mode: GameMode;
  /** +1 for white (moves 0→23), -1 for black (moves 23→0) */
  direction(player: PlayerId): 1 | -1;
  /** distance from start, 0..23 (off = 24) */
  progress(player: PlayerId, point: PointIndex): number;
  pointFromProgress(player: PlayerId, progress: number): PointIndex;
  headPoint(player: PlayerId): PointIndex;
  initialPoints(player: PlayerId): Array<[PointIndex, number]>;
  /** All legal moves for `die` given the turn context. Pure. */
  legalMoves(state: GameState, player: PlayerId, die: number, ctx: TurnContext): Move[];
  /**
   * Apply a move. Returns the new state, or an error string when the
   * move is rejected by a positional rule (e.g. the 6-block trap in
   * long backgammon must be checked after EVERY intermediate move).
   */
  applyMove(state: GameState, move: Move): GameState | string;
  allInOwnHome(state: GameState, player: PlayerId): boolean;
  hasCheckerOnBar(state: GameState, player: PlayerId): boolean;
  checkersOnBoard(state: GameState, player: PlayerId): number;
  /** Классификация результата партии для счёта (ст. 48 правил). */
  classifyOutcome(state: GameState, winner: PlayerId): OutcomeResult;
}

export const opponent = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    points: [s.points[0].slice(), s.points[1].slice()],
    bar: [s.bar[0], s.bar[1]],
    off: [s.off[0], s.off[1]],
    dice: s.dice ? [s.dice[0], s.dice[1]] : null,
    remainingDice: s.remainingDice.slice(),
    turnsTaken: [s.turnsTaken[0], s.turnsTaken[1]],
  };
}

export function emptyState(mode: GameMode, firstPlayer: PlayerId): GameState {
  return {
    mode,
    points: [new Array(24).fill(0), new Array(24).fill(0)],
    bar: [0, 0],
    off: [0, 0],
    currentPlayer: firstPlayer,
    dice: null,
    remainingDice: [],
    phase: 'roll',
    winner: null,
    mars: false,
    outcome: 'oin',
    turnsTaken: [0, 0],
    firstPlayer,
    turnNumber: 1,
  };
}
