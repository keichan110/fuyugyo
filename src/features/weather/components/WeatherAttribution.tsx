import { Anchor, Text } from '@mantine/core';

import { formatFetchedAt } from '../display';
import { useWeatherDaily } from '../queries';

/**
 * 天気データの出典表記（MET Norway / CC BY 4.0）。
 * 表示できる天気が1日分もないときは何も描画しない。
 */
export function WeatherAttribution() {
  const { data } = useWeatherDaily();
  if (!data || data.days.length === 0) return null;

  return (
    <Text size="xs" c="dimmed">
      天気予報は{' '}
      <Anchor href="https://api.met.no/" target="_blank" rel="noopener noreferrer" inherit>
        MET Norway
      </Anchor>
      （ノルウェー気象研究所）のデータ（
      <Anchor
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        inherit
      >
        CC BY 4.0
      </Anchor>
      ）を加工して表示しています。
      {data.lastFetchedAt && ` 最終更新 ${formatFetchedAt(data.lastFetchedAt)}`}
    </Text>
  );
}
