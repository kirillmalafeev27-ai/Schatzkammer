import { describe, expect, it } from 'vitest';
import { cellIndex, exitIndex, neighbors, startIndex, type GridShape } from '../src/core/grid';
import { allConnected, bfsDistances, findPath } from '../src/core/pathfinding';

const g: GridShape = { cols: 5, rows: 4, doorCol: 2 };
const n = g.cols * g.rows + 1;

describe('сетка', () => {
  it('выход соединён только со стартом', () => {
    expect(neighbors(g, exitIndex(g))).toEqual([startIndex(g)]);
    expect(neighbors(g, startIndex(g))).toContain(exitIndex(g));
    expect(neighbors(g, cellIndex(g, 0, 0))).not.toContain(exitIndex(g));
  });
  it('только 4 направления', () => {
    const nb = neighbors(g, cellIndex(g, 2, 2));
    expect(nb.sort()).toEqual([cellIndex(g, 2, 1), cellIndex(g, 3, 2), cellIndex(g, 2, 3), cellIndex(g, 1, 2)].sort());
  });
});

describe('BFS', () => {
  it('считает дистанции и обходит препятствия', () => {
    const blocked = new Uint8Array(n);
    blocked[cellIndex(g, 2, 1)] = 1;
    const d = bfsDistances(g, blocked, startIndex(g));
    expect(d[cellIndex(g, 2, 2)]).toBe(4);
    expect(d[exitIndex(g)]).toBe(1);
    expect(d[cellIndex(g, 2, 1)]).toBe(-1);
  });
  it('видит несвязный зал', () => {
    const blocked = new Uint8Array(n);
    blocked[cellIndex(g, 0, 1)] = 1;
    blocked[cellIndex(g, 1, 0)] = 1;
    expect(allConnected(g, blocked, startIndex(g))).toBe(false);
  });
});

describe('выбор маршрута (2.3.3)', () => {
  it('из кратчайших выбирает путь без предметов, кроме самой цели', () => {
    const blocked = new Uint8Array(n);
    const items = new Uint8Array(n);
    // Из (0,0) в (2,1): кратчайшие пути идут через (1,0) или (0,1)/(1,1).
    items[cellIndex(g, 1, 0)] = 1;
    items[cellIndex(g, 2, 1)] = 1; // предмет на цели не мешает
    const path = findPath(g, blocked, items, cellIndex(g, 0, 0), cellIndex(g, 2, 1))!;
    expect(path).toHaveLength(3);
    expect(path).not.toContain(cellIndex(g, 1, 0));
    expect(path[path.length - 1]).toBe(cellIndex(g, 2, 1));
  });
  it('ходит по предметам, только если иначе путь длиннее', () => {
    const blocked = new Uint8Array(n);
    const items = new Uint8Array(n);
    items[cellIndex(g, 1, 0)] = 1;
    const path = findPath(g, blocked, items, cellIndex(g, 0, 0), cellIndex(g, 2, 0))!;
    expect(path).toEqual([cellIndex(g, 1, 0), cellIndex(g, 2, 0)]);
  });
  it('недостижимая клетка — null, своя клетка — пустой путь', () => {
    const blocked = new Uint8Array(n);
    blocked[cellIndex(g, 4, 3)] = 1;
    const items = new Uint8Array(n);
    expect(findPath(g, blocked, items, startIndex(g), cellIndex(g, 4, 3))).toBeNull();
    expect(findPath(g, blocked, items, startIndex(g), startIndex(g))).toEqual([]);
  });
});
