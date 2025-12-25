/**
 * API モック設定
 *
 * REST API呼び出しの統一的なモック設定を提供します。
 * fetch, Next.js API Routes との統合をサポートします。
 */

import { jest } from "@jest/globals";

// APIレスポンスの型定義
type MockApiCall = {
  url: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
  response: any;
  status: number;
  delay?: number;
};

// モックされたAPI呼び出しの履歴
let mockApiCalls: MockApiCall[] = [];

// レスポンス設定のストレージ
const mockResponses = new Map<string, MockApiCall>();

/**
 * APIレスポンスを設定する
 */
export const mockApiResponse = (
  method: string,
  url: string,
  options: {
    response: any;
    status?: number;
    delay?: number;
  }
) => {
  const { response, status = 200, delay = 0 } = options;
  const key = `${method.toUpperCase()}:${url}`;
  mockResponses.set(key, {
    url,
    method: method.toUpperCase(),
    response,
    status,
    delay,
  });
};

/**
 * 統一APIレスポンス形式のヘルパー
 */
export const mockSuccessResponse = <T>(
  method: string,
  url: string,
  data: T,
  status = 200
) =>
  mockApiResponse(method, url, {
    response: { success: true, data },
    status,
  });

export const mockErrorResponse = (
  method: string,
  url: string,
  error: string,
  status = 400
) => {
  mockApiResponse(method, url, {
    response: { success: false, error },
    status,
  });
};

/**
 * fetchのグローバルモック
 */
export const setupFetchMock = () => {
  (global.fetch as any) = jest
    .fn()
    .mockImplementation(async (...args: any[]) => {
      const [url, options = {}] = args as [string | URL, RequestInit];
      const urlString = typeof url === "string" ? url : url.toString();
      const method = options.method || "GET";
      const key = `${method.toUpperCase()}:${urlString}`;

      // モック設定を検索
      const mockConfig = mockResponses.get(key);
      if (!mockConfig) {
        // デフォルト404レスポンス
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
          json: async () => ({
            success: false,
            error: "API endpoint not mocked",
          }),
          text: async () => "Not Found",
          blob: async () => new Blob(),
          arrayBuffer: async () => new ArrayBuffer(0),
          formData: async () => new FormData(),
          clone: jest.fn(),
          body: null,
          bodyUsed: false,
          type: "default" as ResponseType,
          url: urlString,
          redirected: false,
        });
      }

      // API呼び出し履歴に記録
      mockApiCalls.push({
        url: urlString,
        method,
        body: options.body ? JSON.parse(options.body as string) : undefined,
        headers: options.headers as Record<string, string>,
        response: mockConfig.response,
        status: mockConfig.status,
      });

      // 遅延がある場合は待機
      if (mockConfig.delay && mockConfig.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockConfig.delay));
      }

      // レスポンスを返す
      return Promise.resolve({
        ok: mockConfig.status >= 200 && mockConfig.status < 300,
        status: mockConfig.status,
        statusText: mockConfig.status < 400 ? "OK" : "Error",
        headers: new Headers({
          "Content-Type": "application/json",
        }),
        json: async () => mockConfig.response,
        text: async () => JSON.stringify(mockConfig.response),
        blob: async () => new Blob([JSON.stringify(mockConfig.response)]),
        arrayBuffer: async () =>
          new TextEncoder().encode(JSON.stringify(mockConfig.response)).buffer,
        formData: async () => new FormData(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        type: "default" as ResponseType,
        url: urlString,
        redirected: false,
      });
    });
};

/**
 * APIエンドポイント別のモック設定ヘルパー
 */
export const setupApiMocks = {
  // 部門API
  departments: {
    list: (departments: any[] = []) =>
      mockApiResponse("GET", "/api/departments", {
        response: {
          success: true,
          data: departments,
        },
      }),

    get: (id: number, department: any) =>
      mockApiResponse("GET", `/api/departments/${id}`, {
        response: {
          success: true,
          data: department,
        },
      }),

    create: (department: any) =>
      mockApiResponse("POST", "/api/departments", {
        response: {
          success: true,
          data: department,
        },
      }),

    update: (id: number, department: any) =>
      mockApiResponse("PUT", `/api/departments/${id}`, {
        response: {
          success: true,
          data: department,
        },
      }),

    delete: (id: number) =>
      mockApiResponse("DELETE", `/api/departments/${id}`, {
        response: {
          success: true,
          data: null,
        },
      }),
  },

  // インストラクターAPI
  instructors: {
    list: (instructors: any[] = []) =>
      mockApiResponse("GET", "/api/instructors", {
        response: {
          success: true,
          data: instructors,
        },
      }),

    get: (id: number, instructor: any) =>
      mockApiResponse("GET", `/api/instructors/${id}`, {
        response: {
          success: true,
          data: instructor,
        },
      }),

    create: (instructor: any) =>
      mockApiResponse("POST", "/api/instructors", {
        response: {
          success: true,
          data: instructor,
        },
      }),

    update: (id: number, instructor: any) =>
      mockApiResponse("PUT", `/api/instructors/${id}`, {
        response: {
          success: true,
          data: instructor,
        },
      }),

    delete: (id: number) =>
      mockApiResponse("DELETE", `/api/instructors/${id}`, {
        response: {
          success: true,
          data: null,
        },
      }),
  },

  // 資格API
  certifications: {
    list: (certifications: any[] = []) =>
      mockApiResponse("GET", "/api/certifications", {
        response: {
          success: true,
          data: certifications,
        },
      }),

    get: (id: number, certification: any) =>
      mockApiResponse("GET", `/api/certifications/${id}`, {
        response: {
          success: true,
          data: certification,
        },
      }),

    create: (certification: any) =>
      mockApiResponse("POST", "/api/certifications", {
        response: {
          success: true,
          data: certification,
        },
      }),

    update: (id: number, certification: any) =>
      mockApiResponse("PUT", `/api/certifications/${id}`, {
        response: {
          success: true,
          data: certification,
        },
      }),

    delete: (id: number) =>
      mockApiResponse("DELETE", `/api/certifications/${id}`, {
        response: {
          success: true,
          data: null,
        },
      }),
  },

  // シフトAPI
  shifts: {
    // DEPRECATED: GET /api/shifts has been replaced by /api/usecases/shifts/monthly-view and weekly-view
    // list: (shifts: any[] = []) =>
    //   mockApiResponse("GET", "/api/shifts", {
    //     response: { success: true, data: shifts },
    //   }),

    // DEPRECATED: GET /api/shifts/[id] has been replaced by /api/usecases/shifts/edit-data
    // get: (id: number, shift: any) =>
    //   mockApiResponse("GET", `/api/shifts/${id}`, {
    //     response: {
    //       success: true,
    //       data: shift,
    //     },
    //   }),

    create: (shift: any) =>
      mockApiResponse("POST", "/api/shifts", {
        response: { success: true, data: shift },
      }),

    update: (id: number, shift: any) =>
      mockApiResponse("PUT", `/api/shifts/${id}`, {
        response: {
          success: true,
          data: shift,
        },
      }),

    delete: (id: number) =>
      mockApiResponse("DELETE", `/api/shifts/${id}`, {
        response: {
          success: true,
          data: null,
        },
      }),

    prepare: (prepareData: any) =>
      mockApiResponse("GET", "/api/shifts/prepare", {
        response: {
          success: true,
          data: prepareData,
        },
      }),
  },

  // シフト種別API
  shiftTypes: {
    list: (shiftTypes: any[] = []) =>
      mockApiResponse("GET", "/api/shift-types", {
        response: {
          success: true,
          data: shiftTypes,
        },
      }),

    get: (id: number, shiftType: any) =>
      mockApiResponse("GET", `/api/shift-types/${id}`, {
        response: {
          success: true,
          data: shiftType,
        },
      }),

    create: (shiftType: any) =>
      mockApiResponse("POST", "/api/shift-types", {
        response: {
          success: true,
          data: shiftType,
        },
      }),

    update: (id: number, shiftType: any) =>
      mockApiResponse("PUT", `/api/shift-types/${id}`, {
        response: {
          success: true,
          data: shiftType,
        },
      }),

    delete: (id: number) =>
      mockApiResponse("DELETE", `/api/shift-types/${id}`, {
        response: {
          success: true,
          data: null,
        },
      }),
  },

  // ヘルスチェック
  health: () =>
    mockApiResponse("GET", "/api/health", {
      response: {
        success: true,
        data: { status: "ok" },
      },
    }),
};

/**
 * エラーレスポンスのセットアップ
 */
export const setupApiErrors = {
  // 認証エラー
  unauthorized: (method: string, url: string) =>
    mockErrorResponse(method, url, "Unauthorized", 401),

  // 権限エラー
  forbidden: (method: string, url: string) =>
    mockErrorResponse(method, url, "Forbidden", 403),

  // Not Found
  notFound: (method: string, url: string) =>
    mockErrorResponse(method, url, "Not Found", 404),

  // バリデーションエラー
  validation: (
    method: string,
    url: string,
    errors: string[] = ["Invalid input"]
  ) => mockErrorResponse(method, url, errors.join(", "), 422),

  // サーバーエラー
  serverError: (method: string, url: string) =>
    mockErrorResponse(method, url, "Internal Server Error", 500),

  // ネットワークエラー
  networkError: (method: string, url: string) => {
    mockApiResponse(method, url, {
      response: null,
      status: 0,
    }); // status 0 for network errors
  },
};

/**
 * API呼び出し履歴の取得
 */
export const getApiCallHistory = () => [...mockApiCalls];

/**
 * 特定のAPI呼び出しを検索
 */
export const findApiCall = (method: string, url: string) =>
  mockApiCalls.find(
    (call) => call.method === method.toUpperCase() && call.url === url
  );

/**
 * API呼び出し回数のアサーション
 */
export const expectApiCall = (method: string, url: string, times = 1) => {
  const calls = mockApiCalls.filter(
    (call) => call.method === method.toUpperCase() && call.url === url
  );
  expect(calls).toHaveLength(times);
};

/**
 * API呼び出し内容のアサーション
 */
export const expectApiCallWith = (
  method: string,
  url: string,
  expectedBody?: any,
  expectedHeaders?: Record<string, string>
) => {
  const call = findApiCall(method, url);
  expect(call).toBeDefined();

  if (expectedBody) {
    expect(call?.body).toEqual(expectedBody);
  }

  if (expectedHeaders) {
    for (const [key, value] of Object.entries(expectedHeaders)) {
      expect(call?.headers?.[key]).toBe(value);
    }
  }
};

/**
 * モック設定のリセット
 */
export const resetApiMocks = () => {
  mockApiCalls = [];
  mockResponses.clear();

  // fetch mock をリセット
  if (jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockClear();
  }
};
