// Серый прототип (этап 2): простые фигуры под теми же ключами, что и комикс-арт.
// Остаётся в игре как отладочный режим (?art=grey).

import { palette } from '../../config/palette';
import type { StyleKit } from '../ArtFactory';
import { SPR } from '../manifest';
import { CELL } from '../../render/geometry';
import type { Ctx } from '../comicKit';

const grey = (v: number) => `rgb(${v},${v},${v})`;

function rect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string = palette.ink,
  lw = 3,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function circle(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string | null = palette.ink as string,
  lw = 3,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export const greyKit: StyleKit = {
  name: 'grey',
  sprites(add) {
    const box = (name: string, w: number, h: number, ox: number, oy: number, draw: (c: Ctx) => void) =>
      add(name, { w, h, ox, oy, draw });

    box(SPR.coin, 48, 48, 24, 34, (c) => circle(c, 24, 24, 18, '#d8c040'));
    box(SPR.coinShine, 48, 48, 24, 34, (c) => circle(c, 18, 18, 5, '#ffffff', null));
    box(SPR.shadow, 80, 30, 40, 15, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(40, 15, 36, 12, 0, 0, Math.PI * 2);
      c.fill();
    });
    box(SPR.glint, 24, 24, 12, 12, (c) => circle(c, 12, 12, 6, '#ffffff', null));
    box(SPR.sparkle, 24, 24, 12, 12, (c) => circle(c, 12, 12, 5, '#ffffff', null));
    box(SPR.dot, 12, 12, 6, 6, (c) => circle(c, 6, 6, 5, '#ffffff', null));
    box(SPR.softDot, 32, 32, 16, 16, (c) => circle(c, 16, 16, 14, 'rgba(255,255,255,0.5)', null));
    box(SPR.ring, 64, 64, 32, 32, (c) => circle(c, 32, 32, 28, 'rgba(0,0,0,0)', '#ffffff', 4));
    box(SPR.pedestal, 70, 30, 35, 22, (c) => rect(c, 6, 4, 58, 20, grey(120)));
    const gemCol = { ruby: '#c04050', emerald: '#40a070', sapphire: '#4070c0' } as const;
    for (const k of ['ruby', 'emerald', 'sapphire'] as const) {
      box(SPR.gem[k], 60, 60, 30, 52, (c) => {
        c.beginPath();
        c.moveTo(30, 6);
        c.lineTo(54, 30);
        c.lineTo(30, 54);
        c.lineTo(6, 30);
        c.closePath();
        c.fillStyle = gemCol[k];
        c.fill();
        c.strokeStyle = palette.ink;
        c.lineWidth = 3;
        c.stroke();
      });
      box(SPR.halo[k], 120, 120, 60, 60, (c) => circle(c, 60, 60, 50, 'rgba(0,0,0,0)', gemCol[k], 4));
    }
    for (const n of SPR.column) box(n, 80, 190, 40, 180, (c) => rect(c, 8, 8, 64, 172, grey(110)));
    for (const n of SPR.rubble) box(n, 110, 90, 55, 80, (c) => circle(c, 55, 50, 34, grey(100)));
    for (const n of SPR.head) box(n, 110, 100, 55, 90, (c) => circle(c, 55, 50, 40, grey(115)));

    const h = SPR.hero;
    box(h.bootB, 30, 20, 12, 18, (c) => rect(c, 2, 2, 26, 16, palette.hero.boots));
    box(h.bootF, 30, 20, 12, 18, (c) => rect(c, 2, 2, 26, 16, palette.hero.boots));
    box(h.legB, 20, 34, 10, 2, (c) => rect(c, 2, 2, 16, 30, palette.hero.pants));
    box(h.legF, 20, 34, 10, 2, (c) => rect(c, 2, 2, 16, 30, palette.hero.pants));
    box(h.torso, 56, 56, 28, 54, (c) => rect(c, 4, 4, 48, 50, palette.hero.shirt));
    box(h.armB, 18, 44, 9, 4, (c) => rect(c, 2, 2, 14, 40, palette.hero.shirt));
    box(h.armF, 18, 44, 9, 4, (c) => rect(c, 2, 2, 14, 40, palette.hero.shirt));
    box(h.head, 64, 60, 32, 56, (c) => circle(c, 32, 30, 27, palette.hero.skin));
    for (const e of [h.eyes, h.eyesFront, h.eyesBack])
      box(e, 40, 16, 20, 8, (c) => {
        circle(c, 10, 8, 5, '#ffffff');
        circle(c, 30, 8, 5, '#ffffff');
      });
    box(h.eyesClosed, 40, 16, 20, 8, (c) => rect(c, 4, 7, 32, 2, palette.ink, palette.ink, 1));
    for (const b of [h.browsNeutral, h.browsWorried, h.browsStrain, h.browsHappy])
      box(b, 40, 12, 20, 6, (c) => rect(c, 4, 4, 32, 3, palette.ink, palette.ink, 1));
    for (const m of [h.mouthSmile, h.mouthOpen, h.mouthFlat, h.mouthGrit])
      box(m, 20, 12, 10, 6, (c) => rect(c, 3, 4, 14, 3, palette.ink, palette.ink, 1));
    box(h.hat, 80, 40, 40, 34, (c) => rect(c, 4, 18, 72, 14, palette.hero.hat));
    box(h.scarf, 50, 20, 25, 10, (c) => rect(c, 3, 3, 44, 14, palette.hero.scarf));
    box(h.scarfTail, 40, 18, 4, 6, (c) => rect(c, 2, 2, 36, 12, palette.hero.scarf));
    box(h.lantern, 24, 30, 12, 4, (c) => rect(c, 3, 4, 18, 24, palette.hero.lantern));
    h.bag.forEach((n, i) =>
      box(n, 60 + i * 6, 60 + i * 8, 30, 50, (c) => rect(c, 4, 4, 52 + i * 6, 52 + i * 8, palette.hero.bag)),
    );
    box(h.sweat, 12, 16, 6, 8, (c) => circle(c, 6, 9, 5, palette.sweat));

    box(SPR.torchHolder, 40, 60, 20, 20, (c) => rect(c, 14, 10, 12, 44, grey(70)));
    SPR.flames.forEach((n, i) =>
      box(n, 40, 60, 20, 56, (c) => {
        c.beginPath();
        c.moveTo(20, 6 + i);
        c.lineTo(34, 54);
        c.lineTo(6, 54);
        c.closePath();
        c.fillStyle = '#e08030';
        c.fill();
      }),
    );
    box(SPR.ember, 8, 8, 4, 4, (c) => circle(c, 4, 4, 3, '#ffb040', null));

    const d = SPR.door;
    box(d.slab, 110, 170, 55, 0, (c) => rect(c, 2, 2, 106, 166, grey(140)));
    box(d.frameL, 34, 200, 17, 200, (c) => rect(c, 2, 2, 30, 196, grey(90)));
    box(d.frameR, 34, 200, 17, 200, (c) => rect(c, 2, 2, 30, 196, grey(90)));
    box(d.lintel, 180, 40, 90, 40, (c) => rect(c, 2, 2, 176, 36, grey(90)));
    box(d.gear, 40, 40, 20, 20, (c) => circle(c, 20, 20, 16, grey(80)));
    box(d.chain, 8, 60, 4, 0, (c) => rect(c, 2, 0, 4, 60, grey(60), grey(60), 1));
    box(d.sky, 110, 160, 55, 160, (c) => rect(c, 0, 0, 110, 160, '#8ab', '#8ab', 1));
    box(d.skyLate, 110, 160, 55, 160, (c) => rect(c, 0, 0, 110, 160, '#d96', '#d96', 1));
    box(d.beam, 120, 300, 60, 0, (c) => {
      c.fillStyle = 'rgba(255,240,200,0.35)';
      c.beginPath();
      c.moveTo(20, 0);
      c.lineTo(100, 0);
      c.lineTo(120, 300);
      c.lineTo(0, 300);
      c.closePath();
      c.fill();
    });
    box(d.rays, 120, 100, 60, 100, (c) =>
      rect(c, 0, 0, 120, 100, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0)', 1),
    );

    box(SPR.hourglass.frame, 56, 92, 28, 46, (c) => rect(c, 4, 4, 48, 84, 'rgba(0,0,0,0)', grey(150), 4));
    box(SPR.hourglass.sand, 36, 36, 18, 36, (c) =>
      rect(c, 2, 2, 32, 32, palette.sand.base, palette.sand.base, 1),
    );
    box(SPR.hourglass.glass, 56, 92, 28, 46, (c) =>
      rect(c, 8, 8, 40, 76, 'rgba(255,255,255,0.15)', 'rgba(0,0,0,0)', 1),
    );

    box(SPR.sandStream, 24, 190, 12, 190, (c) =>
      rect(c, 8, 0, 8, 190, palette.sand.base, palette.sand.base, 1),
    );
    box(SPR.sandGrain, 8, 8, 4, 4, (c) => circle(c, 4, 4, 3, palette.sand.light, null));
    SPR.dunes.forEach((n, i) =>
      box(n, 130, 80, 65, 60, (c) => {
        c.fillStyle = palette.sand.base;
        c.beginPath();
        c.ellipse(65, 60, 40 + i * 12, 10 + i * 10, 0, 0, Math.PI * 2);
        c.fill();
      }),
    );
    box(SPR.puff, 60, 40, 30, 30, (c) => circle(c, 30, 22, 16, 'rgba(230,200,150,0.6)', null));
    box(SPR.crack, 60, 20, 30, 10, (c) => rect(c, 4, 8, 52, 4, palette.ink, palette.ink, 1));

    const pr = (n: string, col: string) =>
      box(n, 26, 36, 13, 18, (c) => {
        c.beginPath();
        c.ellipse(13, 18, 9, 15, 0, 0, Math.PI * 2);
        c.fillStyle = col;
        c.fill();
      });
    SPR.print.safe.forEach((n) => pr(n, palette.footprints.safe));
    SPR.print.warn.forEach((n) => pr(n, palette.footprints.warn));
    SPR.print.danger.forEach((n) => pr(n, palette.footprints.danger));
    SPR.print.plain.forEach((n) => pr(n, '#dddddd'));
    box(SPR.badge, 44, 44, 22, 22, (c) => circle(c, 22, 22, 18, palette.caption));
    box(SPR.targetRing, CELL, CELL, CELL / 2, CELL / 2, (c) =>
      rect(c, 6, 6, CELL - 12, CELL - 12, 'rgba(0,0,0,0)', '#ffffff', 4),
    );
    box(SPR.targetGlow, CELL, CELL, CELL / 2, CELL / 2, (c) =>
      rect(c, 6, 6, CELL - 12, CELL - 12, 'rgba(255,255,255,0.2)', 'rgba(0,0,0,0)', 1),
    );
    box(SPR.pipFull, 22, 22, 11, 11, (c) => rect(c, 3, 3, 16, 16, palette.good));
    box(SPR.pipEmpty, 22, 22, 11, 11, (c) => rect(c, 3, 3, 16, 16, '#ffffff'));
    box(SPR.lightSpot, 128, 128, 64, 64, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
    box(SPR.rayBurst, 128, 128, 64, 64, (c) => circle(c, 64, 64, 50, 'rgba(255,255,255,0.3)', null));
    box(SPR.chest, 120, 90, 60, 80, (c) => rect(c, 8, 20, 104, 62, '#8a5a30'));
  },

  floor(geom, level) {
    return {
      x: 0,
      y: 0,
      w: geom.floorW,
      h: geom.floorH,
      draw(c) {
        c.fillStyle = grey(40);
        c.fillRect(0, 0, geom.floorW, geom.floorH);
        for (let y = 0; y < level.g.rows; y++)
          for (let x = 0; x < level.g.cols; x++) {
            c.fillStyle = (x + y) % 2 ? grey(150) : grey(160);
            c.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
          }
      },
    };
  },
  walls(geom) {
    const b = geom.bounds;
    return {
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      draw(c) {
        c.fillStyle = grey(70);
        c.fillRect(b.x, b.y, b.w, -b.y);
        c.fillRect(b.x, 0, geom.sideW, geom.floorH);
        c.fillRect(geom.floorW, 0, geom.sideW, geom.floorH);
        const o = geom.door.opening;
        c.clearRect(o.x, o.y, o.w, o.h);
      },
    };
  },
  ledge(geom) {
    const b = geom.bounds;
    return {
      x: b.x,
      y: geom.floorH - 10,
      w: b.w,
      h: geom.southH + 10,
      draw(c) {
        c.fillStyle = grey(60);
        c.fillRect(b.x, geom.floorH, b.w, geom.southH);
      },
    };
  },
  cave(geom) {
    const b = geom.bounds;
    const m = 600;
    return {
      x: b.x - m,
      y: b.y - m,
      w: b.w + m * 2,
      h: b.h + m * 2,
      draw(c) {
        c.fillStyle = grey(25);
        c.fillRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
      },
    };
  },
  vignette() {
    return {
      x: 0,
      y: 0,
      w: 512,
      h: 512,
      draw(c) {
        const g = c.createRadialGradient(256, 256, 120, 256, 256, 360);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.7)');
        c.fillStyle = g;
        c.fillRect(0, 0, 512, 512);
      },
    };
  },
  sfxWord(text, style) {
    const size = style.size;
    const w = size * (text.length * 0.62 + 1);
    const h = size * 1.6;
    return {
      w,
      h,
      ox: w / 2,
      oy: h / 2,
      draw(c) {
        c.font = `${size}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = style.fill;
        c.fillText(text, w / 2, h / 2);
      },
    };
  },
};
