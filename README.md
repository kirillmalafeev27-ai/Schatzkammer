# Сокровищница · Die Schatzkammer

Игра для тренировки немецкого. Каждый верный ответ — шаг искателя сокровищ по залу. Золото тяжелеет, дверь опускается с первой секунды: успел выйти — добыча твоя, не успел — ноль.

Phaser 4 + TypeScript, весь арт рисуется кодом в стиле комикса, свет — собственный шейдер.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
```

Параметры адреса:

| Параметр    | Что делает                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| `?level=3`  | сразу открыть зал 3 (`7` — бесконечный зал)                                |
| `?debug`    | панель отладки (в режиме разработки она открывается клавишей <kbd>`</kbd>) |
| `?art=grey` | серый прототип вместо комиксного арта                                      |
| `?test`     | выключить автопереключение качества по FPS (для автотестов)                |

Управление: нажать на плиту — цель шага; <kbd>1</kbd>–<kbd>4</kbd> — ответ; стрелки — шаг в сторону; <kbd>H</kbd> — к выходу; <kbd>Пробел</kbd> — отменить цель; <kbd>Q</kbd> / <kbd>E</kbd> — выбросить монету / камень; <kbd>P</kbd> или <kbd>Esc</kbd> — пауза.

## Команды

```bash
npm test           # правила, поиск пути, генератор, планировщик, темп, банк вопросов
npm run lint
npm run build      # проверка типов + сборка в dist/
npm run sim        # боты проходят все залы, отчёт по стратегиям
npm run sim -- --level 3 --runs 2000 --tmed 5000 --p 0.8
npm run sim -- --level 5 --override '{"obstacles":6}'   # проба варианта уровня
npm run shots      # скриншоты Playwright (нужен запущенный npm run dev)
npm run shots -- --sizes 390x844,1280x720 --scenario round --out shots
```

## Встраивание

```ts
import { mountTreasury, type QuestionProvider } from './src/embed';

const questions: QuestionProvider = {
  async next() {
    return {
      id: 'q1',
      prompt: 'Ich ___ müde.',
      promptLang: 'de',
      options: ['bin', 'bist', 'ist'],
      optionsLang: 'de',
      correctIndex: 0,
    };
  },
  report({ id, correct, timeMs }) {
    // ответ игрока — для статистики или интервальных повторений
  },
};

const game = mountTreasury(document.getElementById('host')!, {
  questions,
  level: 1, // необязательно
  storage: { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) }, // необязательно
  onFinish: ({ level, escaped, score, stars }) => {}, // необязательно
});

game.destroy();
```

Игра не знает, откуда берутся вопросы: годится любой источник с `next()` и `report()`. Встроенный банк — `src/questions/bank.de.json` (60 проверенных вопросов).

## Устройство

```
src/core/       правила: чистый детерминированный TypeScript без Phaser — редуктор, генератор залов, планировщик, оценка риска
src/config/     все числа (balance.ts, levels.ts) и все цвета (palette.ts)
src/art/        процедурный комикс: обводка, растр, штриховка; рецепты пола, стен, героя, добычи, двери
src/render/     свет ComicLight, виды героя, предметов, двери, песка, эффекты
src/scenes/     BootScene (запекание атласов) и GameScene
src/ui/         DOM-интерфейс: панель вопроса, мешок, экраны меню, залов, итогов, настроек
src/audio/      синтезатор на WebAudio: эффекты, пещерная реверберация, эмбиент
src/questions/  интерфейс вопросов и локальный банк
tools/          sim.ts (симуляция ботами), shots.ts (скриншоты)
```

Отклонения от плана, их причины и отчёт симуляции баланса — в [DECISIONS.md](DECISIONS.md).
