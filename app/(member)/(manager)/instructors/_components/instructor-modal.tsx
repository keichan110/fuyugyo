"use client";

import {
  Info,
  SealCheck,
  User,
  UserGear,
  UserMinus,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useNotification } from "@/app/_providers/notifications";
import { DepartmentIcon } from "@/app/(member)/_components/department-icon";
import { getCertificationsAction } from "@/app/(member)/(manager)/certifications/_lib/actions";
import type { CertificationWithDepartment } from "@/app/(member)/(manager)/certifications/_lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import type { InstructorFormData, InstructorModalProps } from "../_lib/types";

/**
 * インストラクターの作成・編集モーダルコンポーネント
 *
 * @description
 * インストラクター情報の新規作成・編集を行うDrawerモーダルコンポーネントです。
 * Client Componentとして実装され、複雑なフォーム状態管理と資格の動的追加・削除を提供します。
 *
 * フォーム項目:
 * - 基本情報: 姓、名、セイ（カタカナ）、メイ（カタカナ）
 * - ステータス: 有効 / 休止 / 退職（ラジオボタン）
 * - 保有資格: 部門選択→資格選択→追加（動的な資格管理）
 * - 備考: 特記事項のテキストエリア
 *
 * 主な機能:
 * - インストラクターの新規作成・編集
 * - アクティブ資格の動的取得（getCertificationsAction）
 * - 部門別資格フィルタリング（スキー/スノーボード）
 * - 資格の追加・削除（重複チェック付き）
 * - フォームバリデーション（必須項目チェック）
 * - 保存中の状態管理（送信ボタン無効化）
 * - 通知システム統合（成功/エラーメッセージ）
 * - スクロール可能なフォームエリア（ScrollArea使用）
 *
 * @component
 * @example
 * ```tsx
 * <InstructorModal
 *   isOpen={isModalOpen}
 *   onClose={handleCloseModal}
 *   instructor={editingInstructor}
 *   onSave={handleSave}
 * />
 * ```
 */
export default function InstructorModal({
  isOpen,
  onClose,
  instructor,
  onSave,
}: InstructorModalProps) {
  const { showNotification } = useNotification();
  const [formData, setFormData] = useState<InstructorFormData>({
    lastName: "",
    firstName: "",
    lastNameKana: "",
    firstNameKana: "",
    status: "active",
    notes: "",
    certificationIds: [],
  });
  const [availableCertifications, setAvailableCertifications] = useState<
    CertificationWithDepartment[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCertifications, setIsLoadingCertifications] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedCertification, setSelectedCertification] =
    useState<string>("");
  const [assignedCertifications, setAssignedCertifications] = useState<
    {
      id: string;
      name: string;
      shortName: string | null;
      organization: string;
      department: { code: string; name: string };
    }[]
  >([]);

  useEffect(() => {
    // モーダルが開いたときにフォーム状態を初期化
    if (!isOpen) {
      return;
    }

    if (instructor) {
      // 編集モード
      setFormData({
        lastName: instructor.lastName,
        firstName: instructor.firstName,
        lastNameKana: instructor.lastNameKana || "",
        firstNameKana: instructor.firstNameKana || "",
        status: (() => {
          if (instructor.status === "ACTIVE") {
            return "active";
          }
          if (instructor.status === "INACTIVE") {
            return "inactive";
          }
          return "retired";
        })(),
        notes: instructor.notes || "",
        certificationIds: instructor.certifications.map((c) => c.id),
      });
      setAssignedCertifications(instructor.certifications);
    } else {
      // 新規追加モード
      setFormData({
        lastName: "",
        firstName: "",
        lastNameKana: "",
        firstNameKana: "",
        status: "active",
        notes: "",
        certificationIds: [],
      });
      setAssignedCertifications([]);
    }
    setSelectedDepartment("");
    setSelectedCertification("");
  }, [isOpen, instructor]);

  const loadCertifications = useCallback(async () => {
    try {
      setIsLoadingCertifications(true);
      const result = await getCertificationsAction();

      if (result.success && result.data) {
        // getCertificationsAction は既に isActive: true でフィルタ済み
        setAvailableCertifications(result.data);
      } else {
        // エラー時は空配列をセット
        setAvailableCertifications([]);
      }
    } catch (_error) {
      // Intentionally catching and ignoring errors
      // User will see empty certification list in the UI
      setAvailableCertifications([]);
    } finally {
      setIsLoadingCertifications(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCertifications();
    }
  }, [isOpen, loadCertifications]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSave(formData);
      showNotification(
        instructor
          ? "インストラクターが正常に更新されました"
          : "インストラクターが正常に作成されました",
        "success"
      );
      onClose();
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "保存に失敗しました",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedCertification("");
  };

  const getFilteredCertifications = () => {
    if (!selectedDepartment) {
      return [];
    }

    return availableCertifications.filter((cert) => {
      const deptCode = cert.department.code.toLowerCase();
      return deptCode === selectedDepartment;
    });
  };

  const handleAddCertification = () => {
    if (!selectedCertification) {
      return;
    }

    const certificationToAdd = availableCertifications.find(
      (cert) => cert.id === selectedCertification
    );

    if (!certificationToAdd) {
      return;
    }

    // 重複チェック
    if (
      assignedCertifications.find((cert) => cert.id === certificationToAdd.id)
    ) {
      showNotification("この資格は既に追加されています", "warning");
      return;
    }

    const newCertification = {
      id: certificationToAdd.id,
      name: certificationToAdd.name,
      shortName: certificationToAdd.shortName,
      organization: certificationToAdd.organization,
      department: {
        code: certificationToAdd.department.code,
        name: certificationToAdd.department.name,
      },
    };

    setAssignedCertifications((prev) => [...prev, newCertification]);
    setFormData((prev) => ({
      ...prev,
      certificationIds: [
        ...(prev.certificationIds || []),
        certificationToAdd.id,
      ],
    }));

    // リセット
    setSelectedDepartment("");
    setSelectedCertification("");
  };

  const handleRemoveCertification = (certificationId: string) => {
    setAssignedCertifications((prev) =>
      prev.filter((cert) => cert.id !== certificationId)
    );
    setFormData((prev) => ({
      ...prev,
      certificationIds: (prev.certificationIds || []).filter(
        (id) => id !== certificationId
      ),
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return (
          <SealCheck className="h-4 w-4 text-green-600" weight="regular" />
        );
      case "inactive":
        return (
          <UserGear className="h-4 w-4 text-yellow-600" weight="regular" />
        );
      case "retired":
        return <UserMinus className="h-4 w-4 text-gray-600" weight="regular" />;
      default:
        return <User className="h-4 w-4" weight="regular" />;
    }
  };

  return (
    <Drawer onClose={onClose} open={isOpen}>
      <DrawerContent className="flex h-[90vh] flex-col">
        <DrawerHeader className="flex-shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" weight="regular" />
            {instructor ? "インストラクター編集" : "新規インストラクター"}
          </DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* 基本情報 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <Info className="h-4 w-4" weight="regular" />
                基本情報
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="lastName">
                    姓 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="w-full"
                    id="lastName"
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    placeholder="田中"
                    required
                    type="text"
                    value={formData.lastName}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="firstName">
                    名 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="w-full"
                    id="firstName"
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    placeholder="太郎"
                    required
                    type="text"
                    value={formData.firstName}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="lastNameKana">
                    セイ（カタカナ）
                  </Label>
                  <Input
                    className="w-full"
                    id="lastNameKana"
                    onChange={(e) =>
                      setFormData({ ...formData, lastNameKana: e.target.value })
                    }
                    placeholder="タナカ"
                    type="text"
                    value={formData.lastNameKana}
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    className="font-medium text-sm"
                    htmlFor="firstNameKana"
                  >
                    メイ（カタカナ）
                  </Label>
                  <Input
                    className="w-full"
                    id="firstNameKana"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        firstNameKana: e.target.value,
                      })
                    }
                    placeholder="タロウ"
                    type="text"
                    value={formData.firstNameKana}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ステータス */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                {getStatusIcon(formData.status)}
                ステータス
              </div>

              <RadioGroup
                className="grid grid-cols-1 gap-4 md:grid-cols-3"
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as "active" | "inactive" | "retired",
                  })
                }
                value={formData.status}
              >
                <div className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-accent">
                  <RadioGroupItem id="active" value="active" />
                  <Label
                    className="flex flex-1 cursor-pointer items-center gap-2"
                    htmlFor="active"
                  >
                    <SealCheck
                      className="h-4 w-4 text-green-600"
                      weight="regular"
                    />
                    <div>
                      <div className="font-medium">有効</div>
                      <div className="text-muted-foreground text-xs">
                        アクティブな状態
                      </div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-accent">
                  <RadioGroupItem id="inactive" value="inactive" />
                  <Label
                    className="flex flex-1 cursor-pointer items-center gap-2"
                    htmlFor="inactive"
                  >
                    <UserGear
                      className="h-4 w-4 text-yellow-600"
                      weight="regular"
                    />
                    <div>
                      <div className="font-medium">休止</div>
                      <div className="text-muted-foreground text-xs">
                        一時的に休止中
                      </div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-accent">
                  <RadioGroupItem id="retired" value="retired" />
                  <Label
                    className="flex flex-1 cursor-pointer items-center gap-2"
                    htmlFor="retired"
                  >
                    <UserMinus
                      className="h-4 w-4 text-gray-600"
                      weight="regular"
                    />
                    <div>
                      <div className="font-medium">退職</div>
                      <div className="text-muted-foreground text-xs">
                        退職済み
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* 保有資格 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <SealCheck className="h-4 w-4" weight="regular" />
                保有資格
              </div>

              {/* 資格追加セクション */}
              <div className="rounded-lg border border-gray-300 border-dashed bg-gray-50 p-4">
                {/* PC: 1行配置, モバイル: 縦積み */}
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="md:w-40">
                    <Label className="font-medium text-sm">部門</Label>
                    <select
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary"
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      value={selectedDepartment}
                    >
                      <option value="">選択</option>
                      <option value="ski">🎿 スキー</option>
                      <option value="snowboard">🏂 スノーボード</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <Label className="font-medium text-sm">資格を選択</Label>
                    <select
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                      disabled={!selectedDepartment}
                      onChange={(e) => setSelectedCertification(e.target.value)}
                      value={selectedCertification}
                    >
                      <option value="">
                        {selectedDepartment
                          ? "資格を選択してください"
                          : "部門を選択してから資格を選んでください"}
                      </option>
                      {getFilteredCertifications().map((cert) => (
                        <option key={cert.id} value={cert.id}>
                          {cert.shortName || cert.name} ({cert.organization})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="md:mb-0"
                    disabled={!selectedCertification}
                    onClick={handleAddCertification}
                    type="button"
                  >
                    追加
                  </Button>
                </div>
              </div>

              {/* 保有資格一覧 */}
              {isLoadingCertifications ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    資格を読み込み中...
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedCertifications.length > 0 ? (
                    assignedCertifications.map((cert) => {
                      const deptCode = cert.department.code.toLowerCase();

                      return (
                        <div
                          className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
                          key={cert.id}
                        >
                          <div className="flex items-center gap-3">
                            <DepartmentIcon
                              className={`h-4 w-4 ${
                                deptCode === "ski"
                                  ? "text-ski-600 dark:text-ski-400"
                                  : "text-snowboard-600 dark:text-snowboard-400"
                              }`}
                              code={cert.department.code}
                            />
                            <div>
                              <div className="font-medium text-sm">
                                {cert.shortName || cert.name}
                              </div>
                              <div className="text-gray-600 text-xs">
                                {cert.organization}
                              </div>
                            </div>
                          </div>
                          <Button
                            className="text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleRemoveCertification(cert.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <title>削除</title>
                              <path
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                            </svg>
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-4 text-center text-muted-foreground">
                      資格が登録されていません
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* 備考 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <Info className="h-4 w-4" weight="regular" />
                備考
              </div>

              <div className="space-y-2">
                <Textarea
                  className="min-h-[80px] resize-none"
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="その他の特記事項があれば入力してください"
                  value={formData.notes}
                />
              </div>
            </div>
          </form>
        </ScrollArea>

        <DrawerFooter className="flex-shrink-0">
          <div className="flex w-full gap-2">
            <DrawerClose asChild className="flex-1">
              <Button disabled={isSubmitting} variant="outline">
                キャンセル
              </Button>
            </DrawerClose>
            <Button
              className="flex-1"
              disabled={
                isSubmitting ||
                !formData.lastName.trim() ||
                !formData.firstName.trim()
              }
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
