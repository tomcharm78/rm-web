// Next.js middleware entry point. Runs on every request matching the matcher.
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all paths EXCEPT static assets, images, favicon, and API auth routes.
    // This regex is the Next.js-recommended default for auth middleware.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
