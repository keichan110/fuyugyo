import { useState } from 'react';

import { Button } from '@mantine/core';

import { useCreateInvitation, useDeactivateInvitation, useInvitations } from '../queries';
import type { Invitation } from '../schema';

/** 日付を YYYY/MM/DD HH:mm 形式でフォーマットする */
function formatDate(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 招待トークン管理コンポーネント（ADMIN/MANAGER 専用）。
 * 一覧表示・新規作成・無効化操作を提供する。
 */
export function InvitationList() {
  const { data: invitations, isLoading, isError } = useInvitations();
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">招待管理</h2>
        <Button size="sm" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '新規招待を作成'}
        </Button>
      </div>

      {showForm && <InvitationCreateForm onCreated={() => setShowForm(false)} />}

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">招待一覧の取得に失敗しました</p>}

      {!isLoading && invitations?.length === 0 && (
        <p className="text-muted-foreground text-sm">招待がありません</p>
      )}

      {invitations && invitations.length > 0 && (
        <ul className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <InvitationItem key={inv.token} invitation={inv} />
          ))}
        </ul>
      )}
    </section>
  );
}

type InvitationCreateFormProps = {
  onCreated: () => void;
};

/** 招待トークン作成フォーム */
function InvitationCreateForm({ onCreated }: InvitationCreateFormProps) {
  const create = useCreateInvitation();
  const [description, setDescription] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        description: description || undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-card flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          説明（任意）
        </label>
        <input
          id="description"
          type="text"
          maxLength={255}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: スタッフ採用用"
          className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="maxUses" className="text-sm font-medium">
            使用上限（任意）
          </label>
          <input
            id="maxUses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="無制限"
            className="border-input bg-background w-28 rounded-md border px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="expiresInHours" className="text-sm font-medium">
            有効期間（時間・任意）
          </label>
          <input
            id="expiresInHours"
            type="number"
            min={1}
            max={8760}
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            placeholder="デフォルト"
            className="border-input bg-background w-28 rounded-md border px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {create.isError && <p className="text-sm text-red-600">{create.error.message}</p>}

      <Button type="submit" size="sm" disabled={create.isPending}>
        {create.isPending ? '作成中…' : '作成する'}
      </Button>
    </form>
  );
}

type InvitationItemProps = {
  invitation: Invitation;
};

/** 招待トークンの1行表示。URLコピーと無効化ボタンを持つ。 */
function InvitationItem({ invitation }: InvitationItemProps) {
  const deactivate = useDeactivateInvitation(invitation.token);
  const [copied, setCopied] = useState(false);
  const isExpired = invitation.expiresAt <= new Date();
  const isOverLimit = invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses;
  const isInvalid = !invitation.isActive || isExpired || isOverLimit;

  const inviteUrl = `${window.location.origin}/api/auth/line/login?invite=${invitation.token}&redirect=/`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードAPIが利用できない場合（非セキュアコンテキスト等）にフォールバックする
      window.prompt('URLをコピーしてください:', inviteUrl);
    }
  };

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {invitation.description && <span className="font-medium">{invitation.description}</span>}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>
              使用回数: {invitation.usedCount}
              {invitation.maxUses !== null ? ` / ${invitation.maxUses}` : ''}
            </span>
            <span>有効期限: {formatDate(invitation.expiresAt)}</span>
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            {!invitation.isActive && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                無効化済み
              </span>
            )}
            {invitation.isActive && isExpired && (
              <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs">
                期限切れ
              </span>
            )}
            {invitation.isActive && !isExpired && isOverLimit && (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
                上限到達
              </span>
            )}
            {!isInvalid && (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                有効
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {!isInvalid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? 'コピー済み' : 'URLをコピー'}
            </Button>
          )}
          {invitation.isActive && (
            <button
              type="button"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate()}
              className="inline-flex h-8 items-center justify-center rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              無効化
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
