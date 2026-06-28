import { Crown, Star, UserCheck } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent } from "@/components/ui/card";

/**
 * ユーザー統計データの型定義
 */
export type UserStatsData = {
  /** 総ユーザー数 */
  total: number;
  /** アクティブユーザー数 */
  active: number;
  /** 管理者数 */
  admins: number;
  /** マネージャー数 */
  managers: number;
  /** メンバー数 */
  members: number;
};

/**
 * ユーザー統計コンポーネントのプロパティ
 */
type UserStatsProps = {
  /** 表示する統計データ */
  stats: UserStatsData;
};

/**
 * ユーザー統計表示コンポーネント
 *
 * @description
 * ユーザー統計情報を視覚的に表示するServer Componentです。
 * アクティブユーザー数、管理者数、マネージャー数をアイコン付きの
 * 色分けされたカードで横並びに表示します。
 *
 * 表示項目:
 * - アクティブユーザー数（緑色、UserCheckアイコン）
 * - 管理者数（赤色、Crownアイコン）
 * - マネージャー数（青色、Starアイコン）
 *
 * @component
 * @example
 * ```tsx
 * <UserStats
 *   stats={{
 *     total: 50,
 *     active: 45,
 *     admins: 2,
 *     managers: 8,
 *     members: 40
 *   }}
 * />
 * ```
 */
export function UserStats({ stats }: UserStatsProps) {
  return (
    <div className="mb-4 md:mb-6">
      <Card className="mx-auto w-full max-w-md md:mx-0">
        <CardContent className="px-3 py-2">
          <div className="flex items-center justify-center divide-x divide-border">
            {/* アクティブユーザー数 */}
            <div className="flex items-center gap-2 px-4 py-1">
              <UserCheck
                className="h-4 w-4 text-green-600 dark:text-green-400"
                weight="regular"
              />
              <div className="font-bold text-base text-green-600 dark:text-green-400">
                {stats.active}
              </div>
            </div>

            {/* 管理者数 */}
            <div className="flex items-center gap-2 px-4 py-1">
              <Crown
                className="h-4 w-4 text-red-600 dark:text-red-400"
                weight="regular"
              />
              <div className="font-bold text-base text-red-600 dark:text-red-400">
                {stats.admins}
              </div>
            </div>

            {/* マネージャー数 */}
            <div className="flex items-center gap-2 px-4 py-1">
              <Star
                className="h-4 w-4 text-blue-600 dark:text-blue-400"
                weight="regular"
              />
              <div className="font-bold text-base text-blue-600 dark:text-blue-400">
                {stats.managers}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
