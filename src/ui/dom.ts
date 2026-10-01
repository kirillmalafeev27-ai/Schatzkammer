// Мини-помощник для DOM без фреймворков.

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | null | undefined | EventListener> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Перезапустить CSS-анимацию класса. */
export function restartAnim(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Текст задания: «___» становится линией-пропуском. Немецкий текст в регистр не переводится. */
export function promptNodes(text: string): Node[] {
  const parts = text.split('___');
  const out: Node[] = [];
  parts.forEach((p, i) => {
    if (p) out.push(document.createTextNode(p));
    if (i < parts.length - 1) out.push(h('span', { class: 'tz-blank', 'aria-label': 'пропуск' }, ' '));
  });
  return out;
}
