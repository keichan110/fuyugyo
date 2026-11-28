import { describe, expect, it } from 'vitest';

import {
  renderAnnouncementsMessage,
  type AnnouncementsMessageInput,
} from '../src/features/line-webhook/announcements/message';
import type { FlexBubble, FlexComponent, LineMessage } from '../src/server/line/message';

/** LINE の単体バブルの上限（30 KB） */
const BUBBLE_LIMIT = 30 * 1000;

type Item = AnnouncementsMessageInput['items'][number];

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: '件名',
    body: '本文',
    createdAt: new Date('2026-11-27T23:15:00.000Z'),
    ...overrides,
  };
}

function render(items: Item[], unreadCount = items.length): LineMessage {
  return renderAnnouncementsMessage({ items, unreadCount, hasAny: items.length > 0 });
}

function bubbleOf(message: LineMessage): FlexBubble {
  if (message.type !== 'flex' || message.contents.type !== 'bubble') {
    throw new Error('単体バブルの Flex Message ではありません');
  }
  return message.contents;
}

/** 要素に含まれる文字列を、表示順にすべて取り出す。 */
function textsOf(component: FlexComponent): string[] {
  if (component.type === 'separator') return [];
  if (component.type === 'box') return component.contents.flatMap(textsOf);
  return 'text' in component ? [component.text] : [];
}

/** 1件だけの返信の、タイトル・日時・本文を取り出す。 */
function renderOne(overrides: Partial<Item>): string[] {
  return textsOf(bubbleOf(render([item(overrides)])).body);
}

describe('お知らせの返信メッセージ', () => {
  it('Flex Message Simulator 用の例と同じ単体バブルを作る', () => {
    const message = render([
      item({
        title: '集合場所の変更',
        body: '本日の午前レッスンは、第2リフト前に集合してください。',
        createdAt: new Date('2026-11-27T23:15:00.000Z'),
      }),
      item({
        title: '12月の勤務予定を公開しました',
        body: '12月前半の勤務予定を公開しました。担当日をご確認ください。',
        createdAt: new Date('2026-11-27T09:30:00.000Z'),
      }),
      item({
        title: '貸出ウェアの受け取り',
        body: '貸出ウェアは受付でお渡しします。初回勤務日の朝にお立ち寄りください。',
        createdAt: new Date('2026-11-26T03:00:00.000Z'),
      }),
    ]);

    const notice = (title: string, date: string, body: string) => ({
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: '#17354A', wrap: true },
        { type: 'text', text: date, size: 'xs', color: '#566C7C', wrap: true },
        { type: 'text', text: body, size: 'sm', color: '#425567', wrap: true },
      ],
    });
    const separator = { type: 'separator', color: '#CDD7E1' };
    expect(message).toStrictEqual({
      type: 'flex',
      altText: 'お知らせ（未読3件）',
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
              text: '未読3件',
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
          contents: [
            notice(
              '集合場所の変更',
              '11/28（土）08:15',
              '本日の午前レッスンは、第2リフト前に集合してください。',
            ),
            separator,
            notice(
              '12月の勤務予定を公開しました',
              '11/27（金）18:30',
              '12月前半の勤務予定を公開しました。担当日をご確認ください。',
            ),
            separator,
            notice(
              '貸出ウェアの受け取り',
              '11/26（木）12:00',
              '貸出ウェアは受付でお渡しします。初回勤務日の朝にお立ち寄りください。',
            ),
          ],
        },
      },
    });
  });

  it.each([
    [1, 1, '未読1件'],
    [5, 5, '未読5件'],
    [5, 6, '未読6件のうち最新5件を表示'],
    [5, 8, '未読8件のうち最新5件を表示'],
  ])('%i件の表示で未読%i件なら、見出しと代替テキストに範囲を示す', (shown, unread, text) => {
    const message = render(
      Array.from({ length: shown }, () => item()),
      unread,
    );

    expect(textsOf(bubbleOf(message).header)).toEqual(['お知らせ', text]);
    expect(message).toHaveProperty('altText', `お知らせ（${text}）`);
  });

  it.each([
    [false, 'お知らせはありません。'],
    [true, '未読のお知らせはありません。'],
  ])('未読がなく通知の有無が %s なら「%s」を返す', (hasAny, text) => {
    expect(renderAnnouncementsMessage({ items: [], unreadCount: 0, hasAny })).toStrictEqual({
      type: 'text',
      text,
    });
  });

  it.each([
    ['2026-11-27T14:59:59.000Z', '11/27（金）23:59'],
    ['2026-11-27T15:00:00.000Z', '11/28（土）00:00'],
    ['2026-12-31T15:05:00.000Z', '1/1（金）00:05'],
  ])('%s は日本時間の %s と表示する', (createdAt, expected) => {
    expect(renderOne({ createdAt: new Date(createdAt) })[1]).toBe(expected);
  });

  describe.each([
    ['title', 100, 0],
    ['body', 500, 2],
  ] as const)('%s の上限 %i', (field, limit, position) => {
    const rendered = (value: string) => renderOne({ [field]: value })[position];

    it('上限ちょうどまでは原文を保つ', () => {
      const value = `${'あ'.repeat(limit - 3)}\n い`;

      expect(value).toHaveLength(limit);
      expect(rendered(value)).toBe(value);
    });

    it('超える場合は「…」を含めて上限に収める', () => {
      expect(rendered('あ'.repeat(limit + 1))).toBe(`${'あ'.repeat(limit - 1)}…`);
    });

    it('サロゲートペアが切る位置をまたぐ場合は、ペアごと落とす', () => {
      const head = 'a'.repeat(limit - 2);

      expect(rendered(`${head}𠮷bc`)).toBe(`${head}…`);
    });

    it('サロゲートペアが切る位置の直前で完結する場合は残す', () => {
      const head = `${'a'.repeat(limit - 3)}𠮷`;

      expect(rendered(`${head}bc`)).toBe(`${head}…`);
    });

    it('上限ちょうどの末尾のサロゲートペアは省略しない', () => {
      const value = `${'a'.repeat(limit - 2)}𠮷`;

      expect(rendered(value)).toBe(value);
    });
  });

  it('JSON のエスケープが最大になる長文5件でも、単体バブルの上限に収まる', () => {
    // 制御文字は JSON で1コード単位あたり6バイトになる
    const worst = '\u0001'.repeat(1000);
    const items = Array.from({ length: 5 }, () => item({ title: worst, body: worst }));

    const bubble = bubbleOf(render(items, Number.MAX_SAFE_INTEGER));
    const bytes = new TextEncoder().encode(JSON.stringify(bubble)).length;

    // 5件すべてのタイトルと本文が省略後の長さで含まれる
    expect(bytes).toBeGreaterThan(5 * (99 + 499) * 6);
    expect(bytes).toBeLessThanOrEqual(BUBBLE_LIMIT);
  });
});
