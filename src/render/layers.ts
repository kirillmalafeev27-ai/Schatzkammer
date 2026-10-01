// Слои мира (раздел 7.6). К слоям 0–4 применяется световой фильтр; слой 5 рисует вторая камера без фильтра.

import Phaser from 'phaser';

export interface Layers {
  /** 0 — фон пещеры за стенами. */
  bg: Phaser.GameObjects.Layer;
  /** 1 — пол уровня и дюны. */
  floor: Phaser.GameObjects.Layer;
  /** 2 — контактные тени. */
  shadows: Phaser.GameObjects.Layer;
  /** 3 — объекты с сортировкой по y основания. */
  objects: Phaser.GameObjects.Layer;
  /** 4 — атмосфера: пыль в луче, струи песка, искры. */
  atmos: Phaser.GameObjects.Layer;
  /** 5 — то, что читается поверх света: следы, цель, ореолы, слова-звуки. */
  overlay: Phaser.GameObjects.Layer;
}

export function createLayers(scene: Phaser.Scene): Layers {
  return {
    bg: scene.add.layer(),
    floor: scene.add.layer(),
    shadows: scene.add.layer(),
    objects: scene.add.layer(),
    atmos: scene.add.layer(),
    overlay: scene.add.layer(),
  };
}

export function litLayers(l: Layers): Phaser.GameObjects.Layer[] {
  return [l.bg, l.floor, l.shadows, l.objects, l.atmos];
}

export function destroyLayerChildren(l: Layers): void {
  for (const layer of [l.bg, l.floor, l.shadows, l.objects, l.atmos, l.overlay]) layer.removeAll(true);
}
