import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../engine';

// Смоук-тест: случайные легальные партии до победы в обоих режимах.
// Проверяет, что движок не зацикливается, доходит до выбрасывания
// и все сгенерированные легальные ходы реально принимаются движком.
function playRandomGame(mode: 'long' | 'short', seed: number): { plies: number; winner: number } {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const e = new GameEngine(mode);
  let plies = 0;
  while (e.state.winner === null && plies < 3000) {
    plies++;
    e.rollDice();
    while (e.state.phase === 'move' && !e.turnFinished && e.canMove()) {
      const froms = e.legalSources();
      expect(froms.length).toBeGreaterThan(0);
      const from = froms[Math.floor(rnd() * froms.length)];
      const moves = e.legalMovesFrom(from);
      expect(moves.length).toBeGreaterThan(0);
      const mv = moves[Math.floor(rnd() * moves.length)];
      expect(e.playMove(mv)).toBe(true);
    }
    if (e.state.phase === 'move') e.endTurn();
  }
  if (e.state.winner === null) throw new Error(`Игра не завершилась за ${plies} ходов`);
  // у победителя снято все 15 лапок
  expect(e.state.off[e.state.winner]).toBe(15);
  return { plies, winner: e.state.winner };
}

describe('smoke: полные случайные партии', () => {
  it.each([['long'], ['short']] as const)('%s: 10 партий до победы без ошибок', (mode) => {
    for (let i = 1; i <= 10; i++) {
      const { plies } = playRandomGame(mode, i * 7919);
      expect(plies).toBeLessThan(3000);
    }
  }, 120000);
});
