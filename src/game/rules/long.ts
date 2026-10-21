import { cloneState, emptyState, opponent } from '../types';
import type {
  BackgammonRules,
  GameState,
  LongNardyVariant,
  Move,
  OutcomeResult,
  PlayerId,
  PointIndex,
  TurnContext,
} from '../types';

/**
 * Длинные нарды (КотоНарды — главный режим).
 *
 * - Все 15 фишек стартуют на «голове» (противоположные пункты).
 * - Битья нет: пункт с хотя бы одной фишкой соперника закрыт.
 * - С головы обычно снимается одна фишка за ход.
 * - Спортивное правило: второй игрок на своём первом броске при дубле
 *   3–3, 4–4 или 6–6 может снять с головы две фишки.
 * - Блок из 6 пунктов разрешён, но нельзя запирать им все 15 фишек
 *   соперника; проверка — после каждого промежуточного хода.
 */
export class LongBackgammonRules implements BackgammonRules {
  readonly mode = 'long' as const;

  /** Профиль счёта (Правила Минспорта РФ 2025 / классический сетевой). */
  readonly variant: LongNardyVariant;

  constructor(variant?: Partial<LongNardyVariant>) {
    const scoring = variant?.scoring ?? 'official-rf-2025';
    this.variant = {
      scoring,
      // в официальном профиле кокс и «домашний» не используются
      enableKoks: variant?.enableKoks ?? scoring === 'classic-online',
      enableHomeMars: variant?.enableHomeMars ?? scoring === 'classic-online',
    };
  }

  /**
   * Физический порядок пунктов по кругу. В длинных нардах оба игрока
   * движутся В ОДНОМ направлении по одному кругу (ТЗ §9, скриншот):
   * - голова белых — правый верхний угол (пункт 23), дом белых — низ справа;
   * - голова чёрных — левый нижний угол (пункт 11), дом чёрных — верх слева.
   * Индекс в LOOP = «шаг от своей головы» для белых; у чёрных голова
   * смещена на 12 шагов (противоположная точка круга).
   */
  private static readonly LOOP: PointIndex[] = [
    23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12,
    11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
  ];
  private static readonly HEADS: PointIndex[] = [23, 11];

  direction(): 1 | -1 {
    return 1; // оба игрока идут по кругу в одну сторону
  }

  progress(player: PlayerId, point: PointIndex): number {
    const idx = LongBackgammonRules.LOOP.indexOf(point);
    return (idx - (player === 0 ? 0 : 12) + 24) % 24;
  }

  pointFromProgress(player: PlayerId, progress: number): PointIndex {
    return LongBackgammonRules.LOOP[(progress + (player === 0 ? 0 : 12)) % 24];
  }

  headPoint(player: PlayerId): PointIndex {
    return LongBackgammonRules.HEADS[player];
  }

  initialPoints(player: PlayerId): Array<[PointIndex, number]> {
    return [[this.headPoint(player), 15]];
  }

  newGame(firstPlayer: PlayerId): GameState {
    const s = emptyState('long', firstPlayer);
    for (const p of [0, 1] as PlayerId[]) {
      for (const [pt, n] of this.initialPoints(p)) s.points[p][pt] = n;
    }
    return s;
  }

  allInOwnHome(state: GameState, player: PlayerId): boolean {
    for (let pt = 0; pt < 24; pt++) {
      if (state.points[player][pt] > 0 && this.progress(player, pt) < 18) return false;
    }
    return true;
  }

  hasCheckerOnBar(): boolean {
    return false; // в длинных нардах бара нет
  }

  checkersOnBoard(state: GameState, player: PlayerId): number {
    let n = 0;
    for (let pt = 0; pt < 24; pt++) n += state.points[player][pt];
    return n;
  }

  /**
   * Можно ли снимать с головы две фишки (спортивное правило ТЗ §9):
   * второй игрок, его первый ход, дубль 3/4/6.
   */
  headLimitFor(state: GameState, player: PlayerId, dice: [number, number]): number {
    const isSecondPlayer = player !== state.firstPlayer;
    const firstTurn = state.turnsTaken[player] === 0;
    const [d1, d2] = dice;
    const specialDouble = d1 === d2 && (d1 === 3 || d1 === 4 || d1 === 6);
    return isSecondPlayer && firstTurn && specialDouble ? 2 : 1;
  }

  legalMoves(state: GameState, player: PlayerId, die: number, ctx: TurnContext): Move[] {
    const moves: Move[] = [];
    const head = this.headPoint(player);
    const allHome = this.allInOwnHome(state, player);
    for (let pt = 0; pt < 24; pt++) {
      if (state.points[player][pt] === 0) continue;
      if (pt === head && ctx.headMovesUsed >= ctx.headLimit) continue;
      const prog = this.progress(player, pt);
      const targetProg = prog + die;
      if (targetProg > 23) {
        // выбрасывание: точное значение, либо старшая фишка при избытке
        if (!allHome) continue;
        if (targetProg > 24) {
          // нельзя сбрасывать старшую, пока есть фишки дальше от дома
          let farther = false;
          for (let q = 0; q < 24; q++) {
            if (state.points[player][q] > 0 && this.progress(player, q) > prog) {
              farther = true; break;
            }
          }
          if (farther) continue;
        }
        moves.push({ player, from: pt, to: 'off', die });
        continue;
      }
      const to = this.pointFromProgress(player, targetProg);
      if (state.points[opponent(player)][to] > 0) continue; // закрыт — бить нельзя
      moves.push({ player, from: pt, to, die });
    }
    return moves;
  }

  applyMove(state: GameState, move: Move): GameState | string {
    const s = cloneState(state);
    if (move.from === 'bar') return 'В длинных нардах бара нет';
    const from = move.from as number;
    if (s.points[move.player][from] <= 0) return 'Нет фишки на исходном пункте';
    if (move.to === 'off') {
      s.points[move.player][from]--;
      s.off[move.player]++;
    } else {
      const to = move.to as number;
      if (s.points[opponent(move.player)][to] > 0) return 'Пункт соперника закрыт';
      s.points[move.player][from]--;
      s.points[move.player][to]++;
    }
    const err = this.validateBlocks(s, move.player);
    if (err) return err;
    return s;
  }

  /**
   * Запрет блока из шести пунктов, запирающего все фишки соперника (ТЗ §9).
   * Проверяет ВСЕ 6-блоки игрока; соперник «заперт», если все его фишки,
   * ещё находящиеся на доске, стоят за блоком (по прогрессу дальше от дома).
   */
  validateBlocks(state: GameState, player: PlayerId): string | null {
    const occ = new Array<boolean>(24);
    for (let pr = 0; pr < 24; pr++) {
      occ[pr] = state.points[player][this.pointFromProgress(player, pr)] > 0;
    }
    const enemy = opponent(player);
    // фишки на баре в длинных нардах невозможны
    let run = 0;
    for (let pr = 0; pr <= 24; pr++) {
      const filled = pr < 24 && occ[pr];
      if (filled) {
        run++;
      } else {
        if (run >= 6) {
          // проверяем каждое окно длины 6 внутри этого ряда
          for (let a = pr - run; a + 5 < pr; a++) {
            if (this.trapsAll(state, enemy, a)) {
              return 'Блок из шести пунктов не может запирать все 15 фишек соперника';
            }
          }
        }
        run = 0;
      }
    }
    return null;
  }

  private trapsAll(state: GameState, enemy: PlayerId, blockStart: number): boolean {
    // Блок [blockStart .. blockStart+5] в прогрессе ХОДЯЩЕГО. Прогресс
    // соперника сдвинут ровно на 12 шагов (голова соперника противоположна),
    // поэтому в координатах соперника блок начинается с b = (blockStart+12)%24.
    // Прогресс соперника ЛИНЕЙЕН: 0 (голова) → 24 (снятие), круглое поле
    // маршрут не делает — каждый пункт соперник проходит ровно один раз.
    // Фишка «прошла блок» ⇔ её прогресс линейно больше конца блока
    // (сравнение без mod 24!). Сброшенные фишки прошли весь маршрут,
    // значит любой блок ими «пройден».
    if (state.off[enemy] > 0) return false;
    const blockEnd = (blockStart + 12) % 24 + 5;
    for (let pt = 0; pt < 24; pt++) {
      if (state.points[enemy][pt] === 0) continue;
      if (this.progress(enemy, pt) > blockEnd) return false;
    }
    return true;
  }

  /**
   * Классификация результата партии (Правила Минспорта РФ 2025, ст. 48,
   * и классический сетевой вариант с коксом). Проверяется по состоянию
   * всех 15 фишек проигравшего в момент победы.
   *
   * Приоритет: кокс (шашка на базе / в стартовой четверти, прогресс 0–5)
   * → домашний (все 15 в доме, снято 0) → марс (не все в доме, снято 0)
   * → оин (снята хотя бы одна шашка).
   */
  classifyOutcome(state: GameState, winner: PlayerId): OutcomeResult {
    const loser = opponent(winner);
    const off = state.off[loser];
    const v = this.variant;
    if (v.enableKoks) {
      for (let pt = 0; pt < 24; pt++) {
        if (state.points[loser][pt] > 0 && this.progress(loser, pt) <= 5) {
          return { outcome: 'koks', points: 3 };
        }
      }
    }
    if (v.enableHomeMars && off === 0 && this.allInOwnHome(state, loser)) {
      return { outcome: 'home', points: 4 };
    }
    if (off === 0) return { outcome: 'mars', points: 2 };
    return { outcome: 'oin', points: 1 };
  }
}

export const longRules = new LongBackgammonRules();
