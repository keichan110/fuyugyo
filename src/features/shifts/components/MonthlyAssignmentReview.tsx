import { useState } from 'react';

import {
  Accordion,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconChevronRight } from '@tabler/icons-react';

import { AppButton } from '@/components/AppButton';

import { shortDateLabel } from '../view-utils';
import type { AssignmentReviewDay, ReviewKind } from './assignment-review';
import { REVIEW_CATEGORIES } from './assignment-review-categories';
import classes from './assignment-review.module.css';
import { AssignmentReviewIssues } from './AssignmentReviewIssues';

type Props = {
  review: AssignmentReviewDay[];
  ready: Record<ReviewKind, boolean>;
  failed: boolean;
  unsetCount: number | null;
  requirementUnset: boolean;
  uncoveredNames: string[];
  navigationDisabled: boolean;
  onSelectDate: (date: string) => void;
};

/** 問題別の件数と日別の要確認一覧を表示し、対象枠の編集へつなぐ。 */
export function MonthlyAssignmentReview({
  review,
  ready,
  failed,
  unsetCount,
  requirementUnset,
  uncoveredNames,
  navigationDisabled,
  onSelectDate,
}: Props) {
  const [opened, setOpened] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewKind | null>(null);
  const problemDays = review.filter((day) => day.issues.length > 0);
  const visibleDays = problemDays.filter(
    (day) => !filter || day.issues.some((issue) => issue.kind === filter),
  );
  const allReady =
    Object.values(ready).every(Boolean) &&
    uncoveredNames.length === 0 &&
    !requirementUnset &&
    unsetCount === 0 &&
    !failed;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ThemeIcon
            color={problemDays.length ? 'orange' : allReady ? 'green' : 'gray'}
            variant="light"
            radius="xl"
            aria-hidden="true"
          >
            {problemDays.length || !allReady ? (
              <IconAlertTriangle size={18} />
            ) : (
              <IconCheck size={18} />
            )}
          </ThemeIcon>
          <Text fw={700}>
            {problemDays.length
              ? `要確認 ${problemDays.length}枠`
              : allReady
                ? '検出された要確認事項はありません'
                : '未判定の項目があります'}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          現在案・手動編集を反映
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
        {REVIEW_CATEGORIES.map((category) => {
          const kind = category.kind;
          const count = problemDays.filter((day) =>
            day.issues.some((issue) => issue.kind === kind),
          ).length;
          const unavailable = !ready[kind] || (kind === 'qualification' && requirementUnset);
          const partial =
            (kind === 'streak' && uncoveredNames.length > 0) ||
            (kind === 'shortage' && unsetCount !== 0);
          return (
            <ReviewMetric
              key={kind}
              category={category}
              count={count}
              unavailable={unavailable}
              partial={partial}
              unsetCount={kind === 'shortage' ? unsetCount : null}
              selected={filter === kind}
              onClick={() => {
                setFilter((current) => (current === kind ? null : kind));
                setOpened('days');
              }}
            />
          );
        })}
      </SimpleGrid>
      <ReviewNotice
        ready={ready}
        failed={failed}
        requirementUnset={requirementUnset}
        uncoveredNames={uncoveredNames}
      />
      <Accordion value={opened} onChange={setOpened} variant="default">
        <Accordion.Item value="days">
          <Accordion.Control>
            <Text size="sm" fw={600}>
              {filter
                ? `${REVIEW_CATEGORIES.find((item) => item.kind === filter)?.label}のある日`
                : '確認する日'}
              （{visibleDays.length}日）
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Group justify="flex-end">
                {filter && (
                  <AppButton intent="tertiary" size="compact-xs" onClick={() => setFilter(null)}>
                    すべて表示
                  </AppButton>
                )}
              </Group>
              {visibleDays.map((day) => (
                <ReviewDay
                  key={day.date}
                  day={day}
                  filter={filter}
                  navigationDisabled={navigationDisabled}
                  onSelectDate={onSelectDate}
                />
              ))}
              {visibleDays.length === 0 && (
                <Text size="sm" c="dimmed">
                  {filter
                    ? 'この項目の要確認事項は検出されていません。'
                    : '取得済みの情報に要確認事項はありません。'}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="scope">
          <Accordion.Control>
            <Text size="xs" c="dimmed">
              集計条件
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed">
              同じ枠は複数項目に該当する場合があります。勤務可否は要調整・勤務不可の配置、連勤は同部門・全種別の月外勤務を含みます。
            </Text>
            <Text size="xs" c="dimmed">
              勤務日数の分布は、表示枠の候補者・配置者の全部門・全種別の勤務を集計します。同日は1日、1人は1つの階級に含みます。破線は中央値です。勤務可能日数・希望日数は考慮していないため、分布だけで公平性は判断できません。
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

/** 未取得・設定不足を、問題なしの表示と区別して案内する。 */
function ReviewNotice({
  ready,
  failed,
  requirementUnset,
  uncoveredNames,
}: Pick<Props, 'ready' | 'failed' | 'requirementUnset' | 'uncoveredNames'>) {
  if (
    Object.values(ready).every(Boolean) &&
    !failed &&
    !requirementUnset &&
    uncoveredNames.length === 0
  ) {
    return null;
  }
  return (
    <Box className={classes.notice}>
      {failed && (
        <Text size="sm" c="red">
          一部の情報を取得できませんでした。未取得の項目は判定できていません。
        </Text>
      )}
      {!failed && Object.values(ready).some((value) => !value) && (
        <Text size="sm">一部の確認情報を読み込み中です。</Text>
      )}
      {requirementUnset && (
        <Text size="sm">必要資格未設定：この種別の資格構成は判定できません。</Text>
      )}
      {uncoveredNames.length > 0 && (
        <Text size="sm">月外の勤務を取得できないため連勤未判定：{uncoveredNames.join('・')}</Text>
      )}
    </Box>
  );
}

type ReviewMetricProps = {
  category: (typeof REVIEW_CATEGORIES)[number];
  count: number;
  unavailable: boolean;
  partial: boolean;
  unsetCount: number | null;
  selected: boolean;
  onClick: () => void;
};

/** 取得状態・未設定・検出件数の順に、カードの表示状態を決める。 */
function reviewMetricDisplay({
  category,
  count,
  unavailable,
  partial,
  unsetCount,
}: ReviewMetricProps) {
  const countLabel = unavailable ? '未判定' : `${count}枠`;
  const unsetLabel = unsetCount ? `、必要人数未設定${unsetCount}枠` : '';
  const common = {
    countText: unavailable ? '―' : count,
    warning: (count > 0 && !unavailable) || undefined,
    ariaLabel: `${category.label}：${countLabel}${unsetLabel}で絞り込む`,
  };
  if (unavailable) {
    return { ...common, status: '未判定' };
  }
  if (unsetCount !== null && unsetCount > 0) {
    return { ...common, status: `必要人数未設定 ${unsetCount}枠` };
  }
  if (partial) {
    return { ...common, status: '一部未判定' };
  }
  return { ...common, status: count > 0 ? '確認が必要' : '該当なし' };
}

/** 問題別の件数を、未判定の有無とともに表示する絞り込みボタン。 */
function ReviewMetric(props: ReviewMetricProps) {
  const {
    category: { label, icon: Icon },
    selected,
    onClick,
  } = props;
  const display = reviewMetricDisplay(props);
  return (
    <UnstyledButton
      className={classes.metric}
      data-warning={display.warning}
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-label={display.ariaLabel}
      onClick={onClick}
    >
      <Group gap={6}>
        <Icon size={17} aria-hidden="true" />
        <Text size="sm" fw={600}>
          {label}
        </Text>
      </Group>
      <Group gap={4} align="baseline" mt={4}>
        <Text size="28px" fw={700} lh={1.2}>
          {display.countText}
        </Text>
        <Text size="xs">枠</Text>
      </Group>
      <Text size="xs" c="dimmed">
        {display.status}
      </Text>
    </UnstyledButton>
  );
}

/** 日ごとの問題を並べ、選択枠の詳細へ移動する。 */
function ReviewDay({
  day,
  filter,
  navigationDisabled,
  onSelectDate,
}: Pick<Props, 'navigationDisabled' | 'onSelectDate'> & {
  day: AssignmentReviewDay;
  filter: ReviewKind | null;
}) {
  return (
    <UnstyledButton
      className={classes.day}
      disabled={navigationDisabled}
      onClick={() => onSelectDate(day.date)}
      aria-label={`${shortDateLabel(day.date)}の要確認事項を確認・編集`}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              {shortDateLabel(day.date)}
            </Text>
          </Group>
          <AssignmentReviewIssues issues={day.issues} filter={filter} />
        </Stack>
        <IconChevronRight size={18} className={classes.arrow} aria-hidden="true" />
      </Group>
    </UnstyledButton>
  );
}
