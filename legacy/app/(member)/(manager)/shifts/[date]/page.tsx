import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DayShiftManager } from "./_components/day-shift-manager";
import {
  getActiveShiftTypes,
  getDepartments,
  getInstructorsWithAssignments,
  getShiftsByDate,
} from "./_lib/queries";
import type { DayShiftData } from "./_lib/types";
import {
  formatDateJa,
  isDateHoliday,
  transformShiftsToSlots,
} from "./_lib/utils";

type PageProps = {
  params: Promise<{
    date: string;
  }>;
  searchParams: Promise<{
    department?: string;
    returnTo?: string;
  }>;
};

// 日付形式の検証（YYYY-MM-DD）
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 動的ルートを常にサーバーサイドで処理
export const dynamic = "force-dynamic";
export const dynamicParams = true;

/**
 * 1日単位のシフト管理ページ
 *
 * @description
 * MANAGER以上の権限を持つユーザーが、特定の日付のシフトを一元管理するページ。
 * URLパラメータから日付を取得し、サーバー側でデータをフェッチしてClient Componentに渡す。
 *
 * @route /shifts/[date]
 * @example /shifts/2024-12-15
 */
export default async function DayShiftPage({
  params,
  searchParams,
}: PageProps) {
  const { date } = await params;
  const { department, returnTo } = await searchParams;

  if (!DATE_PATTERN.test(date)) {
    notFound();
  }

  // 部門IDを取得
  const departmentId = department || undefined;

  // データを並列取得（部門IDがある場合はその部門のシフトとインストラクターのみ取得）
  const [shifts, instructors, departments, shiftTypes] = await Promise.all([
    getShiftsByDate(date, departmentId),
    getInstructorsWithAssignments(date, departmentId),
    getDepartments(),
    getActiveShiftTypes(),
  ]);

  // データを整形
  const dayShiftData: DayShiftData = {
    date,
    shiftSlots: transformShiftsToSlots(shifts),
    availableInstructors: instructors,
    departments,
    shiftTypes,
    // 部門IDを渡す（既にサーバー側でフィルタリング済み）
    ...(departmentId && {
      preselectedDepartmentId: departmentId,
    }),
  };

  // 日付情報の整形
  const formattedDate = formatDateJa(date);
  const isHoliday = isDateHoliday(date);

  // 戻り先のURLを決定（returnToパラメータがあればそれを使用、なければデフォルト）
  const backUrl = returnTo ? decodeURIComponent(returnTo) : "/shifts";

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-5">
          <Link
            className="group inline-flex items-center gap-2 font-medium text-muted-foreground text-sm transition-all hover:gap-3 hover:text-foreground"
            href={backUrl}
          >
            <ArrowLeft className="group-hover:-translate-x-0.5 h-4 w-4 transition-transform" />
            <span>シフト一覧に戻る</span>
          </Link>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container mx-auto px-4 py-8">
        {/* 日付ヘッダー */}
        <div className="mb-8">
          <div className="flex items-baseline gap-3">
            <h1 className="font-bold text-3xl tracking-tight">
              {formattedDate}
            </h1>
            {isHoliday && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 font-medium text-red-600 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                祝日
              </span>
            )}
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            シフトの作成・編集・削除ができます
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-muted-foreground text-sm">読み込み中...</p>
              </div>
            </div>
          }
        >
          <DayShiftManager initialData={dayShiftData} />
        </Suspense>
      </div>
    </div>
  );
}
