// Сетка зала. Клетки пола нумеруются построчно, клетка выхода (проём двери) — отдельный индекс
// cols × rows. Её координата — (doorCol, -1): она лежит в северной стене над стартом.

export interface GridShape {
  readonly cols: number;
  readonly rows: number;
  readonly doorCol: number;
}

export interface Cell {
  x: number;
  y: number;
}

export function cellCount(g: GridShape): number {
  return g.cols * g.rows + 1;
}

export function exitIndex(g: GridShape): number {
  return g.cols * g.rows;
}

export function cellIndex(g: GridShape, x: number, y: number): number {
  if (y === -1 && x === g.doorCol) return exitIndex(g);
  return y * g.cols + x;
}

export function startIndex(g: GridShape): number {
  return cellIndex(g, g.doorCol, 0);
}

export function cellXY(g: GridShape, i: number): Cell {
  if (i === exitIndex(g)) return { x: g.doorCol, y: -1 };
  return { x: i % g.cols, y: Math.floor(i / g.cols) };
}

export function inBounds(g: GridShape, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.cols && y < g.rows;
}

export function isFloor(g: GridShape, i: number): boolean {
  return i >= 0 && i < g.cols * g.rows;
}

/**
 * Соседи по 4 направлениям в фиксированном порядке: вверх, вправо, вниз, влево.
 * Порядок важен для детерминизма поиска пути.
 */
export function neighbors(g: GridShape, i: number, out: number[] = []): number[] {
  out.length = 0;
  const exit = exitIndex(g);
  if (i === exit) {
    out.push(startIndex(g));
    return out;
  }
  const x = i % g.cols;
  const y = (i - x) / g.cols;
  if (y > 0) out.push(i - g.cols);
  else if (x === g.doorCol) out.push(exit);
  if (x < g.cols - 1) out.push(i + 1);
  if (y < g.rows - 1) out.push(i + g.cols);
  if (x > 0) out.push(i - 1);
  return out;
}

export function manhattan(g: GridShape, a: number, b: number): number {
  const p = cellXY(g, a);
  const q = cellXY(g, b);
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
}
