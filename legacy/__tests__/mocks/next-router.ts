/**
 * Next.js Router モック
 *
 * Next.js App Router の navigation hooks (useRouter, useSearchParams等) を
 * テスト環境でモック化するための設定です。
 */

import { jest } from "@jest/globals";

// Router モック状態の管理
type RouterMockState = {
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  routerMethods: {
    push: jest.Mock;
    replace: jest.Mock;
    back: jest.Mock;
    forward: jest.Mock;
    refresh: jest.Mock;
    prefetch: jest.Mock;
  };
};

// デフォルトのルーター状態
const defaultRouterState: RouterMockState = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  params: {},
  routerMethods: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  },
};

// 現在のルーター状態（テスト間で共有）
let currentRouterState = { ...defaultRouterState };

/**
 * useRouter モックの作成
 */
export const createMockUseRouter = (
  overrides: Partial<RouterMockState["routerMethods"]> = {}
) =>
  jest.fn(() => ({
    ...currentRouterState.routerMethods,
    ...overrides,
  }));

/**
 * useSearchParams モックの作成
 */
export const createMockUseSearchParams = (
  searchParams?: URLSearchParams | string
) => {
  let params: URLSearchParams;
  if (!searchParams) {
    params = currentRouterState.searchParams;
  } else if (typeof searchParams === "string") {
    params = new URLSearchParams(searchParams);
  } else {
    params = searchParams;
  }

  const mockSearchParams = {
    get: jest.fn((key: string) => params.get(key)),
    getAll: jest.fn((key: string) => params.getAll(key)),
    has: jest.fn((key: string) => params.has(key)),
    keys: jest.fn(() => params.keys()),
    values: jest.fn(() => params.values()),
    entries: jest.fn(() => params.entries()),
    forEach: jest.fn((callback: (value: string, key: string) => void) =>
      params.forEach(callback)
    ),
    toString: jest.fn(() => params.toString()),
  };

  return jest.fn(() => mockSearchParams);
};

/**
 * usePathname モックの作成
 */
export const createMockUsePathname = (pathname?: string) =>
  jest.fn(() => pathname || currentRouterState.pathname);

/**
 * useParams モックの作成
 */
export const createMockUseParams = (params?: Record<string, string>) =>
  jest.fn(() => params || currentRouterState.params);

/**
 * ルーター状態をセットアップする関数
 */
export const setupRouterMock = (
  options: {
    pathname?: string;
    searchParams?: string | URLSearchParams;
    params?: Record<string, string>;
    routerOverrides?: Partial<RouterMockState["routerMethods"]>;
  } = {}
) => {
  const {
    pathname = "/",
    searchParams = new URLSearchParams(),
    params = {},
    routerOverrides = {},
  } = options;

  // 状態を更新
  currentRouterState = {
    pathname,
    searchParams:
      typeof searchParams === "string"
        ? new URLSearchParams(searchParams)
        : searchParams,
    params,
    routerMethods: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
      ...routerOverrides,
    },
  };

  // Next.js navigation hooks をモック
  jest.doMock("next/navigation", () => ({
    useRouter: createMockUseRouter(routerOverrides),
    useSearchParams: createMockUseSearchParams(currentRouterState.searchParams),
    usePathname: createMockUsePathname(currentRouterState.pathname),
    useParams: createMockUseParams(currentRouterState.params),
  }));

  return currentRouterState;
};

/**
 * ページナビゲーションのシミュレーション
 */
export const simulateNavigation = (
  pathname: string,
  searchParams?: string | URLSearchParams,
  params?: Record<string, string>
) => {
  currentRouterState.pathname = pathname;

  if (searchParams) {
    currentRouterState.searchParams =
      typeof searchParams === "string"
        ? new URLSearchParams(searchParams)
        : searchParams;
  }

  if (params) {
    currentRouterState.params = params;
  }

  // pushメソッドが呼ばれたことをシミュレート
  currentRouterState.routerMethods.push.mockClear();
  currentRouterState.routerMethods.push(
    pathname + (searchParams ? `?${searchParams}` : "")
  );
};

/**
 * 検索パラメータの更新シミュレーション
 */
export const updateSearchParams = (params: Record<string, string | null>) => {
  for (const [key, value] of Object.entries(params)) {
    if (value === null) {
      currentRouterState.searchParams.delete(key);
    } else {
      currentRouterState.searchParams.set(key, value);
    }
  }
};

/**
 * ルーター状態のリセット
 */
export const resetRouterMock = () => {
  currentRouterState = {
    pathname: "/",
    searchParams: new URLSearchParams(),
    params: {},
    routerMethods: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
    },
  };
};

/**
 * 現在のルーター状態を取得
 */
export const getCurrentRouterState = () => ({ ...currentRouterState });

/**
 * ルーターメソッドのアサーションヘルパー
 */
export const expectRouterMethodCall = (
  method: keyof RouterMockState["routerMethods"],
  expectedArgs?: any[]
) => {
  const mockMethod = currentRouterState.routerMethods[method];

  if (expectedArgs) {
    expect(mockMethod).toHaveBeenCalledWith(...expectedArgs);
  } else {
    expect(mockMethod).toHaveBeenCalled();
  }
};

/**
 * 特定のページパターンのセットアップヘルパー
 */
export const setupPageMock = {
  // ホームページ
  home: () => setupRouterMock({ pathname: "/" }),

  // 管理者ページ
  admin: () => setupRouterMock({ pathname: "/admin" }),

  // シフト管理ページ
  shifts: () => setupRouterMock({ pathname: "/admin/shifts" }),

  // インストラクター管理ページ
  instructors: () => setupRouterMock({ pathname: "/admin/instructors" }),

  // 公開シフトページ
  publicShifts: (searchParams?: string) =>
    setupRouterMock({
      pathname: "/shifts",
      searchParams: searchParams || "view=week",
    }),

  // 動的ルート（IDを含む）
  shiftDetail: (id: string) =>
    setupRouterMock({
      pathname: `/admin/shifts/${id}`,
      params: { id },
    }),

  instructorDetail: (id: string) =>
    setupRouterMock({
      pathname: `/admin/instructors/${id}`,
      params: { id },
    }),
};
