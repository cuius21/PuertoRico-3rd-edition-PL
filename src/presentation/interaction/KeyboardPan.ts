const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

export class KeyboardPan {
  private keys = new Set<string>();
  private removers: (() => void)[] = [];

  constructor(
    private document: Document,
    private enabled: () => boolean,
    private pan: (x: number, y: number) => void,
  ) {
    const on = (target: EventTarget, name: string, listener: EventListener) => {
      target.addEventListener(name, listener);
      this.removers.push(() => target.removeEventListener(name, listener));
    };
    on(document, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.isComposing ||
        !this.allowed(e.target)
      ) {
        this.clear();
        return;
      }
      if (!KEYS.has(e.code) || e.defaultPrevented) return;
      e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        this.move(12);
      }
    });
    on(document, 'keyup', (event) =>
      this.keys.delete((event as KeyboardEvent).code),
    );
    on(document, 'visibilitychange', () => this.clear());
    on(document, 'focusin', (event) => {
      if (!this.allowed(event.target)) this.clear();
    });
    if (document.defaultView)
      on(document.defaultView, 'blur', () => this.clear());
  }

  private allowed(target?: EventTarget | null) {
    const element = target as Element | null | undefined;
    return (
      this.enabled() &&
      !this.document.hidden &&
      !element?.closest?.(EDITABLE) &&
      !this.document.activeElement?.closest(EDITABLE) &&
      !this.document.querySelector('dialog[open], [aria-modal="true"]')
    );
  }

  private move(pixels: number) {
    const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const y = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const length = Math.hypot(x, y);
    if (length) this.pan((x / length) * pixels, (y / length) * pixels);
  }

  update(seconds: number) {
    if (!this.allowed()) this.clear();
    else this.move(420 * Math.min(seconds, 0.08));
  }

  clear() {
    this.keys.clear();
  }

  destroy() {
    this.clear();
    this.removers.forEach((remove) => remove());
    this.removers = [];
  }
}
