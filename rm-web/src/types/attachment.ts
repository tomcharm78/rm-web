// Attachments — generic file attachments across modules.

export type AttachmentEntityType = 'investor' | 'task' | 'challenge' | 'session';
export type AttachmentClassification = 'general' | 'confidential' | 'restricted';
export type AttachmentPurpose = 'record' | 'transient';

export type Attachment = {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  purpose: AttachmentPurpose;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  comment: string;
  classification: AttachmentClassification;
  uploadedById: string;
  createdAt: string;
};

// allowed file types (extension → mime is validated loosely; we check extension + mime)
export const ALLOWED_EXTENSIONS = ['pdf', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'docx'] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'text/csv',
  'application/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
] as const;

// role-based size caps (bytes)
const MB = 1024 * 1024;
export const SIZE_CAP_STAFF = 10 * MB;      // rm / arm
export const SIZE_CAP_MANAGER = 35 * MB;    // admin / super_admin

export function sizeCapForRole(role: string): number {
  return role === 'admin' || role === 'super_admin' ? SIZE_CAP_MANAGER : SIZE_CAP_STAFF;
}

export function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function isAllowedFile(fileName: string, mimeType: string): boolean {
  const ext = extensionOf(fileName);
  const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  // some browsers send empty/odd mime types; accept if EITHER extension or mime is in the allow-list,
  // but require the extension to be known (extension is the stronger signal here).
  const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType) || mimeType === '';
  return extOk && mimeOk;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < MB) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / MB).toFixed(1) + ' MB';
}

export function classificationLabel(c: string, ar: boolean): string {
  const m: Record<string, [string, string]> = {
    general: ['General', 'عام'],
    confidential: ['Confidential', 'سري'],
    restricted: ['Restricted', 'مقيّد'],
  };
  return m[c] ? (ar ? m[c][1] : m[c][0]) : c;
}

export function classificationColor(c: string): string {
  switch (c) {
    case 'confidential': return 'bg-amber-100 text-amber-700';
    case 'restricted': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}