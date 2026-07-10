import { Select, Stack, Textarea, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';

import type { Department } from '@/features/departments/schema';

import type { CertificationFormValues } from './useCertificationForm';

type Props = {
  form: UseFormReturnType<CertificationFormValues>;
  /** 部門選択肢（作成時のみ使用するアクティブな部門一覧） */
  departments?: Department[] | undefined;
  /**
   * 指定した場合、部門は変更不可の読み取り専用表示になる（編集時の部門名）。
   * 未指定（作成時）は Select による選択式にする。
   */
  departmentName?: string | undefined;
};

/**
 * 資格の部門・資格名・省略名・発行団体・説明の入力フィールド群。
 * 送信ボタンは持たず、フォーム全体の送信は呼び出し側に委ねる。
 */
export function CertificationFormFields({ form, departments, departmentName }: Props) {
  return (
    <Stack gap="sm">
      {departmentName !== undefined ? (
        <TextInput label="部門" value={departmentName} disabled readOnly />
      ) : (
        <Select
          label="部門"
          required
          placeholder="部門を選択してください"
          data={(departments ?? []).map((dept) => ({ value: dept.id, label: dept.name }))}
          {...form.getInputProps('departmentId')}
        />
      )}

      <TextInput
        label="資格名"
        required
        maxLength={100}
        placeholder="例: スキー指導員"
        {...form.getInputProps('name')}
      />

      <TextInput
        label="省略名"
        required
        maxLength={20}
        placeholder="例: 指導員"
        {...form.getInputProps('shortName')}
      />

      <TextInput
        label="発行団体"
        required
        maxLength={100}
        placeholder="例: 全日本スキー連盟"
        {...form.getInputProps('organization')}
      />

      <Textarea
        label="説明"
        maxLength={500}
        rows={2}
        placeholder="資格の説明（任意）"
        {...form.getInputProps('description')}
      />
    </Stack>
  );
}
