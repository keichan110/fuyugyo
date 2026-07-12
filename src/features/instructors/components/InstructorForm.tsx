import { Group, Stack, Textarea, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';

import type { InstructorFormValues } from './useInstructorForm';

type Props = {
  form: UseFormReturnType<InstructorFormValues>;
};

/**
 * インストラクターの姓名・カナ・備考の入力フィールド群。
 * 送信ボタンは持たず、フォーム全体の送信は呼び出し側に委ねる。
 */
export function InstructorFormFields({ form }: Props) {
  return (
    <Stack gap="sm">
      <Group grow align="flex-start">
        <TextInput
          label="姓"
          required
          maxLength={50}
          placeholder="例: 山田"
          {...form.getInputProps('lastName')}
        />
        <TextInput
          label="名"
          required
          maxLength={50}
          placeholder="例: 太郎"
          {...form.getInputProps('firstName')}
        />
      </Group>

      <Group grow align="flex-start">
        <TextInput
          label="姓（カナ）"
          maxLength={50}
          placeholder="例: ヤマダ"
          {...form.getInputProps('lastNameKana')}
        />
        <TextInput
          label="名（カナ）"
          maxLength={50}
          placeholder="例: タロウ"
          {...form.getInputProps('firstNameKana')}
        />
      </Group>

      <Textarea
        label="備考"
        maxLength={500}
        rows={2}
        placeholder="備考（任意）"
        {...form.getInputProps('notes')}
      />
    </Stack>
  );
}
