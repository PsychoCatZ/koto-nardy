import type { PointIndex } from '../game/types';

// ============================================================
// Геометрия доски и маппинг логических пунктов → физические позиции
// ============================================================

export const L = {
  pw: 1.0,          // ширина пункта
  half: 6.0,        // половина поля (6 пунктов)
  barHalf: 0.62,    // половина ширины бара
  row: 4.2,         // глубина зоны пунктов
  frame: 0.85,      // рамка
  thick: 0.9,       // толщина доски
  checkerR: 0.42,   // радиус фишки
  stackStep: 0.155, // шаг вертикального стекирования
  stackDrift: 0.22, // смещение к бару первых фишек стопки
};

export const BOARD_W = L.half * 2 + L.barHalf * 2;      // 13.24
export const BOARD_D = (L.row + 0.7) * 2;                // 9.8
export const SURFACE_Y = L.thick / 2;

/**
 * Физическая позиция логического пункта.
 * Вид белого (player 0): его дом внизу справа, пункт 0 — крайний правый
 * у торца; пункт 5 — у бара. Верхняя строка — пункты 12..23.
 * Классическая ориентация backgammon, X — вдоль доски, Z — поперёк.
 */
export function pointPosition(p: PointIndex): { x: number; z: number; dirZ: 1 | -1 } {
  const q = Math.floor(p / 6); // 0..3
  const i = p % 6;             // 0..5
  const off = (5 - i) * L.pw + L.pw / 2;
  switch (q) {
    case 0: // 0..5 — низ справа, 0 у правого торца
      return { x: L.barHalf + off, z: L.row / 2, dirZ: 1 };
    case 1: // 6..11 — низ слева, 6 у бара
      return { x: -L.barHalf - (i * L.pw + L.pw / 2), z: L.row / 2, dirZ: 1 };
    case 2: // 12..17 — верх слева, 12 у левого торца
      return { x: -L.barHalf - ((5 - i) * L.pw + L.pw / 2), z: -L.row / 2, dirZ: -1 };
    default: // 18..23 — верх справа, 23 у бара
      return { x: L.barHalf + (i * L.pw + L.pw / 2), z: -L.row / 2, dirZ: -1 };
  }
}

/** Позиция в зоне выбрасывания (торцы доски). idx — порядковый номер снятой фишки */
export function trayPosition(player: 0 | 1, idx: number): { x: number; z: number } {
  // белый сбрасывает справа, чёрный слева (классика)
  const x = (player === 0 ? 1 : -1) * (BOARD_W / 2 - L.frame * 0.5 - 0.1);
  const z = -BOARD_D / 2 + L.frame + 0.6 + idx * 0.55;
  return { x, z };
}

/** Позиция на баре. idx — номер фишки на баре */
export function barPosition(player: 0 | 1, idx: number): { x: number; z: number } {
  return { x: 0, z: (player === 0 ? 1 : -1) * (0.45 + idx * 0.85) };
}

/** Смещение фишки внутри стопки пункта (вдоль направления к бару) */
export function stackOffset(countIndex: number): number {
  return -countIndex * L.stackStep;
}
