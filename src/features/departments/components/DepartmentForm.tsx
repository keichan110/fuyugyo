import { Stack, Textarea, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';

import type { DepartmentFormValues } from './useDepartmentForm';

type Props = {
  form: UseFormReturnType<DepartmentFormValues>;
  /** true の場合コード欄を編集不可にする（編集モードではコードを変更できない仕様のため） */
  codeDisabled?: boolean;
};

/**
 * 部門のコード・部門名・説明の入力フィールド群。
 * 送信ボタンは持たず、フォーム全体の送信は呼び出し側に委ねる。
 */
export function DepartmentFormFields({ form, codeDisabled = false }: Props) {
  return (
    <Stack gap="sm">
      <TextInput
        label="部門コード"
        required
        disabled={codeDisabled}
        description={codeDisabled ? '作成後はコードを変更できません' : undefined}
        maxLength={32}
        placeholder="例: ski"
        {...form.getInputProps('code')}
      />

      <TextInput
        label="部門名"
        required
        maxLength={100}
        placeholder="例: スキー"
        {...form.getInputProps('name')}
      />

      <Textarea
        label="説明"
        maxLength={500}
        rows={2}
        placeholder="部門の説明（任意）"
        {...form.getInputProps('description')}
      />
    </Stack>
  );
}
