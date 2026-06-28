"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TableFilterRow,
  TableHeaderLayout,
  TableTitleRow,
} from "../../_components/table-header";

/**
 * 資格管理ページのテーブルヘッダーコンポーネント
 *
 * @description
 * 資格一覧ページのテーブルヘッダーで、タイトル表示とフィルター機能を提供するClient Componentです。
 * URLパラメータベースのフィルタリングに対応し、フィルター変更時にURLを更新してページ遷移します。
 * instructorsページと同じTableHeaderLayoutを使用した統一デザインです。
 *
 * フィルター機能:
 * - 部門フィルター（Tabs）: すべて / スキー / スノーボード
 * - アクティブフィルター（Switch）: アクティブのみ表示 / すべて表示
 *
 * URLパラメータ:
 * - department: "all" | "ski" | "snowboard"
 * - active: "true" | "false"
 *
 * @component
 * @example
 * ```tsx
 * // URLパラメータ: ?department=ski&active=true
 * <CertificationTableHeader />
 * ```
 *
 * @note
 * 追加ボタンはCertificationListコンポーネント内で実装されているため、ここでは表示しません。
 */
export function CertificationTableHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const currentDepartment = searchParams.get("department") || "all";
  const showActiveOnly = searchParams.get("active") !== "false";

  return (
    <TableHeaderLayout
      filterRow={
        <TableFilterRow
          leftFilter={
            <Tabs
              className="w-full sm:w-auto"
              onValueChange={(value) => updateFilter("department", value)}
              value={currentDepartment}
            >
              <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                <TabsTrigger value="all">すべて</TabsTrigger>
                <TabsTrigger value="ski">スキー</TabsTrigger>
                <TabsTrigger value="snowboard">スノーボード</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          rightFilter={
            <div className="flex items-center space-x-2">
              <Switch
                checked={showActiveOnly}
                id="active-filter"
                onCheckedChange={(checked) =>
                  updateFilter("active", checked ? "true" : "false")
                }
              />
              <Label className="text-sm" htmlFor="active-filter">
                アクティブのみ表示
              </Label>
            </div>
          }
        />
      }
      titleRow={<TableTitleRow title="資格一覧" />}
    />
  );
}
