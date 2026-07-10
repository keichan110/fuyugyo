import classes from './LineLoginButton.module.css';

type LineLoginButtonProps = {
  onClick: () => void;
  text?: string;
};

/**
 * LINE ログインボタン。LINE ブランドガイドラインの制約でデザインが固定のため、
 * Mantine Button ではなく CSS Modules を当てたネイティブ button で実装する（ADR 0008）。
 */
export function LineLoginButton({ onClick, text = 'LINEでログイン' }: LineLoginButtonProps) {
  return (
    <button className={classes.button} onClick={onClick} type="button">
      <img alt="LINE" className={classes.icon} height={36} src="/line_icon.png" width={36} />
      <span>{text}</span>
    </button>
  );
}
