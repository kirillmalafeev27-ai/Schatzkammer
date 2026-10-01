// Единственное место, где живут цвета игры (раздел 7.2 плана).
// Чистый чёрный не используется нигде — только `ink`.

export const palette = {
  ink: '#1b1020', // все контуры и тени; чистый чёрный не используется
  page: '#24124f', // просветы между панелями
  pageDots: '#341c6b', // растр просветов
  panel: '#ffffff', // фон панели вопроса
  caption: '#ffe066', // плашки-подписи

  // окружение — холодное и приглушённое
  caveDeep: '#1a1030',
  rockFar: '#2b2350',
  rock: { base: '#4a3f7a', shadow: '#2f2757', light: '#6e63a8' },
  slab: { base: '#5b5f8f', shadow: '#3d4070', light: '#8085b8', mortar: '#221a3a' },
  moss: '#3f7a6a',
  crystal: { base: '#4fd1c5', glow: '#9ff5ec' },
  doorStone: { base: '#8a7f6a', shadow: '#5e5444', light: '#b8ab8e' },

  // добыча — тёплая и насыщенная; эти цвета больше нигде не встречаются
  gold: { base: '#ffc533', shadow: '#e08a1e', light: '#fff2a8', engrave: '#a45a12' },
  ruby: { base: '#ff3b5c', shadow: '#b0123a', light: '#ffb3c1' },
  emerald: { base: '#2ee59d', shadow: '#0f9a63', light: '#b9ffe0' },
  sapphire: { base: '#3aa0ff', shadow: '#1554c0', light: '#bfe3ff' },

  // герой — сочетание, которого нет ни у добычи, ни у окружения
  hero: {
    hat: '#8a4b2a',
    shirt: '#fff1d6',
    scarf: '#ff6a1a',
    pants: '#2b5d73',
    boots: '#4a2a1a',
    skin: '#f2c094',
    bag: '#c08a52',
    bagStitch: '#7a4e26',
    lantern: '#ffd27a',
  },

  sand: { base: '#e3b46b', shadow: '#b9853f', light: '#ffe1a3' },
  daylight: { early: '#fff6d8', late: '#ff9a4a' },
  torch: '#ffb85c',
  ambient: '#2a2350',

  footprints: { safe: '#fff4d6', warn: '#ff9a3c', danger: '#ff3b3b' },
  good: '#3ddc84',
  bad: '#ff4d4d',

  // Служебные оттенки окружения, производные от основной гаммы (не цвета добычи).
  ironDark: '#2a2236',
  iron: '#4b4458',
  ironLight: '#7d7590',
  bronze: { base: '#9a8458', shadow: '#6b5a3a', light: '#c8b384' }, // приглушённая латунь двери и часов
  flame: { outer: '#e8452c', mid: '#ff8a2a', core: '#ffd36b', white: '#fff5d6' },
  sky: { top: '#7fc8ff', bottom: '#ffe9b8', lateTop: '#ff8a5c', lateBottom: '#ffd27a' },
  jungle: { far: '#3c6e6a', near: '#244a4a' },
  heroEye: '#1b1020',
  sweat: '#bfe9ff',
  paper: '#fff8e8',
  white: '#ffffff',
} as const;

export type Hex = string;

/** '#rrggbb' → 0xrrggbb */
export function hexToInt(hex: Hex): number {
  return parseInt(hex.slice(1), 16);
}

/** '#rrggbb' → [r, g, b] в диапазоне 0..1 */
export function hexToRgb01(hex: Hex): [number, number, number] {
  const n = hexToInt(hex);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** '#rrggbb' → [r, g, b] в диапазоне 0..255 */
export function hexToRgb255(hex: Hex): [number, number, number] {
  const n = hexToInt(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): Hex {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Линейное смешивание двух цветов, t ∈ [0,1]. */
export function mixHex(a: Hex, b: Hex, t: number): Hex {
  const [r1, g1, b1] = hexToRgb255(a);
  const [r2, g2, b2] = hexToRgb255(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Сдвиг цвета: яркость (множитель lightness), оттенок в градусах, насыщенность (множитель). */
export function shiftHex(hex: Hex, lightMul = 1, hueDeg = 0, satMul = 1): Hex {
  const [r, g, b] = hexToRgb255(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h + hueDeg, Math.min(1, s * satMul), Math.max(0, Math.min(1, l * lightMul)));
  return rgbToHex(r2, g2, b2);
}

/** rgba-строка для Canvas 2D. */
export function rgba(hex: Hex, a: number): string {
  const [r, g, b] = hexToRgb255(hex);
  return `rgba(${r},${g},${b},${a})`;
}
