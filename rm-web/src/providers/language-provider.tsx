'use client';

// Language + i18n provider. Wraps the app; provides `useLanguage()`.
// Language preference is stored in:
//   * localStorage (so the client knows on first render)
//   * a cookie (so SSR can render in the right language)
//
// The cookie write happens client-side. SSR reads it on the next request.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { translations, type Language } from '@/constants/i18n';

const STORAGE_KEY = 'rm_language';
const COOKIE_NAME = 'rm_language';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type LanguageContextValue = {
  language: Language;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Hydrate from localStorage on first client render (overrides server-passed initial
  // if the client has a more recent preference).
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as
      | Language
      | null;
    if (stored && (stored === 'en' || stored === 'ar') && stored !== language) {
      setLanguageState(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update <html dir> and <html lang> whenever language changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
      writeCookie(COOKIE_NAME, lang, COOKIE_MAX_AGE);
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let value: unknown = translations[language];
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{ language, isRTL: language === 'ar', setLanguage, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return ctx;
}

// Read the language cookie server-side. Used by the root layout to set
// initialLanguage so SSR matches client.
export function getLanguageFromCookie(cookieValue: string | undefined): Language {
  return cookieValue === 'ar' ? 'ar' : 'en';
}

// Re-export the readCookie helper for convenience.
export { readCookie };
