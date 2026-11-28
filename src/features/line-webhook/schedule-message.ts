/**
 * 勤務日カードの返信メッセージを組み立てる。返信ラベルと対象日を差し替えて共通で使う。
 */

import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';
import type { PublishedShift } from '@/features/shifts/api';
import type {
  FlexBox,
  FlexBubble,
  FlexComponent,
  FlexSpan,
  FlexText,
  LineMessage,
} from '@/server/line/message';

/** 日付カード1枚の JSON の上限（UTF-8 バイト数）。7枚でもカルーセル全体の上限に収まる */
const MAX_BUBBLE_BYTES = 7000;
/** 勤務種別名・担当者名の上限（UTF-8 バイト数）。最低1枠1名がカードに必ず収まる長さにする */
const MAX_NAME_BYTES = 150;
const ELLIPSIS = '…';
const MEMBER_SEPARATOR = '、';
const BODY_TEXT_COLOR = '#425567';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const DEPARTMENT_COLORS: Record<DepartmentCode, { background: string; text: string }> = {
  ski: { background: '#E7F5FF', text: '#1864AB' },
  snowboard: { background: '#FFF4E6', text: '#9C360B' },
};

const encoder = new TextEncoder();
const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'grapheme' });

/** 勤務日カードの返信の入力 */
export type ScheduleMessageInput = {
  /** 返信の種類を示すラベル。各カードの見出しと代替テキストに使う */
  label: string;
  /** カードにする日付（YYYY-MM-DD）。LINE のサイズ上限に収まる7日以内で指定する */
  dates: [string, ...string[]];
  /** 勤務枠。同じ日の中はこの順に表示する */
  shifts: PublishedShift[];
  /** 太字で強調する本人のインストラクター ID。未紐付けは null */
  instructorId: string | null;
};

/** 文字列の UTF-8 バイト数を返す。 */
function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/** 長すぎる名称を、書記素の境界で切って「…」を付ける。 */
function truncateName(name: string): string {
  if (byteLength(name) <= MAX_NAME_BYTES) return name;
  const limit = MAX_NAME_BYTES - byteLength(ELLIPSIS);
  let result = '';
  for (const { segment } of segmenter.segment(name)) {
    if (byteLength(result + segment) > limit) break;
    result += segment;
  }
  return `${result}${ELLIPSIS}`;
}

/** YYYY-MM-DD の暦日を「11/28（土）」の形にする。 */
function formatDate(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  return `${day.getUTCMonth() + 1}/${day.getUTCDate()}（${WEEKDAYS[day.getUTCDay()]}）`;
}

/** 本文の通常のテキストを作る。 */
function bodyText(text: string): FlexText {
  return { type: 'text', text, size: 'sm', color: BODY_TEXT_COLOR, wrap: true };
}

/**
 * 担当者の一覧を作る。先頭から `shownCount` 名を表示し、残りは人数で示す。
 * 本人が表示対象に含まれる場合は、本人の名前だけを太字にする。
 */
function buildMembers(
  members: PublishedShift['assignedInstructors'],
  shownCount: number,
  instructorId: string | null,
): FlexText {
  const shown = members.slice(0, shownCount);
  const names = shown.map((member) => truncateName(member.displayName));
  if (shown.length < members.length) names.push(`ほか${members.length - shown.length}名`);

  const ownIndex = shown.findIndex((member) => member.id === instructorId);
  const ownName = names[ownIndex];
  if (ownName === undefined) return bodyText(names.join(MEMBER_SEPARATOR));

  // 区切り文字は太字にしないため、本人の前後を別の span にする
  const before = names
    .slice(0, ownIndex)
    .map((name) => `${name}${MEMBER_SEPARATOR}`)
    .join('');
  const after = names
    .slice(ownIndex + 1)
    .map((name) => `${MEMBER_SEPARATOR}${name}`)
    .join('');
  const contents: FlexSpan[] = [{ type: 'span', text: ownName, weight: 'bold' }];
  if (before) contents.unshift({ type: 'span', text: before });
  if (after) contents.push({ type: 'span', text: after });
  return { type: 'text', size: 'sm', color: BODY_TEXT_COLOR, wrap: true, contents };
}

/** 勤務枠1件（部門ラベル、勤務種別、担当者）を作る。 */
function buildSlot(
  shift: PublishedShift,
  shownCount: number,
  instructorId: string | null,
): FlexBox {
  const colors = DEPARTMENT_COLORS[shift.department.code];
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: colors.background,
            paddingAll: '4px',
            cornerRadius: '8px',
            contents: [
              {
                type: 'text',
                text: DEPARTMENT_LABELS[shift.department.code],
                size: 'xs',
                weight: 'bold',
                color: colors.text,
                wrap: false,
              },
            ],
            flex: 0,
          },
          {
            type: 'text',
            text: truncateName(shift.shiftType.name),
            size: 'sm',
            color: '#17354A',
            wrap: true,
            weight: 'bold',
          },
        ],
      },
      buildMembers(shift.assignedInstructors, shownCount, instructorId),
    ],
    spacing: 'xs',
  };
}

/** 勤務枠の間に区切り線を入れ、表示しきれない枠があれば件数を末尾に示す。 */
function buildSlotList(slots: FlexBox[], omittedCount: number): FlexComponent[] {
  const contents = slots.flatMap<FlexComponent>((slot, index) =>
    index === 0 ? [slot] : [{ type: 'separator', color: '#CDD7E1' }, slot],
  );
  if (omittedCount > 0) contents.push(bodyText(`ほか${omittedCount}勤務枠`));
  return contents;
}

/** 日付を見出しにしたカードを作る。 */
function buildBubble(label: string, date: string, contents: FlexComponent[]): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: label, size: 'xs', color: '#CDE9F0', weight: 'bold', wrap: true },
        {
          type: 'text',
          text: formatDate(date),
          size: 'xl',
          color: '#FFFFFF',
          wrap: true,
          weight: 'bold',
        },
      ],
      backgroundColor: '#17455C',
      paddingAll: '16px',
      spacing: 'xs',
    },
    body: { type: 'box', layout: 'vertical', contents, paddingAll: '16px', spacing: 'md' },
  };
}

/**
 * 1日分のカードを作る。勤務枠と担当者を順に入れ、サイズ上限を超える分は件数で示す。
 * サイズは省略表示を含む完成形のカードで判定する。
 */
function buildDayBubble(
  label: string,
  date: string,
  shifts: PublishedShift[],
  instructorId: string | null,
): FlexBubble {
  if (shifts.length === 0) {
    return buildBubble(label, date, [bodyText('この日の勤務予定はありません。')]);
  }

  const slots: FlexBox[] = [];
  let bubble = buildBubble(label, date, buildSlotList(slots, shifts.length));
  for (const shift of shifts) {
    const omittedCount = shifts.length - slots.length - 1;
    // 全員を表示すると「ほかN名」が消えてサイズが縮む場合があるため、多い人数から順に試す
    let shownCount = shift.assignedInstructors.length;
    for (; shownCount > 0; shownCount--) {
      const slot = buildSlot(shift, shownCount, instructorId);
      const candidate = buildBubble(label, date, buildSlotList([...slots, slot], omittedCount));
      if (byteLength(JSON.stringify(candidate)) <= MAX_BUBBLE_BYTES) {
        slots.push(slot);
        bubble = candidate;
        break;
      }
    }
    // 担当者を省略した枠より後には、次の枠を入れない
    if (shownCount < shift.assignedInstructors.length) break;
  }
  return bubble;
}

/**
 * 指定日の勤務予定を返信メッセージにする。
 * 勤務のある日が1日でもあれば指定した全日を日付順のカードにし、全日とも勤務がなければテキストにする。
 *
 * @param input - 返信ラベル、対象日、勤務枠、本人のインストラクター ID
 * @returns カルーセルの Flex Message、または勤務予定がないことを知らせるテキスト
 */
export function renderScheduleMessage({
  label,
  dates,
  shifts,
  instructorId,
}: ScheduleMessageInput): LineMessage {
  const days = [...new Set(dates)].sort().map((date) => ({
    date,
    // 担当者のいない枠は空のテキストになり LINE に拒否されるため除く
    shifts: shifts.filter((shift) => shift.date === date && shift.assignedInstructors.length > 0),
  }));
  const start = dates.reduce((earliest, date) => (date < earliest ? date : earliest));
  const end = dates.reduce((latest, date) => (date > latest ? date : latest));
  const period = `${formatDate(start)}〜${formatDate(end)}`;
  const workingDayCount = days.filter((day) => day.shifts.length > 0).length;

  if (workingDayCount === 0) {
    return { type: 'text', text: `${label}（${period}）\nこの期間の勤務予定はありません。` };
  }
  return {
    type: 'flex',
    altText: `${label}（${period}）勤務予定のある日：${workingDayCount}日`,
    contents: {
      type: 'carousel',
      contents: days.map((day) => buildDayBubble(label, day.date, day.shifts, instructorId)),
    },
  };
}
