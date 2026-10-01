// Локальный банк вопросов для разработки (раздел 12).
// Варианты перемешиваются при показе; вопрос не повторяется раньше чем через 10 показов;
// вопрос с неверным ответом возвращается в том же раунде через 4–6 вопросов.

import { balance } from '../config/balance';
import { freshSeed, mulberry32, randInt, shuffle, type Rng } from '../core/rng';
import bankJson from './bank.de.json';
import type { AnswerReport, Question, QuestionProvider } from './types';

export const defaultBank: readonly Question[] = bankJson as Question[];

interface Comeback {
  id: string;
  due: number;
}

export class LocalBankProvider implements QuestionProvider {
  private readonly bank: readonly Question[];
  private readonly rng: Rng;
  private shown = 0;
  private recent: string[] = [];
  private comebacks: Comeback[] = [];
  readonly reports: AnswerReport[] = [];

  constructor(bank: readonly Question[] = defaultBank, seed: number = freshSeed()) {
    if (!bank.length) throw new Error('LocalBankProvider: пустой банк вопросов');
    this.bank = bank;
    this.rng = mulberry32(seed);
  }

  next(): Promise<Question> {
    return Promise.resolve(this.nextSync());
  }

  nextSync(): Question {
    const q = this.choose();
    this.shown++;
    this.recent.push(q.id);
    const keep = Math.min(balance.questions.noRepeatWithin, Math.max(0, this.bank.length - 1));
    while (this.recent.length > keep) this.recent.shift();
    return this.present(q);
  }

  report(r: AnswerReport): void {
    this.reports.push(r);
    if (!r.correct && !this.comebacks.some((c) => c.id === r.id)) {
      const q = balance.questions;
      this.comebacks.push({
        id: r.id,
        due: this.shown + randInt(this.rng, q.wrongReturnMin, q.wrongReturnMax),
      });
    }
  }

  private choose(): Question {
    const dueIdx = this.comebacks.findIndex((c) => c.due <= this.shown + 1);
    if (dueIdx >= 0) {
      const [c] = this.comebacks.splice(dueIdx, 1);
      const q = this.bank.find((b) => b.id === c.id);
      if (q) return q;
    }
    const pending = new Set(this.comebacks.map((c) => c.id));
    let pool = this.bank.filter((b) => !this.recent.includes(b.id) && !pending.has(b.id));
    if (!pool.length) pool = this.bank.filter((b) => !this.recent.includes(b.id));
    if (!pool.length) pool = [...this.bank];
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /** Перемешать варианты и пересчитать correctIndex. */
  private present(q: Question): Question {
    const order = shuffle(
      this.rng,
      q.options.map((_, i) => i),
    );
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  }
}
