import { describe, expect, it } from 'vitest';
import { computePace, emptyHistory, parseHistory, pushAnswer } from '../src/core/pace';

describe('темп игрока (раздел 3)', () => {
  it('по умолчанию T_med = 5 с, p = 0.8', () => {
    expect(computePace(emptyHistory())).toEqual({ tMed: 5000, p: 0.8 });
  });

  it('медиана по последним 20 ответам, верным и неверным', () => {
    let h = emptyHistory();
    for (let i = 0; i < 25; i++) h = pushAnswer(h, i % 2 === 0, 4000);
    expect(h.times).toHaveLength(20);
    expect(computePace(h).tMed).toBe(4000);
  });

  it('T_med ограничен 3–10 с, p — 0.5–1', () => {
    let fast = emptyHistory();
    for (let i = 0; i < 30; i++) fast = pushAnswer(fast, true, 500);
    expect(computePace(fast)).toEqual({ tMed: 3000, p: 1 });
    let slow = emptyHistory();
    for (let i = 0; i < 30; i++) slow = pushAnswer(slow, false, 60_000);
    expect(computePace(slow)).toEqual({ tMed: 10_000, p: 0.5 });
  });

  it('медиана устойчива к выбросам', () => {
    let h = emptyHistory();
    for (let i = 0; i < 18; i++) h = pushAnswer(h, true, 4000);
    h = pushAnswer(h, true, 90_000);
    h = pushAnswer(h, true, 90_000);
    expect(computePace(h).tMed).toBe(4000);
  });

  it('переживает испорченное хранилище', () => {
    expect(parseHistory('{oops')).toEqual(emptyHistory());
    expect(parseHistory(null)).toEqual(emptyHistory());
  });
});
