import { Card, createTheme, Drawer, Menu } from '@mantine/core';

/**
 * アプリ共通テーマ。ブランドカラーはブルー系（ADR 0008）。
 * 各コンポーネントの既定値も定義し、全使用箇所で共通していた props をここに集約する（ADR 0008）
 */
export const theme = createTheme({
  primaryColor: 'blue',
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
