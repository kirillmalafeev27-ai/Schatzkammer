// Сохранения: темп игрока, прогресс по уровням, настройки, флаги обучения.
// По умолчанию — localStorage с префиксом ключей `treasury:`.

import { levels } from '../config/levels';
import { parseHistory, type PaceHistory } from '../core/pace';

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function localStorageAdapter(prefix = 'treasury:'): KeyValueStorage {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(prefix + key, value);
      } catch {
        /* хранилище недоступно — игра работает без сохранений */
      }
    },
  };
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

export type Quality = 'high' | 'low';

export interface Settings {
  sfxVolume: number;
  ambientVolume: number;
  muted: boolean;
  reducedMotion: boolean;
  /** null — следовать системной настройке prefers-reduced-motion. */
  reducedMotionUser: boolean | null;
  quality: Quality;
  qualityAuto: boolean;
  trailHints: boolean;
  sfxLang: 'de' | 'ru';
}

export interface LevelProgress {
  stars: number;
  best: number;
}

export type TutorialFlag = 'start' | 'heavy' | 'risk';

const defaultSettings = (): Settings => ({
  sfxVolume: 0.8,
  ambientVolume: 0.6,
  muted: false,
  reducedMotion: false,
  reducedMotionUser: null,
  quality: 'high',
  qualityAuto: false,
  trailHints: true,
  sfxLang: 'de',
});

function readJson<T>(s: KeyValueStorage, key: string, fallback: T): T {
  const raw = s.get(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export class SaveData {
  readonly store: KeyValueStorage;
  settings: Settings;
  progress: Record<number, LevelProgress>;
  pace: PaceHistory;
  tutorial: Record<TutorialFlag, boolean>;

  constructor(store: KeyValueStorage) {
    this.store = store;
    this.settings = readJson(store, 'settings', defaultSettings());
    this.progress = readJson<Record<number, LevelProgress>>(store, 'progress', {});
    this.pace = parseHistory(store.get('pace'));
    this.tutorial = readJson(store, 'tutorial', { start: false, heavy: false, risk: false });
  }

  saveSettings(): void {
    this.store.set('settings', JSON.stringify(this.settings));
  }
  saveProgress(): void {
    this.store.set('progress', JSON.stringify(this.progress));
  }
  savePace(): void {
    this.store.set('pace', JSON.stringify(this.pace));
  }
  saveTutorial(): void {
    this.store.set('tutorial', JSON.stringify(this.tutorial));
  }

  /** Следующий уровень открывается, когда текущий пройден хотя бы на одну звезду. */
  isUnlocked(levelId: number): boolean {
    if (levelId <= 1) return true;
    return (this.progress[levelId - 1]?.stars ?? 0) >= 1;
  }

  record(levelId: number, stars: number, score: number): { newBest: boolean } {
    const prev = this.progress[levelId] ?? { stars: 0, best: 0 };
    const newBest = stars > 0 && score > prev.best;
    this.progress[levelId] = {
      stars: Math.max(prev.stars, stars),
      best: Math.max(prev.best, stars > 0 ? score : 0),
    };
    this.saveProgress();
    return { newBest };
  }

  highestUnlocked(): number {
    let id = 1;
    for (const l of levels) if (this.isUnlocked(l.id)) id = l.id;
    return id;
  }
}
