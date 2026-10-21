import { cloneState, emptyState, opponent } from '../types';
import type { BackgammonRules, GameState, Move, OutcomeResult, PlayerId, PointIndex, TurnContext } from '../types';

/**
 * Короткие нарды — классический backgammon.
 *
 * Начальная расстановка (по номерам пунктов 1..24 со стороны игрока,
 * игрок движется 24→1): 2-5-3-5 → пункты 24, 13, 8, 6.
 * В логических индексах 0..23 (белый ходит 0←23, то есть 24-й пункт = 23):
 * белый: 2 на 23, 5 на 12, 3 на 7, 5 на 5; чёрный зеркально.
 *
 * - Пункт с ≥2 фишками соперника закрыт.
 * - Одиночная фишка (блот) сбивается на бар.
 * - Пока на баре есть фишки — ходить можно только ими (возврат в игр).
 * - Выбрасывание — после того, как все 15 в доме.
 */
export class ShortBackgammonRules implements BackgammonRules {
  readonly mode = 'short' as const;

  direction(player: PlayerId): 1 | -1 {
    return player === 0 ? -1 : 1;
  }

  progress(player: PlayerId, point: PointIndex): number {
    return player === 0 ? 23 - point : point;
  }

  pointFromProgress(player: PlayerId, progress: number): PointIndex {
    return player === 0 ? 23 - progress : progress;
  }

  headPoint(player: PlayerId): PointIndex {
    return player === 0 ? 23 : 0;
  }

  initialPoints(player: PlayerId): Array<[PointIndex, number]> {
    return player === 0
      ? [[23, 2], [12, 5], [7, 3], [5, 5]]
      : [[0, 2], [11, 5], [16, 3], [18, 5]];
  }

  newGame(firstPlayer: PlayerId): GameState {
    const s = emptyState('short', firstPlayer);
    for (const p of [0, 1] as PlayerId[]) {
      for (const [pt, n] of this.initialPoints(p)) s.points[p][pt] = n;
    }
    return s;
  }

  allInOwnHome(state: GameState, player: PlayerId): boolean {
    for (let pt = 0; pt < 24; pt++) {
      if (state.points[player][pt] > 0 && this.progress(player, pt) >= 18) continue;
      if (state.points[player][pt] > 0) return false;
    }
    return state.bar[player] === 0;
  }

  hasCheckerOnBar(state: GameState, player: PlayerId): boolean {
    return state.bar[player] > 0;
  }

  checkersOnBoard(state: GameState, player: PlayerId): number {
    let n = state.bar[player];
    for (let pt = 0; pt < 24; pt++) n += state.points[player][pt];
    return n;
  }

  legalMoves(state: GameState, player: PlayerId, die: number, _ctx: TurnContext): Move[] {
    const moves: Move[] = [];
    const enemy = opponent(player);

    // Возврат с бара — обязателен и является единственной возможностью
    if (state.bar[player] > 0) {
      const entryProg = 24 - die; // 18..23 — дом соперника
      const to = this.pointFromProgress(player, entryProg);
      const enemyCount = state.points[enemy][to];
      if (enemyCount >= 2) return moves; // закрыт
      moves.push({ player, from: 'bar', to, die, hit: enemyCount === 1 });
      return moves;
    }

    const allHome = this.allInOwnHome(state, player);
    for (let pt = 0; pt < 24; pt++) {
      if (state.points[player][pt] === 0) continue;
      const prog = this.progress(player, pt);
      const targetProg = prog + die;
      if (targetProg > 23) {
        if (!allHome) continue;
        if (targetProg > 24) {
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
      const enemyCount = state.points[enemy][to];
      if (enemyCount >= 2) continue; // закрытый пункт
      moves.push({ player, from: pt, to, die, hit: enemyCount === 1 });
    }
    return moves;
  }

  applyMove(state: GameState, move: Move): GameState | string {
    const s = cloneState(state);
    const enemy = opponent(move.player);
    let fromPt: number;
    if (move.from === 'bar') {
      if (s.bar[move.player] <= 0) return 'На баре нет фишек';
      s.bar[move.player]--;
      fromPt = -1;
    } else {
      fromPt = move.from;
      if (s.points[move.player][fromPt] <= 0) return 'Нет фишки на исходном пункте';
      s.points[move.player][fromPt]--;
    }
    if (move.to === 'off') {
      s.off[move.player]++;
    } else {
      const to = move.to;
      const enemyCount = s.points[enemy][to];
      if (enemyCount >= 2) return 'Пункт закрыт двумя фишками соперника';
      if (enemyCount === 1) {
        s.points[enemy][to]--;
        s.bar[enemy]++;
      }
      s.points[move.player][to]++;
    }
    return s;
  }

  /** Короткие нарды: оин = 1, марс (гэммон) = 2 */
  classifyOutcome(state: GameState, winner: PlayerId): OutcomeResult {
    return state.off[opponent(winner)] === 0
      ? { outcome: 'mars', points: 2 }
      : { outcome: 'oin', points: 1 };
  }
}

export const shortRules = new ShortBackgammonRules();
