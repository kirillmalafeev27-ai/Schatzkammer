// Поиск пути: BFS по 4 направлениям. Из нескольких кратчайших маршрутов выбирается тот,
// что проходит по наименьшему числу предметов (кроме самой цели) — раздел 2.3.3.

import { cellCount, neighbors, type GridShape } from './grid';

export type Blocked = ArrayLike<number>;

/** Расстояния от клетки `from` до всех клеток; -1 — недостижимо. */
export function bfsDistances(g: GridShape, blocked: Blocked, from: number): Int32Array {
  const n = cellCount(g);
  const dist = new Int32Array(n).fill(-1);
  if (blocked[from]) return dist;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[from] = 0;
  queue[tail++] = from;
  const nb: number[] = [];
  while (head < tail) {
    const c = queue[head++];
    neighbors(g, c, nb);
    for (const m of nb) {
      if (dist[m] !== -1 || blocked[m]) continue;
      dist[m] = dist[c] + 1;
      queue[tail++] = m;
    }
  }
  return dist;
}

/**
 * Кратчайший путь от `from` до `to` (без `from`, с `to`), с наименьшим числом предметов по пути.
 * Пустой массив — уже на месте; null — недостижимо.
 */
export function findPath(
  g: GridShape,
  blocked: Blocked,
  items: ArrayLike<number>,
  from: number,
  to: number,
): number[] | null {
  if (from === to) return [];
  if (blocked[to] || blocked[from]) return null;
  const n = cellCount(g);
  const dist = new Int32Array(n).fill(-1);
  const cnt = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[from] = 0;
  queue[tail++] = from;
  const nb: number[] = [];
  while (head < tail) {
    const c = queue[head++];
    if (c === to) break;
    neighbors(g, c, nb);
    for (const m of nb) {
      if (blocked[m]) continue;
      const add = m !== to && items[m] ? 1 : 0;
      if (dist[m] === -1) {
        dist[m] = dist[c] + 1;
        cnt[m] = cnt[c] + add;
        parent[m] = c;
        queue[tail++] = m;
      } else if (dist[m] === dist[c] + 1 && cnt[c] + add < cnt[m]) {
        cnt[m] = cnt[c] + add;
        parent[m] = c;
      }
    }
  }
  if (dist[to] === -1) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = parent[c]) path.push(c);
  path.reverse();
  return path;
}

/** Все ли свободные клетки связаны с `from`. */
export function allConnected(g: GridShape, blocked: Blocked, from: number): boolean {
  const dist = bfsDistances(g, blocked, from);
  const n = cellCount(g);
  for (let i = 0; i < n; i++) {
    if (!blocked[i] && dist[i] === -1) return false;
  }
  return true;
}
