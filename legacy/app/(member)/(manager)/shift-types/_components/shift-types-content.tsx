"use client";

import { Plus, SealCheck, Tag } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableFilterRow,
  TableHeaderLayout,
  TableTitleRow,
} from "../../_components/table-header";
import { createShiftTypeAction, updateShiftTypeAction } from "../_lib/actions";
import type {
  ShiftType,
  ShiftTypeFormData,
  ShiftTypeStats,
} from "../_lib/types";
import ShiftTypeModal from "./shift-type-modal";

type ShiftTypesContentProps = {
  initialShiftTypes: ShiftType[];
};

/**
 * シフト種類を有効/無効と名前順でソートする関数
 *
 * @description
 * 第一優先: 有効なシフト種類を先に表示
 * 第二優先: 名前の日本語ロケール順
 *
 * @param shiftTypes - ソート対象のシフト種類配列
 * @returns ソート済みのシフト種類配列
 */
function sortShiftTypes(shiftTypes: ShiftType[]): ShiftType[] {
  return [...shiftTypes].sort((a, b) => {
    if (a.isActive && !b.isActive) {
      return -1;
    }

    if (!a.isActive && b.isActive) {
      return 1;
    }

    return a.name.localeCompare(b.name, "ja");
  });
}

/**
 * シフト種類をアクティブフィルターでフィルタリングする関数
 *
 * @description
 * アクティブフィルターがtrueの場合、有効なシフト種類のみを返します。
 *
 * @param shiftTypes - フィルタリング対象のシフト種類配列
 * @param showActiveOnly - 有効なシフト種類のみ表示する場合はtrue
 * @returns フィルタリング済みのシフト種類配列
 */
function filterShiftTypes(
  shiftTypes: ShiftType[],
  showActiveOnly: boolean
): ShiftType[] {
  if (showActiveOnly) {
    return shiftTypes.filter((shiftType) => shiftType.isActive);
  }

  return [...shiftTypes];
}

/**
 * シフト種類の統計情報を計算する関数
 *
 * @description
 * シフト種類の総数と有効なシフト種類の数を計算します。
 *
 * @param shiftTypes - 統計対象のシフト種類配列
 * @returns 統計情報オブジェクト
 */
function calculateStats(shiftTypes: ShiftType[]): ShiftTypeStats {
  return {
    total: shiftTypes.length,
    active: shiftTypes.filter((shiftType) => shiftType.isActive).length,
  };
}

/**
 * シフト種類管理画面のメインコンテンツコンポーネント
 *
 * @description
 * シフト種類マスタの一覧表示、フィルタリング、作成・編集機能を提供するClient Componentです。
 * Server Componentから渡された初期データを表示し、統計情報・フィルター・テーブルを統合的に管理します。
 *
 * 主な機能:
 * - シフト種類統計カードの表示（合計数、有効数）
 * - アクティブフィルター（有効のみ表示）
 * - シフト種類テーブルの表示（有効/無効別色分け）
 * - 新規追加・編集モーダルの管理
 * - Server Actionsによる作成・更新（createShiftTypeAction / updateShiftTypeAction）
 * - ページリフレッシュ（router.refresh）による最新データ取得
 * - useMemoによる計算結果のメモ化（パフォーマンス最適化）
 * - レスポンシブ対応（モバイルでは作成日列を非表示）
 *
 * @component
 * @example
 * ```tsx
 * <ShiftTypesContent
 *   initialShiftTypes={shiftTypes}
 * />
 * ```
 */
export default function ShiftTypesContent({
  initialShiftTypes,
}: ShiftTypesContentProps) {
  const router = useRouter();
  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShiftType, setEditingShiftType] = useState<ShiftType | null>(
    null
  );

  // 初期データをソート
  const sortedShiftTypes = useMemo(
    () => sortShiftTypes(initialShiftTypes),
    [initialShiftTypes]
  );

  const filteredShiftTypes = useMemo(
    () => filterShiftTypes(sortedShiftTypes, showActiveOnly),
    [sortedShiftTypes, showActiveOnly]
  );

  const stats = useMemo<ShiftTypeStats>(
    () => calculateStats(sortedShiftTypes),
    [sortedShiftTypes]
  );

  const handleActiveFilterChange = useCallback((checked: boolean) => {
    setShowActiveOnly(checked);
  }, []);

  const handleOpenModal = useCallback((shiftType?: ShiftType) => {
    setEditingShiftType(shiftType ?? null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingShiftType(null);
  }, []);

  const handleSave = useCallback(
    async (data: ShiftTypeFormData) => {
      const result = editingShiftType
        ? await updateShiftTypeAction(editingShiftType.id, data)
        : await createShiftTypeAction(data);

      if (!result.success) {
        throw new Error(result.error || "Failed to save shift type");
      }

      // Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
      handleCloseModal();
    },
    [editingShiftType, handleCloseModal, router]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
              シフト種類管理
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              シフト種類の登録・管理を行います
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 md:mb-6">
        <Card className="mx-auto w-full max-w-md md:mx-0">
          <CardContent className="px-3 py-2">
            <div className="flex items-center justify-center divide-x divide-border">
              <div className="flex items-center gap-2 px-4 py-1">
                <Tag className="h-4 w-4 text-primary" weight="regular" />
                <div className="font-bold text-base text-primary">
                  {stats.total}
                </div>
                <span className="text-muted-foreground text-sm">合計</span>
              </div>

              <div className="flex items-center gap-2 px-4 py-1">
                <SealCheck
                  className="h-4 w-4 text-green-600 dark:text-green-400"
                  weight="regular"
                />
                <div className="font-bold text-base text-green-600 dark:text-green-400">
                  {stats.active}
                </div>
                <span className="text-muted-foreground text-sm">有効</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-lg dark:bg-gray-900">
        <TableHeaderLayout
          filterRow={
            <TableFilterRow
              rightFilter={
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={showActiveOnly}
                    id="active-only"
                    onCheckedChange={handleActiveFilterChange}
                  />
                  <Label
                    className="flex cursor-pointer items-center gap-1"
                    htmlFor="active-only"
                  >
                    <SealCheck
                      className="h-4 w-4 text-green-600 dark:text-green-400"
                      weight="regular"
                    />
                    有効のみ
                  </Label>
                </div>
              }
            />
          }
          titleRow={
            <TableTitleRow
              rightAction={
                <Button
                  className="flex items-center gap-2"
                  onClick={() => handleOpenModal()}
                >
                  <Plus className="h-4 w-4" weight="regular" />
                  追加
                </Button>
              }
              title="シフト種類一覧"
            />
          }
        />
        <Table>
          <TableHeader>
            <TableRow className="bg-white dark:bg-gray-900">
              <TableHead className="w-12" />
              <TableHead className="min-w-[200px]">シフト種類名</TableHead>
              <TableHead className="w-24 text-center">状態</TableHead>
              <TableHead className="hidden min-w-[150px] md:table-cell">
                作成日
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShiftTypes.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={4}
                >
                  {showActiveOnly
                    ? "有効なシフト種類がありません"
                    : "シフト種類が登録されていません"}
                </TableCell>
              </TableRow>
            ) : (
              filteredShiftTypes.map((shiftType) => (
                <TableRow
                  className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                    shiftType.isActive ? "" : "opacity-60"
                  }`}
                  key={shiftType.id}
                  onClick={() => handleOpenModal(shiftType)}
                >
                  <TableCell>
                    <Tag className="h-5 w-5 text-primary" weight="regular" />
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-medium ${shiftType.isActive ? "" : "line-through"}`}
                    >
                      {shiftType.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${
                        shiftType.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                      }`}
                    >
                      {shiftType.isActive ? "有効" : "無効"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                    {new Date(shiftType.createdAt).toLocaleDateString("ja-JP")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ShiftTypeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        shiftType={editingShiftType}
      />
    </div>
  );
}
