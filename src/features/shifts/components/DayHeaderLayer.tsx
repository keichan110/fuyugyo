import { ActionIcon, Box, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconMessage } from '@tabler/icons-react';

import type { HeaderEventPayload } from './calendar-events';
import classes from './ShiftManager.module.css';

type DayHeaderLayerProps = {
  payload: HeaderEventPayload;
  /** MonthView が背景イベントに渡す位置指定のスタイル */
  style: React.CSSProperties | undefined;
  /** 備考アイコンのクリック（その日のドロワーを開く） */
  onSelectDate: (date: string) => void;
  /** 充足表示のクリック（自動割当モードでは対象日の切り替え、通常時はドロワーを開く） */
  onClickDate: (date: string) => void;
};

/**
 * 日付セル上部に重ねるヘッダー層。左から未保存ドット、備考アイコン、右端に充足表示を並べる。
 */
export function DayHeaderLayer({ payload, style, onSelectDate, onClickDate }: DayHeaderLayerProps) {
  return (
    <Box style={style} className={classes.headerLayer}>
      {payload.staged && (
        <Box className={classes.stagedDot} role="img" aria-label="未保存の変更あり" />
      )}
      {payload.description && (
        <Tooltip label={payload.description} multiline maw={320} withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="sm"
            className={classes.descriptionIcon}
            aria-label={`備考: ${payload.description}`}
            onClick={() => onSelectDate(payload.date)}
          >
            <IconMessage size={14} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
      )}
      {payload.staffing && (
        <Tooltip label={payload.staffing.tooltip} multiline maw={320} withArrow>
          <UnstyledButton
            className={classes.staffingBadge}
            data-staffing={payload.staffing.status}
            aria-label={payload.staffing.tooltip}
            onClick={() => onClickDate(payload.date)}
          >
            {payload.staffing.status === 'FILLED' && (
              <IconCircleCheck size={14} stroke={1.75} className={classes.staffingIcon} />
            )}
            {payload.staffing.status === 'SHORT' && (
              <IconAlertTriangle size={14} stroke={1.75} className={classes.staffingIcon} />
            )}
            <span className={classes.staffingText}>{payload.staffing.text}</span>
          </UnstyledButton>
        </Tooltip>
      )}
    </Box>
  );
}
