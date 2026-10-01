import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => localStorage.setItem('treasury:tutorial', JSON.stringify({ start: true, heavy: true, risk: true })));
  await page.goto('http://localhost:5173/?test=1');
  await page.waitForFunction(() => !!(window as any).__tz);
  await page.waitForTimeout(800);
  await page.evaluate(`(async () => { const tz = window.__tz; tz.start(2); tz.skipIntro(); })()`);
  await page.waitForTimeout(1200);
  const dir = '/tmp/claude-0/-home-user-Schatzkammer/2fe108b5-d068-54ba-b7d2-e85fd06051b5/scratchpad/shots';
  const variants: [string, string][] = [
    ['A', `0`],
    ['B', `0.14`],
    ['C', `0.22`],
  ];
  for (const [n, glow] of variants) {
    await page.evaluate(`(() => { const L = window.__tz.app.scene.light; L.glow = ${glow}; })()`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/ab-${n}.png`, clip: { x: 10, y: 50, width: 810, height: 660 } });
  }
  await browser.close();
})();
