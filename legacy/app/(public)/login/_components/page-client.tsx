"use client";

import { Snowflake } from "@phosphor-icons/react";
import { LineLoginButton } from "./line-login-button";

// 背景表示用定数
const MAX_SHIFTS_PER_DAY = 5;
const DAYS_IN_MONTH = 31;
const COLOR_PATTERN_MODULO = 2;

type LoginPageClientProps = {
  /** リダイレクト先URL（デフォルト: "/"） */
  redirectUrl?: string;
  /** 招待トークン */
  inviteToken?: string | undefined;
};

/**
 * ログインページのクライアントコンポーネント
 * LINE ログインボタンと背景表示を担当
 */
export default function LoginPageClient({
  redirectUrl = "/",
  inviteToken,
}: LoginPageClientProps) {
  const handleLineLogin = () => {
    // リダイレクト先と招待トークンをURLパラメータとして渡す
    const params = new URLSearchParams({
      redirect: redirectUrl,
    });
    if (inviteToken) {
      params.set("invite", inviteToken);
    }
    const loginUrl = `/api/auth/line/login?${params.toString()}`;
    window.location.href = loginUrl;
  };

  // Helper function to generate dummy shift patterns for each day
  const generateDummyShiftPattern = (dayIndex: number) => {
    const colors = [
      "bg-ski-200 dark:bg-ski-800",
      "bg-snowboard-200 dark:bg-snowboard-800",
    ];

    // Vary number of shifts based on day (0-4 shifts)
    const shiftCount = (dayIndex + 1) % MAX_SHIFTS_PER_DAY; // Some days 0, some 1-4

    return Array.from({ length: shiftCount }, (_, i) => ({
      id: `${dayIndex}-${i}`, // Unique identifier for each shift
      width: "w-full",
      color: colors[i % COLOR_PATTERN_MODULO] as string,
    }));
  };

  // Helper function to render a single day card
  const renderDummyDay = (
    dayNumber: number,
    shifts: Array<{ id: string; width: string; color: string }>
  ) => {
    // Handle next month preview days (32-35 -> 1-4)
    const displayNumber =
      dayNumber > DAYS_IN_MONTH ? dayNumber - DAYS_IN_MONTH : dayNumber;
    const isNextMonth = dayNumber > DAYS_IN_MONTH;

    return (
      <div
        className={`day-card rounded-xl border-2 ${isNextMonth ? "border-border/50 bg-gray-100/50" : "border-border bg-background"} p-2 shadow-sm`}
        key={dayNumber}
      >
        <div
          className={`mb-1 font-medium text-xs ${isNextMonth ? "text-gray-400" : "text-muted-foreground"}`}
        >
          {displayNumber}
        </div>
        {!isNextMonth && (
          <div className="space-y-0.5">
            {shifts.map((shift) => (
              <div
                className={`h-5 rounded ${shift.width} ${shift.color}`}
                key={shift.id}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex h-[calc(100vh-16rem)] items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white/10 text-card-foreground shadow-lg backdrop-blur-sm">
      {/* Background Calendar Grid - Realistic Shift Schedule */}
      <div className="absolute inset-0 opacity-75">
        <div className="grid h-full w-full grid-cols-7 gap-1 p-3 blur-md">
          {Array.from({ length: 35 }, (_, i) =>
            renderDummyDay(i + 1, generateDummyShiftPattern(i))
          )}
        </div>
      </div>
      <div className="relative z-10 space-y-8 text-center">
        {/* Exclusive Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-1.5 shadow-sm">
          <Snowflake className="h-3.5 w-3.5 text-amber-600" weight="fill" />
          <span className="font-medium text-amber-800 text-xs tracking-wide">
            EXCLUSIVE ACCESS
          </span>
        </div>

        {/* Main Title */}
        <div className="relative">
          <h1 className="font-thin text-5xl text-slate-800 tracking-[0.15em] md:text-6xl lg:text-7xl">
            Members only
          </h1>
          <div className="-bottom-1 -translate-x-1/2 absolute left-1/2 h-[1px] w-24 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        </div>

        {/* Subtitle with Lock Icon */}
        <div className="flex items-center justify-center gap-2.5">
          <Snowflake className="h-5 w-4 text-slate-400" />
          <p className="font-light text-base text-slate-600 tracking-wide">
            招待を受けた方のみ利用可能です
          </p>
        </div>

        {/* LINE Login Button */}
        <div className="flex justify-center">
          <LineLoginButton
            onClick={handleLineLogin}
            size="lg"
            text="LINEでログイン"
          />
        </div>

        {/* Subtle decoration */}
        <div className="flex justify-center space-x-1.5">
          <div className="h-0.5 w-0.5 rounded-full bg-slate-300" />
          <div className="h-0.5 w-4 rounded-full bg-slate-200" />
          <div className="h-0.5 w-0.5 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>
  );
}
