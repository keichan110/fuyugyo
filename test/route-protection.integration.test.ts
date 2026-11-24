import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import app from '../src/index';
import { signJwt, type UserRole } from '../src/server/auth/jwt';
import type { Env } from '../src/server/types';

/**
 * 全 API ルートの認証・ロール保護の棚卸しテスト（実 HTTP ルート）。
 *
 * - Hono に登録された全ルート（method + path）を、保護ルート一覧と公開例外一覧に分類する。
 *   どちらにも載っていない新規ルートがあればこのテストが失敗し、認証漏れを見逃さない。
 * - 保護ルートは具体的なパラメーターと有効な JSON 本文・同一オリジンのヘッダーで未認証リクエストを送り、
 *   CSRF や入力検証による拒否ではなく認証で 401 になること、DB に触れないことを確認する。
 * - ロールの序列（ADMIN > MANAGER > MEMBER）に基づき、必要ロール未満の JWT が 403 になることも、
 *   DB に触れずに確認する。部門所属によるアクセス制限は仕様にないため、この表にも置かない。
 */

type RouteSpec = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Hono に登録されたパス（`:param` を含む） */
  path: string;
  /** そのルートを呼べる最低ロール。ここで要求するロールは `requireRole` の指定と一致させる */
  minRole: UserRole;
  /** 書き込み系で送る、検証を通る有効な JSON 本文 */
  body?: unknown;
};

/** 認証必須の全ルート。`requireAuth`（および必要なら `requireRole`）を持つ */
const PROTECTED_ROUTES: readonly RouteSpec[] = [
  { method: 'GET', path: '/api/auth/me', minRole: 'MEMBER' },

  { method: 'GET', path: '/api/availabilities/me', minRole: 'MEMBER' },
  {
    method: 'PUT',
    path: '/api/availabilities/me',
    minRole: 'MEMBER',
    body: { changes: [{ date: '2027-01-10', type: 'AVAILABLE' }] },
  },
  { method: 'GET', path: '/api/availabilities', minRole: 'MANAGER' },

  { method: 'GET', path: '/api/certifications', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/certifications/:id', minRole: 'MEMBER' },
  {
    method: 'POST',
    path: '/api/certifications',
    minRole: 'MANAGER',
    body: {
      departmentCode: 'ski',
      name: '認定資格',
      shortName: '認定',
      organization: 'テスト協会',
    },
  },
  { method: 'PATCH', path: '/api/certifications/:id', minRole: 'MANAGER', body: { name: '改名' } },
  { method: 'POST', path: '/api/certifications/:id/deactivate', minRole: 'MANAGER' },

  {
    method: 'GET',
    path: '/api/certification-requirements/:departmentCode/:shiftTypeId',
    minRole: 'ADMIN',
  },
  {
    method: 'PUT',
    path: '/api/certification-requirements/:departmentCode/:shiftTypeId',
    minRole: 'ADMIN',
    body: { rules: [] },
  },

  { method: 'GET', path: '/api/department-shift-types/:departmentCode', minRole: 'MEMBER' },
  {
    method: 'POST',
    path: '/api/department-shift-types/:departmentCode',
    minRole: 'ADMIN',
    body: { name: '新しい種別' },
  },
  {
    method: 'POST',
    path: '/api/department-shift-types/:departmentCode/assignments',
    minRole: 'ADMIN',
    body: { shiftTypeId: 'x' },
  },
  {
    method: 'DELETE',
    path: '/api/department-shift-types/:departmentCode/assignments/:shiftTypeId',
    minRole: 'ADMIN',
  },
  {
    method: 'PUT',
    path: '/api/department-shift-types/:departmentCode',
    minRole: 'ADMIN',
    body: { shiftTypeIds: [] },
  },

  { method: 'GET', path: '/api/shift-types', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shift-types/:id', minRole: 'MEMBER' },
  { method: 'POST', path: '/api/shift-types', minRole: 'ADMIN', body: { name: '新種別' } },
  { method: 'PATCH', path: '/api/shift-types/:id', minRole: 'ADMIN', body: { name: '改名' } },

  {
    method: 'GET',
    path: '/api/instructors/by-department/:departmentCode/active',
    minRole: 'MEMBER',
  },
  { method: 'GET', path: '/api/instructors', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/instructors/:id', minRole: 'MEMBER' },
  {
    method: 'POST',
    path: '/api/instructors',
    minRole: 'MANAGER',
    body: { lastName: '山田', firstName: '太郎' },
  },
  { method: 'PATCH', path: '/api/instructors/:id', minRole: 'MANAGER', body: { lastName: '鈴木' } },
  {
    method: 'POST',
    path: '/api/instructors/:id/change-status',
    minRole: 'MANAGER',
    body: { status: 'INACTIVE' },
  },
  {
    method: 'POST',
    path: '/api/instructors/:id/certifications',
    minRole: 'MANAGER',
    body: { certificationId: 'x' },
  },
  { method: 'DELETE', path: '/api/instructors/:id/certifications/:certId', minRole: 'MANAGER' },

  { method: 'POST', path: '/api/invitations', minRole: 'MANAGER', body: {} },
  { method: 'GET', path: '/api/invitations', minRole: 'MANAGER' },
  { method: 'POST', path: '/api/invitations/:token/deactivate', minRole: 'MANAGER' },

  { method: 'GET', path: '/api/users', minRole: 'MANAGER' },
  { method: 'GET', path: '/api/users/:id', minRole: 'MANAGER' },
  {
    method: 'POST',
    path: '/api/users/:id/change-role',
    minRole: 'ADMIN',
    body: { role: 'MANAGER' },
  },
  { method: 'POST', path: '/api/users/:id/deactivate', minRole: 'MANAGER' },
  { method: 'POST', path: '/api/users/:id/activate', minRole: 'MANAGER' },
  {
    method: 'POST',
    path: '/api/users/:id/link-instructor',
    minRole: 'MANAGER',
    body: { instructorId: 'x' },
  },
  { method: 'DELETE', path: '/api/users/:id/link-instructor', minRole: 'MANAGER' },

  { method: 'GET', path: '/api/shifts/auto-assign-context', minRole: 'MANAGER' },
  { method: 'GET', path: '/api/shifts/creation-context', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shifts/instructor-workload', minRole: 'MANAGER' },
  { method: 'GET', path: '/api/shifts/assignment-editor', minRole: 'MANAGER' },
  { method: 'GET', path: '/api/shifts/agenda', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shifts/calendar', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shifts/requirements', minRole: 'MANAGER' },
  { method: 'GET', path: '/api/shifts/attendance', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shifts', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/shifts/me/season-stats', minRole: 'MEMBER' },
  {
    method: 'PUT',
    path: '/api/shifts/publication',
    minRole: 'MANAGER',
    body: {
      month: '2027-01',
      departmentCode: 'ski',
      shiftTypeId: 'x',
      status: 'PUBLISHED',
      dates: [{ date: '2027-01-10', expectedRevision: null }],
    },
  },
  {
    method: 'PUT',
    path: '/api/shifts/assignments',
    minRole: 'MANAGER',
    body: {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [{ date: '2027-01-10', shiftTypeId: 'x', instructorIds: [] }],
    },
  },

  { method: 'GET', path: '/api/season-analysis', minRole: 'MANAGER' },

  { method: 'GET', path: '/api/weather/point', minRole: 'ADMIN' },
  {
    method: 'PUT',
    path: '/api/weather/point',
    minRole: 'ADMIN',
    body: { name: '地点', latitude: 36.1, longitude: 138.5, elevationM: 1500 },
  },
  { method: 'GET', path: '/api/weather/daily', minRole: 'MEMBER' },
  { method: 'GET', path: '/api/weather/steps', minRole: 'MEMBER' },
];

/**
 * 認証を要求しない公開ルートの例外。実コードを確認した理由を必ず添える。
 * 新しい公開ルートを増やすときは、ここに理由を書いて明示的に承認する。
 */
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string; reason: string }> = [
  {
    method: 'GET',
    path: '/api/health',
    reason: '死活監視用。ユーザーデータを返さない',
  },
  {
    method: 'GET',
    path: '/api/auth/line/login',
    reason: 'ログイン開始。未認証で到達する入口のため CF Rate Limit を適用',
  },
  {
    method: 'GET',
    path: '/api/auth/line/callback',
    reason:
      'LINE からの戻り。state 検証を行い、未登録なら利用申請へ誘導する。未認証で到達するため Rate Limit を適用',
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    reason: 'Cookie を破棄するだけで、データ参照・更新をしない',
  },
  {
    method: 'POST',
    path: '/api/access-requests',
    reason:
      '未登録ユーザーの利用申請。LINE ログイン後に発行した申請専用 Cookie を検証し、未認証で到達するため Rate Limit を適用',
  },
  {
    method: 'GET',
    path: '/api/invitations/:token/verify',
    reason: '招待リンクを開く未登録ユーザー向けに、公開用フィールドだけを返す。Rate Limit を適用',
  },
];

const PARAM_SAMPLES: Record<string, string> = { departmentCode: 'ski' };

/** `:param` を具体値に置き換えて、実際にリクエストできる URL にする */
function concretePath(path: string): string {
  return path.replace(/:(\w+)/g, (_match, name: string) => PARAM_SAMPLES[name] ?? 'sample-id');
}

/** どの DB 操作にも到達しない D1。到達すれば例外を投げる */
function unreachableDb(): D1Database {
  return new Proxy(env.DB, {
    get() {
      throw new Error('認証・認可で拒否されるはずのリクエストが DB へ到達しました');
    },
  });
}

function guardedEnv(): Env {
  return { ...env, DB: unreachableDb() };
}

function init(route: RouteSpec, cookie?: string): RequestInit {
  const headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' };
  if (cookie) headers.cookie = `auth-token=${cookie}`;
  if (route.body === undefined) return { method: route.method, headers };
  headers['Content-Type'] = 'application/json';
  return { method: route.method, headers, body: JSON.stringify(route.body) };
}

async function tokenFor(role: UserRole): Promise<string> {
  return await signJwt(
    { userId: `protected-route-${role}`, displayName: role, role, isActive: true },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

/**
 * method が ALL で登録されている既知の middleware のパス（`src/index.ts` の `app.use('*', ...)`。Hono は `/*` として保持する）。
 * 将来 `.all('/api/x', handler)` のような実ハンドラーが増えると、この集合と一致せず失敗する。
 */
const KNOWN_MIDDLEWARE_PATHS: readonly string[] = ['/*'];

const key = (route: { method: string; path: string }) => `${route.method} ${route.path}`;

describe('API ルートの保護の棚卸し', () => {
  it('Hono に登録された全ルートが、保護一覧か公開例外のどちらか一方にだけ載っている', () => {
    // middleware 登録（method が ALL）は既知の middleware パス集合と一致することを確認して分離する。
    // 同じ method/path の重複は 1 件にまとめる
    const allPaths = new Set(
      app.routes.filter((route) => route.method === 'ALL').map((route) => route.path),
    );
    expect([...allPaths].sort()).toEqual([...KNOWN_MIDDLEWARE_PATHS].sort());
    const registered = new Set(
      app.routes.filter((route) => route.method !== 'ALL').map((route) => key(route)),
    );
    const protectedKeys = PROTECTED_ROUTES.map(key);
    const publicKeys = PUBLIC_ROUTES.map(key);

    expect(new Set(protectedKeys).size).toBe(protectedKeys.length);
    expect(protectedKeys.filter((entry) => publicKeys.includes(entry))).toEqual([]);
    expect(
      [...registered].filter(
        (entry) => !protectedKeys.includes(entry) && !publicKeys.includes(entry),
      ),
    ).toEqual([]);
    expect([...protectedKeys, ...publicKeys].filter((entry) => !registered.has(entry))).toEqual([]);
  });

  it.each(PROTECTED_ROUTES.map((route) => [key(route), route] as const))(
    '未認証の %s は同一オリジンの有効な要求でも 401 で、DB に触れない',
    async (_name, route) => {
      const res = await app.request(concretePath(route.path), init(route), guardedEnv());

      expect(res.status).toBe(401);
      expect((res.headers.get('set-cookie') ?? '').includes('auth-token=')).toBe(false);
    },
  );

  it.each(
    PROTECTED_ROUTES.filter((route) => route.minRole !== 'MEMBER').map(
      (route) => [key(route), route] as const,
    ),
  )('%s は必要ロール未満の JWT を 403 で拒否し、DB に触れない', async (_name, route) => {
    // 必要ロールの一段下（MANAGER 必須なら MEMBER、ADMIN 必須なら MANAGER）で検証する
    const below: UserRole = route.minRole === 'ADMIN' ? 'MANAGER' : 'MEMBER';
    const res = await app.request(
      concretePath(route.path),
      init(route, await tokenFor(below)),
      guardedEnv(),
    );

    expect(res.status).toBe(403);
  });
});
