// /api/generate-mom — server-side Groq route.
//
// Takes free-form meeting notes from the admin, calls Groq Llama-4 Scout with
// a structured-JSON prompt, returns parsed MoM content + task suggestions.
//
// Auth: validates the caller's session via Supabase, then checks role is
// admin or super_admin. Any other role returns 403.
//
// PDPL note (per Batch 3 Q8 decision Jun 2026): meeting content sent to
// Groq is processed outside Saudi Arabia. Pre-pilot decision required:
// either self-host an LLM, get Groq KSA enterprise residency, or disable
// AI features for PDPL-sensitive sessions. Tracked in parking lot.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

type AiTaskSuggestion = {
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggested_due_date: string | null; // ISO date or null
};

type AiMomResult = {
  mom_content: string;
  mom_content_ar: string;
  meeting_notes: string;
  meeting_notes_ar: string;
  decisions: string;
  decisions_ar: string;
  action_items: string;
  action_items_ar: string;
  suggested_tasks: AiTaskSuggestion[];
};

// =============================================================================
// Prompt
// =============================================================================

// We ask the model to return bilingual structured output. A focused system
// prompt + JSON-only response keeps things predictable.
const SYSTEM_PROMPT = `You are a meeting-minutes assistant for the Saudi Ministry of Health (MOH) Investment Deputyship. Healthcare investment relationship management context.

The user will give you informal meeting notes / bullet points. Produce formal minutes-of-meeting content in BOTH English and Arabic.

Output structure (JSON only, no markdown, no commentary):
{
  "mom_content": "Full minutes of meeting — formal paragraph form, English",
  "mom_content_ar": "Same content in Arabic — formal MOH register",
  "meeting_notes": "Additional context, observations, side discussions — English",
  "meeting_notes_ar": "Same in Arabic",
  "decisions": "Numbered or bulleted list of decisions reached — English",
  "decisions_ar": "Same in Arabic",
  "action_items": "Numbered or bulleted list of action items with owners if mentioned — English",
  "action_items_ar": "Same in Arabic",
  "suggested_tasks": [
    {
      "title": "Short imperative task title (English)",
      "title_ar": "Arabic version",
      "description": "1-3 sentence detail (English)",
      "description_ar": "Arabic version",
      "priority": "low" | "medium" | "high" | "urgent",
      "suggested_due_date": "YYYY-MM-DD or null"
    }
  ]
}

Rules:
- Always produce both English and Arabic for every text field. Never leave one blank.
- The Arabic must be formal Modern Standard Arabic suitable for MOH government correspondence (not colloquial).
- Be comprehensive on suggested_tasks: include every actionable item the notes mention or imply. If notes mention nothing actionable, return empty array.
- Priorities (use ONLY these exact values): 'critical' for items with explicit deadlines under 48 hours or clear escalation language; 'high' for items with explicit deadlines under 2 weeks; 'medium' as the default; 'low' only for nice-to-haves. Do not use 'urgent' or any other value.
- suggested_due_date should be inferred from the notes (e.g. "by next Thursday") OR left null. Do not fabricate dates.
- If the input language is unclear, assume the more dominant of EN/AR and translate the other. Never omit a language.
- Return ONLY the JSON. No \`\`\`json fences, no preamble.`;

// =============================================================================
// POST handler
// =============================================================================

export async function POST(req: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  // 2. Role check — must be admin or super_admin (Q4)
  const { data: appUser, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (userErr || !appUser) {
    return NextResponse.json({ error: 'user_lookup_failed' }, { status: 500 });
  }
  if (appUser.role !== 'admin' && appUser.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 3. Parse body
  let body: { notes?: string; session_context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const notes = body.notes?.trim();
  if (!notes || notes.length < 10) {
    return NextResponse.json(
      { error: 'notes_too_short', message: 'Provide at least 10 characters of meeting notes' },
      { status: 400 }
    );
  }
  if (notes.length > 10000) {
    return NextResponse.json(
      { error: 'notes_too_long', message: 'Maximum 10,000 characters' },
      { status: 400 }
    );
  }

  // 4. Check Groq API key
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('[generate-mom] GROQ_API_KEY env var missing');
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  // 5. Call Groq
  const userPrompt = body.session_context
    ? `Session context (for tone/topic reference only):\n${body.session_context}\n\nMeeting notes to formalize:\n${notes}`
    : notes;

  let groqResponse: Response;
  try {
    groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,    // Lower temp for structured output consistency
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    console.error('[generate-mom] Groq fetch failed:', err);
    return NextResponse.json({ error: 'ai_request_failed' }, { status: 502 });
  }

  if (!groqResponse.ok) {
    const errBody = await groqResponse.text().catch(() => '');
    console.error('[generate-mom] Groq returned non-OK:', groqResponse.status, errBody);
    return NextResponse.json(
      { error: 'ai_upstream_error', status: groqResponse.status },
      { status: 502 }
    );
  }

  // 6. Parse Groq response
  let groqData: { choices?: Array<{ message?: { content?: string } }> };
  try {
    groqData = await groqResponse.json();
  } catch {
    return NextResponse.json({ error: 'ai_response_not_json' }, { status: 502 });
  }

  const rawText = groqData.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    return NextResponse.json({ error: 'ai_returned_empty' }, { status: 502 });
  }

  let parsed: AiMomResult;
  try {
    parsed = JSON.parse(rawText) as AiMomResult;
  } catch (err) {
    console.error('[generate-mom] Failed to parse model JSON:', err, rawText.slice(0, 500));
    return NextResponse.json(
      { error: 'ai_returned_invalid_json', raw_preview: rawText.slice(0, 200) },
      { status: 502 }
    );
  }

  // 7. Basic sanitation — guarantee all fields exist
  const safe: AiMomResult = {
    mom_content: parsed.mom_content || '',
    mom_content_ar: parsed.mom_content_ar || '',
    meeting_notes: parsed.meeting_notes || '',
    meeting_notes_ar: parsed.meeting_notes_ar || '',
    decisions: parsed.decisions || '',
    decisions_ar: parsed.decisions_ar || '',
    action_items: parsed.action_items || '',
    action_items_ar: parsed.action_items_ar || '',
    suggested_tasks: Array.isArray(parsed.suggested_tasks)
      ? parsed.suggested_tasks
          .filter((t) => t && t.title && t.title_ar)
          .map((t) => ({
            title: t.title,
            title_ar: t.title_ar,
            description: t.description || '',
            description_ar: t.description_ar || '',
            priority: ['low', 'medium', 'high', 'critical'].includes(t.priority as string)
              ? (t.priority as 'low' | 'medium' | 'high' | 'critical')
              : 'medium',
            suggested_due_date: t.suggested_due_date || null,
          }))
      : [],
  };

  return NextResponse.json(safe);
}
