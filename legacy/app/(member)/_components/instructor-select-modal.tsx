"use client";

import { useEffect, useState, useTransition } from "react";
import {
  linkMyInstructor,
  unlinkMyInstructor,
} from "@/app/(member)/_actions/instructor-linkage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InstructorBasicInfo } from "@/types/actions";

type InstructorSelectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructors: InstructorBasicInfo[];
  onSuccess: () => void;
  /** 現在紐づけられているインストラクターID (紐付け解除ボタンの表示制御に使用) */
  currentInstructorId?: string | null;
};

/**
 * インストラクター選択・紐付けモーダルコンポーネント
 *
 * @description
 * 認証ユーザーとインストラクターマスタを紐づけるためのモーダルダイアログです。
 * インストラクター一覧から選択し、紐付けを実行できます。
 * 既に紐付けられている場合は紐付け解除ボタンも表示されます。
 *
 * 主な機能:
 * - インストラクターの検索・選択（姓名・かな表示）
 * - 紐付け実行（linkMyInstructor Server Action呼び出し）
 * - 紐付け解除（unlinkMyInstructor Server Action呼び出し）
 * - エラーメッセージの表示
 * - 処理中の状態管理（useTransition使用）
 *
 * @component
 * @example
 * ```tsx
 * <InstructorSelectModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   instructors={instructorList}
 *   onSuccess={() => router.refresh()}
 *   currentInstructorId={123}
 * />
 * ```
 */
export function InstructorSelectModal({
  open,
  onOpenChange,
  instructors,
  onSuccess,
  currentInstructorId,
}: InstructorSelectModalProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // モーダルが開いたときに現在のインストラクターIDをセット
  useEffect(() => {
    if (open && currentInstructorId) {
      setSelectedId(currentInstructorId);
    } else if (open && !currentInstructorId) {
      setSelectedId("");
    }
  }, [open, currentInstructorId]);

  // 成功時の共通処理
  const handleSuccess = () => {
    onSuccess();
    onOpenChange(false);
    setSelectedId("");
    setErrorMessage(null);
  };

  const handleSubmit = () => {
    if (!selectedId) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const result = await linkMyInstructor(selectedId);

      if (result.success) {
        handleSuccess();
      } else {
        setErrorMessage(result.error);
      }
    });
  };

  const handleUnlink = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await unlinkMyInstructor();

      if (result.success) {
        handleSuccess();
      } else {
        setErrorMessage(result.error);
      }
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>インストラクター情報の設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* インストラクター選択プルダウン */}
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="instructor-select">
              インストラクターを選択
            </label>
            <Select onValueChange={setSelectedId} value={selectedId}>
              <SelectTrigger id="instructor-select">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.lastName} {instructor.firstName}
                    {instructor.lastNameKana && (
                      <span className="text-muted-foreground text-sm">
                        {" "}
                        ({instructor.lastNameKana} {instructor.firstNameKana})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* エラーメッセージ */}
          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {errorMessage}
            </div>
          )}

          {/* アクション */}
          <div className="flex items-center justify-between gap-2">
            {/* 紐付け解除ボタン (現在紐づけられている場合のみ表示) */}
            {currentInstructorId ? (
              <Button
                disabled={isPending}
                onClick={handleUnlink}
                variant="destructive"
              >
                {isPending ? "解除中..." : "紐付けを解除"}
              </Button>
            ) : (
              <div /> // スペーサー
            )}

            {/* キャンセル・保存ボタン */}
            <div className="flex gap-2">
              <Button
                disabled={isPending}
                onClick={() => {
                  onOpenChange(false);
                  setSelectedId(""); // リセット
                }}
                variant="outline"
              >
                キャンセル
              </Button>
              <Button
                disabled={!selectedId || isPending}
                onClick={handleSubmit}
              >
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
