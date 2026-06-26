import { createClient } from '@/lib/supabase/client';
import {
  type Attachment, type AttachmentEntityType, type AttachmentClassification,
  sizeCapForRole, isAllowedFile, humanSize,
} from '@/types/attachment';

const BUCKET = 'attachments';

async function currentUser() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('not authenticated');
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAttachment(r: any): Attachment {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    purpose: r.purpose ?? 'record',
    storagePath: r.storage_path,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    comment: r.comment ?? '',
    classification: r.classification ?? 'general',
    uploadedById: r.uploaded_by_id,
    createdAt: r.created_at,
  };
}

export async function listAttachments(entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('attachments').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToAttachment(r));
}

// safe storage segment from a filename (strip path separators / weird chars)
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120);
}

export async function uploadAttachment(params: {
  entityType: AttachmentEntityType;
  entityId: string;
  organizationId: string;
  file: File;
  comment: string;
  classification: AttachmentClassification;
  userRole: string;
}): Promise<Attachment> {
  const supabase = createClient();
  const me = await currentUser();

  // validate type + size (role-based cap) BEFORE touching storage
  if (!isAllowedFile(params.file.name, params.file.type)) {
    throw new Error('file_type_not_allowed');
  }
  const cap = sizeCapForRole(params.userRole);
  if (params.file.size > cap) {
    throw new Error(`file_too_large:${humanSize(cap)}`);
  }

  // path: org/{orgId}/{entityType}/{entityId}/{uuid}-{safeName}
  const uid = (crypto as Crypto).randomUUID();
  const path = `org/${params.organizationId}/${params.entityType}/${params.entityId}/${uid}-${safeName(params.file.name)}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, params.file, {
    cacheControl: '3600',
    upsert: false,
    contentType: params.file.type || undefined,
  });
  if (upErr) throw new Error(upErr.message);

  // insert the row; if it fails, remove the just-uploaded object (no orphan)
  const { data, error } = await supabase.from('attachments').insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    purpose: 'record',
    storage_path: path,
    file_name: params.file.name,
    mime_type: params.file.type || 'application/octet-stream',
    size_bytes: params.file.size,
    comment: params.comment.trim(),
    classification: params.classification,
    uploaded_by_id: me,
    organization_id: params.organizationId,
  }).select('*').single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return rowToAttachment(data);
}

// short-lived signed URL for download/preview (private bucket)
export async function getAttachmentUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// soft-delete the row AND purge the file from storage
export async function deleteAttachment(att: Attachment): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', att.id);
  if (error) throw new Error(error.message);
  // best-effort purge (row is already gone from the UI either way)
  await supabase.storage.from(BUCKET).remove([att.storagePath]);
}

// ---- org-level attachments switch (gate) ----

export async function getAttachmentsEnabled(organizationId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from('org_module_settings').select('enabled')
    .eq('organization_id', organizationId).eq('module_key', 'attachments').maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(data as any)?.enabled;
}

// only a holder of can_manage_attachments may flip this (enforced by RLS too)
export async function setAttachmentsEnabled(organizationId: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('organizations').update({ attachments_enabled: enabled }).eq('id', organizationId);
  if (error) throw new Error(error.message);
}
// ---- self-contained capability + org lookup for the toggle ----

export async function getMyAttachmentsControl(): Promise<{
  canManage: boolean;
  organizationId: string | null;
  enabled: boolean;
}> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return { canManage: false, organizationId: null, enabled: false };

  const { data: u } = await supabase
    .from('users').select('can_manage_attachments, organization_id').eq('id', me).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = u as any;
  if (!row) return { canManage: false, organizationId: null, enabled: false };

  let enabled = false;
  if (row.organization_id) {
    const { data: o } = await supabase
      .from('org_module_settings').select('enabled')
      .eq('organization_id', row.organization_id).eq('module_key', 'attachments').maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enabled = !!(o as any)?.enabled;
  }
  return {
    canManage: !!row.can_manage_attachments,
    organizationId: row.organization_id ?? null,
    enabled,
  };
}
