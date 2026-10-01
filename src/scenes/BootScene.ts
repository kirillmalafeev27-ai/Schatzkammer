// Загрузка: генерация процедурного арта под экраном «Lädt…» (раздел 7.3.6).

import Phaser from 'phaser';
import { ArtFactory, type StyleKit } from '../art/ArtFactory';
import type { SceneBridge } from './GameScene';

export interface BootData {
  kit: StyleKit;
  cellPx: number;
  bridge: SceneBridge;
  onArt?: (factory: ArtFactory) => void;
}

export class BootScene extends Phaser.Scene {
  private data_!: BootData;

  constructor() {
    super('boot');
  }

  init(data: BootData): void {
    this.data_ = data;
  }

  create(): void {
    const factory = new ArtFactory(this.textures, this.data_.kit, this.data_.cellPx);
    factory.buildStatic();
    this.data_.onArt?.(factory);
    this.scene.start('game', { bridge: this.data_.bridge, factory });
  }
}
