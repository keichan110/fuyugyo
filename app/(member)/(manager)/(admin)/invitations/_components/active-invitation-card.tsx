"use client";

import { Calendar, CheckCircle, Copy, Plus } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isInvitationExpired } from "../_lib/invitation-utils";
import type { InvitationTokenWithStats } from "../_lib/types";

/** クリップボードコピー成功表示のタイムアウト（ミリ秒） */
const CLIPBOARD_SUCCESS_TIMEOUT_MS = 2000;

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
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = useCallback(async () => {
    if (!invitation) {
      return;
    }

    try {
      const baseUrl = window.location.origin;
      const invitationUrl = `${baseUrl}/login?invite=${encodeURIComponent(invitation.token)}`;

      await navigator.clipboard.writeText(invitationUrl);

      setCopied(true);
      window.setTimeout(() => setCopied(false), CLIPBOARD_SUCCESS_TIMEOUT_MS);
    } catch {
      // Clipboard write may fail due to browser permissions or security context
      // Silently ignore the error as this is a non-critical feature
    }
  }, [invitation]);

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

  // SSR対応: 表示用には相対パスのみを使用し、完全なURLはコピー時に生成
  const invitationPath = `/login?invite=${encodeURIComponent(invitation.token)}`;
  const expiresAtDate = invitation.expiresAt
    ? new Date(invitation.expiresAt)
    : null;
  const isExpired = isInvitationExpired(invitation);

  return (
    <Card
      className={`border-2 ${
        isExpired
          ? "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-900/10"
          : "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10"
      }`}
    >
      <CardContent className="space-y-6 p-6 md:p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-bold text-xl md:text-2xl">
                {isExpired ? "期限切れの招待" : "現在有効な招待"}
              </h2>
              {!isExpired && (
                <div className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-700 text-xs dark:bg-green-900/30 dark:text-green-300">
                  有効
                </div>
              )}
              {isExpired && (
                <div className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-700 text-xs dark:bg-red-900/30 dark:text-red-300">
                  期限切れ
                </div>
              )}
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
              {expiresAtDate
                ? format(expiresAtDate, "yyyy年MM月dd日 HH:mm", { locale: ja })
                : "無期限"}
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
              <p className="truncate font-mono text-sm">{invitationPath}</p>
            </div>
            <Button
              className="shrink-0 gap-2"
              onClick={handleCopyUrl}
              size="default"
              variant={copied ? "outline" : "default"}
            >
              {copied ? (
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
