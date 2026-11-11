import { useEffect, useRef, useState } from 'react';

import { NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { ErrorAlert, InfoAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { ListHeader } from '@/components/ListHeader';

import { formatFetchedAt } from '../display';
import { useUpdateWeatherPoint, useWeatherDaily, useWeatherPoint } from '../queries';
import { toUpdateInput, useWeatherPointForm } from './useWeatherPointForm';

/** 天気予報の取得地点（1か所）を登録・更新する管理画面。 */
export function WeatherPointSettings() {
  const point = useWeatherPoint();
  const daily = useWeatherDaily();
  const update = useUpdateWeatherPoint();
  const form = useWeatherPointForm();
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // 登録済みの地点を初回ロード時だけフォームへ反映する（入力中の値を上書きしないため）
  useEffect(() => {
    if (initializedRef.current || point.data === undefined) return;
    initializedRef.current = true;
    if (point.data === null) return;
    const values = {
      name: point.data.name,
      latLng: `${point.data.latitude}, ${point.data.longitude}`,
      elevationM: point.data.elevationM,
    };
    form.setValues(values);
    form.resetDirty(values);
  }, [point.data, form]);

  const handleSubmit = async (values: Parameters<typeof toUpdateInput>[0]) => {
    setError(null);
    const input = toUpdateInput(values);
    if (!input) {
      setError('入力内容を確認してください');
      return;
    }
    try {
      const saved = await update.mutateAsync(input);
      const savedValues = {
        name: saved.name,
        latLng: `${saved.latitude}, ${saved.longitude}`,
        elevationM: saved.elevationM,
      };
      form.setValues(savedValues);
      form.resetDirty(savedValues);
      notifications.show({
        color: 'green',
        message: '保存しました。天気予報には次回の取得から反映されます（最大3時間後）',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '天気予報地点の保存に失敗しました');
    }
  };

  const lastFetchedAt = daily.data?.lastFetchedAt ?? null;

  return (
    <Stack gap="lg">
      <ListHeader title="天気予報地点" />

      {point.isError && <ErrorAlert>{point.error.message}</ErrorAlert>}
      {point.data === null && (
        <InfoAlert>地点を登録するまで、シフト画面に天気は表示されません。</InfoAlert>
      )}

      <Paper withBorder p="md" maw={560}>
        <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
          <Stack gap="sm">
            <TextInput
              label="名前"
              required
              maxLength={50}
              placeholder="例: ゲレンデ中腹"
              disabled={point.isLoading}
              {...form.getInputProps('name')}
            />
            <TextInput
              label="緯度・経度"
              required
              placeholder="36.1234, 137.5678"
              description="Googleマップで地点を右クリックすると、座標をコピーできます。そのまま貼り付けてください"
              disabled={point.isLoading}
              {...form.getInputProps('latLng')}
            />
            <NumberInput
              label="標高(m)"
              required
              allowDecimal={false}
              allowNegative={false}
              min={0}
              max={9000}
              disabled={point.isLoading}
              {...form.getInputProps('elevationM')}
            />
            {error && <ErrorAlert>{error}</ErrorAlert>}
            <AppButton
              intent="primary"
              type="submit"
              loading={update.isPending}
              disabled={point.isLoading}
              style={{ alignSelf: 'flex-end' }}
            >
              保存
            </AppButton>
          </Stack>
        </form>
      </Paper>

      {lastFetchedAt && (
        <Text size="sm" c="dimmed">
          最終取得: {formatFetchedAt(lastFetchedAt)}
        </Text>
      )}
    </Stack>
  );
}
