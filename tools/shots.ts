// Скриншоты через Playwright (раздел 0.7): меню, раунд, итоги в нескольких размерах экрана.
// npm run shots -- [--url http://localhost:5173] [--sizes 390x844,768x1024,1280x720] [--out shots] [--art comic]

import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = arg('url', 'http://localhost:5173/');
const out = arg('out', 'shots');
const art = arg('art', '');
const sizes = arg('sizes', '390x844,768x1024,1280x720')
  .split(',')
  .map((s) => s.split('x').map(Number) as [number, number]);
const scenario = arg('scenario', 'all');
const grey = arg('grey', '');

mkdirSync(out, { recursive: true });

type Tz = {
  state: () => any;
  phase: () => string;
  start: (id: number) => void;
  skipIntro: () => void;
  answer: (c: boolean) => void;
  target: (cell: number) => void;
  exit: () => void;
  setTime: (t: number) => void;
  closeBubble: () => void;
  results: () => string | null;
};

async function waitTz(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as any).__tz, null, { timeout: 30_000 });
}

async function tz<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([f, a]) => {
      const api = (window as any).__tz as Tz;
      return (api as any)[f as string](...(a as unknown[]));
    },
    [fn, args] as const,
  );
}

async function playSome(page: Page, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) {
    const s = await tz<any>(page, 'state');
    if (!s || s.status !== 'playing') return;
    if (s.target == null) {
      // Ближайший предмет как цель.
      const items: number[] = [];
      const n = s.g.cols * s.g.rows;
      for (let c = 0; c < n; c++) if (s.items[c]) items.push(c);
      const hx = s.hero % s.g.cols;
      const hy = Math.floor(s.hero / s.g.cols);
      items.sort((a, b) => Math.abs((a % s.g.cols) - hx) + Math.abs(Math.floor(a / s.g.cols) - hy) - (Math.abs((b % s.g.cols) - hx) + Math.abs(Math.floor(b / s.g.cols) - hy)));
      if (items.length) await tz(page, 'target', items[0]);
    }
    await tz(page, 'answer', true);
    await page.waitForTimeout(120);
  }
}

async function run(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  for (const [w, h] of sizes) {
    const dpr = w < 800 ? 2 : 1;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 800 });
    const page = await ctx.newPage();
    if (scenario !== 'tutorial') {
      await page.addInitScript(() => localStorage.setItem('treasury:tutorial', JSON.stringify({ start: true, heavy: true, risk: true })));
    }
    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const q = new URLSearchParams();
    if (art) q.set('art', art);
    if (grey) q.set('art', 'grey');
    q.set('test', '1');
    await page.goto(`${url}?${q.toString()}`);
    await waitTz(page);
    await page.waitForTimeout(1200);
    const tag = `${w}x${h}`;
    if (scenario === 'all' || scenario === 'menu') await page.screenshot({ path: `${out}/${tag}-1-menu.png` });
    if (scenario === 'all' || scenario === 'round') {
      await tz(page, 'start', 1);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${tag}-2-intro.png` });
      await tz(page, 'skipIntro');
      await page.waitForTimeout(400);
      await playSome(page, 9);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${tag}-3-play.png` });
      const s = await tz<any>(page, 'state');
      await tz(page, 'setTime', s.D * 0.78);
      await playSome(page, 4);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/${tag}-4-late.png` });
      // Отсчёт последних секунд.
      const s2 = await tz<any>(page, 'state');
      await tz(page, 'setTime', s2.D - 7600);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${tag}-5-countdown.png` });
      await tz(page, 'exit');
      for (let i = 0; i < 60; i++) {
        const st = await tz<any>(page, 'state');
        if (!st || st.status !== 'playing') break;
        await tz(page, 'answer', true);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${out}/${tag}-6-escape.png` });
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${out}/${tag}-7-results.png` });
    }
    const errs = logs.filter((l) => l.includes('error') || l.includes('pageerror'));
    console.log(`${tag}: ${errs.length ? errs.join('\n') : 'без ошибок'}`);
    await ctx.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
