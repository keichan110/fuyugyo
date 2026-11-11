import { Group, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

type WeatherMetricProps = {
  icon: Icon;
  /** アイコンのアクセシブルラベル */
  label: string;
  /** 表示する値（単位付き） */
  value: string;
  size: number;
};

/** アイコンと値を密着させて並べる小さな指標表示（降水量・風速など）。 */
export function WeatherMetric({ icon: MetricIcon, label, value, size }: WeatherMetricProps) {
  return (
    <Group gap={2} wrap="nowrap" component="span">
      <MetricIcon size={size} stroke={1.75} role="img" aria-label={label}>
        <title>{label}</title>
      </MetricIcon>
      <Text component="span" size="xs">
        {value}
      </Text>
    </Group>
  );
}
