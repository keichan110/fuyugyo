import { useState } from 'react';

import { Box, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';

import type { DaySummary } from '../daily';
import { DailyWeather } from './DailyWeather';
import { HourlyWeatherStrip } from './HourlyWeatherStrip';
import classes from './WeatherDayRow.module.css';

/**
 * シフト表の日別天気行。タップで時間別予報を開閉する。
 * 閉じている間は時間別データを取得しない。
 */
export function WeatherDayRow({ day }: { day: DaySummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <UnstyledButton
        className={classes.toggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <DailyWeather day={day} showDetails />
        <IconChevronDown size={14} stroke={1.75} className={classes.chevron} aria-hidden />
      </UnstyledButton>
      {expanded && (
        <Box className={classes.hourly}>
          <HourlyWeatherStrip date={day.date} />
        </Box>
      )}
    </>
  );
}
