import { mkdirSync, writeFileSync } from 'node:fs';

import { AUTH_COOKIE, authCookieOptions } from '../src/server/auth/cookies';
import { signJwt } from '../src/server/auth/jwt';
import { toJwtPayload } from '../src/server/auth/user';
import { E2E_BASE_URL, E2E_JWT_EXPIRES_IN, E2E_JWT_SECRET } from './env.ts';
import { AUTH_STATE_DIR, authStatePath } from './fixtures/auth-state.ts';
import { E2E_USERS } from './fixtures/users.ts';

/** JWT 有効期限（E2E_JWT_EXPIRES_IN = "1d"）に揃えた Cookie の有効秒数 */
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * 全 E2E ユーザーの JWT を署名し、`auth-token` Cookie を載せた storageState を保存する。
 * 本番に検証用ログインの口は設けず、アプリ本体の `signJwt` と固定シークレットでログイン状態を再現する。
 * Cookie 属性は `authCookieOptions` に合わせる（http のローカル実行なので secure なし）。
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync(AUTH_STATE_DIR, { recursive: true });
  const options = authCookieOptions(COOKIE_MAX_AGE_SECONDS, false);
  const { hostname } = new URL(E2E_BASE_URL);
  for (const user of E2E_USERS) {
    // DB の値と一致する payload を、アプリ本体と同じ変換で作る
    const token = await signJwt(
      toJwtPayload({
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
      }),
      E2E_JWT_SECRET,
      E2E_JWT_EXPIRES_IN,
    );
    const storageState = {
      cookies: [
        {
          name: AUTH_COOKIE,
          value: token,
          domain: hostname,
          path: options.path ?? '/',
          expires: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS,
          httpOnly: options.httpOnly ?? true,
          secure: options.secure ?? false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    };
    writeFileSync(authStatePath(user.key), JSON.stringify(storageState, null, 2));
  }
}
