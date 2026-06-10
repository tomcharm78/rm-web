import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LanguageProvider } from '@/providers/language-provider';
import { getLanguageFromCookie } from '@/lib/language-cookie';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'RM Platform',
  description: 'Relationship Management Platform',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialLanguage = getLanguageFromCookie(cookieStore.get('rm_language')?.value);

  return (
    <html lang={initialLanguage} dir={initialLanguage === 'ar' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          <LanguageProvider initialLanguage={initialLanguage}>
            <AuthProvider>{children}</AuthProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
