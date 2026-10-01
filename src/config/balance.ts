// Все числа баланса и тайминги игры. В сценах магических чисел нет — только ссылки сюда.

export const balance = {
  grid: {
    cols: 9,
    rows: 8,
    minCols: 7,
    minRows: 7,
    /** Минимальный размер клетки на экране, CSS px. */
    minCellCss: 36,
  },

  bag: {
    capacity: 12,
    /** За каждые N предметов шаг стоит на один ответ больше. */
    itemsPerCostStep: 3,
  },

  values: { coin: 1, gem: 5 },

  door: {
    minMs: 60_000,
    maxMs: 150_000,
    /** Механизм щёлкает каждые 10% хода. */
    notchFrac: 0.1,
    countdownFrom: 10,
    /** Выход в последние N мс считается «KNAPP!». */
    narrowEscapeMs: 2000,
  },

  sand: {
    warnMs: 3000,
  },

  answers: {
    wrongFeedbackMs: 1000,
    correctFlashMs: 150,
    flipMs: 150,
    /** Защита от двойного тапа после появления нового вопроса. */
    doubleTapGuardMs: 120,
  },

  pace: {
    defaultTMedMs: 5000,
    minTMedMs: 3000,
    maxTMedMs: 10_000,
    timeWindow: 20,
    defaultP: 0.8,
    minP: 0.5,
    maxP: 1,
    accuracyWindow: 30,
  },

  risk: {
    safeBelow: 0.75,
    dangerAbove: 1.0,
    recalcMs: 250,
  },

  frame: {
    maxDtMs: 100,
  },

  levelGen: {
    doorCornerMargin: 2,
    /** Номинальная точность для бюджета B = doorAnswers × accuracy. */
    budgetAccuracy: 0.66,
    /** Собрать всё и выйти должно стоить не меньше mustExceed × B. */
    mustExceed: 1.5,
    /** Хотя бы один камень можно вынести за gemReach × B. */
    gemReach: 0.7,
    starGap: 5,
    s2Frac: 0.7,
    s3Frac: 0.95,
    maxAttempts: 50,
    relaxStep: 0.1,
    nearBand: 0.3,
    midBand: 0.6,
    nearCoinShare: 0.4,
    midGemsMin: 1,
    midGemsMax: 2,
  },

  planner: {
    beamWidth: 200,
    maxDepth: 10,
  },

  sim: {
    answerSigma: 0.5,
    strategies: { cautious: 0.6, balanced: 0.85, greedy: 1.05 },
    homeMargin: 1.15,
  },

  anim: {
    stepBaseMs: 180,
    stepPerCostMs: 35,
    stepMaxMs: 320,
    /** Анимации, связанные с ходом, не длиннее. */
    moveMaxMs: 400,
    hitStopMs: 70,
    introMaxMs: 2500,
    finaleMaxMs: 2000,
    heroLeanDeg: [0, 6, 12, 18, 22],
    blinkMinMs: 3000,
    blinkMaxMs: 5000,
    breatheMs: 1600,
    coinShineMinMs: 2000,
    coinShineMaxMs: 4000,
    gemPulseMs: 1500,
    crystalPulseMs: 4000,
    obstacleFadeAlpha: 0.45,
    effectMaxCoverMs: 200,
    maxSfxWords: 3,
    sfxWordMs: 900,
    shakeSmallPx: 2,
    shakeTinyPx: 1,
    shakeBigPx: 8,
    zoomPunch: 1.03,
    maxFlashesPerSec: 3,
    pickupFlyMs: 380,
    dropRollMs: 380,
    sandSinkMs: 360,
    sweatFromCost: 3,
    /** Пыль из-под сапог: базовое число частиц и прибавка за ступень цены. */
    stepDustBase: 3,
    stepDustPerCost: 2,
  },

  light: {
    maxLights: 12,
    ambient: 0.3,
    floorMinLight: 0.55,
    steps: [0.3, 0.65, 1.0],
    thresholds: [0.475, 0.825],
    halftoneBand: 0.06,
    /** Шаг растра, CSS px (умножается на DPR). */
    dotSpacingCss: 6,
    /** Насколько цвет света окрашивает сцену (0 — только яркость). */
    tintAmount: 0.75,
    /** Добавка цвета света на верхней ступени: пятна светятся, а не сереют. */
    glow: 0.22,
    /** Насколько верхняя ступень принимает оттенок источника при той же яркости. */
    gel: 0.45,
    torch: { radius: 3.5, intensity: 1.0, flickerIntensity: 0.12, flickerRadius: 0.06 },
    lantern: { radius: 2.2, intensity: 0.8 },
    door: { radius: 3.0, intensity: 1.2, points: 3 },
    gem: { radius: 1.2, intensity: 0.6, pulseMs: 1500 },
    crystal: { radius: 2.0, intensity: 0.5, pulseMs: 4000 },
    hourglass: { radius: 1.0, intensity: 0.5 },
  },

  colorScript: {
    warmFrom: 0.6,
    lateFrom: 0.85,
    heartbeatLastMs: 10_000,
  },

  audio: {
    pitchJitter: 0.05,
    ambientDuckLast10: 0.4,
    dripMinMs: 4000,
    dripMaxMs: 9000,
    coinChainMs: 2000,
  },

  layout: {
    landscapeRatio: 1.2,
    portraitQuestionFrac: 0.42,
    portraitQuestionMin: 300,
    portraitQuestionMax: 420,
    landscapeQuestionFrac: 0.34,
    landscapeQuestionMin: 340,
    landscapeQuestionMax: 480,
    gutterMin: 10,
    gutterMax: 14,
    promptFontMax: 24,
    promptFontMin: 16,
    optionFontMax: 21,
    optionFontMin: 13,
    optionMinHeight: 56,
  },

  quality: {
    cellPxHigh: 128,
    cellPxLow: 96,
    lowFpsThreshold: 45,
    lowFpsSeconds: 3,
    particlesHigh: 300,
    particlesLow: 150,
    maxDpr: 2,
  },

  questions: {
    noRepeatWithin: 10,
    wrongReturnMin: 4,
    wrongReturnMax: 6,
  },

  world: {
    /** Виртуальный размер клетки мира. */
    cell: 128,
    /** Высота северной стены, в клетках. */
    northWall: 1.6,
    /** Тёмный потолок над стеной, в клетках. */
    ceiling: 0.32,
    /** Боковые массивы скал: узкие, чтобы на телефоне зал 9 × 8 помещался с клеткой ≥ 36 px. */
    sideWall: 0.36,
    southLedge: 0.42,
    heroHeight: 1.3,
    obstacleHeight: 1.4,
  },
} as const;

/** Длительность анимации шага по цене (раздел 7.5.7). */
export function stepAnimMs(cost: number): number {
  const a = balance.anim;
  return Math.min(a.stepMaxMs, a.stepBaseMs + a.stepPerCostMs * Math.max(0, cost - 1));
}
