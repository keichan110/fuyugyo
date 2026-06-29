import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCreateInstructor } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * インストラクター作成フォーム。姓・名・カナ・備考を入力して POST する。
 */
export function InstructorForm({ onSuccess }: Props) {
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastNameKana, setLastNameKana] = useState('');
  const [firstNameKana, setFirstNameKana] = useState('');
  const [notes, setNotes] = useState('');

  const create = useCreateInstructor();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        lastName,
        firstName,
        lastNameKana: lastNameKana || undefined,
        firstNameKana: firstNameKana || undefined,
        notes: notes || undefined,
      },
      onSuccess ? { onSuccess } : undefined
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="inst-last-name" className="text-sm font-medium">
            姓 <span className="text-red-500">*</span>
          </label>
          <input
            id="inst-last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            maxLength={50}
            placeholder="例: 山田"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="inst-first-name" className="text-sm font-medium">
            名 <span className="text-red-500">*</span>
          </label>
          <input
            id="inst-first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={50}
            placeholder="例: 太郎"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="inst-last-name-kana" className="text-sm font-medium">
            姓（カナ）
          </label>
          <input
            id="inst-last-name-kana"
            type="text"
            value={lastNameKana}
            onChange={(e) => setLastNameKana(e.target.value)}
            maxLength={50}
            placeholder="例: ヤマダ"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="inst-first-name-kana" className="text-sm font-medium">
            名（カナ）
          </label>
          <input
            id="inst-first-name-kana"
            type="text"
            value={firstNameKana}
            onChange={(e) => setFirstNameKana(e.target.value)}
            maxLength={50}
            placeholder="例: タロウ"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="inst-notes" className="text-sm font-medium">
          備考
        </label>
        <textarea
          id="inst-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="備考（任意）"
          className="resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {create.isError && (
        <p className="text-red-600 text-sm">{create.error.message}</p>
      )}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? '作成中…' : '作成'}
      </Button>
    </form>
  );
}
