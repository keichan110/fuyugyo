import { useEffect } from 'react';

import { Box, Center, Stack, Text, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { AppButton } from '@/components/AppButton';
import { clearAutoLoginAttempt } from '@/features/auth/auto-login-attempt';

import { getAccessRequestFailure } from '../policy';
import classes from './AccessRequestPage.module.css';

type AccessRequestPageProps = {
  /** 利用許可の申請を送信する */
  onSubmit: () => void;
  /** ログイン画面へ戻る */
  onLogin: () => void;
  /** 送信中かどうか */
  isSubmitting: boolean;
  /** 直前の申請が失敗したときの HTTP ステータス。失敗していなければ null */
  failedStatus: number | null;
};

/**
 * 利用許可の申請画面。LINE ログイン後に未登録と判定された人が、ボタン1つで申請する。
 * 失敗時は HTTP ステータスに応じた案内を出し、続行できない場合はボタンを切り替える。
 */
export function AccessRequestPage({
  onSubmit,
  onLogin,
  isSubmitting,
  failedStatus,
}: AccessRequestPageProps) {
  // OAuth の往復は完了しているため、残すと次回 /login で auto_login_failed が出る
  useEffect(() => {
    clearAutoLoginAttempt();
  }, []);

  const failure = failedStatus === null ? null : getAccessRequestFailure(failedStatus);
  const canSubmit = failure === null || failure.canSubmit;

  return (
    <Box mih="100dvh" p="md" className={classes.heroBackground}>
      <Center mih="100dvh">
        <Stack align="center" gap="xl" maw={420}>
          <AppBadge kind="highlight" size="lg" radius="xl">
            ❄ ACCESS REQUEST
          </AppBadge>

          <Title order={1} fw={200} ta="center" lts="0.15em">
            Request access
          </Title>

          <Text size="md" fw={300} c="dimmed" ta="center">
            このLINEアカウントには利用許可がありません。利用許可を申請すると、管理者に承認された後に利用できるようになります。
          </Text>

          {failure && <ErrorAlert>{failure.message}</ErrorAlert>}

          {canSubmit && (
            <AppButton intent="primary" size="md" loading={isSubmitting} onClick={onSubmit}>
              利用許可を申請する
            </AppButton>
          )}
          {failure?.canLogin && (
            <AppButton intent="secondary" size="md" onClick={onLogin}>
              ログイン画面へ
            </AppButton>
          )}
        </Stack>
      </Center>
    </Box>
  );
}
