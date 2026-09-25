export const NOTIFICATION_TYPES = ["system"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actionPath: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  requestId: number;
};

export const INITIAL_NOTIFICATION_ACTION_STATE: NotificationActionState = {
  status: "idle",
  message: "",
  requestId: 0,
};
