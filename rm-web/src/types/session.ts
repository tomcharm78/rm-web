// Session types — same pattern as investor.ts: SessionRow (DB), Session (app),
// SessionPublicDTO (integration). Companion shapes for attendees, edit history,
// AI tasks. Migration 0010 adds meeting_type (main/followup),
// parent_session_id, meeting_number (auto-generated YYYY/MM/DD/NNNN strings).

export type SessionAttendee = {
  id: string;
  name: string;
  nameAr: string;
  position: string;
  positionAr: string;
  organization?: string;
  organizationAr?: string;
  email?: string;
  phone?: string;
};

type SessionAttendeeRow = {
  id: string;
  name: string;
  name_ar: string;
  position: string;
  position_ar: string;
  organization?: string;
  organization_ar?: string;
  email?: string;
  phone?: string;
};

export type SessionEditHistory = {
  id: string;
  sessionId: string;
  editedById: string;
  editedAt: Date;
  changeDescription: string;
  changeDescriptionAr: string;
  previousContent: string | null;
  newContent: string | null;
};

type SessionEditHistoryRow = {
  id: string;
  session_id: string;
  edited_by_id: string;
  edited_at: string;
  change_description: string;
  change_description_ar: string;
  previous_content: string | null;
  new_content: string | null;
};

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const AI_TASK_STATUSES = ['pending', 'assigned', 'discarded'] as const;
export type AiTaskStatus = (typeof AI_TASK_STATUSES)[number];

export type PendingAiTask = {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  priority: TaskPriority;
  suggestedAssigneeId: string | null;
  suggestedDueDate: string | null;
  suggestedDomainId: string | null;
  status: AiTaskStatus;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdTaskId: string | null;
  aiGeneratedAt: Date;
};

type PendingAiTaskRow = {
  id: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  priority: TaskPriority;
  suggested_assignee_id: string | null;
  suggested_due_date: string | null;
  suggested_domain_id: string | null;
  status: AiTaskStatus;
  resolved_at: string | null;
  resolved_by_id: string | null;
  created_task_id: string | null;
  ai_generated_at: string;
};

// Meeting type (Batch 2.5)
export const MEETING_TYPES = ['main', 'followup'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export type SessionStatus = 'draft' | 'locked';

export type SessionRow = {
  id: string;
  organization_id: string;
  title: string;
  title_ar: string;
  meeting_date: string;
  meeting_location: string | null;
  meeting_location_ar: string | null;
  moh_attendees: SessionAttendeeRow[];
  visitor_attendees: SessionAttendeeRow[];
  mom_content: string;
  mom_content_ar: string;
  meeting_notes: string;
  meeting_notes_ar: string;
  decisions: string;
  decisions_ar: string;
  action_items: string;
  action_items_ar: string;
  status: SessionStatus;
  locked_at: string | null;
  lock_version: number;
  export_version: number | null;
  last_edited_at: string | null;
  last_edited_by_id: string | null;
  can_be_edited_after_lock: boolean;
  generated_tasks: unknown[];
  participant_ids: string[];
  pending_ai_tasks: PendingAiTaskRow[];
  created_by_id: string;
  department_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  external_id: string | null;
  source_system: string | null;
  source_metadata: Record<string, unknown> | null;
  meeting_type: MeetingType;
  parent_session_id: string | null;
  meeting_number: string;
};

export type SessionInsert = {
  id?: string;
  organization_id?: string;
  title: string;
  title_ar: string;
  meeting_date: string;
  meeting_location?: string | null;
  meeting_location_ar?: string | null;
  moh_attendees?: SessionAttendeeRow[];
  visitor_attendees?: SessionAttendeeRow[];
  mom_content?: string;
  mom_content_ar?: string;
  meeting_notes?: string;
  meeting_notes_ar?: string;
  decisions?: string;
  decisions_ar?: string;
  action_items?: string;
  action_items_ar?: string;
  status?: SessionStatus;
  locked_at?: string | null;
  can_be_edited_after_lock?: boolean;
  participant_ids?: string[];
  pending_ai_tasks?: PendingAiTaskRow[];
  created_by_id: string;
  external_id?: string | null;
  source_system?: string | null;
  source_metadata?: Record<string, unknown> | null;
  meeting_type?: MeetingType;
  parent_session_id?: string | null;
  // meeting_number is auto-set by DB trigger; omit on insert
};

export type SessionUpdate = Partial<SessionInsert>;

export type Session = {
  id: string;
  organizationId: string;
  title: string;
  titleAr: string;
  meetingDate: Date;
  meetingLocation: string | null;
  meetingLocationAr: string | null;
  mohAttendees: SessionAttendee[];
  visitorAttendees: SessionAttendee[];
  momContent: string;
  momContentAr: string;
  meetingNotes: string;
  meetingNotesAr: string;
  decisions: string;
  decisionsAr: string;
  actionItems: string;
  actionItemsAr: string;
  status: SessionStatus;
  lockedAt: Date | null;
  lockVersion: number;
  exportVersion: number | null;
  lastEditedAt: Date | null;
  lastEditedById: string | null;
  canBeEditedAfterLock: boolean;
  participantIds: string[];
  pendingAiTasks: PendingAiTask[];
  createdById: string;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  externalId: string | null;
  sourceSystem: string | null;
  sourceMetadata: Record<string, unknown> | null;
  meetingType: MeetingType;
  parentSessionId: string | null;
  meetingNumber: string;
};

export type SessionPublicDTO = {
  id: string;
  external_id: string | null;
  meeting_number: string;
  meeting_type: MeetingType;
  parent_session_id: string | null;
  title: { en: string; ar: string };
  meeting_date: string;
  meeting_location: { en: string | null; ar: string | null };
  attendees: {
    moh: Array<{
      name: { en: string; ar: string };
      position: { en: string; ar: string };
      email: string | null;
      phone: string | null;
    }>;
    visitors: Array<{
      name: { en: string; ar: string };
      position: { en: string; ar: string };
      organization: { en: string; ar: string } | null;
      email: string | null;
      phone: string | null;
    }>;
  };
  content: {
    minutes: { en: string; ar: string };
    notes: { en: string; ar: string };
    decisions: { en: string; ar: string };
    action_items: { en: string; ar: string };
  };
  status: SessionStatus;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

function attendeeFromRow(row: SessionAttendeeRow): SessionAttendee {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    position: row.position,
    positionAr: row.position_ar,
    organization: row.organization,
    organizationAr: row.organization_ar,
    email: row.email,
    phone: row.phone,
  };
}

function attendeeToRow(att: SessionAttendee): SessionAttendeeRow {
  return {
    id: att.id,
    name: att.name,
    name_ar: att.nameAr,
    position: att.position,
    position_ar: att.positionAr,
    organization: att.organization,
    organization_ar: att.organizationAr,
    email: att.email,
    phone: att.phone,
  };
}

function aiTaskFromRow(row: PendingAiTaskRow): PendingAiTask {
  return {
    id: row.id,
    title: row.title,
    titleAr: row.title_ar,
    description: row.description,
    descriptionAr: row.description_ar,
    priority: row.priority,
    suggestedAssigneeId: row.suggested_assignee_id,
    suggestedDueDate: row.suggested_due_date,
    suggestedDomainId: row.suggested_domain_id,
    status: row.status,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    resolvedById: row.resolved_by_id,
    createdTaskId: row.created_task_id,
    aiGeneratedAt: new Date(row.ai_generated_at),
  };
}

function aiTaskToRow(t: PendingAiTask): PendingAiTaskRow {
  return {
    id: t.id,
    title: t.title,
    title_ar: t.titleAr,
    description: t.description,
    description_ar: t.descriptionAr,
    priority: t.priority,
    suggested_assignee_id: t.suggestedAssigneeId,
    suggested_due_date: t.suggestedDueDate,
    suggested_domain_id: t.suggestedDomainId,
    status: t.status,
    resolved_at: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    resolved_by_id: t.resolvedById,
    created_task_id: t.createdTaskId,
    ai_generated_at: t.aiGeneratedAt.toISOString(),
  };
}

export function dbRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    titleAr: row.title_ar,
    meetingDate: new Date(row.meeting_date),
    meetingLocation: row.meeting_location,
    meetingLocationAr: row.meeting_location_ar,
    mohAttendees: (row.moh_attendees ?? []).map(attendeeFromRow),
    visitorAttendees: (row.visitor_attendees ?? []).map(attendeeFromRow),
    momContent: row.mom_content,
    momContentAr: row.mom_content_ar,
    meetingNotes: row.meeting_notes,
    meetingNotesAr: row.meeting_notes_ar,
    decisions: row.decisions,
    decisionsAr: row.decisions_ar,
    actionItems: row.action_items,
    actionItemsAr: row.action_items_ar,
    status: row.status,
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
    lockVersion: row.lock_version,
    exportVersion: row.export_version,
    lastEditedAt: row.last_edited_at ? new Date(row.last_edited_at) : null,
    lastEditedById: row.last_edited_by_id,
    canBeEditedAfterLock: row.can_be_edited_after_lock,
    participantIds: row.participant_ids ?? [],
    pendingAiTasks: (row.pending_ai_tasks ?? []).map(aiTaskFromRow),
    createdById: row.created_by_id,
    departmentId: row.department_id ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    externalId: row.external_id,
    sourceSystem: row.source_system,
    sourceMetadata: row.source_metadata,
    meetingType: row.meeting_type,
    parentSessionId: row.parent_session_id,
    meetingNumber: row.meeting_number,
  };
}

export function editHistoryFromRow(row: SessionEditHistoryRow): SessionEditHistory {
  return {
    id: row.id,
    sessionId: row.session_id,
    editedById: row.edited_by_id,
    editedAt: new Date(row.edited_at),
    changeDescription: row.change_description,
    changeDescriptionAr: row.change_description_ar,
    previousContent: row.previous_content,
    newContent: row.new_content,
  };
}

export function sessionToPublicDTO(s: Session): SessionPublicDTO {
  return {
    id: s.id,
    external_id: s.externalId,
    meeting_number: s.meetingNumber,
    meeting_type: s.meetingType,
    parent_session_id: s.parentSessionId,
    title: { en: s.title, ar: s.titleAr },
    meeting_date: s.meetingDate.toISOString(),
    meeting_location: { en: s.meetingLocation, ar: s.meetingLocationAr },
    attendees: {
      moh: s.mohAttendees.map((a) => ({
        name: { en: a.name, ar: a.nameAr },
        position: { en: a.position, ar: a.positionAr },
        email: a.email ?? null,
        phone: a.phone ?? null,
      })),
      visitors: s.visitorAttendees.map((a) => ({
        name: { en: a.name, ar: a.nameAr },
        position: { en: a.position, ar: a.positionAr },
        organization: a.organization ? { en: a.organization, ar: a.organizationAr ?? '' } : null,
        email: a.email ?? null,
        phone: a.phone ?? null,
      })),
    },
    content: {
      minutes: { en: s.momContent, ar: s.momContentAr },
      notes: { en: s.meetingNotes, ar: s.meetingNotesAr },
      decisions: { en: s.decisions, ar: s.decisionsAr },
      action_items: { en: s.actionItems, ar: s.actionItemsAr },
    },
    status: s.status,
    locked_at: s.lockedAt ? s.lockedAt.toISOString() : null,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

export type SessionFormInput = {
  title: string;
  titleAr: string;
  meetingDate: string;
  meetingLocation?: string;
  meetingLocationAr?: string;
  mohAttendees: SessionAttendee[];
  visitorAttendees: SessionAttendee[];
  momContent: string;
  momContentAr: string;
  meetingNotes: string;
  meetingNotesAr: string;
  decisions: string;
  decisionsAr: string;
  actionItems: string;
  actionItemsAr: string;
  participantIds: string[];
  meetingType: MeetingType;
  parentSessionId: string | null;
};

export function emptyAttendee(prefix: 'moh' | 'vis'): SessionAttendee {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    nameAr: '',
    position: '',
    positionAr: '',
    organization: '',
    organizationAr: '',
    email: '',
    phone: '',
  };
}

export { aiTaskToRow, aiTaskFromRow, attendeeToRow, attendeeFromRow };