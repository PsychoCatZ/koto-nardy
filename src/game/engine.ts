import { cloneState, opponent } from './types';
import type { GameMode, GameState, LongNardyVariant, Move, PlayerId, TurnSequence } from './types';
import { LongBackgammonRules } from './rules/long';
import { ShortBackgammonRules } from './rules/short';
import type { BackgammonRules, TurnContext } from './types';

export function rulesFor(mode: GameMode, variant?: Partial<LongNardyVariant>): BackgammonRules {
  return mode === 'long' ? new LongBackgammonRules(variant) : new ShortBackgammonRules();
}

export interface DiceRoll {
  dice: [number, number];
  isDouble: boolean;
}

/**
 * Генерация полного набора легальных последовательностей хода (ТЗ §18).
 * Для каждого броска движок строит ВСЕ допустимые цепочки перемещений,
 * проверяя позиционные ограничения (блок в длинных) после КАЖДОГО
 * промежуточного хода. Затем применяются правила:
 *  - использовать обе кости, если возможно;
 *  - если возможна только одна — старшая;
 *  - дубль — до четырёх перемещений.
 */
export function generateSequences(
  state: GameState,
  rules: BackgammonRules,
  dice: [number, number],
): TurnSequence[] {
  const isDouble = dice[0] === dice[1];
  const pool: number[] = isDouble ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
  const player = state.currentPlayer;

  const headLimit =
    rules.mode === 'long'
      ? (rules as LongBackgammonRules).headLimitFor(state, player, dice)
      : 99;

  const results: TurnSequence[] = [];

  const dfs = (s: GameState, remaining: number[], moves: Move[], headUsed: number) => {
    let anyMove = false;
    const tried = new Set<number>();
    for (const d of remaining) {
      if (tried.has(d)) continue;
      tried.add(d);
      const ctx: TurnContext = { headMovesUsed: headUsed, headLimit };
      for (const mv of rules.legalMoves(s, player, d, ctx)) {
        const applied = rules.applyMove(s, mv);
        if (typeof applied === 'string') continue; // промежуточный запрет
        anyMove = true;
        const idx = remaining.indexOf(d);
        const rem2 = remaining.slice();
        rem2.splice(idx, 1);
        const head2 = headUsed + (rules.mode === 'long' && mv.from === rules.headPoint(player) ? 1 : 0);
        dfs(applied, rem2, [...moves, mv], head2);
      }
    }
    if (!anyMove) {
      results.push({ moves, usedDice: moves.map((m) => m.die) });
    }
  };

  dfs(state, pool, [], 0);

  if (results.length === 0) {
    return [{ moves: [], usedDice: [] }];
  }

  // обязанность сыграть максимум костей
  const maxLen = Math.max(...results.map((r) => r.moves.length));
  let best = results.filter((r) => r.moves.length === maxLen);

  // если возможен только один ход — обязаны сыграть старшую кость
  if (maxLen === 1 && !isDouble) {
    const hi = Math.max(dice[0], dice[1]);
    const hiSeq = best.filter((r) => r.moves[0].die === hi);
    if (hiSeq.length > 0) best = hiSeq;
  }
  return best;
}

export interface PlayedMove {
  move: Move;
  stateBefore: GameState;
  sequencesBefore: TurnSequence[];
}

/**
 * GameEngine — состояние партии и порядок ходов.
 * UI никогда не двигает фишки напрямую: только playMove() по легальным
 * вариантам из текущих последовательностей.
 */
export class GameEngine {
  state: GameState;
  rules: BackgammonRules;
  sequences: TurnSequence[] = [];
  played: PlayedMove[] = [];
  /** последний бросок, который нельзя отменить */
  lastRoll: DiceRoll | null = null;

  /** Профиль счёта длинных нард (передаётся в правила) */
  private longVariant?: Partial<LongNardyVariant>;

  constructor(mode: GameMode, firstPlayer: PlayerId = 0, longVariant?: Partial<LongNardyVariant>) {
    this.longVariant = longVariant;
    this.rules = rulesFor(mode, longVariant);
    this.state = this.newGame(mode, firstPlayer);
  }

  /** Смена профиля счёта (применяется к текущим правилам и новым партиям) */
  setLongVariant(variant?: Partial<LongNardyVariant>): void {
    this.longVariant = variant;
    this.rules = rulesFor(this.state.mode, variant);
  }

  newGame(mode: GameMode, firstPlayer: PlayerId): GameState {
    this.rules = rulesFor(mode, this.longVariant);
    const r = this.rules as LongBackgammonRules | ShortBackgammonRules;
    this.state = r.newGame(firstPlayer);
    this.sequences = [];
    this.played = [];
    this.lastRoll = null;
    return this.state;
  }

  /** Бросок кубиков. d1/d2 — для отладочной панели (принудительный бросок). */
  rollDice(d1?: number, d2?: number): DiceRoll {
    if (this.state.phase !== 'roll') throw new Error('Сейчас бросать нельзя');
    const dice: [number, number] =
      d1 !== undefined && d2 !== undefined
        ? [d1, d2]
        : [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    this.lastRoll = { dice, isDouble: dice[0] === dice[1] };
    this.state = { ...this.state, dice, phase: 'move' };
    this.sequences = generateSequences(this.state, this.rules, dice);
    this.played = [];
    return this.lastRoll;
  }

  /** true, если у текущего игрока вообще есть ходы после броска */
  canMove(): boolean {
    return this.sequences.some((s) => s.moves.length > 0);
  }

  /** Легальные первые хода из источника source с учётом уже сделанного */
  legalMovesFrom(source: Move['from']): Move[] {
    const n = this.played.length;
    const out = new Map<string, Move>();
    for (const seq of this.sequences) {
      if (seq.moves.length <= n) continue;
      if (!this.prefixMatches(seq, n)) continue;
      const mv = seq.moves[n];
      if (mv.from === source) out.set(`${mv.from}>${mv.to}:${mv.die}`, mv);
    }
    return [...out.values()];
  }

  /** Все легальные источники (пункты/бар), с которых можно ходить */
  legalSources(): Move['from'][] {
    const n = this.played.length;
    const out = new Set<Move['from']>();
    for (const seq of this.sequences) {
      if (seq.moves.length <= n) continue;
      if (!this.prefixMatches(seq, n)) continue;
      out.add(seq.moves[n].from);
    }
    return [...out];
  }

  /** Проверка, что уже сыгранные ходы являются префиксом последовательности */
  private prefixMatches(seq: TurnSequence, n: number): boolean {
    for (let i = 0; i < n; i++) {
      const a = this.played[i].move;
      const b = seq.moves[i];
      if (a.from !== b.from || a.to !== b.to || a.die !== b.die) return false;
    }
    return true;
  }

  /** Ход закончен, когда все оставшиеся последовательности исчерпаны */
  get turnFinished(): boolean {
    return this.state.phase === 'move' && !this.sequences.some((s) => s.moves.length > this.played.length && this.prefixMatches(s, this.played.length));
  }

  /** Сколько перемещений ещё обязателен минимум (максимум по последовательностям) */
  get remainingMoves(): number {
    let max = 0;
    const n = this.played.length;
    for (const seq of this.sequences) {
      if (this.prefixMatches(seq, n)) max = Math.max(max, seq.moves.length - n);
    }
    return max;
  }

  /** Оставшиеся значения кубиков (минимум по всем возможным продолжениям) */
  get remainingDice(): number[] {
    const n = this.played.length;
    const pool: number[] = [];
    for (const seq of this.sequences) {
      if (this.prefixMatches(seq, n)) {
        for (let i = n; i < seq.moves.length; i++) pool.push(seq.moves[i].die);
      }
    }
    return pool;
  }

  /**
   * Сыграть ход. Возвращает true при успехе.
   * Ход валидируется строго по текущим легальным последовательностям.
   */
  playMove(move: Move): boolean {
    if (this.state.phase !== 'move') return false;
    const candidates = this.legalMovesFrom(move.from).filter(
      (m) => m.to === move.to && m.die === move.die,
    );
    if (candidates.length === 0) return false;
    const mv = candidates[0];
    const stateBefore = cloneState(this.state);
    const sequencesBefore = this.sequences.map((s) => ({ moves: s.moves.slice(), usedDice: s.usedDice.slice() }));
    const applied = this.rules.applyMove(this.state, mv);
    if (typeof applied === 'string') return false;
    this.state = applied;
    this.played.push({ move: mv, stateBefore, sequencesBefore });
    // оставляем только последовательности с этим префиксом
    const n = this.played.length;
    this.sequences = this.sequences.filter(
      (s) => s.moves.length >= n && this.prefixMatches(s, n),
    );
    this.checkGameOver();
    return true;
  }

  /** Отменить последний ход текущего хода (ТЗ §8) */
  undoMove(): boolean {
    if (this.played.length === 0) return false;
    const last = this.played.pop()!;
    this.state = last.stateBefore;
    this.sequences = last.sequencesBefore;
    return true;
  }

  /** Завершить ход и передать очередь сопернику */
  endTurn(): void {
    if (this.state.phase !== 'move') return;
    if (this.state.winner !== null) return;
    const next = opponent(this.state.currentPlayer);
    const turnsTaken: [number, number] = [...this.state.turnsTaken];
    turnsTaken[this.state.currentPlayer]++;
    this.state = {
      ...this.state,
      currentPlayer: next,
      dice: null,
      phase: 'roll',
      turnsTaken,
      turnNumber: this.state.turnNumber + 1,
    };
    this.sequences = [];
    this.played = [];
    this.lastRoll = null;
  }

  private checkGameOver(): void {
    if (this.state.off[this.state.currentPlayer] === 15) {
      const winner = this.state.currentPlayer;
      const result = this.rules.classifyOutcome(this.state, winner);
      this.state = {
        ...this.state,
        phase: 'over',
        winner,
        mars: result.outcome !== 'oin',
        outcome: result.outcome,
      };
    }
  }

  /** Сериализация для сохранения партии */
  serialize(): string {
    return JSON.stringify({ state: this.state, playedCount: this.played.length, mode: this.state.mode });
  }
}
