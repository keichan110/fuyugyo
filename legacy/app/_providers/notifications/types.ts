export type NotificationType = "success" | "error" | "warning" | "info";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type Notification = {
  id: string;
  type: NotificationType;
  title?: string | undefined;
  message: string;
  duration?: number | undefined; // ms, 0で手動削除のみ
  dismissible?: boolean | undefined;
  priority?: NotificationPriority | undefined;
  persistent?: boolean | undefined; // true の場合、自動削除されない
  timestamp?: number | undefined; // 作成タイムスタンプ
  action?:
    | {
        label: string;
        onClick: () => void;
        variant?:
          | "default"
          | "destructive"
          | "outline"
          | "secondary"
          | "ghost"
          | "link"
          | undefined;
        loading?: boolean | undefined;
      }
    | undefined;
  actions?:
    | Array<{
        label: string;
        onClick: () => void;
        variant?:
          | "default"
          | "destructive"
          | "outline"
          | "secondary"
          | "ghost"
          | "link"
          | undefined;
        loading?: boolean | undefined;
        primary?: boolean | undefined;
      }>
    | undefined;
};

export type NotificationQueueConfig = {
  maxNotifications: number;
  pauseOnHover: boolean;
  preventDuplicates: boolean;
  duplicateTimeWindow: number; // ms
};
