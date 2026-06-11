'use client';

// BusinessCardScanner — mobile camera capture that calls /api/scan-business-card.
//
// Flow:
//   1. User opens scanner (only on mobile; gated upstream).
//   2. Native camera UI via <input type="file" accept="image/*" capture="environment">.
//   3. Selected image is read as base64.
//   4. POSTed to our /api route, which calls Groq Llama-4 Scout Vision.
//   5. Returned BusinessCardData is bubbled to the parent via onComplete.
//
// We compress the image with canvas before sending to keep payload tiny
// (Groq has token limits on vision inputs and we save bandwidth on slow
// mobile connections).

import { useRef, useState } from 'react';
import { Camera, Loader2, X, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import type { BusinessCardData } from '@/app/api/scan-business-card/route';

type Props = {
  onComplete: (data: BusinessCardData) => void;
  onCancel: () => void;
};

const MAX_DIMENSION = 1600;     // Resize so longest edge is ≤ this many pixels
const JPEG_QUALITY = 0.85;

export function BusinessCardScanner({ onComplete, onCancel }: Props) {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      // Decode + resize via canvas
      const resized = await resizeImage(file, MAX_DIMENSION, JPEG_QUALITY);
      setPreview(resized.dataUrl);

      // Send to API
      setScanning(true);
      const resp = await fetch('/api/scan-business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: resized.base64,
          mimeType: 'image/jpeg',
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const errCode = (errBody?.error as string) || `http_${resp.status}`;
        // Friendlier error mapping
        if (resp.status === 429) {
          throw new Error(language === 'ar' ? 'تم تجاوز الحد، حاول لاحقاً' : 'Rate limited, try again shortly');
        }
        if (resp.status === 413) {
          throw new Error(language === 'ar' ? 'الصورة كبيرة جداً' : 'Image too large');
        }
        throw new Error(errCode);
      }

      const json = await resp.json();
      const data = json.data as BusinessCardData;
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
            {language === 'ar' ? 'مسح بطاقة العمل' : 'Scan Business Card'}
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

        <p className="text-sm text-slate-600 mb-4">
          {language === 'ar'
            ? 'التقط صورة لبطاقة العمل وسنستخرج البيانات تلقائياً. لا يتم تخزين الصورة.'
            : 'Take a clear photo of the business card. We extract the fields and discard the image.'}
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
              ? (language === 'ar' ? 'جارٍ المعالجة...' : 'Processing...')
              : preview
                ? (language === 'ar' ? 'إعادة التقاط' : 'Retake')
                : (language === 'ar' ? 'فتح الكاميرا' : 'Open Camera')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={scanning}
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
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
  // 1. Read file as image
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

  // 2. Compute target size keeping aspect ratio
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  // 3. Draw to canvas, export as JPEG
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
