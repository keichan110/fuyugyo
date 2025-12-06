import { Suspense } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authenticate } from "@/lib/auth/auth";
import {
  getAvailableInstructors,
  getInstructorProfile,
} from "@/lib/data/instructor";
import type {
  InstructorBasicInfo,
  UserInstructorProfile,
} from "@/types/actions";
import { UpcomingShiftsSection } from "./_components/upcoming-shifts-section";
import { getUpcomingShifts } from "./_lib/shift";

/**
 * 今後のシフトセクションの非同期コンポーネント
 */
async function UpcomingShiftsAsync({
  instructorId,
  instructorProfile,
  availableInstructors,
}: {
  instructorId: number | null;
  instructorProfile: UserInstructorProfile | null;
  availableInstructors: InstructorBasicInfo[];
}) {
  const upcomingShifts = instructorId
    ? await getUpcomingShifts(instructorId)
    : [];

  return (
    <UpcomingShiftsSection
      availableInstructors={availableInstructors}
      instructorProfile={instructorProfile}
      shifts={upcomingShifts}
    />
  );
}

/**
 * 今後のシフトセクションのスケルトン
 */
function UpcomingShiftsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="mt-1 h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="w-full px-12">
          <div className="-ml-2 md:-ml-4 flex">
            {/* biome-ignore-start lint/suspicious/noArrayIndexKey: スケルトンは静的表示のため順序変更なし */}
            {Array.from({ length: 5 }, (_, i) => (
              <div
                className="basis-full pl-2 md:basis-1/5 md:pl-4"
                key={`skeleton-shift-${i}`}
              >
                <div className="h-full rounded-lg border p-4">
                  <div className="flex h-full flex-col items-center justify-center space-y-3">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: スケルトン表示範囲の終了 */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ダッシュボードページ
 *
 * このページの役割：
 * - 認証済みユーザー（MEMBER以上）のホームページ
 * - システムの概要情報を一目で確認できる画面
 * - インストラクター紐付け状況の表示と操作
 * - 親レイアウト (member)/layout.tsx で認証済み
 *
 * URL: /
 */
export default async function DashboardPage() {
  // 認証チェック
  const user = await authenticate();
  if (!user) {
    throw new Error("認証が必要です");
  }

  // インストラクター情報取得（React.cacheでメモ化されているため、layout.tsxと重複してもDBクエリは1回のみ）
  // 今後のシフトはSuspenseで遅延読み込みするため、ここでは取得しない
  const [instructorProfile, availableInstructors] = await Promise.all([
    user.instructorId ? getInstructorProfile(user.instructorId) : null,
    // 未紐付けの場合でもHeaderで使用するため、常に取得する
    getAvailableInstructors(),
  ]).catch(() => {
    throw new Error("ダッシュボードデータの取得に失敗しました");
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground">Fuyugyō - 運営管理システム</p>
      </div>

      {/* 今後のシフト（インストラクター紐付け状況を含む） */}
      <Suspense fallback={<UpcomingShiftsSkeleton />}>
        <UpcomingShiftsAsync
          availableInstructors={availableInstructors}
          instructorId={user.instructorId}
          instructorProfile={instructorProfile}
        />
      </Suspense>

      {/* 今後追加される他のダッシュボードコンテンツ */}
    </div>
  );
}
