import { Alert, type AlertProps } from '@mantine/core';

type ErrorAlertProps = Omit<AlertProps, 'color'>;

/**
 * アプリ標準のエラー表示。
 * エラー色と role を固定し、画面側は内容だけに集中できるようにする。
 */
export function ErrorAlert(props: ErrorAlertProps) {
  return <Alert color="red" role="alert" {...props} />;
}
