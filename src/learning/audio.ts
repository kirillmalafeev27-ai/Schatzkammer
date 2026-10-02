// Аудирование произносит немецкую фразу и никогда её не печатает. Если у сервера есть ключ,
// звучит ElevenLabs; если нет — ту же фразу читает голос браузера, так что режим играется и без
// платного провайдера. Порт question-audio из Conveyor.

import { API_PATHS } from './client.ts';

const CACHE_LIMIT = 60;
const clipCache = new Map<string, ArrayBuffer>();

let playbackToken = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeUrl = '';

// iOS запускает звук только внутри жеста пользователя, а аудирование сначала ждёт mp3 — к его
// приходу жест закончен и play() отклоняется. Один элемент, разблокированный, пока палец ещё
// на экране, может звучать до конца сессии, поэтому воспроизведение использует его, а не новый
// Audio(), которому никто ничего не разрешал.
const SILENT_CLIP =
  'data:audio/mpeg;base64,/+MYxAAAAANIAUAAAASEEB/jwOFM/0MM/90b/+RhST//w4NFwOjf///PZu////9lns5GFDv//l9GlUIEEIAAAgIg8Ir/JGq3/+MYxDsLIj5QMYcoAP0dv9HIjUcH//yYSg+CIbkGP//8w0bLVjUP///3Z0x5QCAv/yLjwtGKTEFNRTMuOTeqqqqqqqqqqqqq/+MYxEkNmdJkUYc4AKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

let unlockedPlayer: HTMLAudioElement | null = null;
/** false — у сервера нет ключа озвучки: фраза сразу читается голосом браузера, без лишнего запроса. */
let providerSpeech: boolean | null = null;

export function setProviderSpeech(available: boolean): void {
  providerSpeech = available;
}
let speechUnlocked = false;

/** Вызывать только внутри настоящего жеста — нажатия или клавиши; после первого раза ничего не стоит. */
export function unlockQuestionAudio(): void {
  if (typeof window === 'undefined') return;
  if (!unlockedPlayer) {
    const player = new Audio();
    player.preload = 'auto';
    player.muted = true;
    player.src = SILENT_CLIP;
    void player.play().catch(() => {
      // Отказ значит лишь, что iOS не принял этот жест; элемент остаётся немым, следующее
      // нажатие попробует снова.
    });
    unlockedPlayer = player;
  }
  if (!speechUnlocked && 'speechSynthesis' in window) {
    // Голос браузера — запасной путь, и его первое высказывание тоже привязано к жесту,
    // поэтому он заводится беззвучно.
    const primer = new SpeechSynthesisUtterance(' ');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
    speechUnlocked = true;
  }
}

function releaseActive(): void {
  if (activeAudio) {
    activeAudio.pause();
    // Разблокированный элемент сохраняет разрешение при смене источника, поэтому его
    // опустошают, а не выбрасывают.
    activeAudio.removeAttribute('src');
    activeAudio.load();
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = '';
  }
}

export function stopQuestionAudio(): void {
  playbackToken += 1;
  releaseActive();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowser(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = 0.88;
  const german = window.speechSynthesis.getVoices?.().find((voice) => /^de[-_]/iu.test(voice.lang ?? ''));
  if (german) utterance.voice = german;
  window.speechSynthesis.speak(utterance);
}

function remember(text: string, clip: ArrayBuffer): void {
  if (clipCache.has(text)) clipCache.delete(text);
  clipCache.set(text, clip);
  while (clipCache.size > CACHE_LIMIT) clipCache.delete(clipCache.keys().next().value!);
}

export async function playQuestionAudio(text: string): Promise<void> {
  const sentence = text.trim();
  if (!sentence) return;

  stopQuestionAudio();
  const token = playbackToken;

  let clip = clipCache.get(sentence);
  if (!clip && providerSpeech === false) {
    speakWithBrowser(sentence);
    return;
  }
  if (!clip) {
    try {
      const response = await fetch(API_PATHS.speech, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
      });
      if (!response.ok) throw new Error(`tts_${response.status}`);
      clip = await response.arrayBuffer();
      if (!clip.byteLength) throw new Error('tts_empty');
      remember(sentence, clip);
    } catch {
      if (token === playbackToken) speakWithBrowser(sentence);
      return;
    }
  }
  if (token !== playbackToken) return;

  try {
    const url = URL.createObjectURL(new Blob([clip.slice(0)], { type: 'audio/mpeg' }));
    const audio = unlockedPlayer ?? new Audio();
    audio.muted = false;
    audio.src = url;
    activeAudio = audio;
    activeUrl = url;
    audio.addEventListener(
      'ended',
      () => {
        if (activeAudio === audio) releaseActive();
      },
      { once: true },
    );
    await audio.play();
  } catch {
    // И запрет автозапуска, и ошибка декодирования оставляют голос браузера — ему не нужен
    // объектный URL, и фразу всё равно слышно.
    if (token === playbackToken) {
      releaseActive();
      speakWithBrowser(sentence);
    }
  }
}
