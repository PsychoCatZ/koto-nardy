import { opponent } from './types';
import type { GameState, PlayerId, TurnSequence, BackgammonRules } from './types';
import { generateSequences } from './engine';

export type AiLevel = 'kitten' | 'cat' | 'madcat';

const rnd = (n: number) => Math.floor(Math.random() * n);

/**
 * Оценка позиции с точки зрения игрока `player`.
 * Чем больше — тем лучше. Используется «Котом» и «Безумным Котярой».
 */
export function evaluate(state: GameState, rules: BackgammonRules, player: PlayerId): number {
  const me = player;
  const enemy = opponent(player);
  let score = 0;

  // продвижение: меньше «пипов» = лучше
  let myPips = 0;
  for (let pt = 0; pt < 24; pt++) myPips += state.points[me][pt] * rules.progress(me, pt);
  myPips += state.bar[me] * 25;
  score -= myPips * 1.0;

  // снятые фишки — главное
  score += state.off[me] * 12;
  score -= state.off[enemy] * 12;

  // занятые пункты (≥2 своих)
  for (let pt = 0; pt < 24; pt++) {
    if (state.points[me][pt] >= 2) score += 3;
    if (state.points[enemy][pt] >= 2) score -= 3;
  }

  if (state.mode === 'long') {
    // голова расчищена — плюс
    if (state.points[me][rules.headPoint(me)] === 0) score += 8;
    // длина непрерывных блоков
    score += longestRun(state, rules, me) * 1.5;
    score -= longestRun(state, rules, enemy) * 1.5;
    // приближение к дому учтено через пипсы
  } else {
    // короткие: безопасность блотов
    for (let pt = 0; pt < 24; pt++) {
      const c = state.points[me][pt];
      if (c === 1 && state.bar[me] === 0) {
        const prog = rules.progress(me, pt);
        if (prog < 18) score -= 4; // блот вне дома — риск
      }
      if (state.points[enemy][pt] === 1) score += 2; // цели для атаки
    }
    // бар
    score -= state.bar[me] * 14;
    score += state.bar[enemy] * 14;
    // якоря в доме соперника
    for (let pt = 0; pt < 24; pt++) {
      if (rules.progress(me, pt) >= 18 && state.points[me][pt] >= 2) score += 2;
    }
  }

  if (state.phase === 'over' && state.winner !== null) {
    score += state.winner === player ? 10000 : -10000;
    if (state.winner === player && state.mars) score += 5000;
  }
  return score;
}

function longestRun(state: GameState, rules: BackgammonRules, player: PlayerId): number {
  let best = 0;
  let run = 0;
  for (let pr = 0; pr < 24; pr++) {
    const occupied = state.points[player][rules.pointFromProgress(player, pr)] > 0;
    run = occupied ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function applySequence(
  state: GameState,
  rules: BackgammonRules,
  seq: TurnSequence,
): GameState {
  let s = state;
  for (const m of seq.moves) {
    const r = rules.applyMove(s, m);
    if (typeof r === 'string') return s;
    s = r;
  }
  return s;
}

/** Все 21 комбинация кубиков для расчёта соперника */
const ALL_DICE: Array<[number, number]> = [];
for (let a = 1; a <= 6; a++) {
  for (let b = a; b <= 6; b++) ALL_DICE.push([a, b]);
}

/**
 * Выбор последовательности хода. AI пользуется ТЕМ ЖЕ Rules Engine,
 * что и человек: ему передают только легальные последовательности (ТЗ §12).
 */
export function chooseSequence(
  state: GameState,
  rules: BackgammonRules,
  sequences: TurnSequence[],
  level: AiLevel,
): TurnSequence {
  const playable = sequences.filter((s) => s.moves.length > 0);
  if (playable.length === 0) return sequences[0];
  if (level === 'kitten') {
    // Котёнок: простая оценка + ошибки — случайный выбор почти всегда
    if (Math.random() < 0.75) return playable[rnd(playable.length)];
    return bestByHeuristic(state, rules, playable);
  }

  const ranked = playable
    .map((seq) => ({ seq, sc: evaluate(applySequence(state, rules, seq), rules, state.currentPlayer) }))
    .sort((a, b) => b.sc - a.sc);

  if (level === 'cat') {
    // «Кот»: лучший ход по эвристике, иногда (10%) — второй-третий вариант
    if (ranked.length > 1 && Math.random() < 0.1) {
      return ranked[1 + rnd(Math.min(2, ranked.length - 1))].seq;
    }
    return ranked[0].seq;
  }

  // «Безумный Котяра»: один полуход оппонента вглубь (expectimax по 21 броску)
  const candidates = ranked.slice(0, 6);
  let bestSeq = ranked[0].seq;
  let bestVal = -Infinity;
  const me = state.currentPlayer;

  for (const { seq } of candidates) {
    const afterMe = applySequence(state, rules, seq);
    if (afterMe.phase === 'over') {
      return seq; // выигрышный ход берём сразу
    }
    let sum = 0;
    let weight = 0;
    const enemyState: GameState = {
      ...afterMe,
      currentPlayer: opponent(me),
      dice: null,
      remainingDice: [],
      phase: 'roll' as const,
    };
    for (const [d1, d2] of ALL_DICE) {
      // вес комбинации: дубли реже немного, всё равномерно достаточно
      const w = d1 === d2 ? 1 : 2;
      const enemySeqs = generateFor(enemyState, rules, [d1, d2]);
      const enemyBest = bestByHeuristic(enemyState, rules, enemySeqs);
      const enemyAfter = applySequence(enemyState, rules, enemyBest);
      // возвращаем очередь нам
      const back: GameState = { ...enemyAfter, currentPlayer: me };
      const val = evaluate(back, rules, me);
      sum += val * w;
      weight += w;
    }
    const avg = sum / weight;
    if (avg > bestVal) {
      bestVal = avg;
      bestSeq = seq;
    }
  }
  return bestSeq;
}

function bestByHeuristic(
  state: GameState,
  rules: BackgammonRules,
  sequences: TurnSequence[],
): TurnSequence {
  let best = sequences[0];
  let bestSc = -Infinity;
  for (const seq of sequences) {
    const sc = evaluate(applySequence(state, rules, seq), rules, state.currentPlayer);
    if (sc > bestSc) {
      bestSc = sc;
      best = seq;
    }
  }
  return best;
}

/** Локальная генерация последовательностей для развёртки соперника */
function generateFor(
  state: GameState,
  rules: BackgammonRules,
  dice: [number, number],
): TurnSequence[] {
  return generateSequences(state, rules, dice);
}
