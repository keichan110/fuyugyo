/**
 * LINE Messaging API に送るメッセージの型。アプリが使う要素と属性だけを定義する。
 */

/** テキスト内で書式を分ける部分 */
export type FlexSpan = { type: 'span'; text: string; weight?: 'bold' };

/** Flex のテキスト要素。本文は `text` か `contents` のどちらかで指定する */
export type FlexText = {
  type: 'text';
  size: 'xs' | 'sm' | 'xl';
  color: string;
  weight?: 'bold';
  wrap: boolean;
} & ({ text: string } | { contents: FlexSpan[] });

/** Flex の区切り線 */
export type FlexSeparator = { type: 'separator'; color: string };

/** Flex のボックス要素 */
export type FlexBox = {
  type: 'box';
  layout: 'vertical' | 'horizontal';
  contents: FlexComponent[];
  spacing?: 'xs' | 'sm' | 'md';
  alignItems?: 'center';
  backgroundColor?: string;
  paddingAll?: string;
  cornerRadius?: string;
  flex?: number;
};

/** ボックスに配置できる要素 */
export type FlexComponent = FlexBox | FlexText | FlexSeparator;

/** カルーセルの1枚分のカード */
export type FlexBubble = { type: 'bubble'; size: 'mega'; header: FlexBox; body: FlexBox };

/** 返信で送るメッセージ */
export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: { type: 'carousel'; contents: FlexBubble[] } };
