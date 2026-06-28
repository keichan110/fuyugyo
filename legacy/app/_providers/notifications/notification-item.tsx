"use client";

import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification } from "./types";
import { useNotification } from "./use-notification";
import { useNotificationTimer } from "./use-notification-timer";

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success:
    "border-green-200 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100",
  error:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  warning:
    "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100",
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
};

const ICON_COLORS = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  info: "text-blue-600 dark:text-blue-400",
};

const PRIORITY_STYLES = {
  urgent: "ring-2 ring-red-500 ring-opacity-50",
  high: "ring-1 ring-orange-400 ring-opacity-30",
  normal: "",
  low: "opacity-90",
};

// アニメーション・プログレス関連の定数
const ANIMATION_DURATION_MS = 200;
const _PROGRESS_UPDATE_INTERVAL_MS = 50;
const PROGRESS_PERCENT_BASE = 100;

// プログレスバーコンポーネント
function ProgressBar({
  duration,
  persistent,
  progress,
  type,
}: {
  duration: number | undefined;
  persistent: boolean | undefined;
  progress: number;
  type: "success" | "error" | "warning" | "info";
}) {
  if (!duration || duration <= 0 || persistent) {
    return null;
  }

  return (
    <div className="absolute right-0 bottom-0 left-0 h-1 overflow-hidden rounded-b-lg bg-black/10 dark:bg-white/10">
      <div
        className={cn(
          "h-full transition-all duration-100 ease-linear",
          type === "success" && "bg-green-500",
          type === "error" && "bg-red-500",
          type === "warning" && "bg-yellow-500",
          type === "info" && "bg-blue-500"
        )}
        style={{ width: `${PROGRESS_PERCENT_BASE - progress}%` }}
      />
    </div>
  );
}

// アクションボタンコンポーネント
function ActionButtons({
  action,
  actions,
}: {
  action?: Notification["action"];
  actions?: Notification["actions"];
}) {
  if (action && !actions) {
    return (
      <div className="mt-3">
        <Button
          className="h-7 px-2 text-xs transition-transform duration-150 hover:scale-105"
          disabled={action.loading}
          onClick={action.onClick}
          size="sm"
          variant={action.variant || "outline"}
        >
          {action.loading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            action.label
          )}
        </Button>
      </div>
    );
  }

  if (actions && actions.length > 0) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((act, index) => (
          <Button
            className={cn(
              "h-7 px-2 text-xs transition-transform duration-150 hover:scale-105",
              act.primary && "font-semibold"
            )}
            disabled={act.loading}
            key={`${act.label}-${act.variant || "default"}-${index}`}
            onClick={act.onClick}
            size="sm"
            variant={act.variant || (act.primary ? "default" : "outline")}
          >
            {act.loading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              act.label
            )}
          </Button>
        ))}
      </div>
    );
  }

  return null;
}

// 優先度インジケーターコンポーネント
function PriorityIndicator({
  priority,
}: {
  priority: Notification["priority"];
}) {
  if (!priority || priority === "normal") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute top-2 right-2 h-2 w-2 rounded-full",
        priority === "urgent" && "animate-ping bg-red-500",
        priority === "high" && "bg-orange-500",
        priority === "low" && "bg-gray-400"
      )}
    />
  );
}

type NotificationItemProps = {
  notification: Notification;
};

export function NotificationItem({ notification }: NotificationItemProps) {
  const { hideNotification } = useNotification();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // 安定した参照を作成してuseEffect依存配列問題を回避
  const hideNotificationRef = useRef(hideNotification);
  const notificationIdRef = useRef(notification.id);

  // refs を最新の値で更新
  hideNotificationRef.current = hideNotification;
  notificationIdRef.current = notification.id;

  const Icon = ICONS[notification.type];

  // タイマー完了時の処理
  const handleTimerComplete = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      hideNotificationRef.current(notificationIdRef.current);
    }, ANIMATION_DURATION_MS);
  }, []);

  // タイマー管理をカスタムフックに委譲
  const { progress } = useNotificationTimer({
    duration: notification.duration,
    persistent: notification.persistent,
    onComplete: handleTimerComplete,
    isPaused: false,
    isExiting,
  });

  // 手動削除ロジック
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setTimeout(() => {
      hideNotificationRef.current(notificationIdRef.current);
    }, ANIMATION_DURATION_MS);
  }, []);

  useEffect(() => {
    // アニメーション用の遅延 - 初回のみ実行
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-auto relative transform rounded-lg border shadow-lg transition-all duration-300 ease-in-out",
        "hover:scale-[1.02] hover:shadow-xl",
        STYLES[notification.type],
        PRIORITY_STYLES[notification.priority || "normal"],
        isVisible && !isExiting
          ? "translate-x-0 scale-100 opacity-100"
          : "translate-x-full scale-95 opacity-0"
      )}
    >
      {/* プログレスバー */}
      <ProgressBar
        duration={notification.duration}
        persistent={notification.persistent}
        progress={progress}
        type={notification.type}
      />

      <div
        aria-live={notification.type === "error" ? "assertive" : "polite"}
        className="p-4"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <Icon
            className={cn(
              "mt-0.5 h-5 w-5 flex-shrink-0 transition-transform duration-200",
              ICON_COLORS[notification.type],
              notification.priority === "urgent" && "animate-pulse"
            )}
          />

          <div className="min-w-0 flex-1">
            {notification.title && (
              <h4 className="mb-1 font-semibold text-sm">
                {notification.title}
              </h4>
            )}
            <p className="text-sm">{notification.message}</p>

            {/* アクションボタン */}
            <ActionButtons
              action={notification.action}
              actions={notification.actions}
            />
          </div>

          {notification.dismissible && (
            <button
              aria-label="通知を閉じる"
              className={cn(
                "flex-shrink-0 rounded-full p-1 transition-all duration-150",
                "hover:scale-110 hover:bg-black/10 dark:hover:bg-white/10",
                "focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              )}
              onClick={handleDismiss}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 優先度インジケーター */}
      <PriorityIndicator priority={notification.priority} />
    </div>
  );
}
