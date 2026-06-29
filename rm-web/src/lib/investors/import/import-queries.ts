import { createClient } from '@/lib/supabase/client';
import { formInputToDbInsert, type InvestorFormInput } from '@/types/investor';

export type BulkRowResult = {
  rowIndex: number;
  email: string;
  company: string;
  status: 'created' | 'skipped_duplicate' | 'failed';
  error?: string;
};

export type BulkImportSummary = {
  created: number;
  skippedDuplicate: number;
  failed: number;
  results: BulkRowResult[];
};

// Insert many investors. Tagged source_system='upload'. Skips rows whose
// email already exists as an investor (by lowercase email). Per-row results.
export async function bulkCreateInvestors(inputs: InvestorFormInput[]): Promise<BulkImportSummary> {
  const supabase = createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');
  const { data: appUser } = await supabase
    .from('users').select('organization_id').eq('id', authUser.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (appUser as any)?.organization_id;
  if (!orgId) throw new Error('no_org');

  // fetch existing investor emails up front (one query) to skip duplicates
  const { data: existing } = await supabase
    .from('investors').select('email').is('deleted_at', null);
  const existingEmails = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (existing ?? []).map((r: any) => String(r.email ?? '').trim().toLowerCase()).filter(Boolean)
  );

  const results: BulkRowResult[] = [];
  let created = 0, skippedDuplicate = 0, failed = 0;

  // also guard against duplicates WITHIN the same sheet
  const seenInBatch = new Set<string>();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const email = input.email.trim().toLowerCase();
    const company = input.companyName;

    if (email && (existingEmails.has(email) || seenInBatch.has(email))) {
      skippedDuplicate++;
      results.push({ rowIndex: i, email, company, status: 'skipped_duplicate' });
      continue;
    }

    try {
      const insertRow = formInputToDbInsert(input, orgId, authUser.id, 'upload');
      const { error } = await supabase.from('investors').insert(insertRow);
      if (error) throw new Error(error.message);
      created++;
      if (email) seenInBatch.add(email);
      results.push({ rowIndex: i, email, company, status: 'created' });
    } catch (e) {
      failed++;
      results.push({
        rowIndex: i, email, company, status: 'failed',
        error: e instanceof Error ? e.message : 'insert_failed',
      });
    }
  }

  return { created, skippedDuplicate, failed, results };
}
