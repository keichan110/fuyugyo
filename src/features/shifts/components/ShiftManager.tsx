import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import {
  useCreateShift,
  useDeleteShift,
  useShiftEditData,
  useShiftFormData,
  useUpdateShift,
} from '../queries';
import type { AvailableInstructor } from '../schema';
import { todayString } from '../view-utils';

/**
 * シフト枠（日付 × 部門 × シフト種別）の作成・編集・割り当て変更を行う管理コンポーネント。
 * 集約エンドポイント（form-data / edit-data）から選択肢と割り当て候補を取得し、
 * 作成（POST）・更新（PATCH）・削除（DELETE）を1画面で完結させる。
 */
export function ShiftManager() {
  const [date, setDate] = useState(todayString());
  const [departmentId, setDepartmentId] = useState('');
  const [shiftTypeId, setShiftTypeId] = useState('');

  const formData = useShiftFormData();

  // 部門・シフト種別が未選択なら先頭を初期選択する
  useEffect(() => {
    if (!departmentId && formData.data?.departments[0]) {
      setDepartmentId(formData.data.departments[0].id);
    }
  }, [departmentId, formData.data]);
  useEffect(() => {
    if (!shiftTypeId && formData.data?.shiftTypes[0]) {
      setShiftTypeId(formData.data.shiftTypes[0].id);
    }
  }, [shiftTypeId, formData.data]);

  const canEdit = !!(date && departmentId && shiftTypeId);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">シフト管理</h2>

      {formData.isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {formData.isError && (
        <p className="text-sm text-red-600">フォームデータの取得に失敗しました</p>
      )}

      {formData.data && (
        <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">日付</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">部門</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                {formData.data.departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">シフト種別</span>
              <select
                value={shiftTypeId}
                onChange={(e) => setShiftTypeId(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                {formData.data.shiftTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {canEdit && (
        <ShiftEditor
          key={`${date}-${departmentId}-${shiftTypeId}`}
          date={date}
          departmentId={departmentId}
          shiftTypeId={shiftTypeId}
        />
      )}
    </section>
  );
}

type ShiftEditorProps = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
};

/**
 * 選択中の (date × 部門 × 種別) に対する編集パネル。
 * edit-data から既存シフト・割り当て候補を読み込み、割り当て・備考を編集して保存する。
 */
function ShiftEditor({ date, departmentId, shiftTypeId }: ShiftEditorProps) {
  const editData = useShiftEditData({ date, departmentId, shiftTypeId });
  const createShift = useCreateShift();
  const updateShift = useUpdateShift(editData.data?.shift?.id ?? '');
  const deleteShift = useDeleteShift();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');

  // 初回ロード時のみ初期値を反映する。background refetch（フォーカス時など）で
  // 編集中の入力を上書きしないようフラグでガードする。
  // （日付・部門・種別の切り替え時は親が key で remount するためフラグもリセットされる）
  const initialized = useRef(false);
  useEffect(() => {
    if (!editData.data || initialized.current) {
      return;
    }
    initialized.current = true;
    setSelectedIds(new Set(editData.data.shift?.assignedInstructorIds ?? []));
    setDescription(editData.data.shift?.description ?? '');
  }, [editData.data]);

  if (editData.isLoading) {
    return <p className="text-muted-foreground text-sm">読み込み中…</p>;
  }
  if (editData.isError || !editData.data) {
    return (
      <p className="text-sm text-red-600">
        {editData.error?.message ?? '編集データの取得に失敗しました'}
      </p>
    );
  }

  const { mode, shift, availableInstructors } = editData.data;
  const isEdit = mode === 'edit';

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = () => {
    const instructorIds = [...selectedIds];
    const trimmedDescription = description.trim();
    if (isEdit && shift) {
      updateShift.mutate({
        description: trimmedDescription || null,
        instructorIds,
      });
    } else {
      createShift.mutate({
        date,
        departmentId,
        shiftTypeId,
        description: trimmedDescription || undefined,
        instructorIds,
      });
    }
  };

  const handleDelete = () => {
    if (shift) {
      deleteShift.mutate(shift.id);
    }
  };

  const saving = createShift.isPending || updateShift.isPending;
  const saveError = createShift.error ?? updateShift.error;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{isEdit ? 'シフトを編集' : '新規シフトを作成'}</span>
        {isEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={deleteShift.isPending}
            onClick={handleDelete}
          >
            シフトを削除
          </Button>
        )}
      </div>

      {availableInstructors.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          この部門に割り当て可能なインストラクターがいません
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {availableInstructors.map((inst) => (
            <InstructorCheckbox
              key={inst.id}
              instructor={inst}
              checked={selectedIds.has(inst.id)}
              onToggle={() => toggle(inst.id)}
            />
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">備考（任意）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          className="border-input bg-background focus-visible:ring-ring resize-none rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </label>

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? '保存中…' : isEdit ? '更新' : '作成'}
        </Button>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError.message}</p>}
      {deleteShift.isError && <p className="text-sm text-red-600">{deleteShift.error.message}</p>}
    </div>
  );
}

type InstructorCheckboxProps = {
  instructor: AvailableInstructor;
  checked: boolean;
  onToggle: () => void;
};

/** 割り当て候補インストラクターの1行（チェックボックス + 競合警告）。 */
function InstructorCheckbox({ instructor, checked, onToggle }: InstructorCheckboxProps) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{instructor.displayName}</span>
        {instructor.certificationSummary && (
          <span className="text-muted-foreground text-xs">
            （{instructor.certificationSummary}）
          </span>
        )}
      </label>
      {instructor.hasConflict && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
          同日に別シフトあり
        </span>
      )}
    </li>
  );
}
