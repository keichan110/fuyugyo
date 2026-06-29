import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCertifications } from '@/features/certifications/queries';
import {
  useAssignCertification,
  useChangeInstructorStatus,
  useInstructor,
  useInstructors,
  useUnassignCertification,
  useUpdateInstructor,
} from '../queries';
import type { Instructor } from '../schema';
import { InstructorForm } from './InstructorForm';

/**
 * インストラクター一覧と作成・編集・ステータス変更・資格管理を提供するコンポーネント。
 */
export function InstructorList() {
  const [showForm, setShowForm] = useState(false);
  // 管理画面では全ステータスを表示する
  const activeData = useInstructors('ACTIVE');
  const inactiveData = useInstructors('INACTIVE');

  const allInstructors = [
    ...(activeData.data ?? []),
    ...(inactiveData.data ?? []),
  ];
  const isLoading = activeData.isLoading || inactiveData.isLoading;
  const isError = activeData.isError || inactiveData.isError;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-xl">インストラクター管理</h2>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'キャンセル' : 'インストラクターを追加'}
        </Button>
      </div>

      {showForm && (
        <InstructorForm onSuccess={() => setShowForm(false)} />
      )}

      {isLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}
      {isError && (
        <p className="text-red-600 text-sm">インストラクター一覧の取得に失敗しました</p>
      )}

      {!isLoading && allInstructors.length === 0 && (
        <p className="text-muted-foreground text-sm">インストラクターがいません</p>
      )}

      {allInstructors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {allInstructors.map((instructor) => (
            <InstructorItem key={instructor.id} instructor={instructor} />
          ))}
        </ul>
      )}
    </section>
  );
}

type InstructorItemProps = {
  instructor: Instructor;
};

/**
 * インストラクターの1行表示。編集モードと表示モードを切り替える。
 */
function InstructorItem({ instructor }: InstructorItemProps) {
  const [mode, setMode] = useState<'display' | 'edit' | 'cert'>('display');

  if (mode === 'edit') {
    return (
      <InstructorItemEdit
        instructor={instructor}
        onCancel={() => setMode('display')}
      />
    );
  }
  if (mode === 'cert') {
    return (
      <InstructorCertManager
        instructor={instructor}
        onBack={() => setMode('display')}
      />
    );
  }
  return (
    <InstructorItemDisplay
      instructor={instructor}
      onEdit={() => setMode('edit')}
      onManageCert={() => setMode('cert')}
    />
  );
}

type InstructorItemDisplayProps = {
  instructor: Instructor;
  onEdit: () => void;
  onManageCert: () => void;
};

/** インストラクターの表示モード。ステータス変更ボタンを持つ。 */
function InstructorItemDisplay({ instructor, onEdit, onManageCert }: InstructorItemDisplayProps) {
  const changeStatus = useChangeInstructorStatus(instructor.id);
  const isActive = instructor.status === 'ACTIVE';

  const fullName = `${instructor.lastName} ${instructor.firstName}`;
  const fullNameKana =
    instructor.lastNameKana && instructor.firstNameKana
      ? `${instructor.lastNameKana} ${instructor.firstNameKana}`
      : null;

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{fullName}</span>
            {fullNameKana && (
              <span className="text-muted-foreground text-sm">（{fullNameKana}）</span>
            )}
            {!isActive && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                非アクティブ
              </span>
            )}
          </div>
          {instructor.notes && (
            <p className="text-muted-foreground text-sm">{instructor.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            編集
          </Button>
          <Button variant="outline" size="sm" onClick={onManageCert}>
            資格管理
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={changeStatus.isPending}
            onClick={() =>
              changeStatus.mutate({ status: isActive ? 'INACTIVE' : 'ACTIVE' })
            }
          >
            {isActive ? '非アクティブ化' : 'アクティブ化'}
          </Button>
        </div>
      </div>
      {changeStatus.isError && (
        <p className="text-red-600 text-sm">{changeStatus.error.message}</p>
      )}
    </li>
  );
}

type InstructorItemEditProps = {
  instructor: Instructor;
  onCancel: () => void;
};

/** インストラクターの編集モード。フォームを送信して PATCH する。 */
function InstructorItemEdit({ instructor, onCancel }: InstructorItemEditProps) {
  const [lastName, setLastName] = useState(instructor.lastName);
  const [firstName, setFirstName] = useState(instructor.firstName);
  const [lastNameKana, setLastNameKana] = useState(instructor.lastNameKana ?? '');
  const [firstNameKana, setFirstNameKana] = useState(instructor.firstNameKana ?? '');
  const [notes, setNotes] = useState(instructor.notes ?? '');
  const update = useUpdateInstructor(instructor.id);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        lastName,
        firstName,
        lastNameKana: lastNameKana || null,
        firstNameKana: firstNameKana || null,
        notes: notes || null,
      },
      { onSuccess: onCancel }
    );
  };

  return (
    <li className="rounded-md border border-border bg-card p-4">
      <form onSubmit={handleUpdate} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            maxLength={50}
            placeholder="姓"
            autoFocus
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={50}
            placeholder="名"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={lastNameKana}
            onChange={(e) => setLastNameKana(e.target.value)}
            maxLength={50}
            placeholder="姓（カナ）"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={firstNameKana}
            onChange={(e) => setFirstNameKana(e.target.value)}
            maxLength={50}
            placeholder="名（カナ）"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="備考（任意）"
          className="resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
      {update.isError && (
        <p className="text-red-600 text-sm">{update.error.message}</p>
      )}
    </li>
  );
}

type InstructorCertManagerProps = {
  instructor: Instructor;
  onBack: () => void;
};

/**
 * インストラクターの資格管理パネル。
 * useInstructor で詳細データを取得し、資格の割り当て・解除を操作する。
 */
function InstructorCertManager({ instructor, onBack }: InstructorCertManagerProps) {
  const [selectedCertId, setSelectedCertId] = useState('');
  // 詳細（割り当て済み certifications 含む）を API から取得する
  const { data: detail, isLoading: detailLoading } = useInstructor(instructor.id);
  // 無効化された資格の名前も表示できるよう全件取得する
  const { data: allCerts } = useCertifications(false);
  const assign = useAssignCertification(instructor.id);
  const unassign = useUnassignCertification(instructor.id);

  // certificationId → Certification のマップ（名前表示に使用）
  const certMap = new Map(allCerts?.map((c) => [c.id, c]) ?? []);
  const assignedCertIds = new Set(detail?.certifications.map((ic) => ic.certificationId) ?? []);
  // 割り当てフォームにはアクティブかつ未割り当ての資格のみ表示する
  const availableCerts = allCerts?.filter((c) => c.isActive && !assignedCertIds.has(c.id)) ?? [];

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertId) return;
    assign.mutate(
      { certificationId: selectedCertId },
      { onSuccess: () => setSelectedCertId('') }
    );
  };

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {instructor.lastName} {instructor.firstName} — 資格管理
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          戻る
        </Button>
      </div>

      {detailLoading && <p className="text-muted-foreground text-sm">読み込み中…</p>}

      {/* 割り当て済み一覧 */}
      {!detailLoading && (
        detail && detail.certifications.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {detail.certifications.map((ic) => {
              const cert = certMap.get(ic.certificationId);
              return (
                <li key={ic.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {cert ? `${cert.name}（${cert.shortName}）` : ic.certificationId}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={unassign.isPending}
                    onClick={() => unassign.mutate(ic.certificationId)}
                  >
                    解除
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">割り当て済みの資格がありません</p>
        )
      )}

      {/* 資格割り当てフォーム */}
      {availableCerts.length > 0 && (
        <form onSubmit={handleAssign} className="flex gap-2">
          <select
            value={selectedCertId}
            onChange={(e) => setSelectedCertId(e.target.value)}
            required
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">資格を選択してください</option>
            {availableCerts.map((cert) => (
              <option key={cert.id} value={cert.id}>
                {cert.name}（{cert.shortName}）
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={assign.isPending || !selectedCertId}>
            {assign.isPending ? '割り当て中…' : '割り当て'}
          </Button>
        </form>
      )}

      {assign.isError && (
        <p className="text-red-600 text-sm">{assign.error.message}</p>
      )}
      {unassign.isError && (
        <p className="text-red-600 text-sm">{unassign.error.message}</p>
      )}
    </li>
  );
}
