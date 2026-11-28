import { useCallback, useState, useSyncExternalStore } from 'react';

import { Carousel, type CarouselProps } from '@mantine/carousel';
import { Anchor, Box, Group, Paper, Stack, Text } from '@mantine/core';
import { Calendar, type CalendarProps } from '@mantine/dates';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import dayjs, { type Dayjs } from 'dayjs';

import { useMyAvailabilities } from '@/features/availabilities/queries';
import type { Availability } from '@/features/availabilities/schema';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';
import { useShifts } from '@/features/shifts/queries';
import { formatDate, getCalendarDayColor } from '@/features/shifts/view-utils';

import classes from './PersonalShiftCalendar.module.css';

/** Carousel が渡す Embla API の型。embla の型定義に直接依存せず Mantine の props から引く */
type EmblaApi = Parameters<NonNullable<CarouselProps['getEmblaApi']>>[0];

/** 申告状態ごとのカレンダー上のラベル */
const AVAILABILITY_LABELS = {
  AVAILABLE: '勤務可',
  AVOID: '要調整',
  UNAVAILABLE: '勤務不可',
} satisfies Record<Availability['type'], string>;

/** Calendar の getDayProps prop 自体の型を流用し、既存の getDayProps 実装とのズレを防ぐ */
type GetDayProps = NonNullable<CalendarProps['getDayProps']>;

/** 勤務がない日の曜日・祝日文字色を日本式（日曜・祝日=赤、土曜=青）で返す。 */
function getWeekendDayProps(date: string) {
  const color = getCalendarDayColor(date);
  return color ? { style: { color: `var(--mantine-color-${color}-6)` } } : {};
}

/**
 * スライドが画面外かどうかの判定を Embla から購読する。
 * 画面幅の変更で Embla が再初期化されると select が発火せずに状態が変わるため、reInit も購読する。
 * この再描画により、Carousel の前後矢印の有効・無効も再初期化後の状態に揃う。
 */
function useIsSlideHidden(api: EmblaApi | null): (index: number) => boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!api) return () => {};
      api.on('select', onChange);
      api.on('reInit', onChange);
      return () => {
        api.off('select', onChange);
        api.off('reInit', onChange);
      };
    },
    [api],
  );
  const selectedIndex = useSyncExternalStore(subscribe, () => api?.selectedScrollSnap() ?? 0);
  const snapCount = useSyncExternalStore(subscribe, () => api?.scrollSnapList().length ?? 0);

  // 停止位置が1つだけなら全スライドが並んで見えている
  return (index) => snapCount > 1 && index !== selectedIndex;
}

/**
 * ミニカレンダー1か月分（自前の月ラベル＋Calendar本体＋その月のシフト希望への導線）。
 * 単一の Carousel の各スライドとして描画され、sm以上では2枚横並び・
 * モバイルでは1枚ずつスワイプ表示になる
 */
function MonthCalendar({ month, getDayProps }: { month: Dayjs; getDayProps: GetDayProps }) {
  return (
    <Stack gap="sm">
      <Stack gap={4} align="center">
        {/* ヘッダーを隠しているため、対象月を自前のラベルで明示する */}
        <Text size="sm" fw={600}>
          {month.format('YYYY年M月')}
        </Text>
        <Calendar
          date={month.format('YYYY-MM-DD')}
          static
          size="xs"
          highlightToday
          minLevel="month"
          maxLevel="month"
          withCellSpacing={false}
          // Mantine既定の週末赤（土日両方）を無効化し、getDayPropsで日本式の土日配色に差し替える
          weekendDays={[]}
          classNames={{
            calendarHeader: classes.hiddenCalendarHeader,
            day: classes.calendarDay,
          }}
          getDayProps={getDayProps}
        />
      </Stack>
      <Anchor
        // 検索パラメータの型検査を保つため、Link をそのまま描画する
        renderRoot={(props) => (
          <Link {...props} to="/availabilities" search={{ month: month.format('YYYY-MM') }} />
        )}
        className={classes.editLink}
        size="sm"
        fw={600}
        // 6週ある月と並んでも、導線の高さ位置を下端に揃える
        mt="auto"
      >
        <span>{month.format('M月')}のシフト希望を編集</span>
        <IconArrowRight size={16} aria-hidden />
      </Anchor>
    </Stack>
  );
}

/**
 * 今月・来月の自分の勤務と勤務可否を示すカレンダーパネル。
 * 各月にはその月のシフト希望の編集画面への導線を添える。
 */
export function PersonalShiftCalendar({
  instructorId,
  today,
}: {
  instructorId: string;
  today: string;
}) {
  const [emblaApi, setEmblaApi] = useState<EmblaApi | null>(null);
  const isSlideHidden = useIsSlideHidden(emblaApi);

  // 直近の勤務予定（最大3件）とは別に、今月・来月分の自分のシフトを取得する
  const currentMonth = dayjs(today).startOf('month');
  const nextMonth = currentMonth.add(1, 'month');
  const calendarRangeStart = currentMonth.format('YYYY-MM-DD');
  const calendarRangeEnd = nextMonth.endOf('month').format('YYYY-MM-DD');

  const { data: monthShifts } = useShifts({
    dateFrom: calendarRangeStart,
    dateTo: calendarRangeEnd,
    instructorId,
  });
  const { data: currentMonthAvailabilities } = useMyAvailabilities(currentMonth.format('YYYY-MM'));
  const { data: nextMonthAvailabilities } = useMyAvailabilities(nextMonth.format('YYYY-MM'));

  // 日付文字列(YYYY-MM-DD) → その日に自分が勤務する部門コードの集合。
  // 同日に ski/snowboard 両方の枠に入ることもあるため Set で持つ
  const departmentsByDate = new Map<string, Set<DepartmentCode>>();
  for (const shift of monthShifts ?? []) {
    const dateStr = formatDate(shift.date);
    const set = departmentsByDate.get(dateStr) ?? new Set<DepartmentCode>();
    set.add(shift.departmentCode);
    departmentsByDate.set(dateStr, set);
  }

  const availabilityByDate = new Map<string, Availability['type']>();
  for (const availability of [
    ...(currentMonthAvailabilities?.availabilities ?? []),
    ...(nextMonthAvailabilities?.availabilities ?? []),
  ]) {
    availabilityByDate.set(availability.date, availability.type);
  }

  /**
   * カレンダーの日セルに部門色の背景と勤務可用性の記号を当てる。
   * 祝日は勤務予定の有無にかかわらず赤字にする。勤務部門が0件なら、
   * 曜日に応じた日本式の週末文字色（土曜=青・日曜=赤）も適用する。
   * 1件ならその部門色で塗り、2件（ski・snowboard）なら45°の対角スプリット背景で
   * 両方を表現する。勤務可用性は勤務の有無にかかわらず右上へ重ねる。
   * 勤務日は部門色の背景を優先するが、祝日の赤字表示は維持する。
   * 色は Mantine のセマンティック CSS 変数（`-light` / `-light-color`）経由で指定し、
   * ライト/ダーク双方のテーマに追従させる。
   */
  const getDayProps = (date: string) => {
    const departments = departmentsByDate.get(date);
    const availability = availabilityByDate.get(date);
    const availabilityLabel = availability ? AVAILABILITY_LABELS[availability] : undefined;
    const availabilityProps = {
      'data-availability': availability,
      'aria-label': availabilityLabel
        ? `${dayjs(date).format('M月D日')}、${availabilityLabel}`
        : undefined,
      title: availabilityLabel,
    };

    if (!departments) {
      return { ...getWeekendDayProps(date), ...availabilityProps };
    }
    // departmentCodeSchema.options（ski→snowboard）の順に揃え、
    // スプリット背景の色順（青→オレンジ）を安定させる
    const [firstCode, secondCode] = departmentCodeSchema.options.filter((code) =>
      departments.has(code),
    );
    if (!firstCode) {
      return { ...getWeekendDayProps(date), ...availabilityProps };
    }
    if (!secondCode) {
      const color = getDepartmentAppearance(firstCode).color;
      return {
        ...availabilityProps,
        style: {
          backgroundColor: `var(--mantine-color-${color}-light)`,
          color:
            getCalendarDayColor(date) === 'red'
              ? 'var(--mantine-color-red-6)'
              : `var(--mantine-color-${color}-light-color)`,
        },
      };
    }
    const firstColor = getDepartmentAppearance(firstCode).color;
    const secondColor = getDepartmentAppearance(secondCode).color;
    return {
      ...availabilityProps,
      style: {
        backgroundImage: `linear-gradient(135deg, var(--mantine-color-${firstColor}-light) 50%, var(--mantine-color-${secondColor}-light) 50%)`,
        color: getCalendarDayColor(date) === 'red' ? 'var(--mantine-color-red-6)' : undefined,
      },
    };
  };

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        {/* 今月・来月をカルーセルで表示。sm以上は2枚横並びで両方同時に見えるため
            前後矢印は不要になり非表示にする（module.cssで制御）。
            モバイルは1枚ずつスワイプ切替のため矢印を表示する */}
        <Carousel
          slideSize={{ base: '100%', sm: '50%' }}
          slideGap="md"
          withControls
          emblaOptions={{ align: 'start' }}
          getEmblaApi={setEmblaApi}
          previousControlProps={{ 'aria-label': '前の月' }}
          nextControlProps={{ 'aria-label': '次の月' }}
          classNames={{
            controls: classes.carouselControls,
            control: classes.carouselControl,
          }}
        >
          {[currentMonth, nextMonth].map((month, index) => (
            <Carousel.Slide
              key={month.format('YYYY-MM')}
              className={classes.slide}
              // 画面外のスライド内の導線へフォーカスが移らないようにする
              inert={isSlideHidden(index)}
            >
              <MonthCalendar month={month} getDayProps={getDayProps} />
            </Carousel.Slide>
          ))}
        </Carousel>

        <Group gap="md">
          {departmentCodeSchema.options.map((code) => {
            const appearance = getDepartmentAppearance(code);
            return (
              <Group key={code} gap={6} wrap="nowrap">
                <Box
                  className={classes.legendSwatch}
                  style={{
                    backgroundColor: `var(--mantine-color-${appearance.color}-light)`,
                    borderColor: `var(--mantine-color-${appearance.color}-filled)`,
                  }}
                />
                <Text size="xs" c="dimmed">
                  {appearance.label}
                </Text>
              </Group>
            );
          })}
          <Group gap={6} wrap="nowrap">
            <Text className={classes.availableLegend} aria-hidden>
              ○
            </Text>
            <Text size="xs" c="dimmed">
              勤務可
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Text className={classes.unavailableLegend} aria-hidden>
              ×
            </Text>
            <Text size="xs" c="dimmed">
              勤務不可
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Text className={classes.avoidLegend} aria-hidden>
              △
            </Text>
            <Text size="xs" c="dimmed">
              要調整
            </Text>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}
