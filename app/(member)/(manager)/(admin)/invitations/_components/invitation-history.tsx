"use client";

import {
  Calendar,
  CalendarX,
  CaretDown,
  CaretUp,
  Eye,
  EyeSlash,
  UserCheck,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InvitationTokenWithStats } from "../_lib/types";

type InvitationHistoryProps = {
  invitations: InvitationTokenWithStats[];
  onOpenDetail: (invitation: InvitationTokenWithStats) => void;
};

type InvitationStatus = "active" | "expired" | "inactive";

function getInvitationStatus(
  invitation: InvitationTokenWithStats
): InvitationStatus {
  if (!invitation.isActive) {
    return "inactive";
  }

  if (
    invitation.expiresAt &&
    new Date(invitation.expiresAt).getTime() < Date.now()
  ) {
    return "expired";
  }

  return "active";
}

const STATUS_CONFIG = {
  active: {
    icon: UserCheck,
    label: "有効",
    iconClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  expired: {
    icon: CalendarX,
    label: "期限切れ",
    iconClass: "text-red-600 dark:text-red-400",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  inactive: {
    icon: EyeSlash,
    label: "使用済み",
    iconClass: "text-gray-600 dark:text-gray-400",
    badgeClass:
      "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  },
} satisfies Record<
  InvitationStatus,
  {
    icon: typeof UserCheck;
    label: string;
    iconClass: string;
    badgeClass: string;
  }
>;

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
  onOpenDetail,
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
          <Eye className="h-4 w-4" weight="regular" />
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
            const status = getInvitationStatus(invitation);
            const config = STATUS_CONFIG[status];
            const StatusIcon = config.icon;

            return (
              <Card
                className="cursor-pointer transition-colors hover:bg-muted/50"
                key={invitation.token}
                onClick={() => onOpenDetail(invitation)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <StatusIcon
                        className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconClass}`}
                        weight="regular"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm">
                            {invitation.description || "説明なし"}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium text-xs ${config.badgeClass}`}
                          >
                            {config.label}
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
