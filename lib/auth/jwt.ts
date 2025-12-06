import jwt from "jsonwebtoken";
import { jwtConfig } from "@/lib/env";

/**
 * JWT関連のユーティリティ関数
 * セキュアなJWT生成・検証・デコード機能を提供
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
export function generateJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "iss" | "aud">
): string {
  // biome-ignore lint/style/noMagicNumbers: Unix timestamp変換のため1000を使用
  const now = Math.floor(Date.now() / 1000);

  const jwtPayload: JwtPayload = {
    ...payload,
    iat: now,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  try {
    // ペイロードで iss/aud を設定済みのため、optionsでは設定しない
    const options = {
      expiresIn: jwtConfig.expiresIn, // 48h (from env.ts)
      algorithm: "HS256",
    };

    return jwt.sign(jwtPayload, jwtConfig.secret, options as jwt.SignOptions);
  } catch (error) {
    throw new Error(
      `JWT generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * JWTトークン検証
 *
 * @param token - 検証するJWTトークン
 * @returns 検証結果とペイロード
 *
 * @example
 * ```typescript
 * const result = verifyJwt(token);
 * if (result.success && result.payload) {
 *   console.log('User:', result.payload.displayName);
 *   console.log('Role:', result.payload.role);
 * }
 * ```
 */
export function verifyJwt(token: string): JwtVerificationResult {
  if (!token) {
    return {
      success: false,
      error: "Token is required",
    };
  }

  try {
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    };

    const decoded = jwt.verify(
      token,
      jwtConfig.secret,
      verifyOptions
    ) as JwtPayload;

    // 必須フィールドの検証
    if (!(decoded.userId && decoded.lineUserId && decoded.role)) {
      return {
        success: false,
        error: "Invalid token payload: missing required fields",
      };
    }

    // アクティブユーザーのみ許可
    if (!decoded.isActive) {
      return {
        success: false,
        error: "User is not active",
      };
    }

    return {
      success: true,
      payload: decoded,
    };
  } catch (error) {
    let errorMessage = "Token verification failed";

    if (error instanceof jwt.TokenExpiredError) {
      errorMessage = "Token has expired";
    } else if (error instanceof jwt.JsonWebTokenError) {
      errorMessage = "Invalid token format";
    } else if (error instanceof jwt.NotBeforeError) {
      errorMessage = "Token not yet valid";
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * JWTトークンデコード（検証なし）
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
 * @warning このメソッドは検証を行いません。本番環境では必ずverifyJwt()を使用してください
 */
export function decodeJwt(token: string): JwtVerificationResult {
  if (!token) {
    return {
      success: false,
      error: "Token is required",
    };
  }

  try {
    const decoded = jwt.decode(token) as JwtPayload | null;

    if (!decoded) {
      return {
        success: false,
        error: "Failed to decode token",
      };
    }

    return {
      success: true,
      payload: decoded,
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
export function extractUserFromToken(token: string): {
  userId: string;
  lineUserId: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  isActive: boolean;
} | null {
  const result = verifyJwt(token);

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
