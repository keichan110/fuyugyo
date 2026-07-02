type LineLoginButtonProps = {
  onClick: () => void;
  text?: string;
};

/** LINE ブランドカラー（#06C755）。LINE ブランドガイドラインの制約により固定値で扱う */
const LINE_BRAND_COLOR = '#06C755';
const LINE_BRAND_COLOR_HOVER = '#05b34d';

/**
 * LINE ログインボタン。LINE ブランドガイドラインの制約でデザインが固定のため、
 * Mantine Button ではなくインラインスタイルのネイティブ button で実装する（ADR 0008）。
 */
export function LineLoginButton({ onClick, text = 'LINEでログイン' }: LineLoginButtonProps) {
  return (
    <button
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        height: '3.5rem',
        paddingInline: '2rem',
        borderRadius: '0.375rem',
        border: 'none',
        backgroundColor: LINE_BRAND_COLOR,
        color: 'white',
        fontSize: '1.125rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background-color 200ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = LINE_BRAND_COLOR_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = LINE_BRAND_COLOR;
      }}
      onClick={onClick}
      type="button"
    >
      <img alt="LINE" style={{ flexShrink: 0 }} height={36} src="/line_icon.png" width={36} />
      <span>{text}</span>
    </button>
  );
}
