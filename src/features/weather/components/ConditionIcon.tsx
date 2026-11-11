import {
  IconCloud,
  IconCloudRain,
  IconCloudSnow,
  IconSnowflake,
  IconSun,
  type Icon,
} from '@tabler/icons-react';

import type { Condition } from '../daily';
import { CONDITION_LABELS } from '../display';

const CONDITION_ICONS: Record<Condition, Icon> = {
  clear: IconSun,
  cloudy: IconCloud,
  rain: IconCloudRain,
  sleet: IconCloudSnow,
  snow: IconSnowflake,
};

/**
 * 天気に対応するアイコン（アクセシブルラベル付き）。
 * 日別表示と時間別表示で共有する。
 */
export function ConditionIcon({ condition, size }: { condition: Condition; size: number }) {
  const Component = CONDITION_ICONS[condition];
  return (
    <Component size={size} stroke={1.75} role="img" aria-label={CONDITION_LABELS[condition]}>
      <title>{CONDITION_LABELS[condition]}</title>
    </Component>
  );
}
