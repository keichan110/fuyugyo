import { useEffect, useState } from 'react';

// SSRを行うWorkersのテストにも読み込まれるため、DOMのグローバル型ではなく利用するAPIだけを定義する。
type EventSource = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};
type KeyboardViewport = EventSource & { height: number; scale: number };

/** ブラウザAPIのイベント購読が可能かを確認する。 */
function isEventSource(value: unknown): value is EventSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'addEventListener' in value &&
    typeof value.addEventListener === 'function' &&
    'removeEventListener' in value &&
    typeof value.removeEventListener === 'function'
  );
}

/** ブラウザの表示領域APIを、DOMがない環境でも安全に判別する。 */
function isKeyboardViewport(value: unknown): value is KeyboardViewport {
  return (
    isEventSource(value) &&
    'height' in value &&
    typeof value.height === 'number' &&
    'scale' in value &&
    typeof value.scale === 'number'
  );
}

/** テキスト入力を行う要素かを、DOMコンストラクターに依存せず判定する。 */
function isTextInput(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if ('isContentEditable' in value && value.isContentEditable === true) return true;
  if (!('tagName' in value)) return false;
  if (value.tagName === 'TEXTAREA') return true;
  return (
    value.tagName === 'INPUT' &&
    'type' in value &&
    typeof value.type === 'string' &&
    ![
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(value.type)
  );
}

/** 入力中の表示領域の縮小からソフトウェアキーボードを検出する。ピンチズームは除外する。 */
export function useMobileKeyboardOpen(): boolean {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const browser: unknown = globalThis;
    if (!isEventSource(browser)) return;
    if (!('visualViewport' in browser) || !isKeyboardViewport(browser.visualViewport)) return;
    if (!('document' in browser) || !isEventSource(browser.document)) return;
    if (!('innerHeight' in browser) || typeof browser.innerHeight !== 'number') return;

    const viewport = browser.visualViewport;
    const document = browser.document;
    let fullHeight = Math.max(browser.innerHeight, viewport.height);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const editing = isTextInput('activeElement' in document ? document.activeElement : null);
      // 入力中は縮小前の高さを保持し、ブラウザのバーの開閉程度ではキーボードと判定しない。
      if (!editing && 'innerHeight' in browser && typeof browser.innerHeight === 'number') {
        fullHeight = Math.max(browser.innerHeight, viewport.height);
      }
      setOpened(editing && viewport.scale === 1 && fullHeight - viewport.height > 150);
    };

    const scheduleUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 0);
    };

    viewport.addEventListener('resize', scheduleUpdate);
    document.addEventListener('focusin', scheduleUpdate);
    document.addEventListener('focusout', scheduleUpdate);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('focusin', scheduleUpdate);
      document.removeEventListener('focusout', scheduleUpdate);
    };
  }, []);

  return opened;
}
