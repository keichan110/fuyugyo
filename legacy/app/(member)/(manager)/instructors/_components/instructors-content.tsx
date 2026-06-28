"use client";

import { Plus, SealCheck } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CertificationBadge } from "@/app/_components/certification-badge";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TableFilterRow,
  TableHeaderLayout,
  TableTitleRow,
} from "../../_components/table-header";
import {
  createInstructorAction,
  updateInstructorAction,
} from "../_lib/actions";
import { mapStatusToApi } from "../_lib/api";
import type {
  CategoryFilterType,
  InstructorFormData,
  InstructorStats,
  InstructorWithCertifications,
} from "../_lib/types";
import InstructorModal from "./instructor-modal";

/**
 * インストラクターステータスの並び順定義
 *
 * @description
 * テーブル表示時のステータス優先順位を定義します。
 * ACTIVE（有効）→ INACTIVE（休止）→ RETIRED（退職）の順で表示されます。
 */
const STATUS_ORDER: Partial<
  Record<InstructorWithCertifications["status"], number>
> = {
  ACTIVE: 0,
  INACTIVE: 1,
  RETIRED: 2,
};

/**
 * インストラクターをステータスと氏名でソートする関数
 *
 * @description
 * 第一優先: ステータス順（ACTIVE → INACTIVE → RETIRED）
 * 第二優先: 氏名の日本語ロケール順
 *
 * @param instructors - ソート対象のインストラクター配列
 * @returns ソート済みのインストラクター配列
 */
function sortInstructorsByStatusAndName(
  instructors: InstructorWithCertifications[]
): InstructorWithCertifications[] {
  return [...instructors].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER;
    const orderB = STATUS_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const nameA = `${a.lastName} ${a.firstName}`;
    const nameB = `${b.lastName} ${b.firstName}`;
    return nameA.localeCompare(nameB, "ja");
  });
}

/**
 * インストラクターがスキー資格を保有しているか判定する関数
 *
 * @param instructor - 判定対象のインストラクター
 * @returns スキー資格を保有している場合はtrue
 */
function hasSkiCertification(
  instructor: InstructorWithCertifications
): boolean {
  return instructor.certifications.some((cert) => {
    const deptCode = cert.department.code.toLowerCase();
    return deptCode === "ski";
  });
}

/**
 * インストラクターがスノーボード資格を保有しているか判定する関数
 *
 * @param instructor - 判定対象のインストラクター
 * @returns スノーボード資格を保有している場合はtrue
 */
function hasSnowboardCertification(
  instructor: InstructorWithCertifications
): boolean {
  return instructor.certifications.some((cert) => {
    const deptCode = cert.department.code.toLowerCase();
    return deptCode === "snowboard";
  });
}

/**
 * インストラクターをカテゴリとアクティブフィルターでフィルタリングする関数
 *
 * @description
 * カテゴリフィルター（すべて/スキー/スノーボード）とアクティブフィルターを適用し、
 * ソート済みのインストラクター配列を返します。
 *
 * @param instructors - フィルタリング対象のインストラクター配列
 * @param category - カテゴリフィルター（"all" | "ski" | "snowboard"）
 * @param showActiveOnly - アクティブなインストラクターのみ表示する場合はtrue
 * @returns フィルタリング・ソート済みのインストラクター配列
 */
function filterInstructors(
  instructors: InstructorWithCertifications[],
  category: CategoryFilterType,
  showActiveOnly: boolean
): InstructorWithCertifications[] {
  let filtered = [...instructors];

  switch (category) {
    case "ski":
      filtered = filtered.filter(hasSkiCertification);
      break;
    case "snowboard":
      filtered = filtered.filter(hasSnowboardCertification);
      break;
    default:
      break;
  }

  if (showActiveOnly) {
    filtered = filtered.filter((instructor) => instructor.status === "ACTIVE");
  }

  return sortInstructorsByStatusAndName(filtered);
}

/**
 * インストラクター統計情報を計算する関数
 *
 * @description
 * アクティブなインストラクターの総数、スキー資格保有者数、スノーボード資格保有者数を計算します。
 *
 * @param instructors - 統計対象のインストラクター配列
 * @returns 統計情報オブジェクト
 */
function calculateInstructorStats(
  instructors: InstructorWithCertifications[]
): InstructorStats {
  const activeInstructors = instructors.filter(
    (instructor) => instructor.status === "ACTIVE"
  );

  const skiInstructors = activeInstructors.filter(hasSkiCertification).length;
  const snowboardInstructors = activeInstructors.filter(
    hasSnowboardCertification
  ).length;

  const active = activeInstructors.length;

  return {
    total: active,
    active,
    skiInstructors,
    snowboardInstructors,
  };
}

/**
 * 空状態メッセージを取得する関数
 *
 * @description
 * フィルター条件に応じて適切な空状態メッセージを返します。
 *
 * @param category - カテゴリフィルター
 * @param showActiveOnly - アクティブフィルターの状態
 * @returns 表示するメッセージ
 */
function getEmptyMessage(
  category: CategoryFilterType,
  showActiveOnly: boolean
): string {
  if (category === "all" && !showActiveOnly) {
    return "インストラクターが登録されていません";
  }
  if (showActiveOnly) {
    return "有効なインストラクターがいません";
  }
  return "フィルター条件に一致するインストラクターがいません";
}

type InstructorRowProps = {
  instructor: InstructorWithCertifications;
  onOpenModal: (instructor: InstructorWithCertifications) => void;
};

/**
 * インストラクターテーブルの1行を表示するコンポーネント
 *
 * @description
 * インストラクター情報をステータス別に色分けされたテーブル行として表示します。
 * 行全体がクリッカブルで、クリックすると編集モーダルが開きます。
 * 非アクティブなインストラクターは透明度を下げて表示されます。
 *
 * 表示項目:
 * - 資格アイコン（スキー/スノーボード）
 * - 氏名
 * - フリガナ
 * - 保有資格（CertificationBadge）
 * - 備考（デスクトップのみ）
 *
 * @component
 * @internal
 */
function InstructorRow({ instructor, onOpenModal }: InstructorRowProps) {
  const statusStyles = {
    ACTIVE: {
      row: "bg-green-50/30 hover:bg-green-50/50 dark:bg-green-900/5 dark:hover:bg-green-900/10",
      text: "text-foreground",
    },
    INACTIVE: {
      row: "bg-yellow-50/30 hover:bg-yellow-50/50 dark:bg-yellow-900/5 dark:hover:bg-yellow-900/10",
      text: "text-foreground",
    },
    RETIRED: {
      row: "bg-gray-50/30 hover:bg-gray-50/50 dark:bg-gray-900/5 dark:hover:bg-gray-900/10",
      text: "text-foreground",
    },
  }[instructor.status];

  const skiCertified = hasSkiCertification(instructor);
  const snowboardCertified = hasSnowboardCertification(instructor);

  return (
    <TableRow
      className={`cursor-pointer transition-colors ${statusStyles?.row} ${
        instructor.status !== "ACTIVE" ? "opacity-60" : ""
      }`}
      key={instructor.id}
      onClick={() => onOpenModal(instructor)}
    >
      <TableCell>
        <div className="flex items-center gap-1">
          {skiCertified ? (
            <DepartmentIcon
              className="h-4 w-4 text-ski-600 dark:text-ski-400"
              code="SKI"
            />
          ) : null}
          {snowboardCertified ? (
            <DepartmentIcon
              className="h-4 w-4 text-snowboard-600 dark:text-snowboard-400"
              code="SNOWBOARD"
            />
          ) : null}
          {skiCertified || snowboardCertified ? null : (
            <div className="h-4 w-4" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <span
          className={`whitespace-nowrap font-medium md:whitespace-normal ${
            statusStyles?.text
          } ${instructor.status !== "ACTIVE" ? "line-through" : ""}`}
        >
          {instructor.lastName} {instructor.firstName}
        </span>
      </TableCell>
      <TableCell
        className={`whitespace-nowrap md:whitespace-normal ${statusStyles?.text} ${
          instructor.status !== "ACTIVE" ? "line-through" : ""
        }`}
      >
        {instructor.lastNameKana && instructor.firstNameKana
          ? `${instructor.lastNameKana} ${instructor.firstNameKana}`
          : "-"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {instructor.certifications.length > 0 ? (
            instructor.certifications.map((cert) => (
              <CertificationBadge
                departmentCode={cert.department.code}
                key={cert.id}
                shortName={cert.shortName || cert.name}
              />
            ))
          ) : (
            <span className="text-muted-foreground text-sm">なし</span>
          )}
        </div>
      </TableCell>
      <TableCell
        className={`hidden max-w-xs md:table-cell ${
          instructor.status !== "ACTIVE" ? "line-through" : ""
        }`}
      >
        <p className={`line-clamp-2 text-sm ${statusStyles?.text} opacity-70`}>
          {instructor.notes || "備考なし"}
        </p>
      </TableCell>
    </TableRow>
  );
}

type InstructorsContentProps = {
  initialData: InstructorWithCertifications[];
};

/**
 * インストラクター管理画面のメインコンテンツコンポーネント
 *
 * @description
 * インストラクター一覧の表示、フィルタリング、作成・編集機能を提供するClient Componentです。
 * Server Componentから渡された初期データを表示し、統計情報・フィルター・テーブルを統合的に管理します。
 *
 * 主な機能:
 * - インストラクター統計カードの表示（アクティブ数、スキー/スノーボード資格保有者数）
 * - カテゴリフィルター（すべて/スキー/スノーボード）
 * - アクティブフィルター（有効のみ表示）
 * - インストラクターテーブルの表示（ステータス別色分け）
 * - 新規追加・編集モーダルの管理
 * - Server Actionsによる作成・更新（createInstructorAction / updateInstructorAction）
 * - ページリフレッシュ（router.refresh）による最新データ取得
 * - useMemoによる計算結果のメモ化（パフォーマンス最適化）
 *
 * @component
 * @example
 * ```tsx
 * <InstructorsContent
 *   initialData={instructors}
 * />
 * ```
 */
export default function InstructorsContent({
  initialData,
}: InstructorsContentProps) {
  const router = useRouter();
  const [currentCategory, setCurrentCategory] =
    useState<CategoryFilterType>("all");
  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] =
    useState<InstructorWithCertifications | null>(null);

  const filteredInstructors = useMemo(
    () => filterInstructors(initialData, currentCategory, showActiveOnly),
    [initialData, currentCategory, showActiveOnly]
  );

  const stats = useMemo<InstructorStats>(
    () => calculateInstructorStats(initialData),
    [initialData]
  );

  const handleCategoryChange = useCallback((category: string) => {
    setCurrentCategory(category as CategoryFilterType);
  }, []);

  const handleActiveFilterChange = useCallback((checked: boolean) => {
    setShowActiveOnly(checked);
  }, []);

  const handleOpenModal = useCallback(
    (instructor?: InstructorWithCertifications) => {
      setEditingInstructor(instructor ?? null);
      setIsModalOpen(true);
    },
    []
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingInstructor(null);
  }, []);

  const handleSave = useCallback(
    async (formData: InstructorFormData) => {
      // InstructorFormDataをServer Actionsの入力形式に変換
      const input = {
        lastName: formData.lastName,
        firstName: formData.firstName,
        lastNameKana: formData.lastNameKana || null,
        firstNameKana: formData.firstNameKana || null,
        status: mapStatusToApi(formData.status),
        notes: formData.notes || null,
        certificationIds: formData.certificationIds || [],
      };

      const result = editingInstructor
        ? await updateInstructorAction(editingInstructor.id, input)
        : await createInstructorAction(input);

      if (!result.success) {
        throw new Error(result.error || "Failed to save instructor");
      }

      // ★重要★ Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
      handleCloseModal();
    },
    [editingInstructor, handleCloseModal, router]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
              インストラクター管理
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              インストラクターの登録・管理を行います
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 md:mb-6">
        <Card className="mx-auto w-full max-w-md md:mx-0">
          <CardContent className="px-3 py-2">
            <div className="flex items-center justify-center divide-x divide-border">
              <div className="flex items-center gap-2 px-4 py-1">
                <SealCheck
                  className="h-4 w-4 text-green-600 dark:text-green-400"
                  weight="regular"
                />
                <div className="font-bold text-base text-green-600 dark:text-green-400">
                  {stats.active}
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-1">
                <DepartmentIcon
                  className="h-4 w-4 text-ski-600 dark:text-ski-400"
                  code="SKI"
                />
                <div className="font-bold text-base text-ski-600 dark:text-ski-400">
                  {stats.skiInstructors}
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-1">
                <DepartmentIcon
                  className="h-4 w-4 text-snowboard-600 dark:text-snowboard-400"
                  code="SNOWBOARD"
                />
                <div className="font-bold text-base text-snowboard-600 dark:text-snowboard-400">
                  {stats.snowboardInstructors}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-lg dark:bg-gray-900">
        <TableHeaderLayout
          filterRow={
            <TableFilterRow
              leftFilter={
                <Tabs
                  className="w-full sm:w-auto"
                  onValueChange={handleCategoryChange}
                  value={currentCategory}
                >
                  <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                    <TabsTrigger
                      className="flex items-center gap-2"
                      value="all"
                    >
                      すべて
                    </TabsTrigger>
                    <TabsTrigger
                      className="flex items-center gap-2"
                      value="ski"
                    >
                      スキー
                    </TabsTrigger>
                    <TabsTrigger
                      className="flex items-center gap-2"
                      value="snowboard"
                    >
                      スノーボード
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              }
              rightFilter={
                <div className="hidden items-center space-x-2 sm:flex">
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
              title="インストラクター一覧"
            />
          }
        />
        <Table>
          <TableHeader>
            <TableRow className="bg-white dark:bg-gray-900">
              <TableHead className="w-12">資格</TableHead>
              <TableHead className="min-w-[120px]">氏名</TableHead>
              <TableHead className="min-w-[120px]">フリガナ</TableHead>
              <TableHead className="min-w-[200px]">保有資格</TableHead>
              <TableHead className="hidden min-w-[200px] md:table-cell">
                備考
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInstructors.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={5}
                >
                  {getEmptyMessage(currentCategory, showActiveOnly)}
                </TableCell>
              </TableRow>
            ) : (
              filteredInstructors.map((instructor) => (
                <InstructorRow
                  instructor={instructor}
                  key={instructor.id}
                  onOpenModal={handleOpenModal}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InstructorModal
        instructor={editingInstructor}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
      />
    </div>
  );
}
