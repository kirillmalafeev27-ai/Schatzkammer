// Комикс-арт: сборка всех рецептов в набор стиля.

import { palette, rgba } from '../../config/palette';
import type { StyleKit } from '../ArtFactory';
import { doorSprites } from './door';
import { effectSprites, sfxWordSpec } from './effects';
import { floorBake } from './floor';
import { heroSprites } from './hero';
import { coinSprites, gemSprites, miscSprites } from './items';
import { obstacleSprites } from './obstacles';
import { caveBake, ledgeBake, wallsBake } from './walls';

export const comicKit: StyleKit = {
  name: 'comic',
  sprites(add, rng) {
    coinSprites(add);
    gemSprites(add, rng);
    miscSprites(add, rng);
    obstacleSprites(add, rng);
    heroSprites(add);
    doorSprites(add, rng);
    effectSprites(add, rng);
  },
  floor: floorBake,
  walls: wallsBake,
  ledge: ledgeBake,
  cave: caveBake,
  vignette() {
    // Запасной путь без фильтра: тёмные края растром.
    return {
      x: 0,
      y: 0,
      w: 512,
      h: 512,
      draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 512, 512);
        ctx.ellipse(256, 256, 230, 210, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(palette.ink, 0.55);
        ctx.fill('evenodd');
        ctx.restore();
        // Растр только в кольце у края: точки растут к краю.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(256, 256, 232, 212, 0, 0, Math.PI * 2);
        ctx.ellipse(256, 256, 175, 158, 0, 0, Math.PI * 2);
        ctx.clip('evenodd');
        ctx.fillStyle = rgba(palette.ink, 0.5);
        for (let y = 0; y < 512; y += 8) {
          for (let x = (y / 8) % 2 ? 4 : 0; x < 512; x += 8) {
            const dx = (x - 256) / 232;
            const dy = (y - 256) / 212;
            const r = Math.sqrt(dx * dx + dy * dy);
            const k = Math.max(0, Math.min(1, (r - 0.75) / 0.25));
            if (k <= 0) continue;
            ctx.beginPath();
            ctx.arc(x, y, k * 3.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      },
    };
  },
  sfxWord: sfxWordSpec,
};
