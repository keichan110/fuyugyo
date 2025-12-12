"use client";

import { AlertTriangle, Calendar } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useShiftsLink } from "@/lib/hooks/use-shifts-link";
import type {
  InstructorBasicInfo,
  UserInstructorProfile,
} from "@/types/actions";
import { InstructorLinkageButton } from "./instructor-linkage-button";
import { ShiftCard } from "./shift-card";

type UpcomingShiftsSectionProps = {
  shifts: Array<{
    id: string;
    date: Date;
    department: {
      code: string;
      name: string;
    };
    shiftType: {
      name: string;
    };
  }>;
  instructorProfile: UserInstructorProfile | null;
  availableInstructors: InstructorBasicInfo[];
};

/**
 * カルーセルコンテンツをレンダリングするヘルパー関数
 *
 * @description
 * インストラクターの紐付け状態とシフトの有無に応じて、
 * 適切なコンテンツを早期リターンパターンで返します。
 *
 * @returns CarouselItem要素
 */
function renderCarouselContent({
  instructorProfile,
  shifts,
  availableInstructors,
  onSuccess,
}: {
  instructorProfile: UserInstructorProfile | null;
  shifts: UpcomingShiftsSectionProps["shifts"];
  availableInstructors: InstructorBasicInfo[];
  onSuccess: () => void;
}) {
  // インストラクター未紐付けの場合：警告カードを表示
  if (!instructorProfile) {
    return (
      <CarouselItem className="basis-full pl-2 md:pl-4">
        <Alert className="flex items-center gap-4" variant="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <div>
              <AlertTitle>インストラクター情報が設定されていません</AlertTitle>
              <AlertDescription>
                スケジュール機能を利用するには、インストラクター情報を設定してください。
              </AlertDescription>
            </div>
          </div>
          <div className="ml-auto">
            <InstructorLinkageButton
              instructors={availableInstructors}
              onSuccessAction={onSuccess}
            />
          </div>
        </Alert>
      </CarouselItem>
    );
  }

  // インストラクター紐付け済みだがシフトがない場合
  if (shifts.length === 0) {
    return (
      <CarouselItem className="basis-full pl-2 md:pl-4">
        <div className="rounded-lg border p-4">
          <p className="text-center text-muted-foreground text-sm">
            現在、予定されているシフトはありません
          </p>
        </div>
      </CarouselItem>
    );
  }

  // シフトがある場合：シフトカードを表示
  return shifts.map((shift) => (
    <CarouselItem
      className="basis-full pl-2 md:basis-1/5 md:pl-4"
      key={shift.id}
    >
      <ShiftCard shift={shift} />
    </CarouselItem>
  ));
}

/**
 * インストラクター向け今後のシフト表示セクションコンポーネント
 *
 * @description
 * 認証ユーザーに紐づくインストラクターの今後のシフトをカルーセル形式で表示します。
 * インストラクターが紐づいていない場合は警告アラートを表示します。
 * Client Componentとして実装され、shadcn/uiのCarouselコンポーネントを使用しています。
 * シフトがない場合は空状態メッセージとシフト一覧へのリンクを表示します。
 *
 * 表示形式:
 * - インストラクター未紐付け: 警告アラートとインストラクター設定ボタンを表示
 * - デスクトップ: 一度に5つのシフトカードを表示（横並び）
 * - モバイル: 一度に1つのシフトカードを表示（スワイプで切り替え）
 * - 最後に「すべて表示」リンクカードを配置
 *
 * @component
 * @example
 * ```tsx
 * <UpcomingShiftsSection
 *   shifts={[
 *     {
 *       id: 1,
 *       date: new Date('2024-01-15'),
 *       department: { code: 'ski', name: 'スキー' },
 *       shiftType: { name: '午前' }
 *     }
 *   ]}
 *   instructorProfile={userInstructorProfile}
 *   availableInstructors={instructorsList}
 * />
 * ```
 */
export function UpcomingShiftsSection({
  shifts,
  instructorProfile,
  availableInstructors,
}: UpcomingShiftsSectionProps) {
  const shiftsLink = useShiftsLink();
  const router = useRouter();

  const handleSuccess = () => {
    // ページをリフレッシュして最新データを取得
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <CardTitle>今後のシフト</CardTitle>
        </div>
        <CardDescription>直近の予定されたシフトを表示します</CardDescription>
      </CardHeader>
      <CardContent>
        <Carousel
          className="w-full px-12"
          opts={{
            align: "start",
            loop: false,
          }}
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {renderCarouselContent({
              instructorProfile,
              shifts,
              availableInstructors,
              onSuccess: handleSuccess,
            })}
          </CarouselContent>
          <CarouselPrevious className="left-0" />
          <CarouselNext className="right-0" />
        </Carousel>
        {/* すべてのシフトを見るリンク */}
        <div className="px-12">
          <Link
            className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted/80 hover:text-primary"
            href={shiftsLink}
          >
            <Calendar className="h-4 w-4" />
            すべて表示
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
