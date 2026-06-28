import { Snowflake } from 'lucide-react';
import { LineLoginButton } from './LineLoginButton';

/** 1日あたりのダミーシフト最大数（背景演出用） */
const MAX_SHIFTS_PER_DAY = 5;
/** カレンダーに描画する日数（背景演出用） */
const CALENDAR_DAYS = 35;
/** 当月の日数 */
const DAYS_IN_MONTH = 31;
/** 色パターンの剰余 */
const COLOR_PATTERN_MODULO = 2;

type LoginPageProps = {
  /** 認証後の戻り先 */
  redirectUrl?: string | undefined;
  /** 招待トークン */
  inviteToken?: string | undefined;
  /** 認証エラー理由（コールバックからのリダイレクト時に付与される） */
  error?: string | undefined;
};

/** 日ごとのダミーシフトパターンを生成する（背景演出用） */
function generateDummyShiftPattern(dayIndex: number) {
  const colors = ['bg-sky-200', 'bg-emerald-200'];
  const shiftCount = (dayIndex + 1) % MAX_SHIFTS_PER_DAY;
  return Array.from({ length: shiftCount }, (_, i) => ({
    id: `${dayIndex}-${i}`,
    color: colors[i % COLOR_PATTERN_MODULO] as string,
  }));
}

/** 1日分のダミーカードを描画する（背景演出用） */
function renderDummyDay(
  dayNumber: number,
  shifts: Array<{ id: string; color: string }>
) {
  const displayNumber =
    dayNumber > DAYS_IN_MONTH ? dayNumber - DAYS_IN_MONTH : dayNumber;
  const isNextMonth = dayNumber > DAYS_IN_MONTH;
  return (
    <div
      className={`rounded-xl border-2 p-2 shadow-sm ${
        isNextMonth
          ? 'border-border/50 bg-muted/40'
          : 'border-border bg-background'
      }`}
      key={dayNumber}
    >
      <div className="mb-1 font-medium text-muted-foreground text-xs">
        {displayNumber}
      </div>
      {!isNextMonth && (
        <div className="space-y-0.5">
          {shifts.map((shift) => (
            <div className={`h-5 rounded ${shift.color}`} key={shift.id} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ログインページ。LINE ログインボタンと背景カレンダー演出を表示する。
 * 「招待を受けた方のみ利用可能」の趣旨を踏襲する。
 */
export function LoginPage({ redirectUrl = '/', inviteToken, error }: LoginPageProps) {
  const handleLineLogin = () => {
    const params = new URLSearchParams({ redirect: redirectUrl });
    if (inviteToken) {
      params.set('invite', inviteToken);
    }
    window.location.href = `/api/auth/line/login?${params.toString()}`;
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      {/* 背景カレンダーグリッド */}
      <div className="absolute inset-0 opacity-60">
        <div className="grid h-full w-full grid-cols-7 gap-1 p-3 blur-md">
          {Array.from({ length: CALENDAR_DAYS }, (_, i) =>
            renderDummyDay(i + 1, generateDummyShiftPattern(i))
          )}
        </div>
      </div>

      <div className="relative z-10 space-y-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-1.5 shadow-sm">
          <Snowflake className="h-3.5 w-3.5 text-amber-600" />
          <span className="font-medium text-amber-800 text-xs tracking-wide">
            EXCLUSIVE ACCESS
          </span>
        </div>

        <div className="relative">
          <h1 className="font-thin text-5xl text-slate-800 tracking-[0.15em] md:text-6xl">
            Members only
          </h1>
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <Snowflake className="h-5 w-4 text-slate-400" />
          <p className="font-light text-base text-slate-600 tracking-wide">
            招待を受けた方のみ利用可能です
          </p>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            ログインに失敗しました。もう一度お試しください。
          </p>
        )}

        <div className="flex justify-center">
          <LineLoginButton onClick={handleLineLogin} />
        </div>
      </div>
    </div>
  );
}
