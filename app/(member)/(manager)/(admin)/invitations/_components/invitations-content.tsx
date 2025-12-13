"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  createInvitationAction,
  deleteInvitationAction,
} from "../_lib/actions";
import { isInvitationValid } from "../_lib/invitation-utils";
import type {
  InvitationFormData,
  InvitationTokenWithStats,
} from "../_lib/types";
import ActiveInvitationCard from "./active-invitation-card";
import InvitationHistory from "./invitation-history";
import InvitationModal from "./invitation-modal";

type InvitationsContentProps = {
  initialData: InvitationTokenWithStats[];
};

/**
 * 招待を作成日時の降順でソートする関数
 *
 * @param invitations - ソート対象の招待配列
 * @returns ソート済みの招待配列（新しいものが先）
 */
function sortInvitations(
  invitations: InvitationTokenWithStats[]
): InvitationTokenWithStats[] {
  return [...invitations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * 有効な招待を取得する関数
 *
 * @param invitations - 招待配列
 * @returns 有効な招待、または null
 */
function getActiveInvitation(
  invitations: InvitationTokenWithStats[]
): InvitationTokenWithStats | null {
  return (
    invitations.find((invitation) => isInvitationValid(invitation)) ?? null
  );
}

/**
 * 招待管理画面のメインコンテンツコンポーネント
 *
 * @description
 * 招待トークンの一覧表示、作成、管理を行うClient Componentです。
 * Server Componentから渡された初期データを表示し、アクティブな招待と履歴を分けて表示します。
 *
 * 主な機能:
 * - アクティブな招待をHeroカードで表示
 * - 過去の招待を折りたたみ可能な履歴セクションで表示
 * - 新規作成モーダルの管理
 * - Server Actionsによる作成・無効化（既存の有効な招待は自動的に置き換え）
 * - ページリフレッシュ（router.refresh）による最新データ取得
 * - useMemoによる計算結果のメモ化（パフォーマンス最適化）
 *
 * @component
 * @example
 * ```tsx
 * <InvitationsContent
 *   initialData={invitations}
 * />
 * ```
 */
export default function InvitationsContent({
  initialData,
}: InvitationsContentProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvitation, setEditingInvitation] =
    useState<InvitationTokenWithStats | null>(null);

  const sortedInvitations = useMemo(
    () => sortInvitations(initialData),
    [initialData]
  );

  const activeInvitation = useMemo(
    () => getActiveInvitation(sortedInvitations),
    [sortedInvitations]
  );

  const historicalInvitations = useMemo(
    () =>
      sortedInvitations.filter(
        (invitation) => invitation.token !== activeInvitation?.token
      ),
    [sortedInvitations, activeInvitation]
  );

  const handleOpenModal = useCallback(
    (invitation?: InvitationTokenWithStats) => {
      setEditingInvitation(invitation ?? null);
      setIsModalOpen(true);
    },
    []
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingInvitation(null);
  }, []);

  const handleSave = useCallback(
    async (formData: InvitationFormData) => {
      const requestData = {
        description: formData.description,
        expiresAt: formData.expiresAt.toISOString(),
        role: "MEMBER" as const,
      };

      const result = await createInvitationAction(requestData);

      if (!result.success) {
        throw new Error(result.error || "Failed to create invitation");
      }

      // Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
    },
    [router]
  );

  const handleDeactivate = useCallback(
    async (token: string) => {
      const result = await deleteInvitationAction(token);

      if (!result.success) {
        throw new Error(result.error || "Failed to delete invitation");
      }

      // Close modal and refresh data
      setIsModalOpen(false);
      setEditingInvitation(null);

      // Server Componentを再実行してサーバーから最新データを取得
      router.refresh();
    },
    [router]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 font-bold text-2xl text-foreground md:text-3xl">
              招待管理
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              新規メンバー招待用URLの作成・管理を行います
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 md:mb-8">
        <ActiveInvitationCard
          invitation={activeInvitation}
          onCreateNew={() => handleOpenModal()}
        />
      </div>

      <InvitationHistory invitations={historicalInvitations} />

      <InvitationModal
        invitation={editingInvitation}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDeactivate={handleDeactivate}
        onSave={handleSave}
      />
    </div>
  );
}
