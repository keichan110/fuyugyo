import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { useDeactivateShiftType, useShiftTypes, useUpdateShiftType } from '../queries';
import { ShiftTypeForm } from './ShiftTypeForm';

/**
 * シフト種別一覧と作成・編集・無効化操作を提供するコンポーネント。
 */
export function ShiftTypeList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効種別も表示するため全件取得する
  const { data, isLoading, isError } = useShiftTypes(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">シフト種別管理</h2>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : 'シフト種別を追加'}
        </Button>
      </div>

      {showForm && <ShiftTypeForm onSuccess={() => setShowForm(false)} />}

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">シフト種別一覧の取得に失敗しました</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground text-sm">シフト種別がありません</p>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.map((shiftType) => (
            <ShiftTypeItem
              key={shiftType.id}
              id={shiftType.id}
              name={shiftType.name}
              isActive={shiftType.isActive}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type ShiftTypeItemProps = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * シフト種別の1行表示。編集・無効化ボタンを持つ。
 * deactivate フックをアイテム内に持つことで、各行が独立した操作状態を管理する。
 */
function ShiftTypeItem({ id, name, isActive }: ShiftTypeItemProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const update = useUpdateShiftType(id);
  const deactivate = useDeactivateShiftType();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ name: editName }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-md border p-4">
      {editing ? (
        <form onSubmit={handleUpdate} className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            maxLength={100}
            autoFocus
            className="border-input bg-background focus-visible:ring-ring flex-1 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
          />
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? '保存中…' : '保存'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditName(name);
              setEditing(false);
            }}
          >
            キャンセル
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            {!isActive && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                無効
              </span>
            )}
          </div>
          {isActive && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
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
      )}

      {update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
      {deactivate.isError && <p className="text-sm text-red-600">{deactivate.error.message}</p>}
    </li>
  );
}
