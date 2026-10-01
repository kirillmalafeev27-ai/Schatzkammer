// Выбор набора арта: комикс по умолчанию, серый прототип — по ?art=grey.

import type { StyleKit } from './ArtFactory';
import { comicKit } from './recipes/comic';
import { greyKit } from './recipes/grey';

export function pickKit(name: string | null): StyleKit {
  if (name === 'grey') return greyKit;
  return comicKit;
}
