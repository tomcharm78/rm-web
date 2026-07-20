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

// Duplicate = the same email AT THE SAME COMPANY. The same person at a
  // different company is a legitimate new record — people change employers, and
  // one person can represent two entities. So the key is email+company, not
  // email alone.
  const { data: existing } = await supabase
    .from('investors').select('email, company_name').is('deleted_at', null);
  const dupKey = (email: string, company: string) =>
    `${email.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
  const existingKeys = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (existing ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => dupKey(String(r.email ?? ''), String(r.company_name ?? '')))
      .filter((k) => k !== '|')
  );

  const results: BulkRowResult[] = [];
  let created = 0, skippedDuplicate = 0, failed = 0;

  // also guard against duplicates WITHIN the same sheet
  const seenInBatch = new Set<string>();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const email = input.email.trim().toLowerCase();
    const company = input.companyName;

    const key = dupKey(email, company);
    if (email && company && (existingKeys.has(key) || seenInBatch.has(key))) {
      skippedDuplicate++;
      results.push({ rowIndex: i, email, company, status: 'skipped_duplicate' });
      continue;
    }

    try {
      const insertRow = formInputToDbInsert(input, orgId, authUser.id, 'upload');
      const { error } = await supabase.from('investors').insert(insertRow);
      if (error) throw new Error(error.message);
      created++;
      if (email && company) seenInBatch.add(key);
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
