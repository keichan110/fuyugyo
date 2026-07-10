import { useForm } from '@mantine/form';

/** CertificationForm が扱う入力値 */
export type CertificationFormValues = {
  departmentId: string;
  name: string;
  shortName: string;
  organization: string;
  description: string;
};

const EMPTY_VALUES: CertificationFormValues = {
  departmentId: '',
  name: '',
  shortName: '',
  organization: '',
  description: '',
};

/**
 * 資格の部門・資格名・省略名・発行団体・説明を扱う useForm インスタンスを生成する。
 * 送信は呼び出し側が制御するため、この hook はバリデーション付きの状態のみを提供する。
 * @param initialValues - 編集時の初期値（未指定時は空フォーム＝作成モード）
 */
export function useCertificationForm(initialValues?: CertificationFormValues) {
  return useForm<CertificationFormValues>({
    initialValues: initialValues ?? EMPTY_VALUES,
    validate: {
      departmentId: (value) => (value.trim().length === 0 ? '部門を選択してください' : null),
      name: (value) => {
        if (value.trim().length === 0) return '資格名を入力してください';
        if (value.length > 100) return '資格名は100文字以内で入力してください';
        return null;
      },
      shortName: (value) => {
        if (value.trim().length === 0) return '省略名を入力してください';
        if (value.length > 20) return '省略名は20文字以内で入力してください';
        return null;
      },
      organization: (value) => {
        if (value.trim().length === 0) return '発行団体を入力してください';
        if (value.length > 100) return '発行団体は100文字以内で入力してください';
        return null;
      },
      description: (value) => (value.length > 500 ? '説明は500文字以内で入力してください' : null),
    },
  });
}
