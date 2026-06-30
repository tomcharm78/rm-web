// Session queries — the data layer between the UI and Supabase.
//
// All functions return canonical `Session` (or `SessionEditHistory[]`),
// never raw rows. UI components ONLY use this module to touch session data.
//
// Multi-tenancy: every query relies on RLS to scope by organization_id, set
// in 0008. Reads use the post-0009 sessions_read policy (creator/admin/super/
// participant only).
//
// Lock lifecycle methods:
//   - lockSession(id)              draft → locked
//   - reEnableEditing(id, reason)  locked, edit-disabled → locked, edit-enabled (Q2 (c))
//   - editLockedSession(id, ...)   locked + can_be_edited_after_lock → writes change
//   - updateSession(id, ...)       draft only; locked-with-edit-disabled returns 403
//
// Every state-changing call logs an entry to session_edit_history with a
// human-readable change_description (EN + AR).

import { upsertContactsFromAttendees } from '@/lib/contacts/queries';
import { createClient } from '@/lib/supabase/client';
import {
  dbRowToSession,
  editHistoryFromRow,
  attendeeToRow,
  aiTaskToRow,
  type Session,
  type SessionRow,
  type SessionEditHistory,
  type SessionFormInput,
  type SessionStatus,
  type PendingAiTask,
} from '@/types/session';

// =============================================================================
// READ
// =============================================================================

export type SessionListFilters = {
  departmentId?: string;
  search?: string;
  status?: SessionStatus;
};

export async function listSessions(filters: SessionListFilters = {}): Promise<Session[]> {
  const supabase = createClient();
  let query = supabase
    .from('sessions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }

if (filters.search && filters.search.trim()) {
    // Strip Postgres-OR-syntax-sensitive chars (commas, parens, asterisks).
    // Keep slashes — they're part of meeting_number format (2026/06/12/0001).
    const term = filters.search.trim().replace(/[,()*]/g, ' ');
    const like = `%${term}%`;
    query = query.or(
      `title.ilike.${like},title_ar.ilike.${like},meeting_number.ilike.${like}`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[listSessions] error:', error);
    throw new Error(error.message);
  }
  return (data as SessionRow[]).map(dbRowToSession);
}

export async function getSession(id: string): Promise<Session | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('[getSession] error:', error);
    throw new Error(error.message);
  }
  return data ? dbRowToSession(data as SessionRow) : null;
}

export async function getSessionEditHistory(sessionId: string): Promise<SessionEditHistory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('session_edit_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('edited_at', { ascending: false });
  if (error) {
    console.error('[getSessionEditHistory] error:', error);
    throw new Error(error.message);
  }
  return (data ?? []).map(editHistoryFromRow);
}

// =============================================================================
// WRITE
// =============================================================================

// Helper: fetch the caller's auth + org. Used by every write to set FK columns
// correctly and short-circuit unauthenticated calls before they reach Supabase.
async function getAuthContext() {
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  const { data: appUser, error } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('id', authUser.id)
    .single();
  if (error || !appUser) throw new Error('user_lookup_failed');

  return { supabase, authUserId: authUser.id, organizationId: appUser.organization_id, role: appUser.role };
}

function formToInsertPayload(input: SessionFormInput) {
  return {
    title: input.title.trim(),
    title_ar: input.titleAr.trim(),
    meeting_date: input.meetingDate,
    meeting_location: input.meetingLocation?.trim() || null,
    meeting_location_ar: input.meetingLocationAr?.trim() || null,
    moh_attendees: input.mohAttendees.map(attendeeToRow),
    visitor_attendees: input.visitorAttendees.map(attendeeToRow),
    mom_content: input.momContent,
    mom_content_ar: input.momContentAr,
    meeting_notes: input.meetingNotes,
    meeting_notes_ar: input.meetingNotesAr,
    decisions: input.decisions,
    decisions_ar: input.decisionsAr,
    action_items: input.actionItems,
    action_items_ar: input.actionItemsAr,
    participant_ids: input.participantIds,
    meeting_type: input.meetingType,
    parent_session_id: input.parentSessionId,
  };
}

export async function createSession(input: SessionFormInput): Promise<Session> {
  const { supabase, authUserId, organizationId } = await getAuthContext();

  const insert = {
    ...formToInsertPayload(input),
    organization_id: organizationId,
    created_by_id: authUserId,
    status: 'draft' as SessionStatus,
  };

  const { data, error } = await supabase
    .from('sessions')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    console.error('[createSession] error:', error);
    throw new Error(error.message);
  }
  // push visitor attendees into the Contacts directory (non-blocking)
  void upsertContactsFromAttendees(input.visitorAttendees);
  return dbRowToSession(data as SessionRow);
}

// Update a draft session. Server-side checks (RLS + the status-check below)
// prevent updating locked sessions through this path — use editLockedSession
// for that.
// Update a draft session. Server-side checks (RLS + the status-check below)
// prevent updating locked sessions through this path — use editLockedSession
// for that.
//
// Logs an entry to session_edit_history per Option B decision (Jun 2026):
// every draft edit produces an audit row with a summary of changed fields.
export async function updateSession(id: string, input: SessionFormInput): Promise<Session> {
  const { supabase, authUserId } = await getAuthContext();

  // Fetch first so we can guard the lock state and decide audit content.
  const existing = await getSession(id);
  if (!existing) throw new Error('session_not_found');
  if (existing.status === 'locked' && !existing.canBeEditedAfterLock) {
    throw new Error('session_locked');
  }

  const update = {
    ...formToInsertPayload(input),
    last_edited_at: new Date().toISOString(),
    last_edited_by_id: authUserId,
  };

  const { data, error } = await supabase
    .from('sessions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[updateSession] error:', error);
    throw new Error(error.message);
  }
  // push visitor attendees into the Contacts directory (non-blocking)
  void upsertContactsFromAttendees(input.visitorAttendees);

  // -----------------------------------------------------------------------
  // Option B audit logging: write an Edit History row summarising the diff.
  // We compare the existing row vs. the form input, list the field groups
  // that changed, and persist that as a human-readable change description.
  // -----------------------------------------------------------------------
  const changedFields: string[] = [];
  const changedFieldsAr: string[] = [];

  if (existing.title !== input.title || existing.titleAr !== input.titleAr) {
    changedFields.push('title');
    changedFieldsAr.push('العنوان');
  }
  if (
    existing.meetingLocation !== (input.meetingLocation?.trim() || null) ||
    existing.meetingLocationAr !== (input.meetingLocationAr?.trim() || null)
  ) {
    changedFields.push('location');
    changedFieldsAr.push('الموقع');
  }
  // Compare meeting date as ISO strings to ignore timezone serialisation differences
  if (existing.meetingDate.toISOString() !== new Date(input.meetingDate).toISOString()) {
    changedFields.push('meeting date');
    changedFieldsAr.push('تاريخ الاجتماع');
  }
  // Attendee comparison: shallow length check + deep JSON compare on the raw arrays
  if (JSON.stringify(existing.mohAttendees) !== JSON.stringify(input.mohAttendees)) {
    changedFields.push('MoH attendees');
    changedFieldsAr.push('حضور وزارة الصحة');
  }
  if (JSON.stringify(existing.visitorAttendees) !== JSON.stringify(input.visitorAttendees)) {
    changedFields.push('visitor attendees');
    changedFieldsAr.push('الزوار');
  }
  if (existing.momContent !== input.momContent || existing.momContentAr !== input.momContentAr) {
    changedFields.push('minutes');
    changedFieldsAr.push('المحضر');
  }
  if (existing.meetingNotes !== input.meetingNotes || existing.meetingNotesAr !== input.meetingNotesAr) {
    changedFields.push('notes');
    changedFieldsAr.push('الملاحظات');
  }
  if (existing.decisions !== input.decisions || existing.decisionsAr !== input.decisionsAr) {
    changedFields.push('decisions');
    changedFieldsAr.push('القرارات');
  }
  if (existing.actionItems !== input.actionItems || existing.actionItemsAr !== input.actionItemsAr) {
    changedFields.push('action items');
    changedFieldsAr.push('بنود العمل');
  }
  if (JSON.stringify(existing.participantIds) !== JSON.stringify(input.participantIds)) {
    changedFields.push('participants');
    changedFieldsAr.push('المشاركون');
  }
if (existing.meetingType !== input.meetingType || existing.parentSessionId !== input.parentSessionId) {
    changedFields.push('meeting type / parent');
    changedFieldsAr.push('نوع الاجتماع / المرجع');
  }

  const summary = changedFields.length > 0
    ? `Updated: ${changedFields.join(', ')}`
    : 'Saved (no field changes)';
  const summaryAr = changedFieldsAr.length > 0
    ? `تم التحديث: ${changedFieldsAr.join('، ')}`
    : 'تم الحفظ (لا توجد تغييرات)';

  await supabase.from('session_edit_history').insert({
    session_id: id,
    edited_by_id: authUserId,
    change_description: summary,
    change_description_ar: summaryAr,
  });

  return dbRowToSession(data as SessionRow);
}

// Lock a session. Sets locked_at, increments lock_version, writes audit entry.
// Once locked, the standard updateSession path is closed.
export async function lockSession(id: string, reason?: string): Promise<Session> {
  const { supabase, authUserId } = await getAuthContext();
  const existing = await getSession(id);
  if (!existing) throw new Error('session_not_found');
  if (existing.status === 'locked') throw new Error('already_locked');

  const lockedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('sessions')
    .update({
      status: 'locked',
      locked_at: lockedAt,
      lock_version: existing.lockVersion + 1,
      can_be_edited_after_lock: false,
      last_edited_at: lockedAt,
      last_edited_by_id: authUserId,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('session_edit_history').insert({
    session_id: id,
    edited_by_id: authUserId,
    change_description: reason || 'Session locked',
    change_description_ar: reason || 'تم قفل الجلسة',
  });

  return dbRowToSession(data as SessionRow);
}

// Re-enable editing on a locked session (per Q2 decision: creator, admin,
// super_admin can do this). Permission enforced by RLS + this guard.
// Logs an entry to session_edit_history so the audit trail captures who flipped
// the switch and why.
export async function reEnableEditing(id: string, reason: string, reasonAr: string): Promise<Session> {
  const { supabase, authUserId, role } = await getAuthContext();
  const existing = await getSession(id);
  if (!existing) throw new Error('session_not_found');
  if (existing.status !== 'locked') throw new Error('not_locked');
  if (existing.canBeEditedAfterLock) throw new Error('already_re_enabled');

  // Authorization check matching Q2 (c): creator OR admin OR super_admin
  const isCreator = existing.createdById === authUserId;
  const isAdminOrSuper = role === 'admin' || role === 'super_admin';
  if (!isCreator && !isAdminOrSuper) throw new Error('unauthorized');

  if (!reason.trim() || !reasonAr.trim()) {
    throw new Error('reason_required');
  }

  const { data, error } = await supabase
    .from('sessions')
    .update({
      can_be_edited_after_lock: true,
      last_edited_at: new Date().toISOString(),
      last_edited_by_id: authUserId,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('session_edit_history').insert({
    session_id: id,
    edited_by_id: authUserId,
    change_description: `Editing re-enabled. Reason: ${reason.trim()}`,
    change_description_ar: `تم إعادة تفعيل التعديل. السبب: ${reasonAr.trim()}`,
  });

  return dbRowToSession(data as SessionRow);
}

// Edit a locked session that has had editing re-enabled. Each edit MUST
// include a change_description (EN+AR) explaining what changed and why.
// We snapshot the previous content of changed fields into the audit row.
export async function editLockedSession(
  id: string,
  patch: Partial<Pick<SessionFormInput,
    'momContent' | 'momContentAr' |
    'meetingNotes' | 'meetingNotesAr' |
    'decisions' | 'decisionsAr' |
    'actionItems' | 'actionItemsAr'
  >>,
  changeDescription: string,
  changeDescriptionAr: string,
): Promise<Session> {
  const { supabase, authUserId } = await getAuthContext();
  const existing = await getSession(id);
  if (!existing) throw new Error('session_not_found');
  if (existing.status !== 'locked') throw new Error('not_locked');
  if (!existing.canBeEditedAfterLock) throw new Error('locked_no_edits');
  if (!changeDescription.trim() || !changeDescriptionAr.trim()) {
    throw new Error('change_description_required');
  }

  // Build a compact diff for audit: only changed fields, before+after.
  const changes: Record<string, { before: string; after: string }> = {};
  if (patch.momContent !== undefined && patch.momContent !== existing.momContent) {
    changes.mom_content = { before: existing.momContent, after: patch.momContent };
  }
  if (patch.momContentAr !== undefined && patch.momContentAr !== existing.momContentAr) {
    changes.mom_content_ar = { before: existing.momContentAr, after: patch.momContentAr };
  }
  if (patch.meetingNotes !== undefined && patch.meetingNotes !== existing.meetingNotes) {
    changes.meeting_notes = { before: existing.meetingNotes, after: patch.meetingNotes };
  }
  if (patch.meetingNotesAr !== undefined && patch.meetingNotesAr !== existing.meetingNotesAr) {
    changes.meeting_notes_ar = { before: existing.meetingNotesAr, after: patch.meetingNotesAr };
  }
  if (patch.decisions !== undefined && patch.decisions !== existing.decisions) {
    changes.decisions = { before: existing.decisions, after: patch.decisions };
  }
  if (patch.decisionsAr !== undefined && patch.decisionsAr !== existing.decisionsAr) {
    changes.decisions_ar = { before: existing.decisionsAr, after: patch.decisionsAr };
  }
  if (patch.actionItems !== undefined && patch.actionItems !== existing.actionItems) {
    changes.action_items = { before: existing.actionItems, after: patch.actionItems };
  }
  if (patch.actionItemsAr !== undefined && patch.actionItemsAr !== existing.actionItemsAr) {
    changes.action_items_ar = { before: existing.actionItemsAr, after: patch.actionItemsAr };
  }

  if (Object.keys(changes).length === 0) throw new Error('no_changes');

  // Build update payload (only changed cols)
  const updatePayload: Record<string, string> = {};
  if (patch.momContent !== undefined) updatePayload.mom_content = patch.momContent;
  if (patch.momContentAr !== undefined) updatePayload.mom_content_ar = patch.momContentAr;
  if (patch.meetingNotes !== undefined) updatePayload.meeting_notes = patch.meetingNotes;
  if (patch.meetingNotesAr !== undefined) updatePayload.meeting_notes_ar = patch.meetingNotesAr;
  if (patch.decisions !== undefined) updatePayload.decisions = patch.decisions;
  if (patch.decisionsAr !== undefined) updatePayload.decisions_ar = patch.decisionsAr;
  if (patch.actionItems !== undefined) updatePayload.action_items = patch.actionItems;
  if (patch.actionItemsAr !== undefined) updatePayload.action_items_ar = patch.actionItemsAr;

  const { data, error } = await supabase
    .from('sessions')
    .update({
      ...updatePayload,
      last_edited_at: new Date().toISOString(),
      last_edited_by_id: authUserId,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  // Write audit row with a JSON snapshot of changed fields in previous_content / new_content
  await supabase.from('session_edit_history').insert({
    session_id: id,
    edited_by_id: authUserId,
    change_description: changeDescription.trim(),
    change_description_ar: changeDescriptionAr.trim(),
    previous_content: JSON.stringify(Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, v.before])
    )),
    new_content: JSON.stringify(Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, v.after])
    )),
  });

  return dbRowToSession(data as SessionRow);
}

export async function deleteSession(id: string): Promise<void> {
  const { supabase } = await getAuthContext();
  const { error } = await supabase
    .from('sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// =============================================================================
// AI task triage (used by Batch 3 UI)
// =============================================================================

// Update the entire pending_ai_tasks array on a session (used after triage
// actions: discard, or after assigning which marks the entry 'assigned').
export async function updatePendingAiTasks(
  sessionId: string,
  tasks: PendingAiTask[],
): Promise<Session> {
  const { supabase } = await getAuthContext();
  const { data, error } = await supabase
    .from('sessions')
    .update({ pending_ai_tasks: tasks.map(aiTaskToRow) })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return dbRowToSession(data as SessionRow);
}
