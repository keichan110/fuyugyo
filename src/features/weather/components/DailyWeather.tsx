import { Group, Text } from '@mantine/core';

import type { DaySummary } from '../daily';
import { formatPrecipitationWind, formatTemperature, pickConditions } from '../display';
import { ConditionIcon } from './ConditionIcon';

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
  const details = showDetails ? formatPrecipitationWind(day) : null;
  if (conditions.length === 0 && temperature === null && details === null) return null;
  const iconSize = size === 'compact' ? 13 : 16;

  return (
    <Group gap={4} wrap="nowrap" c="dimmed" component="span">
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
      {details && (
        <Text component="span" size="xs">
          {details}
        </Text>
      )}
    </Group>
  );
}
