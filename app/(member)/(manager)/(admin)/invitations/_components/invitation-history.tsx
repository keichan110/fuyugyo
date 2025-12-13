"use client";

import { Calendar, CalendarX, CaretDown, CaretUp } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getInvitationStatusLabel } from "../_lib/invitation-utils";
import type { InvitationTokenWithStats } from "../_lib/types";

type InvitationHistoryProps = {
  invitations: InvitationTokenWithStats[];
};

/**
 * 過去の招待履歴を表示する折りたたみ可能なコンポーネント
 *
 * @description
 * 過去に作成された招待を時系列で表示します。
 * デフォルトで折りたたまれており、クリックで展開できます。
 *
 * @component
 */
export default function InvitationHistory({
  invitations,
}: InvitationHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (invitations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Button
        className="w-full justify-between gap-2"
        onClick={() => setIsExpanded(!isExpanded)}
        variant="outline"
      >
        <div className="flex items-center gap-2">
          <span>過去の招待履歴</span>
          <span className="text-muted-foreground text-sm">
            ({invitations.length}件)
          </span>
        </div>
        {isExpanded ? (
          <CaretUp className="h-4 w-4" weight="bold" />
        ) : (
          <CaretDown className="h-4 w-4" weight="bold" />
        )}
      </Button>

      {isExpanded && (
        <div className="space-y-2">
          {invitations.map((invitation) => {
            const statusLabel = getInvitationStatusLabel(invitation);

            return (
              <Card key={invitation.token}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm">
                            {invitation.description || "説明なし"}
                          </p>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 text-xs dark:bg-gray-900/30 dark:text-gray-300">
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar
                              className="h-3.5 w-3.5"
                              weight="regular"
                            />
                            作成:{" "}
                            {format(
                              new Date(invitation.createdAt),
                              "yyyy/MM/dd",
                              { locale: ja }
                            )}
                          </div>
                          {invitation.expiresAt && (
                            <div className="flex items-center gap-1">
                              <CalendarX
                                className="h-3.5 w-3.5"
                                weight="regular"
                              />
                              期限:{" "}
                              {format(
                                new Date(invitation.expiresAt),
                                "yyyy/MM/dd",
                                { locale: ja }
                              )}
                            </div>
                          )}
                          <div>使用回数: {invitation.usageCount}回</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
