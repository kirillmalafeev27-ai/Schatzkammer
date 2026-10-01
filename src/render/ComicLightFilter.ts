// Комиксный свет (раздел 8): собственный фильтр камеры мира в системе фильтров Phaser 4.
// Свет квантуется на три ступени, переходы заполнены растровыми точками под 45°.

import Phaser from 'phaser';
import { balance } from '../config/balance';

export const MAX_LIGHTS = balance.light.maxLights;

const FRAG = `
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

#define MAX_LIGHTS ${MAX_LIGHTS}
uniform vec2 uResolution;
uniform vec3 uLightPos[MAX_LIGHTS];      // x, y в пикселях текстуры камеры (y вниз), z — радиус в пикселях
uniform vec4 uLightColor[MAX_LIGHTS];    // rgb, w — сила
uniform int uLightCount;
uniform vec3 uAmbient;                   // цвет × сила
uniform vec4 uPlayfield;                 // x0, y0, x1, y1 в пикселях
uniform float uFloorMin;
uniform vec3 uSteps;
uniform vec2 uThresholds;
uniform float uBand;
uniform float uDot;
uniform float uTint;
uniform vec4 uVignette;                  // сила, радиус, пульс, 0
uniform vec3 uVignetteColor;
uniform float uDebug;
uniform float uGlow;

// Ступень с растром: в полосе вокруг порога пиксель внутри точки получает верхнюю ступень.
float stepWithDots(float lum, float lo, float hi, float thr, vec2 p) {
  float t = clamp((lum - (thr - uBand)) / (2.0 * uBand), 0.0, 1.0);
  if (t <= 0.0) return lo;
  if (t >= 1.0) return hi;
  vec2 r = vec2(p.x + p.y, p.y - p.x) * 0.70710678 / uDot;
  vec2 c = fract(r) - 0.5;
  float d = length(c);
  float radius = sqrt(t) * 0.72;
  float aa = 0.9 / uDot;
  float inside = 1.0 - smoothstep(radius - aa, radius + aa, d);
  return mix(lo, hi, inside);
}

void main () {
  vec4 scene = texture2D(uMainSampler, outTexCoord);
  vec2 p = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution;

  vec3 light = uAmbient;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLightPos[i];
    float d = length(p - L.xy) / max(L.z, 1.0);
    if (d < 1.0) {
      light += uLightColor[i].rgb * uLightColor[i].w * (1.0 - smoothstep(0.0, 1.0, d));
    }
  }
  float lum = max(light.r, max(light.g, light.b));
  vec3 hue = light / max(lum, 0.001);
  bool inField = p.x >= uPlayfield.x && p.y >= uPlayfield.y && p.x <= uPlayfield.z && p.y <= uPlayfield.w;
  if (inField && lum < uFloorMin) {
    // Пол не падает на нижнюю ступень; поднятый свет — нейтрально-тёплый, чтобы не грязнить цвета.
    float k = (uFloorMin - lum) / uFloorMin;
    hue = mix(hue, vec3(1.0, 0.94, 0.86), k);
    lum = uFloorMin;
  }
  float q;
  float mid = 0.5 * (uThresholds.x + uThresholds.y);
  if (lum < mid) q = stepWithDots(lum, uSteps.x, uSteps.y, uThresholds.x, p);
  else q = stepWithDots(lum, uSteps.y, uSteps.z, uThresholds.y, p);

  vec3 tint = mix(vec3(1.0), hue, uTint);
  vec3 col = scene.rgb * tint * q;
  // На верхней ступени свет «красит» поверхность своим цветом — пятна светятся, а не сереют.
  float lit = clamp((q - uSteps.y) / max(0.001, uSteps.z - uSteps.y), 0.0, 1.0);
  col += hue * lit * uGlow;
  // Самосветящиеся пиксели (альфа обнулена режимом EMISSIVE) свет не затемняет.
  float emissive = clamp(1.0 - scene.a, 0.0, 1.0);
  col = mix(col, scene.rgb * 1.04, emissive);
  if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(vec3(lum), 1.0); return; }
  if (uDebug > 1.5) { gl_FragColor = vec4(vec3(q), 1.0); return; }

  // Виньетка цветового сценария: тоже ступенями с растром.
  if (uVignette.x > 0.0) {
    vec2 uv = p / uResolution - 0.5;
    uv.x *= uResolution.x / uResolution.y;
    float r = length(uv);
    float v = smoothstep(uVignette.y, uVignette.y + 0.35, r) * uVignette.x;
    vec2 rr = vec2(p.x + p.y, p.y - p.x) * 0.70710678 / (uDot * 1.4);
    float dd = length(fract(rr) - 0.5);
    float dots = 1.0 - smoothstep(sqrt(v) * 0.72 - 0.08, sqrt(v) * 0.72 + 0.08, dd);
    col = mix(col, uVignetteColor * (0.35 + 0.65 * uVignette.z), dots * clamp(v * 1.6, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface LightSource {
  x: number;
  y: number;
  /** Радиус в мировых единицах. */
  radius: number;
  color: [number, number, number];
  intensity: number;
}

export class ComicLightController extends Phaser.Filters.Controller {
  lights: LightSource[] = [];
  /** Пиксели текстуры камеры. */
  resolution: [number, number] = [1, 1];
  playfield: [number, number, number, number] = [0, 0, 0, 0];
  ambient: [number, number, number] = [0, 0, 0];
  floorMin: number = balance.light.floorMinLight;
  dot = 6;
  tint = balance.light.tintAmount;
  vignette: [number, number, number, number] = [0, 0.6, 0, 0];
  vignetteColor: [number, number, number] = [0.1, 0.05, 0.12];
  debug = 0;
  glow: number = balance.light.glow;
  steps: number[] = [...balance.light.steps];
  thresholds: number[] = [...balance.light.thresholds];
  /** Перевод мира в пиксели текстуры камеры. */
  project: (x: number, y: number) => { x: number; y: number; s: number } = (x, y) => ({ x, y, s: 1 });

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, 'FilterComicLight');
  }
}

export class FilterComicLight extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  private readonly posBuf = new Float32Array(MAX_LIGHTS * 3);
  private readonly colBuf = new Float32Array(MAX_LIGHTS * 4);

  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super('FilterComicLight', manager, undefined, FRAG);
  }

  override setupUniforms(controller: Phaser.Filters.Controller, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const c = controller as ComicLightController;
    const pm = this.programManager;
    const n = Math.min(MAX_LIGHTS, c.lights.length);
    // Масштаб: текстура фильтра может отличаться от размера камеры (на всякий случай нормируем).
    const sx = drawingContext.width / Math.max(1, c.resolution[0]);
    const sy = drawingContext.height / Math.max(1, c.resolution[1]);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      if (i < n) {
        const L = c.lights[i];
        const p = c.project(L.x, L.y);
        this.posBuf[i * 3] = p.x * sx;
        this.posBuf[i * 3 + 1] = p.y * sy;
        this.posBuf[i * 3 + 2] = L.radius * p.s * sx;
        this.colBuf[i * 4] = L.color[0];
        this.colBuf[i * 4 + 1] = L.color[1];
        this.colBuf[i * 4 + 2] = L.color[2];
        this.colBuf[i * 4 + 3] = L.intensity;
      } else {
        this.posBuf[i * 3 + 2] = 0;
        this.colBuf[i * 4 + 3] = 0;
      }
    }
    pm.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
    pm.setUniform('uLightPos[0]', this.posBuf);
    pm.setUniform('uLightColor[0]', this.colBuf);
    pm.setUniform('uLightCount', n);
    pm.setUniform('uAmbient', c.ambient);
    pm.setUniform('uPlayfield', [c.playfield[0] * sx, c.playfield[1] * sy, c.playfield[2] * sx, c.playfield[3] * sy]);
    pm.setUniform('uFloorMin', c.floorMin);
    pm.setUniform('uSteps', c.steps);
    pm.setUniform('uThresholds', c.thresholds);
    pm.setUniform('uBand', balance.light.halftoneBand);
    pm.setUniform('uDot', c.dot * sx);
    pm.setUniform('uTint', c.tint);
    pm.setUniform('uVignette', c.vignette);
    pm.setUniform('uVignetteColor', c.vignetteColor);
    pm.setUniform('uDebug', c.debug);
    pm.setUniform('uGlow', c.glow);
  }
}

export function registerComicLight(renderer: Phaser.Renderer.WebGL.WebGLRenderer): boolean {
  try {
    const nodes = renderer.renderNodes;
    if (!nodes.hasNode('FilterComicLight')) {
      nodes.addNodeConstructor('FilterComicLight', FilterComicLight as any);
    }
    return true;
  } catch (e) {
    console.warn('ComicLight: фильтр недоступен', e);
    return false;
  }
}
