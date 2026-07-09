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

/**
 * インストラクターの姓名・カナ・備考を扱う useForm インスタンスを生成する。
 * 送信は呼び出し側が制御するため、この hook はバリデーション付きの状態のみを提供する。
 * @param initialValues - 編集時の初期値（未指定時は空フォーム＝作成モード）
 */
export function useInstructorForm(initialValues?: InstructorFormValues) {
  return useForm<InstructorFormValues>({
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
}
