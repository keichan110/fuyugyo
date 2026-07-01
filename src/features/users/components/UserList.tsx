import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useInstructors } from '@/features/instructors/queries';

import {
  useActivateUser,
  useChangeRole,
  useDeactivateUser,
  useLinkInstructor,
  useUnlinkInstructor,
  useUsers,
} from '../queries';
import type { User } from '../schema';
import { userRoleSchema, type UserRole } from '../schema';

/** ロールの表示名 */
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: '管理者',
  MANAGER: 'マネージャー',
  MEMBER: 'メンバー',
};

/**
 * ユーザー一覧・ロール変更・無効化・Instructor リンク操作を提供するコンポーネント（ADMIN 専用）。
 */
export function UserList() {
  const { data: userList, isLoading, isError } = useUsers();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">ユーザー管理</h2>

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">ユーザー一覧の取得に失敗しました</p>}

      {!isLoading && userList?.length === 0 && (
        <p className="text-muted-foreground text-sm">ユーザーがいません</p>
      )}

      {userList && userList.length > 0 && (
        <ul className="flex flex-col gap-2">
          {userList.map((user) => (
            <UserItem key={user.id} user={user} />
          ))}
        </ul>
      )}
    </section>
  );
}

type UserItemProps = {
  user: User;
};

/** ユーザーの1行表示。操作モードを切り替える。 */
function UserItem({ user }: UserItemProps) {
  const [mode, setMode] = useState<'display' | 'change-role' | 'link-instructor'>('display');

  if (mode === 'change-role') {
    return <UserRoleChanger user={user} onBack={() => setMode('display')} />;
  }
  if (mode === 'link-instructor') {
    return <UserInstructorLinker user={user} onBack={() => setMode('display')} />;
  }
  return (
    <UserItemDisplay
      user={user}
      onChangeRole={() => setMode('change-role')}
      onLinkInstructor={() => setMode('link-instructor')}
    />
  );
}

type UserItemDisplayProps = {
  user: User;
  onChangeRole: () => void;
  onLinkInstructor: () => void;
};

/** ユーザーの表示モード。無効化・アクティブ化ボタンを持つ。 */
function UserItemDisplay({ user, onChangeRole, onLinkInstructor }: UserItemDisplayProps) {
  const deactivate = useDeactivateUser(user.id);
  const activate = useActivateUser(user.id);

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.displayName}</span>
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
              {ROLE_LABELS[user.role]}
            </span>
            {!user.isActive && (
              <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs">
                無効
              </span>
            )}
            {user.instructorId && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                Instructor リンク済み
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onChangeRole}>
            ロール変更
          </Button>
          <Button variant="outline" size="sm" onClick={onLinkInstructor}>
            Instructor リンク
          </Button>
          {user.isActive ? (
            <Button
              variant="outline"
              size="sm"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate()}
            >
              {deactivate.isPending ? '処理中…' : '無効化'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={activate.isPending}
              onClick={() => activate.mutate()}
            >
              {activate.isPending ? '処理中…' : 'アクティブ化'}
            </Button>
          )}
        </div>
      </div>
      {deactivate.isError && <p className="text-sm text-red-600">{deactivate.error.message}</p>}
      {activate.isError && <p className="text-sm text-red-600">{activate.error.message}</p>}
    </li>
  );
}

type UserRoleChangerProps = {
  user: User;
  onBack: () => void;
};

/** ロール変更パネル。セレクトボックスでロールを選んで PATCH する。 */
function UserRoleChanger({ user, onBack }: UserRoleChangerProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const changeRole = useChangeRole(user.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    changeRole.mutate({ role }, { onSuccess: onBack });
  };

  return (
    <li className="border-border bg-card rounded-md border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium">{user.displayName} — ロール変更</span>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          戻る
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <select
          value={role}
          onChange={(e) => setRole(userRoleSchema.parse(e.target.value))}
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        >
          {userRoleSchema.options.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={changeRole.isPending || role === user.role}>
            {changeRole.isPending ? '保存中…' : '保存'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            キャンセル
          </Button>
        </div>
      </form>
      {changeRole.isError && (
        <p className="mt-2 text-sm text-red-600">{changeRole.error.message}</p>
      )}
    </li>
  );
}

type UserInstructorLinkerProps = {
  user: User;
  onBack: () => void;
};

/**
 * Instructor リンク管理パネル。
 * アクティブ Instructor を一覧表示し、リンク・解除を操作する。
 */
function UserInstructorLinker({ user, onBack }: UserInstructorLinkerProps) {
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const { data: activeInstructors } = useInstructors('ACTIVE');
  const linkInstructor = useLinkInstructor(user.id);
  const unlinkInstructor = useUnlinkInstructor(user.id);

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstructorId) return;
    linkInstructor.mutate({ instructorId: selectedInstructorId }, { onSuccess: onBack });
  };

  const handleUnlink = () => {
    unlinkInstructor.mutate(undefined, { onSuccess: onBack });
  };

  const linkedInstructor = activeInstructors?.find((i) => i.id === user.instructorId);

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{user.displayName} — Instructor リンク</span>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          戻る
        </Button>
      </div>

      {/* 現在のリンク状態 */}
      {user.instructorId ? (
        <div className="bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
          <span>
            リンク中:{' '}
            {linkedInstructor
              ? `${linkedInstructor.lastName} ${linkedInstructor.firstName}`
              : 'インストラクター情報を取得できません'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unlinkInstructor.isPending}
            onClick={handleUnlink}
          >
            {unlinkInstructor.isPending ? '解除中…' : 'リンク解除'}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Instructor にリンクされていません</p>
      )}

      {/* リンクフォーム */}
      {!user.instructorId && activeInstructors && activeInstructors.length > 0 && (
        <form onSubmit={handleLink} className="flex gap-2">
          <select
            value={selectedInstructorId}
            onChange={(e) => setSelectedInstructorId(e.target.value)}
            required
            className="border-input bg-background focus-visible:ring-ring flex-1 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
          >
            <option value="">インストラクターを選択してください</option>
            {activeInstructors.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.lastName} {inst.firstName}
                {inst.lastNameKana && inst.firstNameKana
                  ? `（${inst.lastNameKana} ${inst.firstNameKana}）`
                  : ''}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            size="sm"
            disabled={linkInstructor.isPending || !selectedInstructorId}
          >
            {linkInstructor.isPending ? 'リンク中…' : 'リンク'}
          </Button>
        </form>
      )}

      {linkInstructor.isError && (
        <p className="text-sm text-red-600">{linkInstructor.error.message}</p>
      )}
      {unlinkInstructor.isError && (
        <p className="text-sm text-red-600">{unlinkInstructor.error.message}</p>
      )}
    </li>
  );
}
