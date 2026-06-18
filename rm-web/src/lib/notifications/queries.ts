import { createClient } from '@/lib/supabase/client';
import {
  Notification,
  NotificationRow,
  dbNotificationToNotification,
} from '@/types/notification';

const COLS =
  'id, user_id, title, title_ar, message, message_ar, type, read, related_entity_type, related_entity_id, created_at, source_metadata';

async function currentUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listNotifications(limit = 30): Promise<Notification[]> {
  const supabase = createClient();
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select(COLS)
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as NotificationRow[]).map(dbNotificationToNotification);
}

export async function unreadCount(): Promise<number> {
  const supabase = createClient();
  const uid = await currentUserId();
  if (!uid) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .is('deleted_at', null)
    .eq('read', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient();
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', uid)
    .eq('read', false)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
}