import { Loader, Text } from '@mantine/core';

import {
  formatStepPrecipitation,
  formatStepTemperature,
  formatStepTimeLabel,
  formatStepWind,
} from '../display';
import { useWeatherSteps } from '../queries';
import { ConditionIcon } from './ConditionIcon';
import classes from './WeatherDayRow.module.css';

/**
 * 指定日の時間別予報を横スクロールの表で表示する。
 * 左に行ラベル（単位）を置き、時間ごとの列を JST の 0〜24 時まで並べる。
 */
export function HourlyWeatherStrip({ date }: { date: string }) {
  const { data: steps, isLoading, isError } = useWeatherSteps(date, true);

  if (isLoading) return <Loader size="xs" />;
  if (isError) {
    return (
      <Text size="xs" c="dimmed">
        天気の詳細を取得できませんでした
      </Text>
    );
  }
  if (!steps || steps.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        時間別の予報はありません
      </Text>
    );
  }

  return (
    <div className={classes.strip}>
      <div className={classes.labels}>
        <span className={classes.cell}>時刻</span>
        <span className={classes.cell} />
        <span className={classes.cell}>気温</span>
        <span className={classes.cell}>降水(mm)</span>
        <span className={classes.cell}>風(m/s)</span>
      </div>
      <div className={classes.scroller}>
        {steps.map((step) => (
          <div
            key={step.time.getTime()}
            className={`${classes.column} ${step.stepHours > 1 ? classes.columnWide : ''}`}
          >
            <span className={classes.cell}>{formatStepTimeLabel(step.time, step.stepHours)}</span>
            <span className={classes.cell}>
              {step.condition && <ConditionIcon condition={step.condition} size={16} />}
            </span>
            <span className={classes.cell}>{formatStepTemperature(step.temperatureC)}</span>
            <span className={classes.cell}>{formatStepPrecipitation(step.precipitationMm)}</span>
            <span className={classes.cell}>{formatStepWind(step.windSpeedMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
