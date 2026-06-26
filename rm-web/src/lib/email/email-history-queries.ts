import { createClient } from '@/lib/supabase/client';

export type EmailBatch = {
  id: string;
  subjectTemplate: string;
  bodyTemplate: string;
  cc: string;
  replyTo: string;
  attachmentPaths: string[];
  recipientCount: number;
  successCount: number;
  failCount: number;
  sentById: string;
  createdAt: string;
};

export type SentEmail = {
  id: string;
  batchId: string;
  investorId: string | null;
  recipientEmail: string;
  recipientName: string;
  status: string;
  error: string | null;
  sentAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBatch(r: any): EmailBatch {
  return {
    id: r.id,
    subjectTemplate: r.subject_template,
    bodyTemplate: r.body_template,
    cc: r.cc ?? '',
    replyTo: r.reply_to ?? '',
    attachmentPaths: Array.isArray(r.attachment_paths) ? r.attachment_paths : [],
    recipientCount: r.recipient_count ?? 0,
    successCount: r.success_count ?? 0,
    failCount: r.fail_count ?? 0,
    sentById: r.sent_by_id,
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSent(r: any): SentEmail {
  return {
    id: r.id,
    batchId: r.batch_id,
    investorId: r.investor_id ?? null,
    recipientEmail: r.recipient_email,
    recipientName: r.recipient_name ?? '',
    status: r.status ?? 'sent',
    error: r.error ?? null,
    sentAt: r.sent_at,
  };
}

export async function listEmailBatches(): Promise<EmailBatch[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('email_batches').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => toBatch(r));
}

export async function listBatchRecipients(batchId: string): Promise<SentEmail[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sent_emails').select('*').eq('batch_id', batchId).order('sent_at', { ascending: true });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => toSent(r));
}

// all emails sent to one investor (per-investor history)
export async function listInvestorEmails(investorId: string): Promise<SentEmail[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sent_emails').select('*').eq('investor_id', investorId).order('sent_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => toSent(r));
}

// re-merge a template with one investor's data (reconstruct what they received)
export async function reMergeForInvestor(template: string, investorId: string | null): Promise<string> {
  if (!investorId) return template;
  const supabase = createClient();
  const { data } = await supabase
    .from('investors')
    .select('representative_name, representative_name_ar, company_name, company_name_ar, position, position_ar, email')
    .eq('id', investorId).maybeSingle();
  if (!data) return template;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = data as any;
  const map: Record<string, string> = {
    '{representative_name}': inv.representative_name ?? '',
    '{representative_name_ar}': inv.representative_name_ar ?? '',
    '{company_name}': inv.company_name ?? '',
    '{company_name_ar}': inv.company_name_ar ?? '',
    '{position}': inv.position ?? '',
    '{position_ar}': inv.position_ar ?? '',
    '{email}': inv.email ?? '',
  };
  let out = template;
  for (const [token, val] of Object.entries(map)) out = out.split(token).join(val);
  return out;
}
