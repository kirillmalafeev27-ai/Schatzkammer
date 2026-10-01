// Темп игрока (раздел 3): T_med — медиана времени ответа по последним 20 ответам,
// p — доля верных по последним 30. Хранятся между сессиями, фиксируются на старте раунда.

import { balance } from '../config/balance';

export interface PaceHistory {
  times: number[];
  correct: boolean[];
}

export interface Pace {
  tMed: number;
  p: number;
}

export function emptyHistory(): PaceHistory {
  return { times: [], correct: [] };
}

export function pushAnswer(h: PaceHistory, correct: boolean, timeMs: number): PaceHistory {
  const pc = balance.pace;
  const times = [...h.times, timeMs].slice(-pc.timeWindow);
  const corr = [...h.correct, correct].slice(-pc.accuracyWindow);
  return { times, correct: corr };
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Недостающие до полного окна ответы считаются значениями по умолчанию — так первые раунды
 * не скачут от одного случайного ответа (см. DECISIONS.md).
 */
export function computePace(h: PaceHistory): Pace {
  const pc = balance.pace;
  const times = h.times.slice(-pc.timeWindow);
  const padded = [...times];
  while (padded.length < pc.timeWindow) padded.push(pc.defaultTMedMs);
  const tMed = Math.min(pc.maxTMedMs, Math.max(pc.minTMedMs, median(padded)));

  const corr = h.correct.slice(-pc.accuracyWindow);
  const missing = pc.accuracyWindow - corr.length;
  const right = corr.filter(Boolean).length + missing * pc.defaultP;
  const p = Math.min(pc.maxP, Math.max(pc.minP, right / pc.accuracyWindow));
  return { tMed, p };
}

export function parseHistory(raw: string | null): PaceHistory {
  if (!raw) return emptyHistory();
  try {
    const v = JSON.parse(raw) as Partial<PaceHistory>;
    const times = Array.isArray(v.times) ? v.times.filter((x) => typeof x === 'number' && Number.isFinite(x)) : [];
    const correct = Array.isArray(v.correct) ? v.correct.map(Boolean) : [];
    return { times, correct };
  } catch {
    return emptyHistory();
  }
}
