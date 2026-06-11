// /api/scan-business-card — server-side AI OCR for business cards.
//
// SECURITY: This is a Next.js API route, NOT a client component. It runs on
// our server (Vercel function in production, Codespace in dev). The Groq key
// never leaves the server.
//
// FLOW:
//   1. Client POSTs { imageBase64: "...", mimeType: "image/jpeg" }
//   2. We verify the user is authenticated via Supabase session cookie.
//   3. We send the image to Groq's Llama 4 Scout vision model with a strict
//      JSON-mode prompt that extracts ~15 business card fields.
//   4. Groq returns parsed JSON. We validate it minimally and pass it back.
//   5. The client uses the result to pre-fill the Add Investor form.
//
// PDPL POSTURE: image is held in memory only during the request, never
// written to disk, never logged. Groq itself does not retain user data
// in their inference path. After the API call returns, the image is GC'd.
//
// FAILURE MODES we handle:
//   - User not authenticated → 401
//   - Image too large (>4 MB) → 413
//   - Groq returns malformed JSON → 502 with the raw response in the error
//   - Groq rate limit → 429 with retry-after
//   - Network error → 503

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// --- Config -----------------------------------------------------------------

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB before base64 expansion

// --- Request / Response types ----------------------------------------------

type ScanRequest = {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export type BusinessCardData = {
  companyName: string | null;
  companyNameAr: string | null;
  representativeName: string | null;
  representativeNameAr: string | null;
  position: string | null;
  positionAr: string | null;
  email: string | null;
  mobileNumber: string | null;
  mobileCountryCode: string | null;
  fixedNumber: string | null;
  fixedCountryCode: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  nationality: string | null;
  crNumber: string | null;
};

// --- Prompt ----------------------------------------------------------------

const SYSTEM_PROMPT = `You are an OCR + extraction model specialized in business cards.
You will be given an image of a business card. The card may contain English,
Arabic, or both. Extract the following fields and return STRICT JSON.

Rules:
- Return null for any field that is not clearly present on the card.
- For phone numbers, split into country code (with leading +) and the rest.
  e.g. "+966 50 123 4567" -> countryCode: "+966", number: "501234567".
- The "Ar" suffix fields hold the Arabic-script version, if present.
  If only English is present, the Arabic fields are null. Do not transliterate.
- "nationality" is inferred from the country if the card doesn't say it
  explicitly (e.g. Saudi for Saudi Arabia).
- "crNumber" is the commercial registration number if present, otherwise null.
- Output ONLY the JSON object. No markdown, no commentary, no code fences.`;

const JSON_SCHEMA_HINT = `{
  "companyName": string | null,
  "companyNameAr": string | null,
  "representativeName": string | null,
  "representativeNameAr": string | null,
  "position": string | null,
  "positionAr": string | null,
  "email": string | null,
  "mobileNumber": string | null,
  "mobileCountryCode": string | null,
  "fixedNumber": string | null,
  "fixedCountryCode": string | null,
  "website": string | null,
  "country": string | null,
  "city": string | null,
  "nationality": string | null,
  "crNumber": string | null
}`;

// --- Handler ---------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. AuthN — we don't allow anonymous scans (each scan costs an API call).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: ScanRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.imageBase64 || !body.mimeType) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Reject unsupported mime types.
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(body.mimeType)) {
    return NextResponse.json({ error: 'unsupported_mime_type' }, { status: 415 });
  }

  // 3. Size check — base64 is ~33% bigger than binary, so size cap on b64 string.
  if (body.imageBase64.length > Math.floor(MAX_IMAGE_BYTES * 1.4)) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  // 4. Server-side env vars
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
  if (!apiKey) {
    console.error('[scan-business-card] GROQ_API_KEY missing');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  // 5. Build the Groq request
  const dataUrl = `data:${body.mimeType};base64,${body.imageBase64}`;
  const groqBody = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract the business card fields and return JSON matching this schema:\n${JSON_SCHEMA_HINT}`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.1, // deterministic enough for OCR
  };

  // 6. Call Groq
  let groqResp: Response;
  try {
    groqResp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groqBody),
    });
  } catch (err) {
    console.error('[scan-business-card] Groq network error:', err);
    return NextResponse.json({ error: 'ai_service_unreachable' }, { status: 503 });
  }

  if (groqResp.status === 429) {
    const retryAfter = groqResp.headers.get('retry-after') ?? '60';
    return NextResponse.json(
      { error: 'ai_rate_limited', retry_after_seconds: parseInt(retryAfter, 10) },
      { status: 429 }
    );
  }

  if (!groqResp.ok) {
    const errText = await groqResp.text();
    console.error('[scan-business-card] Groq error', groqResp.status, errText);
    return NextResponse.json(
      { error: 'ai_service_error', status: groqResp.status, detail: errText.slice(0, 500) },
      { status: 502 }
    );
  }

  // 7. Parse the model's reply
  const groqJson = await groqResp.json();
  const rawContent = groqJson?.choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string') {
    console.error('[scan-business-card] Groq returned unexpected shape:', JSON.stringify(groqJson).slice(0, 500));
    return NextResponse.json({ error: 'ai_unexpected_shape' }, { status: 502 });
  }

  let parsed: BusinessCardData;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    console.error('[scan-business-card] Model returned non-JSON:', rawContent.slice(0, 500));
    return NextResponse.json({ error: 'ai_returned_non_json', raw: rawContent.slice(0, 500) }, { status: 502 });
  }

  // 8. Sanitize — make sure every key exists (even if null) so the client doesn't crash
  const result: BusinessCardData = {
    companyName: stringOrNull(parsed.companyName),
    companyNameAr: stringOrNull(parsed.companyNameAr),
    representativeName: stringOrNull(parsed.representativeName),
    representativeNameAr: stringOrNull(parsed.representativeNameAr),
    position: stringOrNull(parsed.position),
    positionAr: stringOrNull(parsed.positionAr),
    email: stringOrNull(parsed.email),
    mobileNumber: stringOrNull(parsed.mobileNumber),
    mobileCountryCode: stringOrNull(parsed.mobileCountryCode),
    fixedNumber: stringOrNull(parsed.fixedNumber),
    fixedCountryCode: stringOrNull(parsed.fixedCountryCode),
    website: stringOrNull(parsed.website),
    country: stringOrNull(parsed.country),
    city: stringOrNull(parsed.city),
    nationality: stringOrNull(parsed.nationality),
    crNumber: stringOrNull(parsed.crNumber),
  };

  return NextResponse.json({ data: result });
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}