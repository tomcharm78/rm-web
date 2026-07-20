// Bulk insert for the contacts import.
//
// Unlike the investors import, duplicates are NOT skipped — every row is
// imported and duplicates are surfaced in the list instead. Contacts arrive
// from many hands (attendee lists, business cards, spreadsheets) and silently
// dropping a row is worse than showing two and letting a human decide.
import { createClient } from '@/lib/supabase/client';
import type { ContactCreateInput } from '@/types/contact';

export type ContactBulkRowResult = {
  rowIndex: number;
  name: string;
  status: 'created' | 'failed';
  error?: string;
};

export type ContactBulkSummary = {
  created: number;
  failed: number;
  duplicates: number;      // imported, but matching an existing contact
  results: ContactBulkRowResult[];
};

// Identity key for a person: email + phone, BOTH must match to count as the
// same person. A shared office number or a generic org inbox is not enough on
// its own — matching on either alone would merge distinct colleagues.
export function contactDupKey(email: string | null | undefined, phone: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  const p = (phone ?? '').replace(/[\s\-()]/g, '').trim();
  if (!e || !p) return null;   // not enough to judge — never a duplicate
  return `${e}|${p}`;
}

export async function bulkCreateContacts(
  inputs: ContactCreateInput[]
): Promise<ContactBulkSummary> {
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  // Existing keys, to COUNT duplicates (not to skip them).
  const { data: existing } = await supabase
    .from('contacts').select('email, phone').is('deleted_at', null);
  const existingKeys = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (existing ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => contactDupKey(r.email, r.phone))
      .filter((k): k is string => !!k)
  );

  const results: ContactBulkRowResult[] = [];
  let created = 0, failed = 0, duplicates = 0;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const key = contactDupKey(input.email, input.phone);
    if (key && existingKeys.has(key)) duplicates++;

    try {
      const { error } = await supabase.from('contacts').insert({
        name: (input.name ?? '').trim(),
        name_ar: (input.nameAr ?? '').trim(),
        email: input.email?.trim() || null,
        organization: (input.organization ?? '').trim(),
        role: (input.role ?? '').trim(),
        phone: (input.phone ?? '').trim(),
        type: input.type ?? 'external',
        created_by_id: authUser.id,
      });
      if (error) throw new Error(error.message);
      created++;
      if (key) existingKeys.add(key);   // so later rows in this sheet count too
      results.push({ rowIndex: i, name: input.name, status: 'created' });
    } catch (err) {
      failed++;
      results.push({
        rowIndex: i,
        name: input.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return { created, failed, duplicates, results };
}

// ---- duplicate detection for the LIST --------------------------------------
// Computed at display rather than stored as a flag: the badge stays truthful
// with no cleanup job, and self-heals the moment one of the pair is deleted.
// "Is this a duplicate?" is a question about the data as it stands, not about
// what happened during an import months ago.
export function findDuplicateIds(entries: { id: string; email: string | null; phone: string }[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const c of entries) {
    const key = contactDupKey(c.email, c.phone);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(c.id);
    byKey.set(key, list);
  }
  const dupes = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) ids.forEach((id) => dupes.add(id));
  }
  return dupes;
}
