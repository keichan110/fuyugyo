import { useState } from 'react';

import { Button } from '@mantine/core';

import { useCreateDepartment } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * 部門作成フォーム。code・name・description を入力して POST する。
 */
export function DepartmentForm({ onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateDepartment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { code, name, description: description || undefined },
      onSuccess ? { onSuccess } : undefined,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-card flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="dept-code" className="text-sm font-medium">
          部門コード <span className="text-red-500">*</span>
        </label>
        <input
          id="dept-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          maxLength={32}
          placeholder="例: ski"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dept-name" className="text-sm font-medium">
          部門名 <span className="text-red-500">*</span>
        </label>
        <input
          id="dept-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="例: スキー"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dept-desc" className="text-sm font-medium">
          説明
        </label>
        <textarea
          id="dept-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="部門の説明（任意）"
          className="border-input bg-background focus-visible:ring-ring resize-none rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      {create.isError && <p className="text-sm text-red-600">{create.error.message}</p>}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? '作成中…' : '作成'}
      </Button>
    </form>
  );
}
