/**
 * 招待管理API クライアント
 *
 * 注意: 主なデータ取得はServer Componentsで行います（_lib/data.ts参照）
 * このファイルは特定のClient Component用のAPI呼び出しのみを含みます
 */

import { HTTP_STATUS_NOT_FOUND } from "@/constants/http-status";
import type { InvitationApiResponse, InvitationTokenWithStats } from "./types";

const API_BASE_URL = "/api/auth/invitations";

export async function checkActiveInvitation(): Promise<InvitationTokenWithStats | null> {
  const response = await fetch(`${API_BASE_URL}/active`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === HTTP_STATUS_NOT_FOUND) {
      return null;
    }
    throw new Error(`有効な招待のチェックに失敗しました: ${response.status}`);
  }

  const result: InvitationApiResponse<{
    token: string;
    description: string;
    expiresAt: string;
    isActive: boolean;
    maxUses: number | null;
    usageCount: number;
    remainingUses: number;
    createdAt: string;
    createdBy: string;
  }> = await response.json();

  if (!result.success) {
    throw new Error(result.error || "有効な招待のチェックに失敗しました");
  }

  // データがそのまま正しい型なので、そのまま返す
  return result.data || null;
}
