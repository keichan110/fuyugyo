import { useState } from 'react';

import {
  Avatar,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { FormFooterButtons } from '@/components/FormFooterButtons';
import { useMe } from '@/features/auth/queries';
import { hasMinimumRole, type MeResponse } from '@/features/auth/schema';
import { useInstructor, useInstructors } from '@/features/instructors/queries';
import type {
  InstructorListItem,
  InstructorWithCertifications,
} from '@/features/instructors/schema';

import {
  useActivateUser,
  useChangeRole,
  useDeactivateUser,
  useLinkInstructor,
  useUnlinkInstructor,
  useUsers,
} from '../queries';
import { USER_ROLE_META } from '../role-meta';
import { userRoleSchema, type User, type UserRole } from '../schema';
import { canChangeUserStatus } from '../status-policy';

/** Drawer が表示する状態（対象ユーザーの ID）。users には作成 API がないため編集モードのみ持つ。 */
export type UserDrawerState = { userId: string };

type Props = {
  state: UserDrawerState | null;
  onClose: () => void;
};

/**
 * ユーザーのロール・Instructor リンク・ステータスを編集する右 Drawer。
 * ユーザーは LINE 招待経由で登録されるため、このコンポーネントは編集モードのみを持つ。
 */
export function UserDrawer({ state, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の非 null な state を保持する
  const [lastState, setLastState] = useState<UserDrawerState | null>(state);

  if (state !== null && state !== lastState) setLastState(state);

  const effectiveState = state ?? lastState;

  return (
    <Drawer opened={state !== null} onClose={onClose} title="ユーザーを編集">
      {effectiveState && (
        <EditPanel key={effectiveState.userId} userId={effectiveState.userId} onClose={onClose} />
      )}
    </Drawer>
  );
}

/** 「姓 名（姓カナ 名カナ）」形式の表示名を組み立てる（カナ未登録なら姓名のみ） */
function fullNameOf(instructor: InstructorListItem | InstructorWithCertifications): string {
  return instructor.lastNameKana && instructor.firstNameKana
    ? `${instructor.lastName} ${instructor.firstName}（${instructor.lastNameKana} ${instructor.firstNameKana}）`
    : `${instructor.lastName} ${instructor.firstName}`;
}

type InstructorLinkEditorProps = {
  /** 現在フォーム上で選択されている Instructor ID（未リンクなら null） */
  instructorId: string | null;
  onSelect: (id: string) => void;
  onUnlink: () => void;
};

/**
 * Instructor リンクの編集セクション。
 * リンク中は Instructor 名のバッジと解除ボタンを、未リンク（またはローカル解除後）は
 * アクティブ Instructor から選ぶ Select を表示する。実際のリンク・解除 API 呼び出しは
 * フォーム保存時にまとめて反映される（CertEditor と同じローカル編集方式）。
 */
function InstructorLinkEditor({ instructorId, onSelect, onUnlink }: InstructorLinkEditorProps) {
  // リンク中の Instructor は無効化済みの可能性もあるため、ACTIVE 一覧ではなく
  // 詳細取得（ステータス問わず取得できる）で名前を解決する
  const { data: linkedInstructor, isLoading } = useInstructor(instructorId ?? '');
  const { data: activeInstructors } = useInstructors('ACTIVE');

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        Instructor リンク
      </Text>

      {instructorId ? (
        isLoading || !linkedInstructor ? (
          <Skeleton height={24} width={180} />
        ) : (
          <Group gap="xs">
            <Avatar color="initials" name={fullNameOf(linkedInstructor)} radius="xl" size="sm" />
            <Text size="sm">{fullNameOf(linkedInstructor)}</Text>
            <CloseButton size="xs" onClick={onUnlink} />
          </Group>
        )
      ) : (
        <Select
          placeholder="インストラクターを選択"
          searchable
          data={(activeInstructors ?? []).map((inst) => ({
            value: inst.id,
            label: fullNameOf(inst),
          }))}
          value={null}
          onChange={(value) => {
            if (value) onSelect(value);
          }}
        />
      )}
    </Stack>
  );
}

/** 編集対象のユーザーを一覧キャッシュから探し、揃うまで Skeleton を表示するローダー */
function EditPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: users } = useUsers();
  const user = users?.find((u) => u.id === userId);

  if (!user) {
    return (
      <Stack gap="sm">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={80} />
      </Stack>
    );
  }

  return <EditForm key={user.id} user={user} onClose={onClose} />;
}

/**
 * ステータス変更ができない理由を返す（変更できるなら null）。
 * 自分自身の無効化は不可。MANAGER は MEMBER のみ変更でき、ADMIN は自分以外の全員を変更できる。
 * ロールによる可否はサーバーと共通の `canChangeUserStatus` で判定する。
 */
function getStatusLock(me: MeResponse | null | undefined, target: User): string | null {
  if (!me) return '操作者の情報を取得できません';
  if (me.id === target.id) return '自分自身のステータスは変更できません';
  if (!canChangeUserStatus(me.role, target.role)) {
    return 'マネージャー・管理者のステータスは管理者のみ変更できます';
  }
  return null;
}

type EditFormProps = {
  user: User;
  onClose: () => void;
};

/**
 * 編集フォーム本体。ロール・Instructor リンク・ステータスをローカルで編集し、
 * 保存で初期値との差分だけをまとめて API に反映する。
 */
function EditForm({ user, onClose }: EditFormProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [instructorId, setInstructorId] = useState<string | null>(user.instructorId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useMe();
  // ロール変更は ADMIN のみ。MANAGER には読み取り専用で見せ、保存時にも送らない
  const canChangeRole = me ? hasMinimumRole(me.role, 'ADMIN') : false;
  const statusLock = getStatusLock(me, user);

  const changeRole = useChangeRole(user.id);
  const activate = useActivateUser(user.id);
  const deactivate = useDeactivateUser(user.id);
  const linkInstructor = useLinkInstructor(user.id);
  const unlinkInstructor = useUnlinkInstructor(user.id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // ロール・ステータスの差分は互いに独立しているため並列実行してよい
      const tasks: Promise<unknown>[] = [];
      if (canChangeRole && role !== user.role) {
        tasks.push(changeRole.mutateAsync({ role }));
      }
      if (!statusLock && isActive !== user.isActive) {
        tasks.push(isActive ? activate.mutateAsync() : deactivate.mutateAsync());
      }
      await Promise.all(tasks);

      // Instructor リンクの差分反映。
      // 別の Instructor への付け替えは、解除と登録を並列に投げるとサーバー側で
      // unlink/link が競合しうるため、必ず解除完了を待ってから登録する。
      if (instructorId !== user.instructorId) {
        if (user.instructorId) {
          await unlinkInstructor.mutateAsync();
        }
        if (instructorId) {
          await linkInstructor.mutateAsync({ instructorId });
        }
      }

      notifications.show({
        color: 'green',
        message: `${user.displayName}を保存しました`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <Stack gap="lg">
        <Group gap="sm">
          {user.pictureUrl ? (
            <Avatar src={user.pictureUrl} radius="xl" />
          ) : (
            <Avatar color="initials" name={user.displayName} radius="xl" />
          )}
          <div>
            <Text fw={500}>{user.displayName}</Text>
            <AppBadge kind={USER_ROLE_META[user.role].badgeKind} size="sm">
              {USER_ROLE_META[user.role].label}
            </AppBadge>
          </div>
        </Group>

        <Divider />

        <Select
          label="ロール"
          data={userRoleSchema.options.map((r) => ({ value: r, label: USER_ROLE_META[r].label }))}
          value={role}
          disabled={!canChangeRole}
          description={canChangeRole ? undefined : 'ロールの変更は管理者のみ可能です'}
          onChange={(value) => setRole(userRoleSchema.parse(value))}
        />

        <Divider />

        <InstructorLinkEditor
          instructorId={instructorId}
          onSelect={setInstructorId}
          onUnlink={() => setInstructorId(null)}
        />

        <Divider />

        <Group justify="space-between">
          <div>
            <Text fw={500} size="sm">
              ステータス
            </Text>
            <Text c="dimmed" size="xs">
              {isActive ? '有効' : '無効'}
            </Text>
            {statusLock && (
              <Text c="dimmed" size="xs">
                {statusLock}
              </Text>
            )}
          </div>
          <Switch
            checked={isActive}
            disabled={statusLock !== null}
            aria-label="ステータス"
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
        </Group>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <FormFooterButtons saving={saving} onCancel={onClose} />
      </Stack>
    </form>
  );
}
