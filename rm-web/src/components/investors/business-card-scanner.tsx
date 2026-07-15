'use client';
// BusinessCardScanner — mobile camera capture with TWO modes:
//
//   • Card mode: photograph a business card -> /api/scan-business-card (Groq
//     vision OCR) -> BusinessCardData.
//   • QR mode:  photograph a QR code -> decoded IN-BROWSER with jsQR (no API,
//     nothing leaves the device) -> parsed as vCard / URL / text -> the same
//     BusinessCardData shape.
//
// Both modes funnel into the same onComplete, so the parent form is unchanged.
// QR codes are increasingly replacing paper cards, and a modern contact often
// shares a vCard QR or a LinkedIn URL rather than a printed card.
import { useRef, useState } from 'react';
import { Camera, Loader2, X, AlertCircle, QrCode, CreditCard } from 'lucide-react';
import jsQR from 'jsqr';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import type { BusinessCardData } from '@/app/api/scan-business-card/route';

type Props = {
  onComplete: (data: BusinessCardData) => void;
  onCancel: () => void;
};

type Mode = 'card' | 'qr';

const MAX_DIMENSION = 1600;     // Resize so longest edge is ≤ this many pixels
const JPEG_QUALITY = 0.85;

export function BusinessCardScanner({ onComplete, onCancel }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('card');
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    // reset the input so re-selecting the same file fires onChange again
    e.target.value = '';

    if (mode === 'qr') {
      await handleQr(file);
    } else {
      await handleCard(file);
    }
  }

  // ---- CARD: photograph -> OCR API -------------------------------------------
  async function handleCard(file: File) {
    try {
      const resized = await resizeImage(file, MAX_DIMENSION, JPEG_QUALITY);
      setPreview(resized.dataUrl);
      setScanning(true);
      const resp = await fetch('/api/scan-business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: resized.base64, mimeType: 'image/jpeg' }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const errCode = (errBody?.error as string) || `http_${resp.status}`;
        if (resp.status === 429) throw new Error(ar ? 'تم تجاوز الحد، حاول لاحقاً' : 'Rate limited, try again shortly');
        if (resp.status === 413) throw new Error(ar ? 'الصورة كبيرة جداً' : 'Image too large');
        throw new Error(errCode);
      }
      const json = await resp.json();
      onComplete(json.data as BusinessCardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setScanning(false);
    }
  }

  // ---- QR: photograph -> decode in-browser -> parse --------------------------
  async function handleQr(file: File) {
    try {
      setScanning(true);
      const { dataUrl, imageData } = await fileToImageData(file, MAX_DIMENSION);
      setPreview(dataUrl);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (!code || !code.data) {
        throw new Error(ar ? 'لم يتم العثور على رمز QR في الصورة' : 'No QR code found in the image');
      }
      const data = parseQrToCardData(code.data);
      onComplete(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {mode === 'qr'
              ? (ar ? 'مسح رمز QR' : 'Scan QR Code')
              : (ar ? 'مسح بطاقة العمل' : 'Scan Business Card')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Close"
            disabled={scanning}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* mode toggle */}
        <div className="mb-4 inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
          <button
            type="button"
            disabled={scanning}
            onClick={() => { setMode('card'); setPreview(null); setError(null); }}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ' +
              (mode === 'card' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')
            }
          >
            <CreditCard className="h-4 w-4" />
            {ar ? 'بطاقة' : 'Card'}
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => { setMode('qr'); setPreview(null); setError(null); }}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ' +
              (mode === 'qr' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')
            }
          >
            <QrCode className="h-4 w-4" />
            {ar ? 'رمز QR' : 'QR'}
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          {mode === 'qr'
            ? (ar
                ? 'التقط صورة واضحة لرمز QR. يتم فك الرمز على جهازك ولا يُرسل إلى أي خادم.'
                : 'Take a clear photo of the QR code. It is decoded on your device and never sent to a server.')
            : (ar
                ? 'التقط صورة لبطاقة العمل وسنستخرج البيانات تلقائياً. لا يتم تخزين الصورة.'
                : 'Take a clear photo of the business card. We extract the fields and discard the image.')}
        </p>

        {preview && (
          <div className="mb-4">
            <img
              src={preview}
              alt="preview"
              className="rounded-md border border-slate-200 w-full max-h-60 object-contain bg-slate-50"
            />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
          disabled={scanning}
        />

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {scanning
              ? (ar ? 'جارٍ المعالجة...' : 'Processing...')
              : preview
                ? (ar ? 'إعادة التقاط' : 'Retake')
                : (ar ? 'فتح الكاميرا' : 'Open Camera')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={scanning}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

async function resizeImage(
  file: File,
  maxDim: number,
  quality: number
): Promise<{ base64: string; dataUrl: string }> {
  const dataUrlOriginal = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrlOriginal;
  });
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unsupported');
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  return { dataUrl, base64 };
}

// Decode an image file to raw pixels for jsQR (which needs a Uint8ClampedArray).
async function fileToImageData(
  file: File,
  maxDim: number
): Promise<{ dataUrl: string; imageData: ImageData }> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = original;
  });
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unsupported');
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, imageData };
}

// A blank BusinessCardData — every field null, so we only fill what the QR gives.
function emptyCard(): BusinessCardData {
  return {
    companyName: null, companyNameAr: null,
    representativeName: null, representativeNameAr: null,
    position: null, positionAr: null,
    email: null,
    mobileNumber: null, mobileCountryCode: null,
    fixedNumber: null, fixedCountryCode: null,
    website: null, country: null, city: null,
    nationality: null, crNumber: null,
  };
}

// Parse whatever the QR encoded into BusinessCardData. Three cases:
//   • vCard (BEGIN:VCARD ...) — richest; map the standard fields.
//   • a URL — put it in website.
//   • plain text — best effort: an email or phone if we can spot one, else website.
function parseQrToCardData(raw: string): BusinessCardData {
  const text = raw.trim();
  const card = emptyCard();

  if (/^BEGIN:VCARD/i.test(text)) {
    return parseVCard(text);
  }

  if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
    card.website = text;
    return card;
  }

  // plain text — try to recognise an email or a phone number
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) card.email = email[0];
  const phone = text.match(/\+?\d[\d\s-]{6,}\d/);
  if (phone) card.mobileNumber = phone[0].replace(/[\s-]/g, '');
  if (!email && !phone) card.website = text; // nothing structured — stash it
  return card;
}

// Minimal vCard parser covering the fields business QR codes actually carry.
function parseVCard(text: string): BusinessCardData {
  const card = emptyCard();
  const lines = text.split(/\r\n|\r|\n/);

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    const key = rawKey.toUpperCase();

    if (key === 'FN') {
      card.representativeName = value;
    } else if (key.startsWith('N') && !card.representativeName) {
      // N:Last;First;... -> "First Last"
      const parts = value.split(';');
      card.representativeName = [parts[1], parts[0]].filter(Boolean).join(' ').trim() || value;
    } else if (key.startsWith('ORG')) {
      card.companyName = value.split(';')[0].trim();
    } else if (key.startsWith('TITLE')) {
      card.position = value;
    } else if (key.startsWith('EMAIL')) {
      if (!card.email) card.email = value;
    } else if (key.startsWith('TEL')) {
      const clean = value.replace(/[\s-]/g, '');
      // CELL/MOBILE -> mobile; everything else -> fixed
      if (/CELL|MOBILE/i.test(key)) {
        if (!card.mobileNumber) card.mobileNumber = clean;
      } else if (!card.fixedNumber) {
        card.fixedNumber = clean;
      }
    } else if (key.startsWith('URL')) {
      if (!card.website) card.website = value;
    } else if (key.startsWith('ADR')) {
      // ADR:;;street;city;region;postcode;country
      const parts = value.split(';');
      if (parts[3] && !card.city) card.city = parts[3].trim();
      if (parts[6] && !card.country) card.country = parts[6].trim();
    }
  }
  return card;
}
