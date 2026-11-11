import { Group, Text } from '@mantine/core';
import {
  IconCloud,
  IconCloudRain,
  IconCloudSnow,
  IconSnowflake,
  IconSun,
  type Icon,
} from '@tabler/icons-react';

import type { Condition, DaySummary } from '../daily';
import {
  CONDITION_LABELS,
  formatPrecipitationWind,
  formatTemperature,
  pickConditions,
} from '../display';

const CONDITION_ICONS: Record<Condition, Icon> = {
  clear: IconSun,
  cloudy: IconCloud,
  rain: IconCloudRain,
  sleet: IconCloudSnow,
  snow: IconSnowflake,
};

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
          const ConditionIcon = CONDITION_ICONS[condition];
          return (
            <Group key={condition} gap={2} wrap="nowrap" component="span">
              {index > 0 && (
                <Text component="span" size="xs" aria-hidden>
                  /
                </Text>
              )}
              <ConditionIcon
                size={iconSize}
                stroke={1.75}
                role="img"
                aria-label={CONDITION_LABELS[condition]}
              >
                <title>{CONDITION_LABELS[condition]}</title>
              </ConditionIcon>
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
