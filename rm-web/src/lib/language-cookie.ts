// Pure helper for reading the language cookie on the server.
// Lives in its own file (no 'use client') so server components can import it.
import type { Language } from '@/constants/i18n';

export function getLanguageFromCookie(cookieValue: string | undefined): Language {
  return cookieValue === 'ar' ? 'ar' : 'en';
}
