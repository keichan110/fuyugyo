/**
 * セキュアログ出力機能のテスト
 * 機密情報のマスキング機能を検証
 */

import { maskSensitiveData, secureLog } from "@/lib/utils/logging";

// テスト用の正規表現パターン
const MASKED_PATTERN = /\.\.\.$/;

// 環境変数のモック
const originalNodeEnv = process.env.NODE_ENV;

describe("maskSensitiveData", () => {
  test("機密情報キーワードを含むデータをマスクする", () => {
    const sensitiveData = {
      token: "secret-token-123456789",
      accessToken: "access-abc123def456",
      channelSecret: "1234567890abcdef",
      password: "mypassword",
      normalData: "normal-value",
      userId: "user123",
    };

    const masked = maskSensitiveData(sensitiveData);

    expect(masked.token).toBe("secr...6789");
    expect(masked.accessToken).toBe("acce...f456");
    expect(masked.channelSecret).toBe("1234...cdef");
    expect(masked.password).toBe("mypa...word"); // 実際の出力
    expect(masked.normalData).toBe("normal-value"); // 通常データはそのまま
    expect(masked.userId).toBe("user123");
  });

  test("短い機密データは****でマスクする", () => {
    const shortSensitiveData = {
      token: "short",
      jwt: "a",
    };

    const masked = maskSensitiveData(shortSensitiveData);

    expect(masked.token).toBe("****");
    expect(masked.jwt).toBe("****");
  });

  test("機密キーワードの大文字小文字を区別しない", () => {
    const mixedCaseData = {
      TOKEN: "uppercase-token-123",
      AccessToken: "mixed-case-token-456",
      CHANNELSECRET: "uppercase-secret-789",
    };

    const masked = maskSensitiveData(mixedCaseData);

    expect(masked.TOKEN).toBe("uppe...-123");
    expect(masked.AccessToken).toBe("mixe...-456");
    expect(masked.CHANNELSECRET).toBe("uppe...-789");
  });

  test("非文字列データはマスクしない", () => {
    const nonStringData = {
      token: 123_456, // 数値
      secret: true, // boolean
      auth: null, // null
      data: { nested: "value" }, // オブジェクト
    };

    const masked = maskSensitiveData(nonStringData);

    expect(masked.token).toBe(123_456);
    expect(masked.secret).toBe(true);
    expect(masked.auth).toBe(null);
    expect(masked.data).toEqual({ nested: "value" });
  });
});

describe("secureLog", () => {
  // console.logのモック
  const mockConsoleInfo = jest.spyOn(console, "info").mockImplementation();
  const mockConsoleWarn = jest.spyOn(console, "warn").mockImplementation();
  const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

  beforeEach(() => {
    mockConsoleInfo.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  test("本番環境ではログを出力しない", () => {
    (process.env as any).NODE_ENV = "production";

    secureLog("info", "Test message", { token: "secret123456" });

    expect(mockConsoleInfo).not.toHaveBeenCalled();
  });

  test("test環境ではログを出力しない", () => {
    (process.env as any).NODE_ENV = "test";

    secureLog("error", "Error message", { password: "secret" });

    expect(mockConsoleError).not.toHaveBeenCalled();
  });
});

describe("セキュリティテストケース", () => {
  test("実際の認証トークンパターンをマスクする", () => {
    const authData = {
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      lineAccessToken: "E1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0",
      state: "csrf-protection-state-12345",
      code: "auth-code-from-line-callback",
    };

    const masked = maskSensitiveData(authData);

    expect(masked.authorization).toBe("Bear...9...");
    expect(masked.lineAccessToken).toBe("E1A2...R9S0");
    expect(masked.state).toBe("csrf...2345");
    expect(masked.code).toBe("auth...back");
  });

  test("機密情報が含まれていないことを確認", () => {
    const sensitiveData = {
      jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      channelSecret: "abcdef1234567890abcdef1234567890",
      normalField: "this-should-not-be-masked",
    };

    const masked = maskSensitiveData(sensitiveData);

    // 機密データがマスクされていることを確認
    expect(masked.jwt).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(masked.channelSecret).not.toContain(
      "abcdef1234567890abcdef1234567890"
    );
    expect(masked.jwt).toMatch(MASKED_PATTERN); // マスク形式
    expect(masked.channelSecret).toBe("abcd...7890"); // マスク形式

    // 通常データはそのまま
    expect(masked.normalField).toBe("this-should-not-be-masked");
  });
});
