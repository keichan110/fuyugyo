import { Alert, Badge, Box, Center, Stack, Text, Title } from '@mantine/core';

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
    const params = new URLSearchParams({ redirect: redirectUrl });
    if (inviteToken) {
      params.set('invite', inviteToken);
    }
    window.location.href = `/api/auth/line/login?${params.toString()}`;
  };

  return (
    <Box mih="100dvh" p="md" className={classes.heroBackground}>
      <Center mih="100dvh">
        <Stack align="center" gap="xl">
          <Badge variant="light" color="yellow" size="lg" radius="xl">
            ❄ EXCLUSIVE ACCESS
          </Badge>

          <Title order={1} fw={200} ta="center" lts="0.15em">
            Members only
          </Title>

          <Text size="md" fw={300} c="dimmed" ta="center">
            ❄ 招待を受けた方のみ利用可能です
          </Text>

          {error && (
            <Alert color="red" role="alert">
              ログインに失敗しました。もう一度お試しください。
            </Alert>
          )}

          <LineLoginButton onClick={handleLineLogin} />
        </Stack>
      </Center>
    </Box>
  );
}
