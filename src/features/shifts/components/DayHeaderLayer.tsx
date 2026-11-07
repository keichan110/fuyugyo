import { Box } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconMessage } from '@tabler/icons-react';

import type { HeaderEventPayload } from './calendar-events';
import classes from './ShiftManager.module.css';

type DayHeaderLayerProps = {
  payload: HeaderEventPayload;
  /** MonthView が背景イベントに渡す位置指定のスタイル */
  style: React.CSSProperties | undefined;
};

/** 日付セルの状態を重ねて表示する。タップは下のセルへ透過し、日付選択に統一する。 */
export function DayHeaderLayer({ payload, style }: DayHeaderLayerProps) {
  return (
    <Box style={style} className={classes.headerLayer}>
      {payload.staged && (
        <Box className={classes.stagedDot} role="img" aria-label="未保存の変更あり" />
      )}
      {payload.description && (
        <IconMessage
          size={14}
          stroke={1.75}
          className={classes.descriptionIcon}
          aria-label={`備考: ${payload.description}`}
        />
      )}
      {payload.staffing && (
        <Box
          component="span"
          className={classes.staffingBadge}
          data-staffing={payload.staffing.status}
          role="img"
          aria-label={payload.staffing.tooltip}
        >
          {payload.staffing.status === 'FILLED' && (
            <IconCircleCheck size={14} stroke={1.75} className={classes.staffingIcon} />
          )}
          {payload.staffing.status === 'SHORT' && (
            <IconAlertTriangle size={14} stroke={1.75} className={classes.staffingIcon} />
          )}
          <span className={classes.staffingText}>{payload.staffing.text}</span>
        </Box>
      )}
    </Box>
  );
}
