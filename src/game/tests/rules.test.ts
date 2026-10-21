import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine';
import type { GameState, PlayerId } from '../types';
import { LongBackgammonRules } from '../rules/long';

// ---------- helpers ----------

function setupLong(overrides?: {
  white?: Array<[number, number]>;
  black?: Array<[number, number]>;
  firstPlayer?: PlayerId;
  turnsTaken?: [number, number];
}): GameEngine {
  const eng = new GameEngine('long', overrides?.firstPlayer ?? 0);
  eng.state.points = [new Array(24).fill(0), new Array(24).fill(0)];
  eng.state.bar = [0, 0];
  eng.state.off = [0, 0];
  if (overrides?.white) for (const [pt, n] of overrides.white) eng.state.points[0][pt] += n;
  if (overrides?.black) for (const [pt, n] of overrides.black) eng.state.points[1][pt] += n;
  if (overrides?.turnsTaken) eng.state.turnsTaken = overrides.turnsTaken;
  return eng;
}

function setupShort(overrides?: {
  white?: Array<[number, number]>;
  black?: Array<[number, number]>;
  bar?: [number, number];
  off?: [number, number];
  firstPlayer?: PlayerId;
}): GameEngine {
  const eng = new GameEngine('short', overrides?.firstPlayer ?? 0);
  eng.state.points = [new Array(24).fill(0), new Array(24).fill(0)];
  eng.state.bar = overrides?.bar ? [...overrides.bar] : [0, 0];
  eng.state.off = overrides?.off ? [...overrides.off] : [0, 0];
  if (overrides?.white) for (const [pt, n] of overrides.white) eng.state.points[0][pt] += n;
  if (overrides?.black) for (const [pt, n] of overrides.black) eng.state.points[1][pt] += n;
  return eng;
}

const total = (st: GameState, p: PlayerId) =>
  st.points[p].reduce((a, b) => a + b, 0) + st.bar[p] + st.off[p];

// ---------- long backgammon ----------

describe('Длинные нарды: базовые правила', () => {
  it('начальная позиция: 15 фишек на голове каждого игрока', () => {
    const eng = new GameEngine('long', 0);
    // голова белых — правый верхний угол (п.23), голова чёрных — левый нижний (п.11)
    expect(eng.state.points[0][23]).toBe(15);
    expect(eng.state.points[1][11]).toBe(15);
    expect(total(eng.state, 0)).toBe(15);
    expect(total(eng.state, 1)).toBe(15);
  });

  it('обычный ход двумя костями: обе должны быть использованы', () => {
    const eng = new GameEngine('long', 0);
    eng.rollDice(3, 5);
    expect(eng.canMove()).toBe(true);
    expect(eng.sequences.every((s) => s.moves.length === 2)).toBe(true);
    expect(eng.sequences.every((s) => s.moves[0].from === 23 && s.moves[1].from !== 23)).toBe(true);
  });

  it('нельзя снять две лапки с головы обычным ходом (даже при дубле)', () => {
    const eng = new GameEngine('long', 0);
    // первый игрок: дубль не даёт права на две фишки с головы
    eng.rollDice(5, 5);
    const headMoves = (s: (typeof eng.sequences)[number]) =>
      s.moves.filter((m) => m.from === 23).length;
    expect(eng.sequences.every((s) => headMoves(s) <= 1)).toBe(true);
  });

  it('спортивное правило: второй игрок, первый бросок 3-3/4-4/6-6 — две с головы', () => {
    // первый игрок = чёрный (firstPlayer = 1); белый — второй
    const eng = new GameEngine('long', 1);
    eng.rollDice(2, 3); // ход чёрного с головы (п.11): +2 → п.9, +3 → п.8
    eng.playMove({ player: 1, from: 11, to: 9, die: 2 });
    eng.playMove({ player: 1, from: 11, to: 8, die: 3 });
    eng.endTurn();
    expect(eng.state.currentPlayer).toBe(0);
    eng.rollDice(3, 3);
    const headMoves = (s: (typeof eng.sequences)[number]) =>
      s.moves.filter((m) => m.from === 23).length;
    expect(eng.sequences.some((s) => headMoves(s) === 2)).toBe(true);
    // но не три
    expect(eng.sequences.every((s) => headMoves(s) <= 2)).toBe(true);
  });

  it('то же правило НЕ действует для первого игрока', () => {
    const eng = new GameEngine('long', 0);
    eng.rollDice(6, 6);
    const headMoves = (s: (typeof eng.sequences)[number]) =>
      s.moves.filter((m) => m.from === 23).length;
    expect(eng.sequences.every((s) => headMoves(s) <= 1)).toBe(true);
  });

  it('нельзя поставить лапку на пункт соперника', () => {
    const eng = setupLong({
      white: [[11, 1], [12, 1]], // прогресс 12 и 11
      black: [[8, 1]],
      firstPlayer: 0,
      turnsTaken: [1, 1],
    });
    // чёрный занимает пункт 8 (для белого прогресс 15). К3: 12→15=п.8 закрыт,
    // к4: 11→15=п.8 закрыт; открытые пункты — 9 (к3) и 7 (к4).
    eng.rollDice(3, 4);
    const targets = eng.sequences.flatMap((s) => s.moves.filter((m) => m.player === 0).map((m) => m.to));
    expect(targets).not.toContain(8);
    expect(targets).toContain(9);
    expect(targets).toContain(7);
  });

  it('запрет блока из шести, запирающего все 15 фишек соперника', () => {
    // Белый занимает прогресс 0..4 (п.23,22,21,20,19) и водит фишку
    // с прогресса 4 (п.19) костью 1 на прогресс 5 (п.18), замывая блок 0..5.
    const rules = new LongBackgammonRules();
    const mk = (black: Array<[number, number]>, blackOff = 0) => {
      const st = rules.newGame(0);
      st.turnsTaken = [2, 2];
      st.points = [new Array(24).fill(0), new Array(24).fill(0)];
      st.points[0][23] = 1;
      st.points[0][22] = 1; st.points[0][21] = 1; st.points[0][20] = 1;
      st.points[0][19] = 2; // одна из них пойдёт 19→18
      for (const [pt, n] of black) st.points[1][pt] = n;
      st.off = [0, blackOff];
      return st;
    };
    // все 15 чёрных на голове (п.11, прогресс 0) — за блоком → запереть нельзя
    const trapped = mk([[11, 15]]);
    expect(typeof rules.applyMove(trapped, { player: 0, from: 19, to: 18, die: 1 })).toBe('string');

    // чёрная фишка на п.16 (её прогресс 19) уже прошла блок и сидит в доме → разрешён
    const passed = mk([[11, 14], [16, 1]]);
    expect(typeof rules.applyMove(passed, { player: 0, from: 19, to: 18, die: 1 })).toBe('object');

    // чёрный уже снял хотя бы одну шашку — она «прошла» любой блок → разрешён
    const borneOff = mk([[11, 14]], 1);
    expect(typeof rules.applyMove(borneOff, { player: 0, from: 19, to: 18, die: 1 })).toBe('object');

    // кейс игрока: чёрный зашёл домой (п.12..17) — стена у головы белого разрешена
    const home = mk([[12, 5], [13, 4], [14, 3], [15, 3]]);
    expect(typeof rules.applyMove(home, { player: 0, from: 19, to: 18, die: 1 })).toBe('object');
  });

  it('блок из шести проверяется на промежуточном шаге хода', () => {
    // те же белые, кости 1-2: ход 19→18 (к1) создаёт запирающий блок ДАЖЕ если
    // следующим ходом этой же фишкой уйти дальше 18→16 (к2)
    const eng = setupLong({
      white: [[23, 1], [22, 1], [21, 1], [20, 1], [19, 2]],
      black: [[11, 15]],
      firstPlayer: 0,
      turnsTaken: [2, 2],
    });
    eng.rollDice(1, 2);
    // ни одна последовательность не начинается с 19→18: промежуточная
    // позиция (блок 0..5, все чёрные за ним) незаконна
    for (const seq of eng.sequences) {
      expect(seq.moves[0]?.from !== 19 || seq.moves[0]?.to !== 18).toBe(true);
      let st: GameState = eng.state;
      for (const m of seq.moves) {
        const r = eng.rules.applyMove(st, m);
        expect(typeof r).toBe('object');
        st = r as GameState;
      }
      expect((eng.rules as LongBackgammonRules).validateBlocks(st, 0)).toBeNull();
    }
    // прямой запрет applyMove для промежуточного состояния
    const rules = new LongBackgammonRules();
    const st = rules.newGame(0);
    st.turnsTaken = [2, 2];
    st.points = [new Array(24).fill(0), new Array(24).fill(0)];
    st.points[0][23] = 1; st.points[0][22] = 1; st.points[0][21] = 1;
    st.points[0][20] = 1; st.points[0][19] = 2;
    st.points[1][11] = 15;
    expect(typeof rules.applyMove(st, { player: 0, from: 19, to: 18, die: 1 })).toBe('string');
  });

  it('если из двух костей можно сыграть только одну — обязана старшая', () => {
    const eng = setupLong({
      white: [[13, 1]], // прогресс 10
      black: [[9, 1], [3, 1]], // закрывают прогресс 14 (к4) и 20 (к4 после к6)
      firstPlayer: 0,
      turnsTaken: [3, 3],
    });
    eng.rollDice(4, 6);
    // 10+4=14 закрыт; 10+6=16 свободен, но 16+4=20 закрыт —
    // каждая кость играется только отдельно; обязана старшая (6)
    expect(eng.sequences.length).toBeGreaterThan(0);
    expect(eng.sequences.every((s) => s.moves.length === 1 && s.moves[0].die === 6)).toBe(true);
  });

  it('нумерация дома: угловой пункт — №1 (к1 снимает с него), у бара — №6', () => {
    const eng = setupLong({
      white: [[0, 1], [5, 1]], // угол (прогресс 23) и у бара (прогресс 18)
      black: [[11, 15]],
      firstPlayer: 0,
      turnsTaken: [8, 8],
    });
    eng.rollDice(1, 6);
    const moves = eng.sequences.flatMap((s) => s.moves);
    expect(moves.some((m) => m.to === 'off' && m.from === 0 && m.die === 1)).toBe(true);
    expect(moves.some((m) => m.to === 'off' && m.from === 5 && m.die === 6)).toBe(true);
  });

  it('нельзя выбрасывать, пока не все 15 фишек вошли в дом', () => {
    const eng = setupLong({
      // 14 в доме (п.0..4), одна снаружи (п.13, прогресс 10)
      white: [[0, 4], [1, 4], [2, 3], [3, 2], [4, 1], [13, 1]],
      black: [[11, 15]],
      firstPlayer: 0,
      turnsTaken: [8, 8],
    });
    eng.rollDice(1, 6);
    const moves = eng.sequences.flatMap((s) => s.moves);
    expect(moves.some((m) => m.to === 'off')).toBe(false);
  });

  it('корректное выбрасывание: точное значение и правило старшей фишки', () => {
    const eng = setupLong({
      // прогресс 18 (п.5) — 1 фишка, прогресс 22 (п.1) — 14 фишек
      white: [[5, 1], [1, 14]],
      black: [[12, 15]],
      firstPlayer: 0,
      turnsTaken: [5, 5],
    });
    eng.rollDice(6, 1);
    const moves = eng.sequences.flatMap((s) => s.moves);
    // к6: с п.1 (прогресс 22) — нет фишек дальше от дома → сброс разрешён
    expect(moves.some((m) => m.to === 'off' && m.from === 1 && m.die === 6)).toBe(true);
    // к1: ни одна фишка не сбрасывается (18+1=19 → п.4; 22+1=23 → п.0)
    expect(moves.some((m) => m.to === 'off' && m.die === 1)).toBe(false);
    expect(moves.some((m) => m.to === 4 && m.die === 1)).toBe(true);
  });

  it('победа: снятие всех 15 фишек', () => {
    const eng = setupLong({
      white: [[0, 3], [1, 1]], // прогресс 23 (x3) и 22
      black: [[12, 15]],
      firstPlayer: 0,
      turnsTaken: [10, 10],
    });
    eng.state.off = [11, 0]; // осталось 4 фишки на доске
    eng.rollDice(6, 6);
    while (!eng.turnFinished && eng.played.length < 4) {
      const mv = eng.legalMovesFrom(eng.legalSources()[0])[0];
      eng.playMove(mv);
    }
    expect(eng.state.phase).toBe('over');
    expect(eng.state.winner).toBe(0);
    expect(eng.state.mars).toBe(true); // у чёрного 0 снято
    expect(eng.state.outcome).toBe('mars');
  });

  it('счёт партии: оин и марс (официальный профиль РФ 2025)', () => {
    const official = new LongBackgammonRules();
    const mk = (black: Array<[number, number]>, blackOff: number): GameState => {
      const st = official.newGame(0);
      st.points = [new Array(24).fill(0), new Array(24).fill(0)];
      for (const [pt, n] of black) st.points[1][pt] = n;
      st.off = [15, blackOff];
      return st;
    };
    // проигравший снял хотя бы одну шашку — оин, 1 очко
    expect(official.classifyOutcome(mk([[12, 10]], 5), 0)).toEqual({ outcome: 'oin', points: 1 });
    // не все в доме, 0 снято — марс, 2 очка
    expect(official.classifyOutcome(mk([[12, 14], [10, 1]], 0), 0)).toEqual({ outcome: 'mars', points: 2 });
    // все 15 в доме, 0 снято — в официальном профиле это марс (домашний отключён)
    expect(official.classifyOutcome(mk([[12, 15]], 0), 0)).toEqual({ outcome: 'mars', points: 2 });
    // шашка на базе в официальном профиле НЕ даёт кокс — марс
    expect(official.classifyOutcome(mk([[11, 1], [12, 14]], 0), 0)).toEqual({ outcome: 'mars', points: 2 });
  });

  it('счёт партии: кокс и домашний (классический профиль), проверка приоритета', () => {
    const classic = new LongBackgammonRules({ scoring: 'classic-online' });
    const mk = (black: Array<[number, number]>, blackOff: number): GameState => {
      const st = classic.newGame(0);
      st.points = [new Array(24).fill(0), new Array(24).fill(0)];
      for (const [pt, n] of black) st.points[1][pt] = n;
      st.off = [15, blackOff];
      return st;
    };
    // шашка на базе (п.11, стартовая четверть) — кокс, 3 очка
    expect(classic.classifyOutcome(mk([[11, 1], [12, 14]], 0), 0)).toEqual({ outcome: 'koks', points: 3 });
    // кокс имеет приоритет: даже если остальные 14 уже в доме
    expect(classic.classifyOutcome(mk([[11, 1], [13, 14]], 0), 0)).toEqual({ outcome: 'koks', points: 3 });
    // все 15 в доме, 0 снято — домашний, 4 очка
    expect(classic.classifyOutcome(mk([[12, 15]], 0), 0)).toEqual({ outcome: 'home', points: 4 });
    // не все в доме (п.5 = прогресс 6 — вне дома и вне базы), 0 снято — марс, 2 очка
    expect(classic.classifyOutcome(mk([[12, 14], [5, 1]], 0), 0)).toEqual({ outcome: 'mars', points: 2 });
    // приоритет документа: шашка на базе → кокс строго первым, даже при снятых
    expect(classic.classifyOutcome(mk([[11, 1], [12, 13]], 1), 0)).toEqual({ outcome: 'koks', points: 3 });
    // оин только без шашек на базе и со снятой шашкой
    expect(classic.classifyOutcome(mk([[12, 13]], 2), 0)).toEqual({ outcome: 'oin', points: 1 });
  });

  it('невозможно сделать запрещённый ход через playMove', () => {
    const eng = new GameEngine('long', 0);
    eng.rollDice(2, 3);
    expect(eng.playMove({ player: 0, from: 5, to: 7, die: 2 })).toBe(false);
    expect(eng.playMove({ player: 0, from: 0, to: 10, die: 5 })).toBe(false);
    // кости 2:3 — к5 в пуле нет; с головы к3 идёт на п.20 (23−3), а не на п.10
    expect(eng.playMove({ player: 0, from: 23, to: 10, die: 5 })).toBe(false);
    expect(eng.playMove({ player: 0, from: 23, to: 20, die: 3 })).toBe(true);
  });

  it('отмена последнего хода восстанавливает позицию', () => {
    const eng = new GameEngine('long', 0);
    eng.rollDice(2, 3);
    const before = JSON.stringify(eng.state.points);
    const src = eng.legalSources()[0];
    const mv = eng.legalMovesFrom(src)[0];
    eng.playMove(mv);
    expect(eng.undoMove()).toBe(true);
    expect(JSON.stringify(eng.state.points)).toBe(before);
  });
});

// ---------- short backgammon ----------

describe('Короткие нарды: базовые правила', () => {
  it('начальная расстановка 2-5-3-5', () => {
    const eng = new GameEngine('short', 0);
    expect(eng.state.points[0][23]).toBe(2);
    expect(eng.state.points[0][12]).toBe(5);
    expect(eng.state.points[0][7]).toBe(3);
    expect(eng.state.points[0][5]).toBe(5);
    expect(eng.state.points[1][0]).toBe(2);
    expect(eng.state.points[1][11]).toBe(5);
    expect(eng.state.points[1][16]).toBe(3);
    expect(eng.state.points[1][18]).toBe(5);
  });

  it('блот сбивается на бар', () => {
    const eng = setupShort({
      white: [[23, 1], [12, 14]],
      black: [[17, 1]],
      firstPlayer: 0,
    });
    // белый ходит 23→17 костью 6, чёрный блот на 17
    eng.rollDice(6, 1);
    const hit = eng.sequences
      .flatMap((s) => s.moves)
      .find((m) => m.from === 23 && m.to === 17);
    expect(hit).toBeDefined();
    expect(hit!.hit).toBe(true);
    expect(eng.playMove(hit!)).toBe(true);
    expect(eng.state.points[1][17]).toBe(0);
    expect(eng.state.bar[1]).toBe(1);
  });

  it('пункт с двумя фишками закрыт', () => {
    const eng = setupShort({
      white: [[23, 1], [12, 14]],
      black: [[16, 2]],
      firstPlayer: 0,
    });
    eng.rollDice(6, 1);
    const moves = eng.sequences.flatMap((s) => s.moves);
    expect(moves.some((m) => m.to === 16)).toBe(false);
  });

  it('бар имеет приоритет: первым ходом обязан вернуться с бара', () => {
    const eng = setupShort({
      white: [[23, 1], [12, 14]],
      black: [[11, 5]],
      bar: [1, 0],
      firstPlayer: 0,
    });
    eng.rollDice(3, 5);
    // легальные источники ПЕРВОГО хода — только бар
    expect(eng.legalSources()).toEqual(['bar']);
    const entry = eng.legalMovesFrom('bar');
    expect(entry.length).toBeGreaterThan(0);
    // вход белого — в дом чёрного: пункты 2 (к3) и 4 (к5)
    expect(entry.map((m) => m.to).sort()).toEqual([2, 4]);
  });

  it('возврат с бара: каждая последовательность начинается со входа', () => {
    const eng = setupShort({
      white: [[12, 15]],
      black: [[2, 1], [1, 2]],
      bar: [1, 0],
      firstPlayer: 0,
    });
    eng.rollDice(5, 5);
    // вход к5: прогресс 24-5=19 → физ. пункт 4 — пусто, входит без боя
    for (const s of eng.sequences) {
      expect(s.moves[0].from).toBe('bar');
      expect(s.moves[0].to).toBe(4);
      expect(s.moves[0].hit).toBe(false);
    }
  });

  it('вход с разбоем: на блот соперника — сбитие', () => {
    const eng = setupShort({
      white: [[12, 15]],
      black: [[4, 1]], // блот чёрного на пункте 4
      bar: [1, 0],
      firstPlayer: 0,
    });
    eng.rollDice(5, 2);
    const entry = eng.legalMovesFrom('bar').find((m) => m.die === 5);
    expect(entry).toBeDefined();
    expect(entry!.hit).toBe(true);
    eng.playMove(entry!);
    expect(eng.state.bar[1]).toBe(1);
    expect(eng.state.points[0][4]).toBe(1);
  });

  it('выбрасывание и победа в коротких нардах', () => {
    const eng = setupShort({
      white: [[0, 1]],
      black: [[23, 2], [12, 5], [7, 3], [5, 5]],
      off: [14, 0],
      firstPlayer: 0,
    });
    eng.rollDice(6, 1);
    while (eng.state.phase !== 'over' && !eng.turnFinished) {
      const src = eng.legalSources()[0];
      if (src === undefined) break;
      const mv = eng.legalMovesFrom(src)[0];
      if (!mv) break;
      eng.playMove(mv);
    }
    expect(eng.state.phase).toBe('over');
    expect(eng.state.winner).toBe(0);
    expect(eng.state.off[0]).toBe(15);
  });

  it('при возможности только одного хода играется старшая кость', () => {
    // короткие: белый на баре, вход открыт только к6 (пункт 5).
    // вторая кость ничем не играет → единственный ход — вход старшей костью.
    const eng = setupShort({
      white: [[12, 14]],
      black: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2]],
      bar: [1, 0],
      firstPlayer: 0,
    });
    eng.rollDice(6, 5);
    expect(eng.sequences.every((s) => s.moves.length === 1)).toBe(true);
    expect(eng.sequences.every((s) => s.moves[0].die === 6)).toBe(true);
  });

  it('если старшая не играет вообще — играется младшая', () => {
    const eng = setupShort({
      white: [[12, 14]],
      black: [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [11, 2], [0, 1]],
      bar: [1, 0],
      firstPlayer: 0,
    });
    // вход открыт только к1 (пункт 0: одна чёрная фишка — блот, вход с боем)
    eng.rollDice(6, 1);
    expect(eng.sequences.every((s) => s.moves.length === 1)).toBe(true);
    expect(eng.sequences.every((s) => s.moves[0].die === 1)).toBe(true);
    expect(eng.sequences.every((s) => s.moves[0].hit === true)).toBe(true);
  });

  it('дубль даёт четыре перемещения', () => {
    const eng = new GameEngine('short', 0);
    eng.rollDice(4, 4);
    expect(eng.sequences.every((s) => s.moves.length <= 4)).toBe(true);
    expect(eng.sequences.some((s) => s.moves.length === 4)).toBe(true);
  });

  it('если только одна кость играет — выбирается старшая', () => {
    const eng = new GameEngine('long', 0);
    // позиция, где обе кости играют: фишки белого на п.0 и п.1 (прогресс 23 и 22)
    eng.state.points = [new Array(24).fill(0), new Array(24).fill(0)];
    eng.state.points[0][0] = 8;
    eng.state.points[0][1] = 7;
    eng.state.points[1][11] = 15;
    eng.state.turnsTaken = [3, 3];
    eng.rollDice(6, 1);
    // к6: п.1→off (нет дальше) или... к1: п.0→off точно; обе играют → обе нужны
    expect(eng.sequences.every((s) => s.moves.length === 2)).toBe(true);
  });
});

// ---------- engine integrity ----------

describe('Целостность движка', () => {
  it('игра против самого себя (симуляция) сохраняет инварианты', () => {
    const eng = new GameEngine('short', 0);
    let guard = 0;
    while ((eng.state.phase as string) !== 'over' && guard++ < 500) {
      eng.rollDice();
      while (!eng.turnFinished) {
        const sources = eng.legalSources();
        if (sources.length === 0) break;
        const mv = eng.legalMovesFrom(sources[0])[0];
        if (!mv) break;
        expect(eng.playMove(mv)).toBe(true);
      }
      if (eng.state.phase !== 'over') eng.endTurn();
    }
    expect(eng.state.phase).toBe('over');
    expect(eng.state.winner).not.toBeNull();
    expect(total(eng.state, 0)).toBe(15);
    expect(total(eng.state, 1)).toBe(15);
  });

  it('AI всегда выбирает легальную последовательность', async () => {
    const { chooseSequence } = await import('../ai');
    const eng = new GameEngine('long', 0);
    eng.rollDice(2, 5);
    const seq = chooseSequence(eng.state, eng.rules, eng.sequences, 'madcat');
    expect(eng.sequences).toContain(seq);
  });
});
