import { Box, Center, Stack, Text, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';

import { getLineLoginUrl, getLoginErrorMessage } from '../login-policy';
import { LineLoginButton } from './LineLoginButton';
import classes from './LoginPage.module.css';

type LoginPageProps = {
  /** 認証後の戻り先 */
  redirectUrl?: string | undefined;
  /** 招待トークン */
  inviteToken?: string | undefined;
  /** 認証エラー理由（コールバックからのリダイレクト時に付与される） */
  error?: string | undefined;
};

/**
 * ログインページ。LINE ログインボタンを表示する。
 * 「招待を受けた方のみ利用可能」の趣旨を踏襲する。
 */
export function LoginPage({ redirectUrl = '/', inviteToken, error }: LoginPageProps) {
  const handleLineLogin = () => {
    window.location.href = getLineLoginUrl({ redirect: redirectUrl, invite: inviteToken });
  };

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

          <Text size="md" fw={300} c="dimmed" ta="center">
            ❄ 招待を受けた方のみ利用可能です
          </Text>

          {error && <ErrorAlert>{getLoginErrorMessage(error)}</ErrorAlert>}

          <LineLoginButton onClick={handleLineLogin} />
        </Stack>
      </Center>
    </Box>
  );
}
