"use client";

import type React from "react";
import { createContext, useContext, useReducer } from "react";
import { createPortal } from "react-dom";
import { NotificationContainer } from "./notification-container";
import type { Notification, NotificationQueueConfig } from "./types";

type NotificationState = {
  notifications: Notification[];
  paused: boolean;
  config: NotificationQueueConfig;
};

type NotificationAction =
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "REMOVE_NOTIFICATION"; payload: string }
  | { type: "CLEAR_ALL" }
  | { type: "PAUSE_QUEUE" }
  | { type: "RESUME_QUEUE" }
  | { type: "UPDATE_CONFIG"; payload: Partial<NotificationQueueConfig> };

const NotificationContext = createContext<{
  state: NotificationState;
  dispatch: React.Dispatch<NotificationAction>;
} | null>(null);

// 優先度の数値変換（高いほど優先）
const getPriorityValue = (priority = "normal"): number => {
  const priorities = { low: 1, normal: 2, high: 3, urgent: 4 };
  return priorities[priority as keyof typeof priorities] || 2;
};

// 重複チェック
const isDuplicate = (
  notifications: Notification[],
  newNotification: Notification,
  timeWindow: number
): boolean => {
  const now = newNotification.timestamp || Date.now();
  return notifications.some(
    (n) =>
      n.message === newNotification.message &&
      n.type === newNotification.type &&
      (n.timestamp || 0) > now - timeWindow
  );
};

const notificationReducer = (
  state: NotificationState,
  action: NotificationAction
): NotificationState => {
  switch (action.type) {
    case "ADD_NOTIFICATION": {
      const notification = {
        ...action.payload,
        timestamp: action.payload.timestamp || Date.now(),
        priority: action.payload.priority || "normal",
      };

      // 重複チェック
      if (
        state.config.preventDuplicates &&
        isDuplicate(
          state.notifications,
          notification,
          state.config.duplicateTimeWindow
        )
      ) {
        return state;
      }

      let newNotifications = [...state.notifications, notification];

      // 優先度でソート（urgent > high > normal > low）
      newNotifications.sort((a, b) => {
        const priorityDiff =
          getPriorityValue(b.priority) - getPriorityValue(a.priority);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        // 同じ優先度の場合はタイムスタンプで新しい順
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      // 最大件数制限
      if (newNotifications.length > state.config.maxNotifications) {
        // persistent=true の通知は削除しない
        const removableNotifications = newNotifications.filter(
          (n) => !n.persistent
        );
        const removeCount =
          newNotifications.length - state.config.maxNotifications;

        if (removeCount > 0 && removableNotifications.length >= removeCount) {
          // 優先度が低く、古いものから削除
          removableNotifications.sort((a, b) => {
            const priorityDiff =
              getPriorityValue(a.priority) - getPriorityValue(b.priority);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }
            return (a.timestamp || 0) - (b.timestamp || 0);
          });

          const toRemove = removableNotifications.slice(0, removeCount);
          newNotifications = newNotifications.filter(
            (n) => !toRemove.some((r) => r.id === n.id)
          );
        }
      }

      return {
        ...state,
        notifications: newNotifications,
      };
    }
    case "REMOVE_NOTIFICATION":
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => n.id !== action.payload
        ),
      };
    case "CLEAR_ALL":
      return {
        ...state,
        notifications: [],
      };
    case "PAUSE_QUEUE":
      return {
        ...state,
        paused: true,
      };
    case "RESUME_QUEUE":
      return {
        ...state,
        paused: false,
      };
    case "UPDATE_CONFIG":
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };
    default:
      return state;
  }
};

const defaultConfig: NotificationQueueConfig = {
  maxNotifications: 5,
  pauseOnHover: true,
  preventDuplicates: true,
  duplicateTimeWindow: 5000, // 5秒
};

export function NotificationProvider({
  children,
  config = defaultConfig,
}: {
  children: React.ReactNode;
  config?: Partial<NotificationQueueConfig>;
}) {
  const [state, dispatch] = useReducer(notificationReducer, {
    notifications: [],
    paused: false,
    config: { ...defaultConfig, ...config },
  });

  return (
    <NotificationContext.Provider value={{ state, dispatch }}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(<NotificationContainer />, document.body)}
    </NotificationContext.Provider>
  );
}

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotificationContext must be used within NotificationProvider"
    );
  }
  return context;
};
