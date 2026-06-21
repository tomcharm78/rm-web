import { NextResponse } from 'next/server';

const SYSTEM = `You assist an officer at a Saudi Ministry of Health Investment Deputyship who keeps a journal of strategic investment "challenges" — long-horizon, multi-stakeholder cases (regulatory, financial, licensing, etc.).
Write a concise, professional journal follow-up entry in BOTH English and Arabic. Use a formal government register. The Arabic must read naturally, not as a literal word-for-word translation. Do not invent facts that are not present in the input.
Return JSON ONLY — no markdown, no commentary — exactly in this shape:
{"body_en":"...","body_ar":"..."}`;

export async function POST(req: Request) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('[challenge-journal-assist] GROQ_API_KEY env var missing');
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  let input: {
    mode?: string;
    notes?: string;
    challengeTitle?: string;
    challengeDescription?: string;
    recentEntries?: string[];
  };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const mode = input.mode === 'summary' ? 'summary' : 'draft';
  const title = (input.challengeTitle || '').slice(0, 500);
  const description = (input.challengeDescription || '').slice(0, 4000);
  const notes = (input.notes || '').slice(0, 4000);
  const recent = Array.isArray(input.recentEntries)
    ? input.recentEntries.slice(-10).map((e) => String(e).slice(0, 1500))
    : [];

  let userPrompt: string;
  if (mode === 'summary') {
    userPrompt =
      `Summarize the CURRENT STATE of this challenge as a single journal entry suitable for a management update.\n\n` +
      `Challenge: ${title}\nDescription: ${description}\n\n` +
      `Recent journal entries (oldest to newest):\n` +
      (recent.length ? recent.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(none yet)');
  } else {
    userPrompt =
      `Turn these rough notes into a clear, professional journal follow-up entry. Keep all facts; do not add new ones.\n\n` +
      `Rough notes:\n${notes || '(empty)'}\n\n` +
      `For context — Challenge: ${title} — ${description}`;
  }

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
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    console.error('[challenge-journal-assist] fetch failed:', err);
    return NextResponse.json({ error: 'ai_request_failed' }, { status: 502 });
  }

  if (!groqResponse.ok) {
    const errBody = await groqResponse.text().catch(() => '');
    console.error('[challenge-journal-assist] Groq non-OK:', groqResponse.status, errBody);
    return NextResponse.json({ error: 'ai_upstream_error', status: groqResponse.status }, { status: 502 });
  }

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

  let parsed: { body_en?: string; body_ar?: string };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: 'ai_returned_empty' }, { status: 502 });
  }

  return NextResponse.json({
    bodyEn: parsed.body_en || '',
    bodyAr: parsed.body_ar || '',
  });
}
