import { Group, Text } from '@mantine/core';
import { IconDroplet, IconWind } from '@tabler/icons-react';

import type { DaySummary } from '../daily';
import { formatPrecipitation, formatTemperature, formatWindMax, pickConditions } from '../display';
import { ConditionIcon } from './ConditionIcon';
import { WeatherMetric } from './WeatherMetric';

type DailyWeatherProps = {
  /** 表示する日別サマリー（未取得なら何も描画しない） */
  day: DaySummary | undefined;
  /** compact は気温を省き、狭いカレンダーセル向けにアイコンだけ表示する */
  size?: 'compact' | 'normal';
  /** true なら降水量と風速も添える（シフト表の天気行向け） */
  showDetails?: boolean;
};

/**
 * 1日分の天気（午前/午後のアイコンと最高/最低気温）を控えめに表示する。
 * データが無いときは何も描画せず、画面本体を妨げない。
 */
export function DailyWeather({ day, size = 'normal', showDetails = false }: DailyWeatherProps) {
  if (!day) return null;
  const conditions = pickConditions(day);
  const temperature = size === 'normal' ? formatTemperature(day) : null;
  const precipitation = showDetails ? formatPrecipitation(day.precipitationMm) : null;
  const wind = showDetails ? formatWindMax(day.windMaxMs) : null;
  if (conditions.length === 0 && temperature === null && precipitation === null && wind === null) {
    return null;
  }
  const iconSize = size === 'compact' ? 13 : 16;

  return (
    // 詳細表示（シフト表の天気行）は要素ごとの間隔を広げ、各アイコンは自分の値に密着させる
    <Group gap={showDetails ? 12 : 4} wrap="nowrap" c="dimmed" component="span">
      <Group gap={2} wrap="nowrap" component="span">
        {conditions.map((condition, index) => {
          return (
            <Group key={condition} gap={2} wrap="nowrap" component="span">
              {index > 0 && (
                <Text component="span" size="xs" aria-hidden>
                  /
                </Text>
              )}
              <ConditionIcon condition={condition} size={iconSize} />
            </Group>
          );
        })}
      </Group>
      {temperature && (
        <Text component="span" size="xs">
          {temperature}
        </Text>
      )}
      {precipitation && (
        <WeatherMetric icon={IconDroplet} label="降水量" value={precipitation} size={iconSize} />
      )}
      {wind && <WeatherMetric icon={IconWind} label="最大風速" value={wind} size={iconSize} />}
    </Group>
  );
}
