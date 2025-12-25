/**
 * テスト専用型定義
 *
 * Jest・Testing Library・プロジェクト固有のテストで使用される型定義を提供します。
 */

import "@testing-library/jest-dom";

// Global test utilities
declare global {
  /**
   * Date.now()のモック設定用ヘルパー（jest.setup.jsで定義）
   */
  const mockDate: (isoDate: string) => Date;
}

// Jest custom matchers の拡張
declare module "@jest/expect" {
  type Matchers<R> = {
    /**
     * APIレスポンスが成功形式かをチェック
     */
    toBeSuccessApiResponse(): R;

    /**
     * APIレスポンスがエラー形式かをチェック
     */
    toBeErrorApiResponse(expectedError?: string): R;

    /**
     * 日付が指定範囲内かをチェック
     */
    toBeDateWithinRange(startDate: Date, endDate: Date): R;

    /**
     * 配列が指定されたプロパティでソートされているかをチェック
     */
    toBeSortedBy(property: string, order?: "asc" | "desc"): R;

    /**
     * 日本の祝日かをチェック
     */
    toBeJapaneseHoliday(): R;

    /**
     * 週末（土日）かをチェック
     */
    toBeWeekend(): R;

    /**
     * 配列に重複がないかをチェック
     */
    toHaveUniqueElements(keyExtractor?: (item: any) => any): R;

    /**
     * Promiseが指定時間内に解決されるかをチェック
     */
    toResolveWithin(timeoutMs: number): R;
  };
}

// Testing Library の拡張
declare module "@testing-library/react" {
  type RenderOptions = {
    /**
     * 初期プロパティ
     */
    initialProps?: Record<string, unknown>;
  };
}

// テストデータ型定義
export type TestApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type TestRouterState = {
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
};

export type TestPrismaConfig = {
  mockData?: {
    departments?: any[];
    instructors?: any[];
    certifications?: any[];
    shifts?: any[];
    shiftTypes?: any[];
    shiftAssignments?: any[];
  };
  resetOnTest?: boolean;
};

// モック関数の型定義
export type MockFunction<T extends (...args: any[]) => any> = jest.Mock<
  ReturnType<T>,
  Parameters<T>
>;

// テストユーティリティの型定義
export type TestUtils = {
  // ファクトリー関数
  factories: {
    createDepartment: (
      overrides?: Partial<import("@prisma/client").Department>
    ) => import("@prisma/client").Department;
    createInstructor: (
      overrides?: Partial<import("@prisma/client").Instructor>
    ) => import("@prisma/client").Instructor;
    createCertification: (
      overrides?: Partial<import("@prisma/client").Certification>
    ) => import("@prisma/client").Certification;
    createShift: (
      overrides?: Partial<import("@prisma/client").Shift>
    ) => import("@prisma/client").Shift;
    createShiftType: (
      overrides?: Partial<import("@prisma/client").ShiftType>
    ) => import("@prisma/client").ShiftType;
    createShiftAssignment: (
      overrides?: Partial<import("@prisma/client").ShiftAssignment>
    ) => import("@prisma/client").ShiftAssignment;
  };

  // モック関数
  mocks: {
    prisma: () => any;
    router: (options?: Partial<TestRouterState>) => void;
    api: {
      setupMocks: () => void;
      resetMocks: () => void;
      expectCall: (method: string, url: string, times?: number) => void;
    };
  };

  // レンダリング
  render: (ui: React.ReactElement, options?: any) => any;
};

// Next.js App Router 関連の型定義
export type MockNavigationHooks = {
  useRouter: MockFunction<
    () => {
      push: jest.Mock;
      replace: jest.Mock;
      back: jest.Mock;
      forward: jest.Mock;
      refresh: jest.Mock;
      prefetch: jest.Mock;
    }
  >;
  useSearchParams: MockFunction<
    () => {
      get: jest.Mock;
      getAll: jest.Mock;
      has: jest.Mock;
      keys: jest.Mock;
      values: jest.Mock;
      entries: jest.Mock;
      forEach: jest.Mock;
      toString: jest.Mock;
    }
  >;
  usePathname: MockFunction<() => string>;
  useParams: MockFunction<() => Record<string, string>>;
};

// テスト環境変数の型定義
export type TestEnvironmentConfig = {
  NODE_ENV: "test";
  TZ: "Asia/Tokyo";
  DATABASE_URL: string;
  NEXT_PUBLIC_APP_URL?: string;
};

// カスタムイベントハンドラーの型定義
export type MockEventHandlers = {
  onClick: jest.Mock;
  onChange: jest.Mock;
  onSubmit: jest.Mock;
  onFocus: jest.Mock;
  onBlur: jest.Mock;
  onKeyDown: jest.Mock;
  onKeyUp: jest.Mock;
};

// テストケース共通の型定義
export type TestCase<T = any> = {
  description: string;
  input: T;
  expected: any;
  shouldThrow?: boolean;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
};

// パフォーマンステストの型定義
export type PerformanceTestResult = {
  duration: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  operationsPerSecond?: number;
};

// テストスイート設定の型定義
export type TestSuiteConfig = {
  timeout?: number;
  retries?: number;
  setupFiles?: string[];
  teardownFiles?: string[];
  mockResets?: boolean;
  isolateModules?: boolean;
};
