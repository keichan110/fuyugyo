/**
 * セキュアCookie設定機能のテスト
 * CSRF攻撃対策とセキュリティ強化されたCookie管理を検証
 */

import {
  clearAuthCookies,
  deleteCookie,
  type SecureCookieOptions,
  setAuthCookie,
  setRefreshTokenCookie,
  setSecureCookie,
  setSessionCookie,
  validateCookieOptions,
} from "@/lib/utils/cookies";

// NextResponseのモック
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn(() => ({
      cookies: {
        set: jest.fn(),
      },
    })),
  },
}));

// 環境変数のモック
const originalNodeEnv = process.env.NODE_ENV;

describe("setSecureCookie", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  test("デフォルトのセキュア設定を適用する", () => {
    (process.env as any).NODE_ENV = "production";

    setSecureCookie(mockResponse, {
      name: "test-cookie",
      value: "test-value",
    });

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "test-cookie",
      "test-value",
      {
        httpOnly: true,
        secure: true, // 本番環境では true
        sameSite: "strict", // デフォルトでstrictに変更
        maxAge: 3600, // デフォルト1時間
        path: "/",
      }
    );
  });

  test("開発環境ではsecureフラグをfalseにする", () => {
    (process.env as any).NODE_ENV = "development";

    setSecureCookie(mockResponse, {
      name: "dev-cookie",
      value: "dev-value",
    });

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "dev-cookie",
      "dev-value",
      {
        httpOnly: true,
        secure: false, // 開発環境では false
        sameSite: "strict",
        maxAge: 3600,
        path: "/",
      }
    );
  });

  test("カスタム設定を正しく適用する", () => {
    const customOptions: SecureCookieOptions = {
      name: "custom-cookie",
      value: "custom-value",
      maxAge: 7200,
      path: "/api",
      httpOnly: false,
      secure: true,
      sameSite: "lax",
    };

    setSecureCookie(mockResponse, customOptions);

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "custom-cookie",
      "custom-value",
      {
        httpOnly: false,
        secure: true,
        sameSite: "lax",
        maxAge: 7200,
        path: "/api",
      }
    );
  });
});

describe("setAuthCookie", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  test("認証トークン用の厳格なセキュリティ設定を適用する", () => {
    (process.env as any).NODE_ENV = "production";

    setAuthCookie(mockResponse, "jwt-token-12345");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-token",
      "jwt-token-12345",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax", // OAuth/外部IdPリダイレクトに対応
        maxAge: 48 * 60 * 60, // 48時間（既存の設定に合わせる）
        path: "/",
      }
    );
  });
});

describe("setSessionCookie", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
  });

  test("セッション用の適切なセキュリティ設定を適用する", () => {
    const sessionData = JSON.stringify({
      state: "abc123",
      createdAt: Date.now(),
    });

    setSessionCookie(mockResponse, sessionData);

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-session",
      sessionData,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60, // 10分間
        path: "/",
      }
    );
  });
});

describe("setRefreshTokenCookie", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
    (process.env as any).NODE_ENV = "production";
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  test("リフレッシュトークン用の最高レベルセキュリティ設定を適用する", () => {
    setRefreshTokenCookie(mockResponse, "refresh-token-xyz789");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "refresh-token",
      "refresh-token-xyz789",
      {
        httpOnly: true,
        secure: true, // 常にHTTPS必須
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60, // 7日間
        path: "/api/auth", // 認証API以外からはアクセス不可
      }
    );
  });
});

describe("deleteCookie", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  test("Cookieを安全に削除する", () => {
    (process.env as any).NODE_ENV = "production";

    deleteCookie(mockResponse, "test-cookie");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith("test-cookie", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0, // 即座に期限切れ
      path: "/",
    });
  });

  test("カスタムパスでCookieを削除する", () => {
    deleteCookie(mockResponse, "api-cookie", "/api/auth", "strict");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith("api-cookie", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/api/auth",
    });
  });
});

describe("clearAuthCookies", () => {
  let mockResponse: any;

  beforeEach(() => {
    mockResponse = {
      cookies: {
        set: jest.fn(),
      },
    };
  });

  test("全認証関連Cookieを削除する", () => {
    clearAuthCookies(mockResponse);

    // 3つのCookieが削除されることを確認
    expect(mockResponse.cookies.set).toHaveBeenCalledTimes(3);

    // auth-token の削除
    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-token",
      "",
      expect.objectContaining({
        maxAge: 0,
      })
    );

    // auth-session の削除
    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-session",
      "",
      expect.objectContaining({
        maxAge: 0,
      })
    );

    // refresh-token の削除
    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "refresh-token",
      "",
      expect.objectContaining({
        maxAge: 0,
        path: "/api/auth",
      })
    );
  });
});

describe("validateCookieOptions", () => {
  test("セキュアな設定を正しく検証する", () => {
    const secureOptions: SecureCookieOptions = {
      name: "secure-cookie",
      value: "secure-value",
      sameSite: "strict",
      httpOnly: true,
      secure: true,
    };

    const result = validateCookieOptions(secureOptions);

    expect(result.isSecure).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test("不安全な設定に対して警告を出す", () => {
    (process.env as any).NODE_ENV = "production";

    const insecureOptions: SecureCookieOptions = {
      name: "insecure-cookie",
      value: "insecure-value",
      sameSite: "none",
      httpOnly: false,
      secure: false,
    };

    const result = validateCookieOptions(insecureOptions);

    expect(result.isSecure).toBe(false);
    expect(result.warnings).toContain(
      'SameSite should be "strict" or "lax" for CSRF protection'
    );
    expect(result.warnings).toContain(
      "HttpOnly should be true to prevent XSS attacks"
    );
    expect(result.warnings).toContain(
      "Secure flag should be true in production environment"
    );
  });

  test("認証トークンの長期間有効期限に対して警告を出す", () => {
    const longTermTokenOptions: SecureCookieOptions = {
      name: "long-term-token",
      value: "token-value",
      maxAge: 48 * 60 * 60, // 48時間
    };

    const result = validateCookieOptions(longTermTokenOptions);

    expect(result.warnings).toContain(
      "Auth tokens should have shorter expiration time (max 48 hours)"
    );
  });
});

describe("CSRF攻撃対策テスト", () => {
  test("SameSite=laxでOAuthリダイレクト後もCSRF攻撃を防ぐ", () => {
    const mockResponse = { cookies: { set: jest.fn() } } as any;

    // OAuthリダイレクト後もCookieを送信する必要があるためlaxを使用
    setAuthCookie(mockResponse, "auth-token");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-token",
      "auth-token",
      expect.objectContaining({
        sameSite: "lax",
      })
    );
  });

  test("HttpOnlyによりXSS攻撃を防ぐ", () => {
    const mockResponse = { cookies: { set: jest.fn() } } as any;

    setAuthCookie(mockResponse, "auth-token");

    expect(mockResponse.cookies.set).toHaveBeenCalledWith(
      "auth-token",
      "auth-token",
      expect.objectContaining({
        httpOnly: true,
      })
    );
  });
});
