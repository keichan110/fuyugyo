import { Alert, type AlertProps } from '@mantine/core';

type ErrorAlertProps = Omit<AlertProps, 'color'>;
type AppAlertProps = Omit<AlertProps, 'color'>;

/**
 * アプリ標準のエラー表示。
 * エラー色と role を固定し、画面側は内容だけに集中できるようにする。
 */
export function ErrorAlert(props: ErrorAlertProps) {
  return <Alert color="red" role="alert" {...props} />;
}

/**
 * アプリ標準の警告表示。
 * 注意喚起の色を固定し、必要に応じて title や icon は呼び出し側から渡す。
 */
export function WarningAlert(props: AppAlertProps) {
  return <Alert color="yellow" variant="light" {...props} />;
}

/**
 * アプリ標準の情報表示。
 * 補足情報や到達状態の通知に使う。
 */
export function InfoAlert(props: AppAlertProps) {
  return <Alert color="blue" {...props} />;
}
