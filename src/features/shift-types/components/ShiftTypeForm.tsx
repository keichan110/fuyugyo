import { Stack, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';

import type { ShiftTypeFormValues } from './useShiftTypeForm';

type Props = {
  form: UseFormReturnType<ShiftTypeFormValues>;
};

/**
 * シフト種別名の入力フィールド群。
 * 送信ボタンは持たず、フォーム全体の送信は呼び出し側に委ねる。
 */
export function ShiftTypeFormFields({ form }: Props) {
  return (
    <Stack gap="sm">
      <TextInput
        label="種別名"
        required
        maxLength={100}
        placeholder="例: 終日、午前、午後"
        {...form.getInputProps('name')}
      />
    </Stack>
  );
}
