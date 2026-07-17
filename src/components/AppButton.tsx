import {
  Button,
  polymorphicFactory,
  type ButtonProps,
  type PolymorphicFactory,
} from '@mantine/core';

type StandardIntent = 'primary' | 'secondary' | 'tertiary';

type StandardButtonProps = {
  /** 操作の意味と強調度。 */
  intent: StandardIntent;
  emphasis?: never;
  compact?: never;
};

type DangerButtonProps = {
  /** データの削除・停止・解除など、破壊的な操作を表す。 */
  intent: 'danger';
  /** 破壊操作への入口は low、最終確認は high を指定する。 */
  emphasis?: 'low' | 'high';
  /** 行内などの狭い場所で、淡い背景を付けずに表示する。 */
  compact?: boolean;
};

export type AppButtonProps = Omit<ButtonProps, 'color' | 'variant'> &
  (StandardButtonProps | DangerButtonProps);

type AppButtonFactory = PolymorphicFactory<{
  props: AppButtonProps;
  defaultComponent: 'button';
  defaultRef: HTMLButtonElement;
}>;

/**
 * 操作の意味を Mantine の色と variant へ一貫して割り当てる共通ボタン。
 */
export const AppButton = polymorphicFactory<AppButtonFactory>(
  ({ intent, emphasis, compact, ref, ...props }) => {
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

    const variant = {
      primary: 'filled',
      secondary: 'default',
      tertiary: 'subtle',
    }[intent] satisfies ButtonProps['variant'];

    return <Button ref={ref} {...props} variant={variant} />;
  },
);
