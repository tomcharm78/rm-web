import { createClient } from '@/lib/supabase/client';

export type ChallengeJournalEntry = {
  id: string;
  challengeId: string;
  authorId: string;
  body: string;
  authorName: string;
  authorNameAr: string;
  authorDepartment: string;
  authorDepartmentAr: string;
  createdAt: string;
  editedAt: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): ChallengeJournalEntry {
  return {
    id: r.id,
    challengeId: r.challenge_id,
    authorId: r.author_id,
    body: r.body,
    authorName: r.author_name ?? '',
    authorNameAr: r.author_name_ar ?? '',
    authorDepartment: r.author_department ?? '',
    authorDepartmentAr: r.author_department_ar ?? '',
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
  };
}

export async function listChallengeJournal(challengeId: string): Promise<ChallengeJournalEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('challenge_journal').select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToEntry(r));
}

// attribution (name + department, both languages) is resolved by the caller and
// stored on the row at post time — stable even if the author later moves department.
export async function createChallengeJournalEntry(input: {
  challengeId: string;
  body: string;
  authorName: string;
  authorNameAr: string;
  authorDepartment: string;
  authorDepartmentAr: string;
}): Promise<ChallengeJournalEntry> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error('not authenticated');
  const { data, error } = await supabase.from('challenge_journal').insert({
    challenge_id: input.challengeId,
    author_id: me,
    body: input.body.trim(),
    author_name: input.authorName,
    author_name_ar: input.authorNameAr,
    author_department: input.authorDepartment,
    author_department_ar: input.authorDepartmentAr,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

// single edit, within one hour — also enforced by RLS. If the DB refuses (window
// closed or already edited), no row comes back and we surface a clear message.
export async function editChallengeJournalEntry(entryId: string, body: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from('challenge_journal')
    .update({ body: body.trim(), edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('This comment can no longer be edited.');
  }
}
