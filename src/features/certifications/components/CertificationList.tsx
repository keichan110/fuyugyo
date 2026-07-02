import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDepartments } from '@/features/departments/queries';

import { useCertifications, useDeactivateCertification, useUpdateCertification } from '../queries';
import { CertificationForm } from './CertificationForm';

/**
 * 資格一覧と作成・編集・無効化操作を提供するコンポーネント。
 */
export function CertificationList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効資格も表示するため全件取得する
  const { data, isLoading, isError } = useCertifications(false);
  const { data: departments } = useDepartments(false);

  /** departmentId → name のマップ */
  const deptNameMap = new Map(departments?.map((d) => [d.id, d.name]) ?? []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">資格管理</h2>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '資格を追加'}
        </Button>
      </div>

      {showForm && <CertificationForm onSuccess={() => setShowForm(false)} />}

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">資格一覧の取得に失敗しました</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground text-sm">資格がありません</p>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.map((cert) => (
            <CertificationItem
              key={cert.id}
              id={cert.id}
              name={cert.name}
              shortName={cert.shortName}
              organization={cert.organization}
              description={cert.description}
              isActive={cert.isActive}
              departmentName={deptNameMap.get(cert.departmentId) ?? cert.departmentId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type CertificationItemProps = {
  id: string;
  name: string;
  shortName: string;
  organization: string;
  description: string | null;
  isActive: boolean;
  departmentName: string;
};

/**
 * 資格の1行表示。編集モードと表示モードを切り替える。
 */
function CertificationItem(props: CertificationItemProps) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <CertificationItemEdit {...props} onCancel={() => setEditing(false)} />
  ) : (
    <CertificationItemDisplay {...props} onEdit={() => setEditing(true)} />
  );
}

type CertificationItemDisplayProps = CertificationItemProps & {
  onEdit: () => void;
};

/** 資格の表示モード。無効化ボタンを持つ。 */
function CertificationItemDisplay({
  id,
  name,
  shortName,
  organization,
  description,
  isActive,
  departmentName,
  onEdit,
}: CertificationItemDisplayProps) {
  const deactivate = useDeactivateCertification();

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground font-mono text-sm">({shortName})</span>
            {!isActive && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                無効
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {departmentName} ／ {organization}
          </p>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        {isActive && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              編集
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate(id)}
            >
              無効化
            </Button>
          </div>
        )}
      </div>
      {deactivate.isError && <p className="text-sm text-red-600">{deactivate.error.message}</p>}
    </li>
  );
}

type CertificationItemEditProps = CertificationItemProps & {
  onCancel: () => void;
};

/** 資格の編集モード。フォームを送信して PATCH する。 */
function CertificationItemEdit({
  id,
  name,
  shortName,
  organization,
  description,
  onCancel,
}: CertificationItemEditProps) {
  const [editName, setEditName] = useState(name);
  const [editShortName, setEditShortName] = useState(shortName);
  const [editOrganization, setEditOrganization] = useState(organization);
  const [editDescription, setEditDescription] = useState(description ?? '');
  const update = useUpdateCertification(id);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        name: editName,
        shortName: editShortName,
        organization: editOrganization,
        description: editDescription || null,
      },
      { onSuccess: onCancel },
    );
  };

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-md border p-4">
      <form onSubmit={handleUpdate} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            maxLength={100}
            placeholder="資格名"
            autoFocus
            className="border-input bg-background focus-visible:ring-ring flex-1 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
          />
          <input
            type="text"
            value={editShortName}
            onChange={(e) => setEditShortName(e.target.value)}
            required
            maxLength={20}
            placeholder="省略名"
            className="border-input bg-background focus-visible:ring-ring w-24 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
          />
        </div>
        <input
          type="text"
          value={editOrganization}
          onChange={(e) => setEditOrganization(e.target.value)}
          required
          maxLength={100}
          placeholder="発行団体"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="説明（任意）"
          className="border-input bg-background focus-visible:ring-ring resize-none rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? '保存中…' : '保存'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </form>
      {update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
    </li>
  );
}
