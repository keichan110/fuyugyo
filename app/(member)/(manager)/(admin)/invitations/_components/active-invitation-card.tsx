"use client";

import { Calendar, CheckCircle, Copy, Plus } from "@phosphor-icons/react";
import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeInJST } from "../_lib/date-utils";
import { isInvitationExpired } from "../_lib/invitation-utils";
import type { InvitationTokenWithStats } from "../_lib/types";

/** クリップボードコピー成功表示のタイムアウト（ミリ秒） */
const CLIPBOARD_SUCCESS_TIMEOUT_MS = 2000;

type CopyStatus = "idle" | "copied" | "error";

type ActiveInvitationCardProps = {
  invitation: InvitationTokenWithStats | null;
  onCreateNew: () => void;
};

/**
 * 現在有効な招待を表示するHeroカードコンポーネント
 *
 * @description
 * 有効な招待が存在する場合、詳細情報と招待URLコピー機能を提供します。
 * 有効な招待が存在しない場合、新規作成を促すメッセージを表示します。
 *
 * @component
 */
export default function ActiveInvitationCard({
  invitation,
  onCreateNew,
}: ActiveInvitationCardProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [fullUrl, setFullUrl] = useState("");

  // クライアント側でフルURLを生成（SSR対応）
  useEffect(() => {
    if (invitation) {
      const baseUrl = window.location.origin;
      const invitationUrl = `${baseUrl}/login?invite=${encodeURIComponent(invitation.token)}`;
      setFullUrl(invitationUrl);
    }
  }, [invitation]);

  const handleCopyUrl = useCallback(async () => {
    if (!fullUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyStatus("copied");
    } catch {
      // Clipboard APIはHTTPS環境やブラウザ権限が必要なため失敗する可能性がある
      setCopyStatus("error");
    }
  }, [fullUrl]);

  // copyStatusの自動リセット（クリーンアップ対応）
  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timerId = setTimeout(
      () => setCopyStatus("idle"),
      CLIPBOARD_SUCCESS_TIMEOUT_MS
    );
    return () => clearTimeout(timerId);
  }, [copyStatus]);

  if (!invitation) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-12">
          <div className="rounded-full bg-muted p-6">
            <Plus
              className="h-12 w-12 text-muted-foreground"
              weight="regular"
            />
          </div>
          <div className="text-center">
            <h2 className="mb-2 font-semibold text-lg">
              有効な招待が作成されていません
            </h2>
            <p className="mb-4 text-muted-foreground text-sm">
              新しい招待を作成して、メンバーを招待しましょう
            </p>
            <Button className="gap-2" onClick={onCreateNew} size="lg">
              <Plus className="h-5 w-5" weight="regular" />
              新しい招待を作成
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const expiresAtDate = invitation.expiresAt
    ? new Date(invitation.expiresAt)
    : null;
  const isExpired = isInvitationExpired(invitation);

  // SSR時の相対パス（初回レンダリング用フォールバック）
  const invitationPath = `/login?invite=${encodeURIComponent(invitation.token)}`;
  // クライアント側で生成されたフルURL、またはSSR時のフォールバック
  const displayUrl = fullUrl || invitationPath;

  return (
    <Card
      className={clsx(
        "border-2",
        isExpired
          ? "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-900/10"
          : "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10"
      )}
    >
      <CardContent className="space-y-6 p-6 md:p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-bold text-xl md:text-2xl">
                {isExpired ? "期限切れの招待" : "現在有効な招待"}
              </h2>
              <div
                className={clsx(
                  "rounded-full px-2 py-1 font-medium text-xs",
                  isExpired
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                )}
              >
                {isExpired ? "期限切れ" : "有効"}
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {invitation.description || "説明なし"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" weight="regular" />
              有効期限
            </div>
            <p className="font-medium text-foreground">
              {expiresAtDate ? formatDateTimeInJST(expiresAtDate) : "無期限"}
            </p>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground text-sm">使用回数</div>
            <p className="font-medium text-foreground">
              {invitation.usageCount}回
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">招待URL</div>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2">
              <p className="truncate font-mono text-sm">{displayUrl}</p>
            </div>
            <Button
              className="shrink-0 gap-2"
              onClick={handleCopyUrl}
              size="default"
              variant={copyStatus === "copied" ? "outline" : "default"}
            >
              {copyStatus === "copied" ? (
                <>
                  <CheckCircle className="h-4 w-4" weight="fill" />
                  コピー完了
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" weight="regular" />
                  URLコピー
                </>
              )}
            </Button>
          </div>
          {copyStatus === "error" && (
            <p className="text-red-600 text-sm dark:text-red-400">
              URLのコピーに失敗しました。手動でURLをコピーしてください。
            </p>
          )}
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button className="gap-2" onClick={onCreateNew} variant="outline">
            <Plus className="h-4 w-4" weight="regular" />
            新しい招待を作成
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
