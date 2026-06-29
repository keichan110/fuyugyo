import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCreateShiftType } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * シフト種別作成フォーム。name を入力して POST する。
 */
export function ShiftTypeForm({ onSuccess }: Props) {
  const [name, setName] = useState('');
  const create = useCreateShiftType();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name },
      onSuccess ? { onSuccess } : undefined
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="shift-type-name" className="text-sm font-medium">
          種別名 <span className="text-red-500">*</span>
        </label>
        <input
          id="shift-type-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="例: 終日、午前、午後"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
