import { createClient } from '@/lib/supabase/client';
import type {
  Contact, ContactCreateInput, ContactUpdateInput, ContactType, DirectoryEntry,
} from '@/types/contact';

async function uid(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('not authenticated');
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToContact(r: any): Contact {
  return {
    id: r.id,
    name: r.name,
    nameAr: r.name_ar ?? '',
    email: r.email ?? null,
    organization: r.organization ?? '',
    role: r.role ?? '',
    phone: r.phone ?? '',
    type: (r.type ?? 'external') as ContactType,
    createdById: r.created_by_id,
    editedById: r.edited_by_id ?? null,
    createdAt: r.created_at,
  };
}

// ---- editable contacts ----

export async function listContacts(): Promise<Contact[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('contacts').select('*')
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToContact(r));
}

export async function createContact(input: ContactCreateInput): Promise<Contact> {
  const supabase = createClient();
  const me = await uid();
  const { data, error } = await supabase.from('contacts').insert({
    name: input.name.trim(),
    name_ar: (input.nameAr ?? '').trim(),
    email: input.email?.trim() || null,
    organization: (input.organization ?? '').trim(),
    role: (input.role ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    type: input.type ?? 'external',
    created_by_id: me,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToContact(data);
}

export async function updateContact(id: string, patch: ContactUpdateInput): Promise<void> {
  const supabase = createClient();
  const me = await uid();
  const row: Record<string, unknown> = { edited_by_id: me, updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.nameAr !== undefined) row.name_ar = patch.nameAr.trim();
  if (patch.email !== undefined) row.email = patch.email?.trim() || null;
  if (patch.organization !== undefined) row.organization = patch.organization.trim();
  if (patch.role !== undefined) row.role = patch.role.trim();
  if (patch.phone !== undefined) row.phone = patch.phone.trim();
  if (patch.type !== undefined) row.type = patch.type;
  const { error } = await supabase.from('contacts').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function softDeleteContact(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('contacts')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- merged directory (contacts + investor reps, read-only) ----

export async function listDirectory(): Promise<DirectoryEntry[]> {
  const supabase = createClient();

  const contacts = await listContacts();
  const contactEntries: DirectoryEntry[] = contacts.map((c) => ({
    source: 'contact',
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    email: c.email,
    organization: c.organization,
    role: c.role,
    phone: c.phone,
    type: c.type,
    editable: true,
    contact: c,
  }));

  // investor representatives, read live; never copied into contacts
  const { data: inv, error } = await supabase
    .from('investors')
    .select('id, representative_name, representative_name_ar, position, position_ar, email, mobile_number, mobile_country_code, company_name, company_name_ar')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const investorEntries: DirectoryEntry[] = (inv ?? []).map((r: any) => {
    const phone = [r.mobile_country_code, r.mobile_number].filter(Boolean).join(' ').trim();
    return {
      source: 'investor' as const,
      id: 'inv_' + r.id,
      name: r.representative_name ?? '',
      nameAr: r.representative_name_ar ?? '',
      email: r.email ?? null,
      organization: r.company_name ?? '',
      role: r.position ?? '',
      phone,
      type: 'investor' as const,
      editable: false,
      investorId: r.id,
    };
  });

  return [...contactEntries, ...investorEntries];
}
// ---- push session attendees into the contacts directory ----
// For each attendee: match on email (if present) else exact name; create if no match.
// Partial details are fine (no email/phone). Reuses createContact so the insert
// satisfies RLS (created_by_id etc). Non-fatal — failures never block the session save.
export async function upsertContactsFromAttendees(attendees: {
  name: string; nameAr?: string;
  position?: string; organization?: string; organizationAr?: string;
  email?: string | null; phone?: string;
}[]): Promise<void> {
  try {
    const existing = await listContacts();
    for (const att of attendees) {
      const name = (att.name ?? '').trim();
      if (!name) continue; // skip nameless attendees
      const email = (att.email ?? '').trim().toLowerCase();

      const match = existing.find((c) => {
        if (email && c.email) return c.email.trim().toLowerCase() === email;
        return c.name.trim().toLowerCase() === name.toLowerCase();
      });
      if (match) continue; // already in the directory

      await createContact({
        name,
        nameAr: att.nameAr?.trim() || '',
        email: email || null,
        organization: (att.organization ?? '').trim(),
        role: (att.position ?? '').trim(),
        phone: (att.phone ?? '').trim(),
        type: 'external',
      });
    }
  } catch {
    // never block the session save on a directory write
  }
}