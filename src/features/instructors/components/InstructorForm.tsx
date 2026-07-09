import { Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';

/** InstructorForm が扱う入力値 */
export type InstructorFormValues = {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  notes: string;
};

const EMPTY_VALUES: InstructorFormValues = {
  lastName: '',
  firstName: '',
  lastNameKana: '',
  firstNameKana: '',
  notes: '',
};

type Props = {
  /** 編集時の初期値（未指定時は空フォーム＝作成モード） */
  initialValues?: InstructorFormValues;
  /** 送信ボタンのラベル（例: 「作成」「保存」） */
  submitLabel: string;
  loading?: boolean;
  onSubmit: (values: InstructorFormValues) => void;
};

/**
 * インストラクターの姓名・カナ・備考を入力するフォーム。
 * 作成・編集の両モードで共用し、送信処理は呼び出し側に委ねる。
 */
export function InstructorForm({ initialValues, submitLabel, loading = false, onSubmit }: Props) {
  const form = useForm<InstructorFormValues>({
    initialValues: initialValues ?? EMPTY_VALUES,
    validate: {
      lastName: (value) => {
        if (value.trim().length === 0) return '姓を入力してください';
        if (value.length > 50) return '姓は50文字以内で入力してください';
        return null;
      },
      firstName: (value) => {
        if (value.trim().length === 0) return '名を入力してください';
        if (value.length > 50) return '名は50文字以内で入力してください';
        return null;
      },
      lastNameKana: (value) => (value.length > 50 ? 'カナは50文字以内で入力してください' : null),
      firstNameKana: (value) => (value.length > 50 ? 'カナは50文字以内で入力してください' : null),
      notes: (value) => (value.length > 500 ? '備考は500文字以内で入力してください' : null),
    },
  });

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
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

        <Group justify="flex-end">
          <Button type="submit" loading={loading}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
