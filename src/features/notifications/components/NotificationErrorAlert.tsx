import { useEffect, useRef } from 'react';

import { Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';

import { moveFocusIfLost } from './move-focus';

type NotificationErrorAlertProps = {
  /** 失敗した操作を伝える文言 */
  message: string;
  /** 失敗した操作をやり直す */
  onRetry: () => void;
  /** やり直しの処理中かどうか */
  retrying: boolean;
  /** 利用者の操作が失敗した場合に、再試行ボタンへフォーカスを戻すかどうか */
  restoreFocus?: boolean;
};

/** お知らせの取得・既読化の失敗と、再試行の操作を表示する。 */
export function NotificationErrorAlert({
  message,
  onRetry,
  retrying,
  restoreFocus = false,
}: NotificationErrorAlertProps) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (restoreFocus && !retrying) {
      moveFocusIfLost(retryRef.current);
    }
  }, [restoreFocus, retrying]);

  return (
    <ErrorAlert>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{message}</Text>
        <AppButton ref={retryRef} intent="secondary" size="xs" loading={retrying} onClick={onRetry}>
          再試行
        </AppButton>
      </Stack>
    </ErrorAlert>
  );
}
