export type NotificationSeverity = 'info' | 'warning' | 'success' | 'error';

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string | null;
  title_ar: string | null;
  message: string | null;
  message_ar: string | null;
  type: NotificationSeverity;
  read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  source_metadata: Record<string, unknown> | null;
};

export type Notification = {
  id: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  severity: NotificationSeverity;
  read: boolean;
  entityType: string | null;
  entityId: string | null;
  event: string | null;
  actorId: string | null;
  createdAt: string;
};

export function dbNotificationToNotification(r: NotificationRow): Notification {
  const meta = (r.source_metadata ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title ?? '',
    titleAr: r.title_ar ?? '',
    message: r.message ?? '',
    messageAr: r.message_ar ?? '',
    severity: r.type,
    read: r.read,
    entityType: r.related_entity_type,
    entityId: r.related_entity_id,
    event: typeof meta.event === 'string' ? meta.event : null,
    actorId: typeof meta.actorId === 'string' ? meta.actorId : null,
    createdAt: r.created_at,
  };
}