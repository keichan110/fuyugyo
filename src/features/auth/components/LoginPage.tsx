import { Box, Center, Stack, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';

import { getLoginErrorMessage, isRetryableLoginError } from '../login-policy';
import { LineLoginButton } from './LineLoginButton';
import classes from './LoginPage.module.css';

type LoginPageProps = {
  /** LINE ログインを開始する */
  onLineLogin: () => void;
  /** 認証エラー理由（コールバックからのリダイレクト時に付与される） */
  error?: string | undefined;
};

/**
 * ログインページ。認証エラーに応じた案内と、再試行可能な場合にログインボタンを表示する。
 */
export function LoginPage({ onLineLogin, error }: LoginPageProps) {
  const canRetry = isRetryableLoginError(error);

  return (
    <Box mih="100dvh" p="md" className={classes.heroBackground}>
      <Center mih="100dvh">
        <Stack align="center" gap="xl">
          <AppBadge kind="highlight" size="lg" radius="xl">
            ❄ EXCLUSIVE ACCESS
          </AppBadge>

          <Title order={1} fw={200} ta="center" lts="0.15em">
            Members only
          </Title>

          {error && <ErrorAlert>{getLoginErrorMessage(error)}</ErrorAlert>}

          {canRetry && <LineLoginButton onClick={onLineLogin} />}
        </Stack>
      </Center>
    </Box>
  );
}
