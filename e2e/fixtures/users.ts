import type { UserRole } from '../../src/server/auth/jwt.ts';

/**
 * E2E ユーザー定義の唯一の出所。
 * seed（DB 投入）と global-setup（JWT 署名）の両方がここを参照し、値のコピーは作らない。
 * `lineUserId` は実在の LINE ユーザーと衝突しない明らかなダミー値にしている。
 */
export type E2eUser = {
  /** 認証状態ファイル名・識別に使うキー */
  key: 'admin' | 'manager' | 'member' | 'inactive';
  /** users.id（固定 UUID 形式） */
  id: string;
  lineUserId: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  /** 紐付けるインストラクター ID。紐付けなしは null */
  instructorId: string | null;
};

export const E2E_USERS: readonly E2eUser[] = [
  {
    key: 'admin',
    id: '00000000-0000-4000-8000-00000000a001',
    lineUserId: 'e2e-admin',
    displayName: 'E2E管理者',
    role: 'ADMIN',
    isActive: true,
    instructorId: '00000000-0000-4000-8000-00000000b001',
  },
  {
    key: 'manager',
    id: '00000000-0000-4000-8000-00000000a002',
    lineUserId: 'e2e-manager',
    displayName: 'E2Eマネージャー',
    role: 'MANAGER',
    isActive: true,
    instructorId: '00000000-0000-4000-8000-00000000b002',
  },
  {
    key: 'member',
    id: '00000000-0000-4000-8000-00000000a003',
    lineUserId: 'e2e-member',
    displayName: 'E2Eメンバー',
    role: 'MEMBER',
    isActive: true,
    instructorId: '00000000-0000-4000-8000-00000000b003',
  },
  {
    key: 'inactive',
    id: '00000000-0000-4000-8000-00000000a004',
    lineUserId: 'e2e-inactive',
    displayName: 'E2E無効ユーザー',
    role: 'MEMBER',
    isActive: false,
    instructorId: null,
  },
];

/** key から E2E ユーザーを取得する。未定義なら例外 */
export function getE2eUser(key: E2eUser['key']): E2eUser {
  const user = E2E_USERS.find((candidate) => candidate.key === key);
  if (!user) throw new Error(`E2E ユーザーが未定義です: ${key}`);
  return user;
}
