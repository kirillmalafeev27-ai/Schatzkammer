// Компоновка страницы (раздел 11.1) и выбор размера зала под устройство.

import { balance } from '../config/balance';

export type Orient = 'portrait' | 'landscape';

export interface PageLayout {
  orient: Orient;
  gutter: number;
  /** Высота панели вопроса (портрет) или ширина (ландшафт), CSS px. */
  qSize: number;
  /** Внутренний размер панели мира, CSS px (без рамок). */
  worldW: number;
  worldH: number;
}

const BORDER = 4;

export function computeLayout(w: number, h: number, inset = { top: 0, right: 0, bottom: 0, left: 0 }): PageLayout {
  const L = balance.layout;
  const orient: Orient = w / Math.max(1, h) >= L.landscapeRatio ? 'landscape' : 'portrait';
  const gutter = Math.round(Math.min(L.gutterMax, Math.max(L.gutterMin, Math.min(w, h) * 0.016)));
  const iw = w - inset.left - inset.right - gutter * 2;
  const ih = h - inset.top - inset.bottom - gutter * 2;
  if (orient === 'portrait') {
    const qSize = Math.round(Math.min(L.portraitQuestionMax, Math.max(L.portraitQuestionMin, h * L.portraitQuestionFrac)));
    return { orient, gutter, qSize, worldW: iw - BORDER * 2, worldH: ih - qSize - gutter - BORDER * 2 };
  }
  const qSize = Math.round(Math.min(L.landscapeQuestionMax, Math.max(L.landscapeQuestionMin, w * L.landscapeQuestionFrac)));
  return { orient, gutter, qSize, worldW: iw - qSize - gutter - BORDER * 2, worldH: ih - BORDER * 2 };
}

/** Размер мира в клетках для сетки cols × rows. */
export function worldCells(cols: number, rows: number): { w: number; h: number } {
  const W = balance.world;
  return { w: cols + W.sideWall * 2, h: rows + W.northWall + W.ceiling + W.southLedge };
}

export interface GridChoice {
  cols: number;
  rows: number;
  cellCss: number;
}

/**
 * Зал вписывается в панель целиком; минимальная клетка 36 CSS px. Если 9 × 8 не помещается,
 * генератор получает меньшие cols × rows, но не меньше 7 × 7.
 */
export function chooseGrid(worldW: number, worldH: number): GridChoice {
  const G = balance.grid;
  const options: GridChoice[] = [];
  for (let cols = G.cols; cols >= G.minCols; cols--) {
    for (let rows = G.rows; rows >= G.minRows; rows--) {
      const c = worldCells(cols, rows);
      options.push({ cols, rows, cellCss: Math.min(worldW / c.w, worldH / c.h) });
    }
  }
  const fitting = options.filter((o) => o.cellCss >= G.minCellCss);
  if (fitting.length) {
    fitting.sort((a, b) => b.cols * b.rows - a.cols * a.rows || b.cellCss - a.cellCss);
    return fitting[0];
  }
  // Даже 7 × 7 не даёт 36 px — берём самый крупный вариант из минимальных (см. DECISIONS.md).
  options.sort((a, b) => b.cellCss - a.cellCss);
  return options[0];
}
