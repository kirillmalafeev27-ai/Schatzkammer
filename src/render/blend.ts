// Собственные режимы смешивания.
// EMISSIVE: цвет рисуется как обычно, а альфа кадра под объектом обнуляется — световой фильтр
// читает это как «светится сам» и не затемняет пиксель. Объекты, нарисованные поверх
// (герой перед монетой), возвращают альфу 1 — перекрытие честное.
// ADD_KEEP: аддитивный свет, не трогающий альфу (стандартный ADD в Phaser умножает на DST_ALPHA
// и «проваливался» бы над светящимися пикселями).

import Phaser from 'phaser';

export const blend = {
  emissive: Phaser.BlendModes.NORMAL as number,
  addKeep: Phaser.BlendModes.ADD as number,
};

export function registerBlendModes(renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer): void {
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  const gl = renderer.gl;
  const modes = renderer.blendModes as unknown as object[];
  const make = (func: number[]) => ({ enabled: true, color: [0, 0, 0, 0], equation: [gl.FUNC_ADD, gl.FUNC_ADD], func });
  modes.push(make([gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA]));
  blend.emissive = modes.length - 1;
  modes.push(make([gl.ONE, gl.ONE, gl.ZERO, gl.ONE]));
  blend.addKeep = modes.length - 1;
}
