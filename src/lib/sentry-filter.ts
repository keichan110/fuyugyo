type ErrorEvent = {
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string }> };
    }>;
  };
};

/** 通信断・キャンセル・ブラウザ拡張など、通知対象外のエラーを判定する。 */
export function isIgnoredBrowserError(event: ErrorEvent, originalException: unknown): boolean {
  if (typeof originalException === 'object' && originalException !== null) {
    if ('name' in originalException && originalException.name === 'AbortError') return true;
    if ('status' in originalException && typeof originalException.status === 'number') {
      if (originalException.status >= 400 && originalException.status < 500) return true;
    }
  }

  return (
    event.exception?.values?.some((exception) => {
      if (exception.type === 'AbortError') return true;
      const message = exception.value ?? '';
      // fetch の既知の通信エラーだけを除外し、他の TypeError は通知する。
      if (
        exception.type === 'TypeError' &&
        /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/.test(
          message,
        )
      ) {
        return true;
      }
      if (
        /^ResizeObserver loop (limit exceeded|completed with undelivered notifications\.?)$/.test(
          message,
        )
      ) {
        return true;
      }
      // 自アプリのフレームが混在する場合は落とさず、拡張機能だけの例外を除外する。
      const frames = exception.stacktrace?.frames?.filter((frame) => frame.filename);
      return (
        !!frames?.length &&
        frames.every((frame) =>
          /^(chrome-extension|moz-extension|safari-web-extension):/.test(frame.filename ?? ''),
        )
      );
    }) ?? false
  );
}
