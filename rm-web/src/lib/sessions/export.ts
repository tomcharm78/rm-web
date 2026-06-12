// Session export helpers.
//
// Two formats:
//   1. CSV bulk export — all sessions visible to the user, flat tabular form.
//      Excel-compatible (UTF-8 BOM so Arabic doesn't show as ??????).
//   2. Word per-session export — formatted HTML file with .doc extension.
//      Word opens .doc-extension HTML cleanly and renders the document.
//      No external library, no bundle bloat.
//
// Both functions return a string; the caller triggers download via downloadBlob.

import type { Session } from '@/types/session';

type Language = 'en' | 'ar';

// =============================================================================
// CSV (bulk)
// =============================================================================

export function sessionsToCsv(sessions: Session[], language: Language = 'en'): string {
  const headers = language === 'ar'
    ? [
        'العنوان (EN)',
        'العنوان (AR)',
        'تاريخ الاجتماع',
        'الموقع',
        'الحالة',
        'تاريخ القفل',
        'عدد حضور وزارة الصحة',
        'عدد الزوار',
        'تاريخ الإنشاء',
        'تاريخ آخر تعديل',
      ]
    : [
        'Title (EN)',
        'Title (AR)',
        'Meeting Date',
        'Location',
        'Status',
        'Locked At',
        'MoH Attendees',
        'Visitor Attendees',
        'Created At',
        'Last Edited',
      ];

  const rows = sessions.map((s) => [
    s.title,
    s.titleAr,
    s.meetingDate.toISOString(),
    language === 'ar' ? s.meetingLocationAr || s.meetingLocation || '' : s.meetingLocation || '',
    s.status,
    s.lockedAt ? s.lockedAt.toISOString() : '',
    String(s.mohAttendees.length),
    String(s.visitorAttendees.length),
    s.createdAt.toISOString(),
    s.lastEditedAt ? s.lastEditedAt.toISOString() : '',
  ]);

  const lines = [headers, ...rows].map((cells) =>
    cells.map((c) => csvEscape(String(c ?? ''))).join(',')
  );
  return '\uFEFF' + lines.join('\r\n');
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

// =============================================================================
// Word per-session export (HTML-with-.doc-extension)
// =============================================================================

// Build a complete HTML document that Word will open as a .doc.
// Uses inline styles only (Word's CSS support is weak).
// Bilingual layout: shows both English and Arabic side-by-side where applicable.
export function sessionToWordHtml(session: Session, language: Language = 'en'): string {
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const formattedDate = session.meetingDate.toLocaleString();
  const formattedLockedAt = session.lockedAt ? session.lockedAt.toLocaleString() : null;

  const title = `${escapeHtml(session.title)}<br/><span style="font-size:14pt">${escapeHtml(session.titleAr)}</span>`;

  const mohAttendeesHtml = session.mohAttendees.length === 0
    ? '<p style="color:#888">—</p>'
    : `<ul>${session.mohAttendees.map((a) => `
        <li>
          <strong>${escapeHtml(a.name)}</strong> / ${escapeHtml(a.nameAr)}
          — ${escapeHtml(a.position)} / ${escapeHtml(a.positionAr)}
          ${a.email ? `<br/><small>${escapeHtml(a.email)}</small>` : ''}
          ${a.phone ? `<br/><small>${escapeHtml(a.phone)}</small>` : ''}
        </li>`).join('')}</ul>`;

  const visitorAttendeesHtml = session.visitorAttendees.length === 0
    ? '<p style="color:#888">—</p>'
    : `<ul>${session.visitorAttendees.map((a) => `
        <li>
          <strong>${escapeHtml(a.name)}</strong> / ${escapeHtml(a.nameAr)}
          — ${escapeHtml(a.position)} / ${escapeHtml(a.positionAr)}
          ${a.organization ? `<br/><em>${escapeHtml(a.organization)} / ${escapeHtml(a.organizationAr || '')}</em>` : ''}
          ${a.email ? `<br/><small>${escapeHtml(a.email)}</small>` : ''}
          ${a.phone ? `<br/><small>${escapeHtml(a.phone)}</small>` : ''}
        </li>`).join('')}</ul>`;

  const section = (labelEn: string, labelAr: string, contentEn: string, contentAr: string) => {
    if (!contentEn && !contentAr) return '';
    return `
      <h2 style="border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24pt">
        ${escapeHtml(labelEn)} / <span style="font-family:Tahoma">${escapeHtml(labelAr)}</span>
      </h2>
      ${contentEn ? `<div style="margin-bottom:8pt"><strong>English:</strong><br/>${nl2br(escapeHtml(contentEn))}</div>` : ''}
      ${contentAr ? `<div dir="rtl" style="font-family:Tahoma"><strong>العربية:</strong><br/>${nl2br(escapeHtml(contentAr))}</div>` : ''}
    `;
  };

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}" xmlns:office="urn:schemas-microsoft-com:office:office" xmlns:word="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(session.title)}</title>
<style>
  @page { size: A4; margin: 1in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #222; }
  h1 { font-size: 20pt; margin: 0 0 8pt 0; }
  h2 { font-size: 14pt; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 16pt; }
  .meta strong { color: #222; }
  .badge { display: inline-block; padding: 2pt 6pt; border-radius: 4pt; font-size: 9pt; font-weight: bold; }
  .badge-draft { background: #fff5d6; color: #806600; }
  .badge-locked { background: #dde6ff; color: #1a3680; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <strong>Meeting Date / تاريخ الاجتماع:</strong> ${escapeHtml(formattedDate)}<br/>
    ${session.meetingLocation ? `<strong>Location / الموقع:</strong> ${escapeHtml(session.meetingLocation)} ${session.meetingLocationAr ? `(${escapeHtml(session.meetingLocationAr)})` : ''}<br/>` : ''}
    <strong>Status / الحالة:</strong>
    <span class="badge badge-${session.status}">${session.status.toUpperCase()}</span>
    ${formattedLockedAt ? ` &mdash; locked on ${escapeHtml(formattedLockedAt)}` : ''}
  </div>

  <h2>MoH Attendees / حضور وزارة الصحة</h2>
  ${mohAttendeesHtml}

  <h2>Visitors / الزوار</h2>
  ${visitorAttendeesHtml}

  ${section('Minutes of Meeting', 'محضر الاجتماع', session.momContent, session.momContentAr)}
  ${section('Meeting Notes', 'ملاحظات الاجتماع', session.meetingNotes, session.meetingNotesAr)}
  ${section('Decisions', 'القرارات', session.decisions, session.decisionsAr)}
  ${section('Action Items', 'بنود العمل', session.actionItems, session.actionItemsAr)}

  <hr style="margin-top:24pt"/>
  <div style="font-size:9pt;color:#888">
    Generated from RM Platform on ${escapeHtml(new Date().toLocaleString())}.<br/>
    Session ID: ${escapeHtml(session.id)}
  </div>
</body>
</html>`;
}

// =============================================================================
// Browser download helpers
// =============================================================================

export function downloadCsv(content: string, filename: string): void {
  download(content, filename, 'text/csv;charset=utf-8');
}

export function downloadWordDoc(html: string, filename: string): void {
  // application/msword + .doc extension makes Windows associate the file
  // with Word for double-click open.
  download(html, filename.endsWith('.doc') ? filename : `${filename}.doc`, 'application/msword');
}

function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// =============================================================================
// Internals
// =============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(s: string): string {
  return s.replace(/\n/g, '<br/>');
}
