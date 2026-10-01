// Звуковой движок (раздел 10): собственный синтезатор на WebAudio, без аудиофайлов.
// AudioContext запускается по первому жесту; до этого — тишина без ошибок.

import { balance } from '../config/balance';

export interface PlayOpts {
  /** Панорама −1…1 по координате x источника. */
  pan?: number;
  /** Множитель высоты. */
  pitch?: number;
  vol?: number;
  /** Доп. параметр пресета (вес, номер в серии и т. п.). */
  k?: number;
}

export type Preset = (e: AudioEngine, o: Required<PlayOpts>, out: AudioNode, t: number) => void;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambientBus: GainNode | null = null;
  reverb: ConvolverNode | null = null;
  reverbSend: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private brownBuf: AudioBuffer | null = null;
  private ambientNodes: AudioNode[] = [];
  private dripTimer: number | null = null;
  private scrape: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private presets: Record<string, Preset> = {};
  private volumes = { sfx: 0.8, ambient: 0.6, muted: false };
  private duckK = 1;
  private destroyed = false;

  register(presets: Record<string, Preset>): void {
    this.presets = { ...this.presets, ...presets };
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Вызывать из обработчика жеста пользователя. */
  unlock(): void {
    if (this.destroyed) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambientBus = ctx.createGain();
    this.ambientBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.8);
    const rvGain = ctx.createGain();
    rvGain.gain.value = 0.55;
    this.reverb.connect(rvGain);
    rvGain.connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.reverb);
    this.noiseBuf = this.makeNoise(2, 'white');
    this.brownBuf = this.makeNoise(4, 'brown');
    this.applyVolumes();
  }

  private makeNoise(seconds: number, kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  /** Импульс пещерной реверберации: шум с экспоненциальным спадом. */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Ранние отражения — редкие щелчки, хвост — гладкий шум.
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * 0.6;
      }
    }
    return buf;
  }

  setVolumes(sfx: number, ambient: number, muted: boolean): void {
    this.volumes = { sfx, ambient, muted };
    this.applyVolumes();
  }

  /** В последние 10 с эмбиент тише на 40%. */
  duck(on: boolean): void {
    this.duckK = on ? 1 - balance.audio.ambientDuckLast10 : 1;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambientBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambientBus.gain.setTargetAtTime(this.volumes.ambient * this.duckK, t, 0.3);
  }

  play(name: string, opts: PlayOpts = {}): void {
    if (!this.ready || !this.sfxBus) return;
    const preset = this.presets[name];
    if (!preset) return;
    const ctx = this.ctx!;
    const jitter = 1 + (Math.random() * 2 - 1) * balance.audio.pitchJitter;
    const o: Required<PlayOpts> = { pan: opts.pan ?? 0, pitch: (opts.pitch ?? 1) * jitter, vol: opts.vol ?? 1, k: opts.k ?? 0 };
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, o.pan));
    const g = ctx.createGain();
    g.gain.value = o.vol;
    g.connect(panner);
    panner.connect(this.sfxBus);
    try {
      preset(this, o, g, ctx.currentTime + 0.005);
    } catch {
      /* звук не критичен */
    }
  }

  // ── Примитивы для пресетов ────────────────────────────────────────────────

  osc(
    out: AudioNode,
    type: OscillatorType,
    f0: number,
    t: number,
    dur: number,
    peak: number,
    opts: { f1?: number; attack?: number; send?: number; detune?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    if (opts.send && this.reverbSend) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(
    out: AudioNode,
    t: number,
    dur: number,
    peak: number,
    filter: { type: BiquadFilterType; f: number; f1?: number; q?: number },
    opts: { attack?: number; send?: number; brown?: boolean } = {},
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = opts.brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = filter.type;
    bf.frequency.setValueAtTime(filter.f, t);
    if (filter.f1) bf.frequency.exponentialRampToValueAtTime(Math.max(20, filter.f1), t + dur);
    bf.Q.value = filter.q ?? 1;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bf);
    bf.connect(g);
    g.connect(out);
    if (opts.send && this.reverbSend) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ── Эмбиент ───────────────────────────────────────────────────────────────

  startAmbient(): void {
    if (!this.ready || this.ambientNodes.length || !this.ambientBus) return;
    const ctx = this.ctx!;
    // Низкий гул пещеры — фильтрованный коричневый шум с медленным дыханием.
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.ambientBus);
    // Тонкий «ветер» из щели двери.
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.noiseBuf;
    wsrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.9;
    const wg = ctx.createGain();
    wg.gain.value = 0.03;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.11;
    const wlg = ctx.createGain();
    wlg.gain.value = 0.02;
    wl.connect(wlg);
    wlg.connect(wg.gain);
    wsrc.connect(bp);
    bp.connect(wg);
    wg.connect(this.ambientBus);
    src.start();
    lfo.start();
    wsrc.start();
    wl.start();
    this.ambientNodes = [src, lfo, wsrc, wl, g, wg];
    this.scheduleDrip();
  }

  private scheduleDrip(): void {
    if (this.destroyed) return;
    const a = balance.audio;
    const delay = a.dripMinMs + Math.random() * (a.dripMaxMs - a.dripMinMs);
    this.dripTimer = window.setTimeout(() => {
      this.drip();
      this.scheduleDrip();
    }, delay);
  }

  private drip(): void {
    if (!this.ready || !this.ambientBus) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambientBus);
    const f = 900 + Math.random() * 900;
    this.osc(pan, 'sine', f * 1.6, t, 0.16, 0.12, { f1: f * 0.7, send: 0.9 });
    if (Math.random() < 0.4) this.osc(pan, 'sine', f * 1.2, t + 0.21, 0.12, 0.05, { f1: f * 0.6, send: 0.9 });
  }

  /** Далёкий рокот на каждом щелчке механизма. */
  rumble(): void {
    if (!this.ready || !this.ambientBus) return;
    const t = this.ctx!.currentTime + 0.02;
    this.noise(this.ambientBus, t, 1.6, 0.35, { type: 'lowpass', f: 140, f1: 60 }, { attack: 0.25, brown: true, send: 0.6 });
  }

  /** Непрерывный скрежет двери: громкость по скорости. */
  setScrape(level: number): void {
    if (!this.ready || !this.sfxBus) return;
    const ctx = this.ctx!;
    if (!this.scrape) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 330;
      filter.Q.value = 4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      src.start();
      this.scrape = { src, gain, filter };
    }
    const t = ctx.currentTime;
    this.scrape.gain.gain.setTargetAtTime(Math.max(0, level) * 0.05, t, 0.2);
    this.scrape.filter.frequency.setTargetAtTime(260 + 140 * level, t, 0.3);
  }

  stopAmbient(): void {
    for (const n of this.ambientNodes) {
      try {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      } catch {
        /* уже остановлен */
      }
    }
    this.ambientNodes = [];
    if (this.dripTimer != null) clearTimeout(this.dripTimer);
    this.dripTimer = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAmbient();
    try {
      this.scrape?.src.stop();
    } catch {
      /* ничего */
    }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
