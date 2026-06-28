import { useCallback } from "react";
import { useNotificationContext } from "./notification-provider";
import type {
  Notification,
  NotificationPriority,
  NotificationType,
} from "./types";

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

export function useNotification() {
  const { dispatch } = useNotificationContext();

  const showNotification = useCallback(
    (
      message: string,
      type: NotificationType,
      options?: {
        title?: string;
        duration?: number;
        dismissible?: boolean;
        priority?: NotificationPriority;
        persistent?: boolean;
        action?: {
          label: string;
          onClick: () => void;
          variant?:
            | "default"
            | "destructive"
            | "outline"
            | "secondary"
            | "ghost"
            | "link";
          loading?: boolean;
        };
        actions?: Array<{
          label: string;
          onClick: () => void;
          variant?:
            | "default"
            | "destructive"
            | "outline"
            | "secondary"
            | "ghost"
            | "link";
          loading?: boolean;
          primary?: boolean;
        }>;
      }
    ) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const duration = options?.duration ?? DEFAULT_DURATIONS[type];

      const notification: Notification = {
        id,
        type,
        message,
        duration,
        dismissible: options?.dismissible ?? true,
        priority: options?.priority || "normal",
        persistent: options?.persistent,
        ...(options?.title && { title: options.title }),
        ...(options?.action && { action: options.action }),
        ...(options?.actions && { actions: options.actions }),
      };

      dispatch({ type: "ADD_NOTIFICATION", payload: notification });

      return id;
    },
    [dispatch]
  );

  const hideNotification = useCallback(
    (id: string) => {
      dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
    },
    [dispatch]
  );

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, [dispatch]);

  const pauseQueue = useCallback(() => {
    dispatch({ type: "PAUSE_QUEUE" });
  }, [dispatch]);

  const resumeQueue = useCallback(() => {
    dispatch({ type: "RESUME_QUEUE" });
  }, [dispatch]);

  // 便利なヘルパー関数
  const showSuccess = useCallback(
    (
      message: string,
      options?: Omit<Parameters<typeof showNotification>[2], "type">
    ) => showNotification(message, "success", options),
    [showNotification]
  );

  const showError = useCallback(
    (
      message: string,
      options?: Omit<Parameters<typeof showNotification>[2], "type">
    ) => showNotification(message, "error", options),
    [showNotification]
  );

  const showWarning = useCallback(
    (
      message: string,
      options?: Omit<Parameters<typeof showNotification>[2], "type">
    ) => showNotification(message, "warning", options),
    [showNotification]
  );

  const showInfo = useCallback(
    (
      message: string,
      options?: Omit<Parameters<typeof showNotification>[2], "type">
    ) => showNotification(message, "info", options),
    [showNotification]
  );

  return {
    showNotification,
    hideNotification,
    clearAll,
    pauseQueue,
    resumeQueue,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}
