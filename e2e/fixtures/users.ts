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

/** ユーザーに紐付けるインストラクターの固定 ID。seed のインストラクター投入もここを参照する */
export const E2E_LINKED_INSTRUCTOR_IDS = {
  admin: '00000000-0000-4000-8000-00000000b001',
  manager: '00000000-0000-4000-8000-00000000b002',
  member: '00000000-0000-4000-8000-00000000b003',
} as const;

/** seed と global-setup が共有する E2E ユーザー一覧（3ロール＋無効ユーザー） */
export const E2E_USERS: readonly E2eUser[] = [
  {
    key: 'admin',
    id: '00000000-0000-4000-8000-00000000a001',
    lineUserId: 'e2e-admin',
    displayName: 'E2E管理者',
    role: 'ADMIN',
    isActive: true,
    instructorId: E2E_LINKED_INSTRUCTOR_IDS.admin,
  },
  {
    key: 'manager',
    id: '00000000-0000-4000-8000-00000000a002',
    lineUserId: 'e2e-manager',
    displayName: 'E2Eマネージャー',
    role: 'MANAGER',
    isActive: true,
    instructorId: E2E_LINKED_INSTRUCTOR_IDS.manager,
  },
  {
    key: 'member',
    id: '00000000-0000-4000-8000-00000000a003',
    lineUserId: 'e2e-member',
    displayName: 'E2Eメンバー',
    role: 'MEMBER',
    isActive: true,
    instructorId: E2E_LINKED_INSTRUCTOR_IDS.member,
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
