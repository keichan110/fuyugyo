"use client";

import { Calendar, Clock, Eye, Info, Plus, Trash } from "@phosphor-icons/react";
import { addDays, addMonths, format } from "date-fns";
import { useEffect, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatDateInJST } from "../_lib/date-utils";
import type {
  InvitationFormData,
  InvitationTokenWithStats,
} from "../_lib/types";

/** デフォルト有効期限日数 */
const DEFAULT_EXPIRY_DAYS = 7;
/** 最大有効期限月数 */
const MAX_EXPIRY_MONTHS = 1;

type InvitationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: InvitationFormData) => Promise<void>;
  invitation?: InvitationTokenWithStats | null;
  onDeactivate?: (token: string) => Promise<void>;
};

/**
 * 招待フォームのバリデーション関数
 *
 * @param formData - バリデーション対象のフォームデータ
 * @param isEditing - 編集モードかどうか
 * @returns エラーメッセージ（バリデーションOKの場合はnull）
 */
function validateInvitationForm(
  formData: InvitationFormData,
  isEditing: boolean
): string | null {
  if (isEditing) {
    return "編集モードでは新しい招待を作成できません";
  }

  if (!formData.description.trim()) {
    return "説明を入力してください";
  }

  const maxExpiryDate = addMonths(new Date(), MAX_EXPIRY_MONTHS);
  if (formData.expiresAt > maxExpiryDate) {
    return "有効期限は最大1ヶ月までです";
  }

  if (formData.expiresAt <= new Date()) {
    return "有効期限は現在時刻より後に設定してください";
  }

  return null;
}

/**
 * 招待の作成・詳細表示モーダルコンポーネント
 *
 * @description
 * 新規招待の作成と既存招待の詳細表示・無効化を行うDrawerモーダルです。
 * Client Componentとして実装され、複雑なフォーム状態管理とバリデーションを提供します。
 *
 * フォーム項目（新規作成時）:
 * - 説明（必須）: 招待の目的や対象者
 * - 有効期限（必須）: 最大1ヶ月まで設定可能
 *
 * 主な機能:
 * - 新規招待の作成
 * - 既存招待の詳細表示（閲覧専用）
 * - 有効な招待の無効化（確認ダイアログ付き）
 * - バリデーション（説明必須、有効期限チェック）
 * - エラーメッセージ表示
 *
 * @component
 * @example
 * ```tsx
 * // 新規作成モード
 * <InvitationModal
 *   isOpen={true}
 *   onClose={handleClose}
 *   onSave={handleSave}
 * />
 *
 * // 詳細表示モード
 * <InvitationModal
 *   isOpen={true}
 *   onClose={handleClose}
 *   onSave={handleSave}
 *   invitation={existingInvitation}
 *   onDeactivate={handleDeactivate}
 * />
 * ```
 */
export default function InvitationModal({
  isOpen,
  onClose,
  onSave,
  invitation,
  onDeactivate,
}: InvitationModalProps) {
  const [formData, setFormData] = useState<InvitationFormData>({
    description: "",
    expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const isEditing = !!invitation;

  useEffect(() => {
    if (invitation) {
      setFormData({
        description: invitation.description || "",
        expiresAt: invitation.expiresAt
          ? new Date(invitation.expiresAt)
          : addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      });
    } else {
      setFormData({
        description: "",
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      });
    }
    setError(null);
  }, [invitation]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const validationError = validateInvitationForm(formData, isEditing);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSave(formData);

      setFormData({
        description: "",
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      });

      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "招待の作成に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!(invitation && onDeactivate)) {
      return;
    }

    if (!showConfirmDeactivate) {
      setShowConfirmDeactivate(true);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onDeactivate(invitation.token);
      onClose();
    } catch (deactivateError) {
      setError(
        deactivateError instanceof Error
          ? deactivateError.message
          : "招待の無効化に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
      setShowConfirmDeactivate(false);
    }
  };

  const handleClose = () => {
    setFormData({
      description: "",
      expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
    });
    setError(null);
    onClose();
  };

  return (
    <Drawer onOpenChange={handleClose} open={isOpen}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-7xl">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-2xl">
              {isEditing ? (
                <>
                  <Eye className="h-6 w-6" weight="regular" />
                  招待詳細
                </>
              ) : (
                <>
                  <Plus className="h-6 w-6" weight="regular" />
                  新規招待作成
                </>
              )}
            </DrawerTitle>
          </DrawerHeader>

          <ScrollArea className="h-auto max-h-[60vh] overflow-auto overflow-y-auto p-4">
            <form
              className="space-y-6"
              id="invitation-form"
              onSubmit={handleSubmit}
            >
              {error && (
                <div className="rounded-md bg-destructive/15 p-3">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Info className="h-4 w-4" weight="regular" />
                  招待情報
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      className="font-medium text-sm"
                      htmlFor="description"
                    >
                      説明 <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      className="resize-none"
                      id="description"
                      onChange={
                        isEditing
                          ? undefined
                          : (e) =>
                              setFormData({
                                ...formData,
                                description: e.target.value,
                              })
                      }
                      placeholder={
                        isEditing ? "" : "招待の目的や対象者を記入してください"
                      }
                      readOnly={isEditing}
                      required={!isEditing}
                      rows={3}
                      value={formData.description}
                    />
                    <p className="text-muted-foreground text-xs">
                      この招待が何のためのものかを分かりやすく記述してください
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Calendar className="h-4 w-4" weight="regular" />
                  有効期限設定
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-medium text-sm" htmlFor="expiresAt">
                      有効期限 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="w-full"
                      id="expiresAt"
                      max={
                        isEditing
                          ? undefined
                          : format(
                              addMonths(new Date(), MAX_EXPIRY_MONTHS),
                              "yyyy-MM-dd"
                            )
                      }
                      min={
                        isEditing ? undefined : format(new Date(), "yyyy-MM-dd")
                      }
                      onChange={
                        isEditing
                          ? undefined
                          : (e) => {
                              const date = new Date(e.target.value);
                              setFormData({ ...formData, expiresAt: date });
                            }
                      }
                      readOnly={isEditing}
                      required={!isEditing}
                      type="date"
                      value={format(formData.expiresAt, "yyyy-MM-dd")}
                    />
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      最大1ヶ月まで設定可能です
                    </div>
                  </div>

                  {/* 期限の詳細表示 */}
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/20">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="flex items-center gap-2 font-medium text-orange-900 text-sm dark:text-orange-100">
                        <Clock className="h-4 w-4" weight="regular" />
                        有効期限
                      </div>
                      <div className="font-bold text-2xl text-orange-700 dark:text-orange-300">
                        {formatDateInJST(formData.expiresAt)} 23:59まで
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
                  <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-900 text-sm dark:text-blue-100">
                    <Info className="h-4 w-4" weight="regular" />
                    招待URLについて
                  </h4>
                  <ul className="space-y-1 text-blue-800 text-xs dark:text-blue-200">
                    <li>
                      •
                      使用回数に制限はありません（期間内であれば何度でも使用可能）
                    </li>
                    <li>• 有効期限を過ぎると自動的に無効になります</li>
                    <li>• 管理者が手動で無効化することも可能です</li>
                    <li>• 招待URLは作成後にコピーできます</li>
                  </ul>
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
                  {isEditing ? "閉じる" : "キャンセル"}
                </Button>
              </DrawerClose>

              {isEditing ? (
                invitation?.isActive && (
                  <Button
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={handleDeactivate}
                    type="button"
                    variant="destructive"
                  >
                    {(() => {
                      if (isSubmitting) {
                        return (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            無効化中...
                          </>
                        );
                      }
                      if (showConfirmDeactivate) {
                        return (
                          <>
                            <Trash className="mr-2 h-4 w-4" weight="regular" />
                            本当に無効化しますか？
                          </>
                        );
                      }
                      return (
                        <>
                          <Trash className="mr-2 h-4 w-4" weight="regular" />
                          無効化
                        </>
                      );
                    })()}
                  </Button>
                )
              ) : (
                <Button
                  className="flex-1"
                  disabled={isSubmitting || !formData.description.trim()}
                  form="invitation-form"
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      作成中...
                    </>
                  ) : (
                    "作成"
                  )}
                </Button>
              )}
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
