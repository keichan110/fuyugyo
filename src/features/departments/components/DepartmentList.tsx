import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { useDeactivateDepartment, useDepartments } from '../queries';
import { DepartmentForm } from './DepartmentForm';

/**
 * 部門一覧と作成・無効化操作を提供するコンポーネント。
 */
export function DepartmentList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では無効部門も表示するため全件取得する
  const { data, isLoading, isError } = useDepartments(false);
  const deactivate = useDeactivateDepartment();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">部門管理</h2>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : '部門を追加'}
        </Button>
      </div>

      {showForm && <DepartmentForm onSuccess={() => setShowForm(false)} />}

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">部門一覧の取得に失敗しました</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground text-sm">部門がありません</p>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.map((dept) => (
            <li
              key={dept.id}
              className="border-border bg-card flex items-center justify-between rounded-md border p-4"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-sm">{dept.code}</span>
                  <span className="font-medium">{dept.name}</span>
                  {!dept.isActive && (
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                      無効
                    </span>
                  )}
                </div>
                {dept.description && (
                  <p className="text-muted-foreground text-sm">{dept.description}</p>
                )}
              </div>
              {dept.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deactivate.isPending}
                  onClick={() => deactivate.mutate(dept.id)}
                >
                  無効化
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
