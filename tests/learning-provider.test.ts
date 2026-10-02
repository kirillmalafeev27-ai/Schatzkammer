import { describe, expect, it, vi } from 'vitest';
import { LearningProvider } from '../src/learning/LearningProvider';
import { AUDIO_DISPLAY_CONTEXT, TASK_FORMATS } from '../src/learning/formats';
import type { LearningSettings } from '../src/learning/settings';

const base: LearningSettings = {
  level: 'B1',
  mode: 'recognition',
  // Лексическая тема без своих резервных заданий: так резерв отдаёт только задания темы
  // грамматики, и формат первого вопроса известен заранее.
  lexicalTopic: 'Zukunft & Lebensplanung',
  grammarTopic: 'Wortstellung im Nebensatz',
};

const offline = () => Promise.resolve({ ready: false, speech: false });
const online = () => Promise.resolve({ ready: true, speech: false });

describe('обучающий движок как источник вопросов', () => {
  it('вопрос выбирается в момент показа и несёт свой формат', async () => {
    const provider = new LearningProvider(base, { status: offline });
    expect(provider.prefetch).toBe(false);
    const q = await provider.next();
    expect(q.instruction).toBe(TASK_FORMATS.wortstellung.instruction);
    expect(q.meta).toBe('B1 · Wortstellung im Nebensatz');
    expect(q.promptLang).toBe('de');
    expect(q.options).toHaveLength(4);
    expect(q.rule).toBeTruthy();
    expect(q.hint).toBe('Выбери вариант с правильным порядком слов.');
    expect(q.recall).toBeUndefined();
  });

  it('воспроизведение даёт поле ввода с подсказкой формата', async () => {
    const provider = new LearningProvider({ ...base, mode: 'recall' }, { status: offline });
    const q = await provider.next();
    expect(q.recall).toEqual({ placeholder: 'Напиши предложение целиком' });
    expect(q.hint).toBe('Собери предложение и введи его целиком.');
  });

  it('выбор целого предложения и в воспроизведении идёт с вариантами', async () => {
    const provider = new LearningProvider(
      { ...base, mode: 'recall', grammarTopic: 'Infinitiv mit zu' },
      { status: offline },
    );
    const q = await provider.next();
    expect(q.instruction).toBe(TASK_FORMATS.satzvarianten.instruction);
    expect(q.recall).toBeUndefined();
    expect(q.options).toHaveLength(4);
    expect(q.hint).toBe(TASK_FORMATS.satzvarianten.hints.recall);
  });

  it('аудирование не печатает фразу и перевод, варианты по-русски', async () => {
    const provider = new LearningProvider({ ...base, mode: 'audio' }, { status: offline });
    const q = await provider.next();
    expect(q.prompt).toBe(AUDIO_DISPLAY_CONTEXT);
    expect(q.audioText).toBeTruthy();
    expect(q.translation).toBeUndefined();
    expect(q.optionsLang).toBe('ru');
    expect(q.meta).toBe('B1 · Zukunft & Lebensplanung');
  });

  it('синонимы показывают всё поле слова', async () => {
    const provider = new LearningProvider(
      { ...base, grammarTopic: 'Wortfelder & Synonyme' },
      { status: offline },
    );
    const q = await provider.next();
    expect(q.wordField?.bank).toHaveLength(5);
    expect(q.instruction).toBe(`Вместо стёртого «${q.wordField?.base}» вставьте точный синоним.`);
    // Варианты стоят в нужной форме, поэтому узнаются по основе словарной формы.
    const stem = (w: string) => w.toLocaleLowerCase('de-DE').slice(0, 4);
    for (const option of q.options) {
      expect(q.wordField?.bank.map(stem)).toContain(stem(option));
    }
  });

  it('без готового сервера пул не шлёт запросов; с готовым — шлёт', async () => {
    const generate = vi.fn(async () => []);
    const quiet = new LearningProvider(base, { status: offline, generate });
    await quiet.status();
    quiet.setEnabled(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(generate).not.toHaveBeenCalled();

    const busy = new LearningProvider(base, { status: online, generate });
    busy.setEnabled(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(generate).toHaveBeenCalledTimes(1);
    quiet.destroy();
    busy.destroy();
  });

  it('свободный ответ уходит в проверку с настройками; неизвестный вопрос сравнивается на месте', async () => {
    const evaluate = vi.fn(async () => ({ correct: true, feedback: 'Верно.' }));
    const provider = new LearningProvider({ ...base, mode: 'recall' }, { status: offline, evaluate });
    const q = await provider.next();
    expect(await provider.evaluate(q, 'egal')).toEqual({ correct: true, feedback: 'Верно.' });
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ id: q.id }),
      'egal',
      expect.objectContaining({ mode: 'recall' }),
    );

    const stranger = { ...q, id: 'unknown', options: ['eins', 'zwei', 'drei', 'vier'], correctIndex: 1 };
    expect(await provider.evaluate(stranger, 'Zwei')).toMatchObject({ correct: true });
    expect(await provider.evaluate(stranger, 'drei')).toEqual({
      correct: false,
      feedback: 'Пока не совпало. Ответ: zwei',
    });
  });
});
