"use client";

import { FileText, Info } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useNotification } from "@/app/_providers/notifications";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/types/actions";
import { getDepartmentIdByTypeAction } from "../_lib/actions";
import type {
  CreateCertificationInput,
  UpdateCertificationInput,
} from "../_lib/schemas";
import type {
  CertificationFormData,
  CertificationWithDepartment,
} from "../_lib/types";

type CertificationActionResult = ActionResult<unknown>;
type CreateAction = (
  input: CreateCertificationInput
) => Promise<CertificationActionResult>;
type UpdateAction = (
  id: string,
  input: UpdateCertificationInput
) => Promise<CertificationActionResult>;

/**
 * 資格モーダルコンポーネントのプロパティ
 */
type CertificationModalProps = {
  /** モーダルの開閉状態 */
  isOpen: boolean;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** 編集する資格（未指定の場合は新規追加） */
  certification?: CertificationWithDepartment | null;
  /** 資格作成アクション */
  onCreateCertification: CreateAction;
  /** 資格更新アクション */
  onUpdateCertification: UpdateAction;
};

/**
 * 資格の作成・編集モーダルコンポーネント
 *
 * @description
 * 資格マスタデータの新規作成・編集を行うDrawerモーダルコンポーネントです。
 * Client Componentとして実装され、useStateで送信状態を管理しながらServer Actionsを呼び出します。
 * フォームデータをServer Actionsの入力形式に変換して送信します。
 *
 * フォーム項目:
 * - 部門選択（ラジオボタン）
 * - 資格名（短縮名）
 * - 発行組織
 * - 正式名称
 * - 説明・備考（任意）
 * - 有効/無効スイッチ
 *
 * 主な機能:
 * - 資格の新規作成（onCreateCertification）
 * - 既存資格の編集（onUpdateCertification）
 * - フォームバリデーション（HTML5 required属性）
 * - Server Actionsによる保存
 * - 保存中のUI状態表示（ボタン無効化）
 * - 通知システム統合（成功/エラーメッセージ）
 * - ページリフレッシュ（router.refresh）
 *
 * @component
 * @example
 * ```tsx
 * <CertificationModal
 *   isOpen={isModalOpen}
 *   onClose={handleCloseModal}
 *   certification={editingCertification}
 *   onCreateCertification={createAction}
 *   onUpdateCertification={updateAction}
 * />
 * ```
 */
export default function CertificationModal({
  isOpen,
  onClose,
  certification,
  onCreateCertification,
  onUpdateCertification,
}: CertificationModalProps) {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [formData, setFormData] = useState<CertificationFormData>({
    name: "",
    shortName: "",
    department: "ski",
    organization: "",
    description: "",
    status: "active",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // モーダルが開いたときにフォーム状態を初期化
    if (!isOpen) {
      return;
    }

    if (certification) {
      // 編集モード
      const deptCode = certification.department.code.toLowerCase() as
        | "ski"
        | "snowboard";

      setFormData({
        name: certification.name,
        shortName: certification.shortName || "",
        department: deptCode,
        organization: certification.organization,
        description: certification.description || "",
        status: certification.isActive ? "active" : "inactive",
      });
    } else {
      // 新規追加モード
      setFormData({
        name: "",
        shortName: "",
        department: "ski",
        organization: "",
        description: "",
        status: "active",
      });
    }
  }, [isOpen, certification]);

  /**
   * 部門IDを取得するヘルパー関数
   */
  const fetchDepartmentId = async (
    departmentType: "ski" | "snowboard"
  ): Promise<string> => {
    const result = await getDepartmentIdByTypeAction(departmentType);
    if (!result.success) {
      throw new Error(result.error || "部門IDの取得に失敗しました");
    }
    return result.data;
  };

  /**
   * 入力データを構築するヘルパー関数
   */
  const buildCertificationInput = (
    departmentId: string,
    data: CertificationFormData
  ) => ({
    departmentId,
    name: data.name,
    shortName: data.shortName,
    organization: data.organization,
    description: data.description || null,
    isActive: data.status === "active",
  });

  /**
   * Server Actionを実行するヘルパー関数
   */
  const executeCertificationAction = async (
    input: CreateCertificationInput | UpdateCertificationInput
  ): Promise<CertificationActionResult> => {
    if (certification) {
      return await onUpdateCertification(certification.id, input);
    }
    return await onCreateCertification(input);
  };

  /**
   * フォーム送信ハンドラー
   *
   * @remarks
   * フォームデータを Server Actions の入力形式に変換し、
   * useState ベースの送信フラグで UI をロックしながら非同期で保存処理を実行します。
   *
   * @param e - フォームイベント
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const departmentId = await fetchDepartmentId(formData.department);
      const input = buildCertificationInput(departmentId, formData);
      const result = await executeCertificationAction(input);

      if (result.success) {
        showNotification(
          certification
            ? "資格が正常に更新されました"
            : "資格が正常に作成されました",
          "success"
        );
        router.refresh();
        onClose();
      } else {
        showNotification(result.error || "保存に失敗しました", "error");
      }
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "保存に失敗しました",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer onOpenChange={onClose} open={isOpen}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-7xl">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-2xl">
              {certification ? "資格編集" : "新しい資格を追加"}
            </DrawerTitle>
          </DrawerHeader>

          <ScrollArea className="h-auto max-h-[60vh] overflow-auto overflow-y-auto p-4">
            <form
              className="space-y-6"
              id="certification-form"
              onSubmit={handleSubmit}
            >
              {/* 基本情報セクション */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-semibold text-lg">
                  <Info className="h-5 w-5 text-primary" weight="regular" />
                  基本情報
                </div>

                {/* 部門選択（全幅） */}
                <div className="space-y-2">
                  <Label className="font-medium text-sm">
                    部門 <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    className="flex gap-4"
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        department: value as "ski" | "snowboard",
                      }))
                    }
                    value={formData.department}
                  >
                    <div className="flex cursor-pointer items-center space-x-2 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem id="ski" value="ski" />
                      <Label
                        className="flex cursor-pointer items-center gap-2"
                        htmlFor="ski"
                      >
                        <DepartmentIcon className="h-5 w-5" code="SKI" />
                        <span className="font-medium">スキー</span>
                      </Label>
                    </div>
                    <div className="flex cursor-pointer items-center space-x-2 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-accent has-[:checked]:bg-accent/20">
                      <RadioGroupItem id="snowboard" value="snowboard" />
                      <Label
                        className="flex cursor-pointer items-center gap-2"
                        htmlFor="snowboard"
                      >
                        <DepartmentIcon className="h-5 w-5" code="SNOWBOARD" />
                        <span className="font-medium">スノーボード</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* 資格名（幅制限） */}
                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="shortName">
                    資格名 <span className="text-destructive">*</span>
                  </Label>
                  <div className="max-w-md">
                    <Input
                      id="shortName"
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          shortName: e.target.value,
                        }))
                      }
                      placeholder="例: 指導員"
                      required
                      value={formData.shortName}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    シフト表示などで使用する資格名を入力してください
                  </p>
                </div>

                {/* 発行組織と正式名称を2カラム（発行組織は小さく） */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
                  <div className="space-y-2">
                    <Label
                      className="font-medium text-sm"
                      htmlFor="organization"
                    >
                      発行組織 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="organization"
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          organization: e.target.value,
                        }))
                      }
                      placeholder="例: SAJ"
                      required
                      value={formData.organization}
                    />
                    <p className="text-muted-foreground text-xs">
                      資格を発行した組織名を入力してください
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      className="font-medium text-sm"
                      htmlFor="certificationName"
                    >
                      正式名称 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="certificationName"
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="例: 全日本スキー連盟公認スキー指導員"
                      required
                      value={formData.name}
                    />
                    <p className="text-muted-foreground text-xs">
                      正式な資格名称を入力してください
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 詳細情報セクション */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-semibold text-lg">
                  <FileText className="h-5 w-5 text-primary" weight="regular" />
                  詳細情報
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="description">
                    説明・備考
                  </Label>
                  <Textarea
                    id="description"
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="資格の詳細説明、取得条件、有効期限などを記載してください"
                    rows={4}
                    value={formData.description}
                  />
                  <p className="text-muted-foreground text-xs">
                    資格の詳細情報や注意事項などを記載（省略可）
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm">有効</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formData.status === "active"}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          status: checked ? "active" : "inactive",
                        }))
                      }
                    />
                    <Label className="text-muted-foreground text-sm">
                      {formData.status === "active" ? "有効" : "無効"}
                    </Label>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    無効にした資格は新規割り当てができなくなります
                  </p>
                </div>
              </div>
            </form>
          </ScrollArea>

          <DrawerFooter>
            <div className="flex w-full gap-2">
              <DrawerClose asChild>
                <Button
                  className="flex-1"
                  disabled={isSubmitting}
                  type="button"
                  variant="outline"
                >
                  キャンセル
                </Button>
              </DrawerClose>
              <Button
                className="flex-1"
                disabled={isSubmitting}
                form="certification-form"
                type="submit"
              >
                {isSubmitting ? "保存中..." : "保存"}
              </Button>
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
