import { useForm } from '@mantine/form';

/** DepartmentForm が扱う入力値 */
export type DepartmentFormValues = {
  code: string;
  name: string;
  description: string;
};

const EMPTY_VALUES: DepartmentFormValues = {
  code: '',
  name: '',
  description: '',
};

/**
 * 部門のコード・部門名・説明を扱う useForm インスタンスを生成する。
 * 送信は呼び出し側が制御するため、この hook はバリデーション付きの状態のみを提供する。
 * @param initialValues - 編集時の初期値（未指定時は空フォーム＝作成モード）
 */
export function useDepartmentForm(initialValues?: DepartmentFormValues) {
  return useForm<DepartmentFormValues>({
    initialValues: initialValues ?? EMPTY_VALUES,
    validate: {
      code: (value) => {
        if (value.trim().length === 0) return 'コードを入力してください';
        if (value.length > 32) return 'コードは32文字以内で入力してください';
        return null;
      },
      name: (value) => {
        if (value.trim().length === 0) return '部門名を入力してください';
        if (value.length > 100) return '部門名は100文字以内で入力してください';
        return null;
      },
      description: (value) => (value.length > 500 ? '説明は500文字以内で入力してください' : null),
    },
  });
}
