'use client';

// AttendeesEditor — edits an array of SessionAttendee inline.
//
// Used twice in the session form: once for MoH attendees, once for visitor
// attendees. The visitor variant shows organization fields, the MoH variant
// hides them (those attendees are inside MOH, organization is implicit).
//
// Behavior:
//   - Each row is editable in place: name EN/AR, position EN/AR, email, phone
//   - "Add attendee" button appends a fresh row
//   - Trash icon on each row removes it
//   - Empty array shows a friendly placeholder

import { useState } from 'react';
import { ContactPickerModal } from '@/components/sessions/contact-picker-modal';
import type { DirectoryEntry } from '@/types/contact';
import { Trash2, Plus } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { type SessionAttendee, emptyAttendee } from '@/types/session';

type Props = {
  kind: 'moh' | 'visitor';
  value: SessionAttendee[];
  onChange: (next: SessionAttendee[]) => void;
  disabled?: boolean;
};

export function AttendeesEditor({ kind, value, onChange, disabled }: Props) {const [pickerOpen, setPickerOpen] = useState(false);

  function addFromContacts(entries: DirectoryEntry[]) {
    const mapped = entries.map((e) => ({
      ...emptyAttendee(kind === 'moh' ? 'moh' : 'vis'),
      name: e.name ?? '',
      nameAr: e.nameAr ?? '',
      position: e.role ?? '',
      positionAr: e.roleAr ?? '',
      organization: e.organization ?? '',
      organizationAr: e.organizationAr ?? '',
      email: e.email ?? '',
      phone: e.phone ?? '',
    }));
    onChange([...value, ...mapped]);
  }
  const { language } = useLanguage();

  function updateAt(index: number, patch: Partial<SessionAttendee>) {
    const next = value.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, emptyAttendee(kind === 'moh' ? 'moh' : 'vis')]);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-slate-500 italic">
          {language === 'ar'
            ? 'لا يوجد حضور — انقر لإضافة'
            : 'No attendees yet — click to add'}
        </p>
      )}

      {value.map((att, i) => (
        <div
          key={att.id}
          className="rounded-md border border-slate-200 bg-slate-50/40 p-3 space-y-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder={language === 'ar' ? 'الاسم (EN)' : 'Name (EN)'}
              dir="ltr"
              value={att.name}
              disabled={disabled}
              onChange={(e) => updateAt(i, { name: e.target.value })}
            />
            <Input
              placeholder={language === 'ar' ? 'الاسم (AR)' : 'Name (AR)'}
              dir="rtl"
              value={att.nameAr}
              disabled={disabled}
              onChange={(e) => updateAt(i, { nameAr: e.target.value })}
            />
            <Input
              placeholder={language === 'ar' ? 'المنصب (EN)' : 'Position (EN)'}
              dir="ltr"
              value={att.position}
              disabled={disabled}
              onChange={(e) => updateAt(i, { position: e.target.value })}
            />
            <Input
              placeholder={language === 'ar' ? 'المنصب (AR)' : 'Position (AR)'}
              dir="rtl"
              value={att.positionAr}
              disabled={disabled}
              onChange={(e) => updateAt(i, { positionAr: e.target.value })}
            />
            {kind === 'visitor' && (
              <>
                <Input
                  placeholder={language === 'ar' ? 'الجهة (EN)' : 'Organization (EN)'}
                  dir="ltr"
                  value={att.organization ?? ''}
                  disabled={disabled}
                  onChange={(e) => updateAt(i, { organization: e.target.value })}
                />
                <Input
                  placeholder={language === 'ar' ? 'الجهة (AR)' : 'Organization (AR)'}
                  dir="rtl"
                  value={att.organizationAr ?? ''}
                  disabled={disabled}
                  onChange={(e) => updateAt(i, { organizationAr: e.target.value })}
                />
              </>
            )}
            <Input
              placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
              dir="ltr"
              type="email"
              value={att.email ?? ''}
              disabled={disabled}
              onChange={(e) => updateAt(i, { email: e.target.value })}
            />
            <Input
              placeholder={language === 'ar' ? 'الهاتف' : 'Phone'}
              dir="ltr"
              value={att.phone ?? ''}
              disabled={disabled}
              onChange={(e) => updateAt(i, { phone: e.target.value })}
            />
          </div>

          {!disabled && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
                {language === 'ar' ? 'إزالة' : 'Remove'}
              </button>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'إضافة' : 'Add attendee'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'من جهات الاتصال' : 'From Contacts'}
          </Button>
        </div>
      )}
      {pickerOpen && (
        <ContactPickerModal onClose={() => setPickerOpen(false)} onPick={addFromContacts} />
      )}
    </div>
  );
}
