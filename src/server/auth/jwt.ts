import { errors, jwtVerify, SignJWT } from 'jose';

/**
 * ステートレス JWT の発行・検証（ADR 0003）。
 * KV セッションは持たず、JWT そのものがログインセッションとなる。
 * jose を用いるため Cloudflare Workers の isolate 上で外部アクセス0で完結する。
 */

/** JWT 発行者識別子 */
const JWT_ISSUER = 'fuyugyo';
/** JWT 対象者識別子 */
const JWT_AUDIENCE = 'fuyugyo-users';

/** 有効なユーザーロール（ADMIN > MANAGER > MEMBER の序列を持つ） */
export const VALID_ROLES = ['ADMIN', 'MANAGER', 'MEMBER'] as const;

/** ユーザーロール型 */
export type UserRole = (typeof VALID_ROLES)[number];

/** JWT ペイロード（ログインセッションの中身） */
export type JwtPayload = {
  /** ユーザー ID */
  userId: string;
  /** LINE ユーザー ID */
  lineUserId: string;
  /** 表示名 */
  displayName: string;
  /** ユーザーロール */
  role: UserRole;
  /** アクティブフラグ */
  isActive: boolean;
};

/** 署名対象のペイロード（標準クレームは jose が付与する） */
type JwtClaims = JwtPayload;

/** シークレット文字列を jose 用の鍵に変換する */
function toSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * JWT を発行する。
 *
 * @param payload - トークンに含めるユーザー情報
 * @param secret - 署名用シークレット（`c.env.JWT_SECRET`）
 * @param expiresIn - 有効期限文字列（例: "12h"。`c.env.JWT_EXPIRES_IN`）
 * @returns 署名済み JWT 文字列
 */
export async function signJwt(
  payload: JwtPayload,
  secret: string,
  expiresIn: string
): Promise<string> {
  const claims: JwtClaims = payload;
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(toSecretKey(secret));
}

/** JWT 検証結果 */
export type JwtVerifyResult =
  | { success: true; payload: JwtPayload }
  | { success: false; error: string };

/** role 値が UserRole か判定する */
function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' && VALID_ROLES.includes(value as UserRole)
  );
}

/**
 * jose の検証済みペイロードを型安全に `JwtPayload` へ写す。
 * 型アサーションを避け、フィールドごとに型を確認する。
 */
function parsePayload(claims: Record<string, unknown>): JwtPayload | null {
  const { userId, lineUserId, displayName, role, isActive } = claims;
  if (
    typeof userId !== 'string' ||
    typeof lineUserId !== 'string' ||
    typeof displayName !== 'string' ||
    !isUserRole(role) ||
    typeof isActive !== 'boolean'
  ) {
    return null;
  }
  return { userId, lineUserId, displayName, role, isActive };
}

/**
 * JWT を検証してペイロードを取り出す。署名・発行者・対象者・有効期限を確認する。
 *
 * @param token - 検証する JWT 文字列
 * @param secret - 署名用シークレット（`c.env.JWT_SECRET`）
 * @returns 検証結果
 */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtVerifyResult> {
  if (!token) {
    return { success: false, error: 'Token is required' };
  }

  try {
    const { payload } = await jwtVerify(token, toSecretKey(secret), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const parsed = parsePayload(payload);
    if (!parsed) {
      return { success: false, error: 'Invalid token claims' };
    }

    return { success: true, payload: parsed };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { success: false, error: 'Token has expired' };
    }
    if (error instanceof errors.JOSEError) {
      return { success: false, error: 'Invalid token' };
    }
    return { success: false, error: 'Token verification failed' };
  }
}
