import {
  Button,
  polymorphicFactory,
  type ButtonProps,
  type PolymorphicFactory,
} from '@mantine/core';

type PrimaryButtonProps = {
  /** 操作の意味と強調度。 */
  intent: 'primary';
  /** 操作が成功した直後の一時的なフィードバック（コピー完了など）として成功色で表示する。 */
  success?: boolean;
  emphasis?: never;
  compact?: never;
  active?: never;
};

type StandardButtonProps = {
  /** 操作の意味と強調度。 */
  intent: 'secondary' | 'tertiary';
  emphasis?: never;
  compact?: never;
  success?: never;
  active?: never;
};

type ToggleButtonProps = {
  /** オン・オフを切り替える操作。 */
  intent: 'toggle';
  /** オンの状態かどうか。オンのとき淡い背景で強調する。 */
  active: boolean;
  emphasis?: never;
  compact?: never;
  success?: never;
};

type DangerButtonProps = {
  /** データの削除・停止・解除など、破壊的な操作を表す。 */
  intent: 'danger';
  /** 破壊操作への入口は low、最終確認は high を指定する。 */
  emphasis?: 'low' | 'high';
  /** 行内などの狭い場所で、淡い背景を付けずに表示する。 */
  compact?: boolean;
  success?: never;
  active?: never;
};

export type AppButtonProps = Omit<ButtonProps, 'color' | 'variant'> &
  (PrimaryButtonProps | StandardButtonProps | ToggleButtonProps | DangerButtonProps);

type AppButtonFactory = PolymorphicFactory<{
  props: AppButtonProps;
  defaultComponent: 'button';
  defaultRef: HTMLButtonElement;
}>;

/**
 * 操作の意味を Mantine の色と variant へ一貫して割り当てる共通ボタン。
 */
export const AppButton = polymorphicFactory<AppButtonFactory>(
  ({ intent, emphasis, compact, success, active, ref, ...props }) => {
    if (intent === 'danger') {
      const highEmphasis = emphasis === 'high';

      return (
        <Button
          ref={ref}
          {...props}
          color="red"
          variant={highEmphasis ? 'filled' : compact ? 'subtle' : 'light'}
        />
      );
    }

    if (intent === 'primary') {
      return (
        <Button ref={ref} {...props} {...(success ? { color: 'green' } : {})} variant="filled" />
      );
    }

    if (intent === 'toggle') {
      // オンの状態は、淡い塗りに加えて主色の枠でも示す
      return (
        <Button
          ref={ref}
          {...(active ? { bd: '1px solid var(--mantine-primary-color-filled)' } : {})}
          {...props}
          variant={active ? 'light' : 'default'}
        />
      );
    }

    const variant = {
      secondary: 'default',
      tertiary: 'subtle',
    }[intent] satisfies ButtonProps['variant'];

    return <Button ref={ref} {...props} variant={variant} />;
  },
);
