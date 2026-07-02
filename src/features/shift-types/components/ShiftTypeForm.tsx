import { useState } from 'react';

import { Button } from '@mantine/core';

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
    create.mutate({ name }, onSuccess ? { onSuccess } : undefined);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-card flex flex-col gap-3 rounded-md border p-4"
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
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      {create.isError && <p className="text-sm text-red-600">{create.error.message}</p>}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? '作成中…' : '作成'}
      </Button>
    </form>
  );
}
