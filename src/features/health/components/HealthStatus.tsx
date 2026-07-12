import { Button, Card, Stack, Table, Text, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';

import { useHealth } from '../queries';

/**
 * ヘルスチェック結果を表示するコンポーネント。
 * Hono RPC（型安全）で取得したデータをそのまま描画し、歩く骨格の疎通を可視化する。
 */
export function HealthStatus() {
  const { data, isLoading, isError, refetch, isRefetching } = useHealth();

  return (
    <Card padding="xl" radius="lg">
      <Stack align="center" gap="md">
        <Title order={1}>Fuyugyō</Title>
        <Text c="dimmed" size="sm">
          Hono + Drizzle/D1 + Vite + React 19 walking skeleton
        </Text>

        {isLoading && !data && (
          <Text c="dimmed" size="sm">
            確認中…
          </Text>
        )}
        {isError && <ErrorAlert>API への接続に失敗しました</ErrorAlert>}
        {data && !isError && (
          <Table withRowBorders={false}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td c="dimmed">status</Table.Td>
                <Table.Td ff="monospace">{data.status}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td c="dimmed">timestamp</Table.Td>
                <Table.Td ff="monospace">{data.timestamp}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}

        <Button loading={isRefetching} onClick={() => refetch()}>
          再取得
        </Button>
      </Stack>
    </Card>
  );
}
