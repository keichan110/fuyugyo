import { describe, expect, it } from 'vitest';

import type { DepartmentCode } from '../src/features/departments/schema';
import { renderScheduleMessage } from '../src/features/line-webhook/schedule-message';
import type { PublishedShift } from '../src/features/shifts/api';
import type { FlexBubble, FlexComponent, LineMessage } from '../src/server/line/message';

const BUBBLE_LIMIT = 7000;
/** LINE のカルーセル全体の上限 */
const CAROUSEL_LIMIT = 50 * 1000;
const WEEK: [string, ...string[]] = [
  '2026-11-28',
  '2026-11-29',
  '2026-11-30',
  '2026-12-01',
  '2026-12-02',
  '2026-12-03',
  '2026-12-04',
];

function members(count: number, name = (index: number) => `山田 太郎${index}`) {
  return Array.from({ length: count }, (_, index) => ({
    id: `i-${index}`,
    displayName: name(index),
  }));
}

function slot(
  assignedInstructors: PublishedShift['assignedInstructors'],
  {
    date = '2026-11-28',
    code = 'ski',
    name = '一般レッスン',
  }: { date?: string; code?: DepartmentCode; name?: string } = {},
): PublishedShift {
  return {
    date,
    department: { code, name: code },
    shiftType: { id: name, name },
    assignedInstructors,
  };
}

function render(
  shifts: PublishedShift[],
  { dates = ['2026-11-28'], instructorId = null }: Partial<RenderOptions> = {},
): LineMessage {
  return renderScheduleMessage({ label: '全体の勤務予定', dates, shifts, instructorId });
}

type RenderOptions = { dates: [string, ...string[]]; instructorId: string | null };

function bubblesOf(message: LineMessage): FlexBubble[] {
  if (message.type !== 'flex') throw new Error('Flex Message ではありません');
  return message.contents.contents;
}

function firstBubble(message: LineMessage): FlexBubble {
  const [bubble] = bubblesOf(message);
  if (!bubble) throw new Error('カードがありません');
  return bubble;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** カード本文に含まれる文字列を、表示順にすべて取り出す。 */
function textsOf(component: FlexComponent): string[] {
  if (component.type === 'separator') return [];
  if (component.type === 'box') return component.contents.flatMap(textsOf);
  return 'text' in component
    ? [component.text]
    : [component.contents.map((span) => span.text).join('')];
}

/** 省略表示「ほかN名」などの件数を取り出す。表示がなければ 0。 */
function omitted(texts: string[], unit: '名' | '勤務枠'): number {
  const matched = texts.join('\n').match(new RegExp(`ほか(\\d+)${unit}`));
  return matched ? Number(matched[1]) : 0;
}

describe('勤務日カードの構造', () => {
  it('確定した実装見本と同じ JSON を作る', () => {
    const two = [
      { id: 'i-a', displayName: '講師A' },
      { id: 'i-b', displayName: '講師B' },
    ];
    const highlighted = [
      { id: 'i-c', displayName: '講師A' },
      { id: 'i-self', displayName: '講師B' },
    ];
    const message = render(
      [
        slot(two),
        slot(two, { name: '団体レッスン' }),
        slot(highlighted, { code: 'snowboard' }),
        slot(two, { code: 'snowboard', name: '団体レッスン' }),
      ],
      { instructorId: 'i-self' },
    );

    const sampleSlot = (
      department: string,
      background: string,
      color: string,
      name: string,
      memberContents: Record<string, unknown>,
    ) => ({
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
              backgroundColor: background,
              paddingAll: '4px',
              cornerRadius: '8px',
              contents: [
                { type: 'text', text: department, size: 'xs', weight: 'bold', color, wrap: false },
              ],
              flex: 0,
            },
            { type: 'text', text: name, size: 'sm', color: '#17354A', wrap: true, weight: 'bold' },
          ],
        },
        { type: 'text', size: 'sm', color: '#425567', wrap: true, ...memberContents },
      ],
      spacing: 'xs',
    });
    const ski = (name: string) =>
      sampleSlot('スキー', '#E7F5FF', '#1864AB', name, { text: '講師A、講師B' });
    const separator = { type: 'separator', color: '#CDD7E1' };

    expect(message.type === 'flex' ? message.contents : null).toEqual({
      type: 'carousel',
      contents: [
        {
          type: 'bubble',
          size: 'mega',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '全体の勤務予定',
                size: 'xs',
                color: '#CDE9F0',
                weight: 'bold',
                wrap: true,
              },
              {
                type: 'text',
                text: '11/28（土）',
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
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              ski('一般レッスン'),
              separator,
              ski('団体レッスン'),
              separator,
              sampleSlot('スノーボード', '#FFF4E6', '#9C360B', '一般レッスン', {
                contents: [
                  { type: 'span', text: '講師A、' },
                  { type: 'span', text: '講師B', weight: 'bold' },
                ],
              }),
              separator,
              sampleSlot('スノーボード', '#FFF4E6', '#9C360B', '団体レッスン', {
                text: '講師A、講師B',
              }),
            ],
            paddingAll: '16px',
            spacing: 'md',
          },
        },
      ],
    });
  });

  it.each([
    ['i-0', ['*山田 太郎0', '、山田 太郎1、山田 太郎2']],
    ['i-1', ['山田 太郎0、', '*山田 太郎1', '、山田 太郎2']],
    ['i-2', ['山田 太郎0、山田 太郎1、', '*山田 太郎2']],
  ])('本人（%s）の名前だけを太字にする', (instructorId, expected) => {
    const body = firstBubble(render([slot(members(3))], { instructorId })).body;
    const [box] = body.contents;
    const text = box?.type === 'box' ? box.contents[1] : undefined;
    const spans = text?.type === 'text' && 'contents' in text ? text.contents : [];

    expect(spans.map((span) => `${span.weight === 'bold' ? '*' : ''}${span.text}`)).toEqual(
      expected,
    );
  });

  it('指定した日付を昇順にカードにし、対象外の日と担当者のいない枠は表示しない', () => {
    const message = render(
      [
        slot(members(1), { date: '2026-12-01' }),
        slot(members(1), { date: '2026-12-09' }),
        slot([], { date: '2026-11-28' }),
      ],
      { dates: ['2026-12-01', '2026-11-28'] },
    );

    expect(message).toMatchObject({
      altText: '全体の勤務予定（11/28（土）〜12/1（火））勤務予定のある日：1日',
    });
    expect(bubblesOf(message).map((bubble) => textsOf(bubble.body))).toEqual([
      ['この日の勤務予定はありません。'],
      ['スキー', '一般レッスン', '山田 太郎0'],
    ]);
  });

  it('返信ラベルを差し替えられる', () => {
    const message = renderScheduleMessage({
      label: '直近の勤務予定',
      dates: ['2026-11-28'],
      shifts: [slot(members(1))],
      instructorId: null,
    });

    expect(message).toMatchObject({
      altText: '直近の勤務予定（11/28（土）〜11/28（土））勤務予定のある日：1日',
    });
    expect(textsOf(firstBubble(message).header)).toEqual(['直近の勤務予定', '11/28（土）']);
  });

  it('全日とも勤務がなければテキスト1件にする', () => {
    expect(render([], { dates: WEEK })).toEqual({
      type: 'text',
      text: '全体の勤務予定（11/28（土）〜12/4（金））\nこの期間の勤務予定はありません。',
    });
  });
});

describe('勤務日カードのサイズ上限', () => {
  it('担当者が多い枠は、入る人数までを順に表示して残りの人数を示す', () => {
    const bubble = firstBubble(render([slot(members(600))]));
    const texts = textsOf(bubble.body);
    const rest = omitted(texts, '名');
    const shown = texts.at(-1)?.split('、').slice(0, -1) ?? [];

    expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
    // 次の1名が入らないところまで詰める
    expect(bytes(bubble)).toBeGreaterThan(BUBBLE_LIMIT - 40);
    expect(rest).toBeGreaterThan(0);
    expect(shown.length + rest).toBe(600);
    expect(shown[0]).toBe('山田 太郎0');
    expect(shown.at(-1)).toBe(`山田 太郎${shown.length - 1}`);
  });

  it('担当者を省略した枠より後の枠は、件数だけを示す', () => {
    const bubble = firstBubble(
      render([slot(members(600)), slot(members(1), { name: '団体レッスン' }), slot(members(1))]),
    );
    const texts = textsOf(bubble.body);

    expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
    expect(texts).not.toContain('団体レッスン');
    expect(texts.at(-1)).toBe('ほか2勤務枠');
    expect(bubble.body.contents.map((component) => component.type)).toEqual(['box', 'text']);
  });

  it('勤務枠が多い日は、入る枠までを順に表示して残りの枠数を示す', () => {
    const shifts = Array.from({ length: 60 }, (_, index) =>
      slot(members(3), { name: `種別${index}` }),
    );
    const bubble = firstBubble(render(shifts));
    const texts = textsOf(bubble.body);
    const shownSlots = texts.filter((text) => text.startsWith('種別'));
    const rest = omitted(texts, '勤務枠');

    expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
    expect(rest).toBeGreaterThan(0);
    expect(shownSlots.length + rest).toBe(60);
    expect(shownSlots).toEqual(shownSlots.map((_, index) => `種別${index}`));
  });

  it('上限に収まる枠は省略しない', () => {
    const texts = textsOf(firstBubble(render([slot(members(100))])).body);

    expect(texts.join('')).not.toContain('ほか');
    expect(texts.at(-1)?.split('、')).toHaveLength(100);
  });

  it('長い日本語名は折り返し表示のまま省略しない', () => {
    const name = '長谷川原田之内 左衛門三郎次郎太郎';
    const bubble = firstBubble(render([slot(members(1, () => name))]));

    expect(textsOf(bubble.body)).toContain(name);
    expect(JSON.stringify(bubble.body)).not.toContain('"wrap":false,"text"');
  });

  it.each([
    ['日本語', 'あ'],
    ['サロゲートペア', '𠮷'],
    ['異体字セレクタ付き', '葛\u{E0100}'],
    ['結合した絵文字', '👨‍👩‍👧'],
  ])('極端に長い%sの名称は文字の境界で「…」を付けて短縮する', (_label, character) => {
    const long = character.repeat(3000);
    const bubble = firstBubble(
      render(
        [
          slot(
            members(2, () => long),
            { name: long },
          ),
          slot(members(1, () => long)),
        ],
        { instructorId: 'i-0' },
      ),
    );
    const [, shiftTypeName = '', memberText = ''] = textsOf(bubble.body);

    expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
    for (const text of [shiftTypeName, ...memberText.split('、')]) {
      const kept = text.slice(0, -1);
      expect(text.endsWith('…')).toBe(true);
      expect(kept.length).toBeGreaterThan(0);
      expect(kept).toBe(character.repeat(kept.length / character.length));
    }
  });

  it('7日すべてが上限まで埋まってもカルーセルの上限に収まる', () => {
    const shifts = WEEK.flatMap((date) =>
      Array.from({ length: 20 }, (_, index) =>
        slot(members(80), { date, name: `一般レッスン${index}`, code: 'snowboard' }),
      ),
    );
    const message = render(shifts, { dates: WEEK, instructorId: 'i-0' });
    const bubbles = bubblesOf(message);

    expect(bubbles).toHaveLength(7);
    for (const bubble of bubbles) expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
    expect(bytes(message.type === 'flex' ? message.contents : null)).toBeLessThan(CAROUSEL_LIMIT);
  });

  it('全員が入る境界の前後でも、省略表示を含めて上限に収まる', () => {
    const truncated = new Set<boolean>();
    for (let count = 240; count <= 360; count++) {
      const bubble = firstBubble(
        render([slot(members(count)), slot(members(1), { name: '団体レッスン' })]),
      );
      const texts = textsOf(bubble.body);
      const shownSlotCount = texts.filter((text) => text === 'スキー').length;
      expect(bytes(bubble)).toBeLessThanOrEqual(BUBBLE_LIMIT);
      expect(omitted(texts, '勤務枠') + shownSlotCount).toBe(2);
      truncated.add(omitted(texts, '名') > 0);
    }
    // 範囲内に、全員が入る人数と省略する人数の両方が含まれることを確かめる
    expect(truncated).toEqual(new Set([false, true]));
  });
});
