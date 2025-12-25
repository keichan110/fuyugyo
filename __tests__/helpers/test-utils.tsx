/**
 * テストユーティリティ関数
 *
 * Reactコンポーネントのテストで共通して使用されるヘルパー関数を提供します。
 * Testing Library の拡張機能やカスタムレンダリング関数を含みます。
 */

import { type RenderOptions, render } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import React from "react";

// プロバイダーラッパーコンポーネント
type ProvidersProps = {
  children: React.ReactNode;
};

const TestProviders: React.FC<ProvidersProps> = ({ children }) => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    {children}
  </ThemeProvider>
);

// カスタムレンダリング関数の型定義
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  initialProps?: Record<string, unknown>;
}

/**
 * カスタムレンダリング関数
 *
 * React Testing Library の render 関数を拡張し、
 * アプリケーションで使用する各種プロバイダーを自動で含めます。
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { initialProps, ...renderOptions } = options;

  // プロパティが指定されている場合はコンポーネントを cloneElement で拡張
  const elementWithProps = initialProps
    ? React.cloneElement(ui, initialProps)
    : ui;

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <TestProviders>{children}</TestProviders>
  );

  return render(elementWithProps, { wrapper: Wrapper, ...renderOptions });
};

/**
 * 非同期コンポーネント用のユーティリティ
 */
export const waitForElementToBeRemoved = async (
  callback: () => HTMLElement | null
): Promise<void> =>
  new Promise((resolve) => {
    const element = callback();
    if (!element) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!callback()) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

/**
 * フォーム送信のシミュレーション
 */
export const submitForm = (form: HTMLFormElement): void => {
  const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);
};

/**
 * 日付関連のテストユーティリティ
 */
export const setSystemDate = (date: string | Date): jest.SpyInstance => {
  const mockDate = typeof date === "string" ? new Date(date) : date;
  return jest.spyOn(Date, "now").mockReturnValue(mockDate.getTime());
};

export const restoreSystemDate = (spy: jest.SpyInstance): void => {
  spy.mockRestore();
};

/**
 * ローカルストレージのモック
 */
export const mockLocalStorage = () => {
  const store: { [key: string]: string } = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      store[key] = undefined as any;
    }),
    clear: jest.fn(() => {
      for (const key of Object.keys(store)) {
        store[key] = undefined as any;
      }
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
  };
};

/**
 * ファイルアップロードのシミュレーション
 */
export const createMockFile = (
  name = "test-file.txt",
  size = 1024,
  type = "text/plain"
): File => {
  const content = "a".repeat(size);
  return new File([content], name, { type });
};

/**
 * レスポンシブブレークポイントのテスト用ユーティリティ
 */
export const mockMatchMedia = (matches = false) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

/**
 * エラーハンドリングのテスト用ユーティリティ
 */
export const suppressConsoleError = (): jest.SpyInstance =>
  jest.spyOn(console, "error").mockImplementation(() => {
    // Intentionally suppress console.error in tests
  });

export const suppressConsoleWarn = (): jest.SpyInstance =>
  jest.spyOn(console, "warn").mockImplementation(() => {
    // Intentionally suppress console.warn in tests
  });

/**
 * テスト用のカスタムフック
 */
export const createMockIntersectionObserver = () => {
  const mockIntersectionObserver = jest.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  });

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: mockIntersectionObserver,
  });

  Object.defineProperty(global, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: mockIntersectionObserver,
  });

  return mockIntersectionObserver;
};

/**
 * テスト用のダミーイベントハンドラー
 */
export const createMockEventHandlers = () => ({
  onClick: jest.fn(),
  onChange: jest.fn(),
  onSubmit: jest.fn(),
  onFocus: jest.fn(),
  onBlur: jest.fn(),
  onKeyDown: jest.fn(),
  onKeyUp: jest.fn(),
});

/**
 * API レスポンスのモック作成ヘルパー
 */
export const createMockApiResponse = <T,>(data: T, success = true) =>
  success
    ? { success: true as const, data }
    : { success: false as const, error: "Mock API Error" };

// 共通のexportとしてTesting Libraryのutilitiesも再エクスポート
export * from "@testing-library/react";
export { userEvent } from "@testing-library/user-event";
