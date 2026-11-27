import { Card, createTheme, Drawer, Menu, type MantineColorsTuple } from '@mantine/core';

/** ブランドカラー（Deep Teal）。既定の主塗りになる 6 番目が基準色 `#203B4A` */
const brand: MantineColorsTuple = [
  '#eaf2f5',
  '#d8e7ed',
  '#bfd5de',
  '#9bbac8',
  '#6d95a7',
  '#43687b',
  '#203b4a',
  '#19303d',
  '#132630',
  '#0d1b23',
];

/**
 * アクセントカラー（Mint）。塗りには 4 番目の `#80C9BE` を使い、文字は Deep Teal にする。
 * 明るい面で意味を持つ小さな印には、コントラストを確保できる 7 番目の `#2C8073` を使う
 */
const accent: MantineColorsTuple = [
  '#eff9f7',
  '#ddf2ef',
  '#c4e9e3',
  '#a6dcd3',
  '#80c9be',
  '#64b7ab',
  '#4a9f93',
  '#2c8073',
  '#23665c',
  '#194b44',
];

/**
 * アプリ共通テーマ。ブランドカラーは Deep Teal、アクセントは Mint。
 * 各コンポーネントの既定値も定義し、全使用箇所で共通していた props をここに集約する
 */
export const theme = createTheme({
  colors: { brand, accent },
  primaryColor: 'brand',
  components: {
    Drawer: Drawer.extend({
      defaultProps: { position: 'right', size: 'md' },
    }),
    Menu: Menu.extend({
      defaultProps: { shadow: 'md' },
    }),
    Card: Card.extend({
      defaultProps: { withBorder: true, radius: 'md' },
    }),
  },
});
