import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/**
 * 利用申請用の一時トークン。
 * 未登録の LINE ユーザーが申請ボタンを押すまでプロフィールを持ち回るためのもので、
 * セッション JWT（`jwt.ts`）とは audience を分け、互いに受理しない。
 */

/** 申請トークン専用の発行者識別子 */
const ACCESS_REQUEST_ISSUER = 'fuyugyo';
/** 申請トークン専用の対象者識別子。セッション JWT（`fuyugyo-users`）と区別する */
const ACCESS_REQUEST_AUDIENCE = 'fuyugyo-access-request';
/** 申請トークンの有効期限 */
const ACCESS_REQUEST_EXPIRES_IN = '10m';

/** 申請トークンに載せる LINE プロフィール */
const accessRequestProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string(),
  pictureUrl: z.string().optional(),
  /** OAuth 開始時に発行したフロー識別子。申請 POST で現在のフロー Cookie と照合する */
  flow: z.string().min(1).optional(),
});

/** 申請トークンに載せる LINE プロフィール */
export type AccessRequestProfile = z.infer<typeof accessRequestProfileSchema>;

/** シークレット文字列を jose 用の鍵に変換する */
function toSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * 利用申請用の短期トークンを発行する。
 *
 * @param profile - 載せる LINE プロフィール（フロー識別子を含められる）
 * @param secret - 署名用シークレット（`c.env.JWT_SECRET`）
 * @returns 署名済み JWT 文字列（有効期限 10 分）
 */
export async function signAccessRequestToken(
  profile: AccessRequestProfile,
  secret: string,
): Promise<string> {
  return await new SignJWT({ ...profile })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ACCESS_REQUEST_ISSUER)
    .setAudience(ACCESS_REQUEST_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_REQUEST_EXPIRES_IN)
    .sign(toSecretKey(secret));
}

/**
 * 利用申請トークンを検証し、LINE プロフィールを返す。
 * 署名・発行者・専用 audience・有効期限・ペイロード形式のいずれかが不正なら null を返す。
 *
 * @param token - 検証する JWT 文字列
 * @param secret - 署名用シークレット（`c.env.JWT_SECRET`）
 * @returns 検証できたプロフィール。不正なら null
 */
export async function verifyAccessRequestToken(
  token: string,
  secret: string,
): Promise<AccessRequestProfile | null> {
  try {
    const { payload } = await jwtVerify(token, toSecretKey(secret), {
      issuer: ACCESS_REQUEST_ISSUER,
      audience: ACCESS_REQUEST_AUDIENCE,
      algorithms: ['HS256'],
      requiredClaims: ['iat', 'exp'],
    });
    const parsed = accessRequestProfileSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
