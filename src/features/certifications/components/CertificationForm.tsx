import { useState } from 'react';

import { Button } from '@mantine/core';

import { useDepartments } from '@/features/departments/queries';

import { useCreateCertification } from '../queries';

type Props = {
  onSuccess?: () => void;
};

/**
 * 資格作成フォーム。departmentId・name・shortName・organization・description を入力して POST する。
 */
export function CertificationForm({ onSuccess }: Props) {
  const [departmentId, setDepartmentId] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [organization, setOrganization] = useState('');
  const [description, setDescription] = useState('');

  const { data: departments } = useDepartments(true);
  const create = useCreateCertification();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        departmentId,
        name,
        shortName,
        organization,
        description: description || undefined,
      },
      onSuccess ? { onSuccess } : undefined,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-card flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="cert-department" className="text-sm font-medium">
          部門 <span className="text-red-500">*</span>
        </label>
        <select
          id="cert-department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          required
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        >
          <option value="">部門を選択してください</option>
          {departments?.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cert-name" className="text-sm font-medium">
          資格名 <span className="text-red-500">*</span>
        </label>
        <input
          id="cert-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="例: スキー指導員"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cert-short-name" className="text-sm font-medium">
          省略名 <span className="text-red-500">*</span>
        </label>
        <input
          id="cert-short-name"
          type="text"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          required
          maxLength={20}
          placeholder="例: 指導員"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cert-organization" className="text-sm font-medium">
          発行団体 <span className="text-red-500">*</span>
        </label>
        <input
          id="cert-organization"
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          required
          maxLength={100}
          placeholder="例: 全日本スキー連盟"
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cert-desc" className="text-sm font-medium">
          説明
        </label>
        <textarea
          id="cert-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="資格の説明（任意）"
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
