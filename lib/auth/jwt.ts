import { errors, decodeJwt as joseDecodeJwt, jwtVerify, SignJWT } from "jose";
import { jwtConfig } from "@/lib/env";

/**
 * JWT関連のユーティリティ関数
 * セキュアなJWT生成・検証・デコード機能を提供
 *
 * Cloudflare Workers環境対応のため、joseライブラリを使用
 */

// biome-ignore lint/style/noMagicNumbers: 時間計算は可読性のため意図的にマジックナンバーを使用
const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6時間

/**
 * JWT発行者識別子
 */
const JWT_ISSUER = "fuyugyo";

/**
 * JWT対象者識別子
 */
const JWT_AUDIENCE = "fuyugyo-users";

/**
 * JWTペイロードの型定義
 */
export type JwtPayload = {
  /** ユーザーID (cuid形式) */
  userId: string;
  /** LINEユーザーID */
  lineUserId: string;
  /** 表示名 */
  displayName: string;
  /** ユーザー権限 */
  role: "ADMIN" | "MANAGER" | "MEMBER";
  /** アクティブフラグ */
  isActive: boolean;
  /** 発行時刻 (Unix timestamp) */
  iat?: number;
  /** 有効期限 (Unix timestamp) */
  exp?: number;
  /** 発行者 */
  iss?: string;
  /** 対象者 */
  aud?: string;
};

/**
 * JWT検証結果の型定義
 */
export type JwtVerificationResult = {
  success: boolean;
  payload?: JwtPayload;
  error?: string;
};

/**
 * シークレットキーをUint8Arrayに変換
 */
function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(jwtConfig.secret);
}

/**
 * JWTトークン生成
 *
 * @param payload - トークンに含めるペイロード
 * @returns 署名済みJWTトークン
 *
 * @example
 * ```typescript
 * const token = generateJwt({
 *   userId: 'clx7k2m0p0000abcdefgh123',
 *   lineUserId: '12345678901234567890',
 *   displayName: '山田太郎',
 *   role: 'MEMBER',
 *   isActive: true
 * });
 * ```
 */
export async function generateJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "iss" | "aud">
): Promise<string> {
  try {
    const secret = getSecretKey();

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(jwtConfig.expiresIn) // "48h"
      .sign(secret);

    return token;
  } catch (error) {
    throw new Error(
      `JWT generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * joseのエラー型かどうかを判定する型ガード
 */
function isJOSEError(error: unknown): error is errors.JOSEError {
  return error instanceof errors.JOSEError;
}

/**
 * エラーメッセージを解析
 * joseライブラリのcodeプロパティを使用して堅牢にエラーを判定
 */
function parseJwtError(error: unknown): string {
  if (!isJOSEError(error)) {
    return "Token verification failed";
  }

  // codeプロパティで明示的にエラーの種類を判定
  switch (error.code) {
    case "ERR_JWT_EXPIRED":
      return "Token has expired";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "Invalid token signature";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return "Invalid token claims";
    default:
      return "Token verification failed";
  }
}

/**
 * JWTペイロードを検証
 * 型アサーション前に呼び出して、ランタイムエラーを防ぐ
 */
function validateJwtPayload(payload: unknown): JwtVerificationResult | null {
  // payload が object であることを確認
  if (typeof payload !== "object" || payload === null) {
    return {
      success: false,
      error: "Invalid token payload: not an object",
    };
  }

  const p = payload as Record<string, unknown>;

  // 必須フィールドの存在と型を検証
  if (
    typeof p.userId !== "string" ||
    typeof p.lineUserId !== "string" ||
    typeof p.role !== "string"
  ) {
    return {
      success: false,
      error: "Invalid token payload: missing required fields",
    };
  }

  // role の値を検証
  if (p.role !== "ADMIN" && p.role !== "MANAGER" && p.role !== "MEMBER") {
    return {
      success: false,
      error: "Invalid token payload: invalid role",
    };
  }

  // isActive の型と値を検証
  if (typeof p.isActive !== "boolean") {
    return {
      success: false,
      error: "Invalid token payload: isActive must be boolean",
    };
  }

  // アクティブユーザーのみ許可
  if (!p.isActive) {
    return {
      success: false,
      error: "User is not active",
    };
  }

  return null;
}

/**
 * JWTトークン検証
 *
 * @param token - 検証するJWTトークン
 * @returns 検証結果とペイロード
 *
 * @example
 * ```typescript
 * const result = await verifyJwt(token);
 * if (result.success && result.payload) {
 *   console.log('User:', result.payload.displayName);
 *   console.log('Role:', result.payload.role);
 * }
 * ```
 */
export async function verifyJwt(token: string): Promise<JwtVerificationResult> {
  if (!token) {
    return {
      success: false,
      error: "Token is required",
    };
  }

  try {
    const secret = getSecretKey();

    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // 型アサーション前にペイロード検証を実施
    const validationError = validateJwtPayload(payload);
    if (validationError) {
      return validationError;
    }

    // 検証済みなので安全に型アサーション可能
    const jwtPayload = payload as JwtPayload;

    return {
      success: true,
      payload: jwtPayload,
    };
  } catch (error) {
    return {
      success: false,
      error: parseJwtError(error),
    };
  }
}

/**
 * JWTトークンデコード（署名検証なし）
 * デバッグ用途でトークンの内容を確認したい場合に使用
 *
 * @param token - デコードするJWTトークン
 * @returns デコード結果
 *
 * @example
 * ```typescript
 * const result = decodeJwt(token);
 * if (result.success && result.payload) {
 *   console.log('Token expires at:', new Date(result.payload.exp! * 1000));
 * }
 * ```
 *
 * @warning このメソッドは署名検証を行いません。本番環境では必ずverifyJwt()を使用してください
 */
export function decodeJwt(token: string): JwtVerificationResult {
  if (!token) {
    return {
      success: false,
      error: "Token is required",
    };
  }

  try {
    const decoded = joseDecodeJwt(token);

    if (!decoded) {
      return {
        success: false,
        error: "Failed to decode token",
      };
    }

    // 型アサーション前にペイロード構造を検証
    const validationError = validateJwtPayload(decoded);
    if (validationError) {
      return validationError;
    }

    // 検証済みなので安全に型アサーション可能
    const jwtPayload = decoded as JwtPayload;

    return {
      success: true,
      payload: jwtPayload,
    };
  } catch (error) {
    return {
      success: false,
      error: `Token decode failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * JWTトークンの有効期限チェック
 *
 * @param token - チェックするJWTトークン
 * @returns 有効期限情報
 *
 * @example
 * ```typescript
 * const expiry = getTokenExpiry(token);
 * if (expiry.success && expiry.expiresAt) {
 *   const hoursLeft = Math.floor((expiry.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
 *   console.log(`Token expires in ${hoursLeft} hours`);
 * }
 * ```
 */
export function getTokenExpiry(token: string): {
  success: boolean;
  expiresAt?: Date;
  isExpired?: boolean;
  error?: string;
} {
  const decoded = decodeJwt(token);

  if (!(decoded.success && decoded.payload?.exp)) {
    return {
      success: false,
      error: "Unable to decode token or missing expiry",
    };
  }

  // biome-ignore lint/style/noMagicNumbers: Unix timestamp変換のため1000を使用
  const expiresAt = new Date(decoded.payload.exp * 1000);
  const isExpired = expiresAt.getTime() < Date.now();

  return {
    success: true,
    expiresAt,
    isExpired,
  };
}

/**
 * リフレッシュが必要かどうかを判定
 * トークンの残り有効期限が6時間未満の場合にtrueを返す
 *
 * @param token - チェックするJWTトークン
 * @returns リフレッシュ必要性
 */
export function shouldRefreshToken(token: string): boolean {
  const expiry = getTokenExpiry(token);

  if (!(expiry.success && expiry.expiresAt)) {
    return true; // トークンが無効な場合は再認証が必要
  }

  if (expiry.isExpired) {
    return true; // 期限切れの場合は再認証が必要
  }

  // 残り時間が6時間未満の場合はリフレッシュを推奨
  const sixHoursFromNow = Date.now() + REFRESH_THRESHOLD_MS;
  return expiry.expiresAt.getTime() < sixHoursFromNow;
}

/**
 * トークンからユーザー情報を安全に抽出
 *
 * @param token - JWTトークン
 * @returns ユーザー情報または null
 */
export async function extractUserFromToken(token: string): Promise<{
  userId: string;
  lineUserId: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  isActive: boolean;
} | null> {
  const result = await verifyJwt(token);

  if (!(result.success && result.payload)) {
    return null;
  }

  return {
    userId: result.payload.userId,
    lineUserId: result.payload.lineUserId,
    displayName: result.payload.displayName,
    role: result.payload.role,
    isActive: result.payload.isActive,
  };
}
