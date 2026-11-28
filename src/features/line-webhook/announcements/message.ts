/**
 * お知らせの返信メッセージを組み立てる。
 */

import type { FlexBox, FlexComponent, LineMessage } from '@/server/line/message';

/** タイトルの上限（UTF-16 コード単位） */
const MAX_TITLE_LENGTH = 100;
/** 本文の上限（UTF-16 コード単位） */
const MAX_BODY_LENGTH = 500;
const ELLIPSIS = '…';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 返信に表示する通知1件。リンクは返信に含めないため受け取らない */
type Announcement = { title: string; body: string; createdAt: Date };

/** お知らせの返信の入力 */
export type AnnouncementsMessageInput = {
  /** 表示する未読通知。新しい順に5件以内で指定する（カード1枚のサイズ上限に収まる件数） */
  items: Announcement[];
  /** 本人の未読総数 */
  unreadCount: number;
  /** 既読を含む本人の通知があるか */
  hasAny: boolean;
};

/**
 * 上限を超える文字列を「…」込みで上限以内に切り詰める。
 * サロゲートペアの途中では切らない。
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  let end = maxLength - ELLIPSIS.length;
  const lastCode = value.charCodeAt(end - 1);
  // 末尾に上位サロゲートだけが残る場合は、その1文字も落とす
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}${ELLIPSIS}`;
}

/** 日時を日本時間の「11/28（土）08:15」の形にする。 */
function formatDateTime(date: Date): string {
  // UTC の各値が日本時間の値になるようにずらす
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const time = jst.toISOString().slice(11, 16);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}（${WEEKDAYS[jst.getUTCDay()]}）${time}`;
}

/** 通知1件分（タイトル、通知日時、本文）を作る。 */
function buildItem({ title, body, createdAt }: Announcement): FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: truncate(title, MAX_TITLE_LENGTH),
        size: 'sm',
        weight: 'bold',
        color: '#17354A',
        wrap: true,
      },
      { type: 'text', text: formatDateTime(createdAt), size: 'xs', color: '#566C7C', wrap: true },
      {
        type: 'text',
        text: truncate(body, MAX_BODY_LENGTH),
        size: 'sm',
        color: '#425567',
        wrap: true,
      },
    ],
  };
}

/**
 * 未読通知を返信メッセージにする。
 *
 * @param input - 表示する未読通知、未読総数、通知の有無
 * @returns 1枚のカードの Flex Message、または未読がないことを知らせるテキスト
 */
export function renderAnnouncementsMessage({
  items,
  unreadCount,
  hasAny,
}: AnnouncementsMessageInput): LineMessage {
  if (items.length === 0) {
    return {
      type: 'text',
      text: hasAny ? '未読のお知らせはありません。' : 'お知らせはありません。',
    };
  }
  const countText =
    unreadCount > items.length
      ? `未読${unreadCount}件のうち最新${items.length}件を表示`
      : `未読${unreadCount}件`;
  return {
    type: 'flex',
    altText: `お知らせ（${countText}）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'お知らせ',
            size: 'xl',
            color: '#FFFFFF',
            wrap: true,
            weight: 'bold',
          },
          {
            type: 'text',
            text: countText,
            size: 'xs',
            color: '#CDE9F0',
            weight: 'bold',
            wrap: true,
          },
        ],
        backgroundColor: '#17455C',
        paddingAll: '16px',
        spacing: 'xs',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: items.flatMap<FlexComponent>((item, index) =>
          index === 0
            ? [buildItem(item)]
            : [{ type: 'separator', color: '#CDD7E1' }, buildItem(item)],
        ),
      },
    },
  };
}
