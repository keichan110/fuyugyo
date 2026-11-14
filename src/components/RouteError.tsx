import { Center, Stack, Text, Title } from '@mantine/core';

import { AppButton } from './AppButton';

/** 描画・ルート読み込み失敗時に詳細を公開せず、再読み込みを案内する。 */
export function RouteError() {
  return (
    <Center mih="60vh" p="md">
      <Stack align="center" role="alert">
        <Title order={2}>画面を表示できませんでした</Title>
        <Text>時間をおいて、もう一度お試しください。</Text>
        <AppButton intent="primary" onClick={() => window.location.reload()}>
          再読み込み
        </AppButton>
      </Stack>
    </Center>
  );
}
