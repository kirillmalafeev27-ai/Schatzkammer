// Действия и события редуктора (раздел 13.3).

export type PauseReason = 'user' | 'hidden' | 'blur' | 'tutorial' | 'menu';

export type Action =
  | { type: 'START' }
  | { type: 'TICK'; dt: number }
  | { type: 'ANSWER'; correct: boolean; timeMs: number }
  | { type: 'SET_TARGET'; cell: number }
  | { type: 'CANCEL_TARGET' }
  | { type: 'DROP'; kind: 'coin' | 'gem' }
  | { type: 'PAUSE'; reason: PauseReason }
  | { type: 'RESUME'; reason: PauseReason }
  /** Только для отладки: перемотать часы двери. */
  | { type: 'DEBUG_SET_TIME'; t: number };

export type GameEvent =
  | { type: 'STARTED' }
  | { type: 'PIP'; pips: number; cost: number }
  | { type: 'WRONG' }
  | { type: 'STEP'; from: number; to: number; cost: number; facing: 1 | -1 }
  | { type: 'PICKUP'; cell: number; item: number; bagCount: number }
  | { type: 'PICKUP_BLOCKED'; cell: number; item: number }
  | { type: 'COST_CHANGED'; from: number; to: number }
  | { type: 'DROPPED'; item: number }
  | { type: 'TARGET_SET'; cell: number }
  | { type: 'TARGET_REACHED'; cell: number }
  | { type: 'TARGET_CLEARED' }
  | { type: 'BUMP'; cell: number }
  | { type: 'SAND_WARN'; cell: number }
  | { type: 'SAND_BURIED'; cell: number; item: number }
  | { type: 'DOOR_NOTCH'; n: number }
  | { type: 'COUNTDOWN'; n: number }
  | { type: 'ESCAPED'; score: number; timeLeftMs: number }
  | { type: 'LOCKED_IN'; lost: number }
  | { type: 'PAUSED' }
  | { type: 'RESUMED' };

export type GameEventType = GameEvent['type'];
