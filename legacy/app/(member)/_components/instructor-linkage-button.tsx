"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { InstructorBasicInfo } from "@/types/actions";
import { InstructorSelectModal } from "./instructor-select-modal";

type InstructorLinkageButtonProps = {
  instructors: InstructorBasicInfo[];
  onSuccessAction: () => void;
};

/**
 * インストラクター紐付けモーダルを開くボタンコンポーネント
 *
 * @description
 * インストラクター情報を設定するためのモーダル（InstructorSelectModal）を開くボタンを提供します。
 * 認証ユーザーとインストラクターマスタを紐づける際に使用されます。
 * モーダルの開閉状態を管理し、紐付け成功時にコールバックを実行します。
 *
 * @component
 * @example
 * ```tsx
 * <InstructorLinkageButton
 *   instructors={availableInstructors}
 *   onSuccessAction={() => router.refresh()}
 * />
 * ```
 */
export function InstructorLinkageButton({
  instructors,
  onSuccessAction,
}: InstructorLinkageButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Button
        className="gap-2"
        onClick={() => setModalOpen(true)}
        variant="outline"
      >
        設定
      </Button>

      <InstructorSelectModal
        instructors={instructors}
        onOpenChange={setModalOpen}
        onSuccess={onSuccessAction}
        open={modalOpen}
      />
    </>
  );
}
