import { cn } from '@/lib/utils';

type LineLoginButtonProps = {
  onClick: () => void;
  text?: string;
};

/**
 * LINE ログインボタン。LINE ブランドカラー（#06C755）とアイコンで構成する。
 */
export function LineLoginButton({
  onClick,
  text = 'LINEでログイン',
}: LineLoginButtonProps) {
  return (
    <button
      className={cn(
        'relative inline-flex h-14 items-center justify-center gap-4 rounded-md px-8 font-medium text-lg',
        'bg-[#06C755] text-white transition-colors duration-200 hover:bg-[#06C755]/90 active:bg-[#06C755]/70'
      )}
      onClick={onClick}
      type="button"
    >
      <img
        alt="LINE"
        className="shrink-0"
        height={36}
        src="/line_icon.png"
        width={36}
      />
      <span>{text}</span>
    </button>
  );
}
