import { describe, expect, it } from 'vitest';
import { defaultBank, LocalBankProvider } from '../src/questions/LocalBankProvider';

describe('банк вопросов', () => {
  it('60 вопросов, 2–4 варианта, верный индекс в пределах, id уникальны', () => {
    expect(defaultBank).toHaveLength(60);
    const ids = new Set(defaultBank.map((q) => q.id));
    expect(ids.size).toBe(60);
    for (const q of defaultBank) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it('есть вопросы с 2, 3 и 4 вариантами', () => {
    const counts = new Set(defaultBank.map((q) => q.options.length));
    expect([...counts].sort()).toEqual([2, 3, 4]);
  });
});

describe('LocalBankProvider', () => {
  it('перемешивает варианты и пересчитывает correctIndex', () => {
    const p = new LocalBankProvider(defaultBank, 3);
    for (let i = 0; i < 200; i++) {
      const q = p.nextSync();
      const orig = defaultBank.find((b) => b.id === q.id)!;
      expect(q.options[q.correctIndex]).toBe(orig.options[orig.correctIndex]);
      expect([...q.options].sort()).toEqual([...orig.options].sort());
    }
  });

  it('вопрос не повторяется раньше чем через 10 показов', () => {
    const p = new LocalBankProvider(defaultBank, 11);
    const seen: string[] = [];
    for (let i = 0; i < 500; i++) {
      const q = p.nextSync();
      const last = seen.lastIndexOf(q.id);
      if (last >= 0) expect(seen.length - last).toBeGreaterThan(10);
      seen.push(q.id);
      p.report({ id: q.id, correct: true, timeMs: 1000 });
    }
  });

  it('вопрос с неверным ответом возвращается через 4–6 вопросов', () => {
    for (let seed = 1; seed < 50; seed++) {
      const p = new LocalBankProvider(defaultBank, seed);
      p.nextSync();
      const current = p.nextSync(); // показан
      p.nextSync(); // уже загружен следующий — как в игре
      p.report({ id: current.id, correct: false, timeMs: 2000 });
      let gap = 0;
      for (let i = 0; i < 10; i++) {
        const q = p.nextSync();
        gap = i + 1; // вопросов между показами
        if (q.id === current.id) break;
      }
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(6);
    }
  });
});
