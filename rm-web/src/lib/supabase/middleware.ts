// Supabase middleware helper.
//
// Runs on EVERY request before the page/route handler. Three responsibilities:
//   1. Refresh the auth session (Supabase tokens expire — refresh transparently)
//   2. Enforce route guards:
//      a. Unauthenticated users on protected routes → redirect to /login
//      b. Authenticated users on /login → redirect to /
//      c. Authenticated users with force_password_change=true → /force-password-change
//      d. Authenticated users with role='investor' → sign out + redirect to /login
//      e. Authenticated users with is_active=false → sign out + redirect to /login
//
// IMPORTANT: middleware runs in the Edge runtime; use only edge-compatible code.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/survey', '/api/public-survey'];
const FORCE_CHANGE_PATH = '/force-password-change';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do NOT remove this getUser() call — it refreshes the session token.
  // Calling getSession() alone would NOT trigger token refresh.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + '/')
  );

  // Case (a): not authed, on a protected route → /login
  if (!authUser && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authed: pull the application user row to check role / status flags.
  // Without this query we can't enforce force_password_change or investor lockout.
  // A tiny extra DB hit per request — acceptable for a pilot. We can cache later.
  if (authUser) {
    const { data: appUser } = await supabase
      .from('users')
      .select('role, is_active, force_password_change')
      .eq('id', authUser.id)
      .single();

    // Case (d): investor role → not allowed in app
    // Case (e): inactive account → not allowed in app
    if (!appUser || appUser.role === 'investor' || !appUser.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set(
        'reason',
        !appUser ? 'unknown' : appUser.role === 'investor' ? 'no_access' : 'inactive'
      );
      return NextResponse.redirect(url);
    }

    // Case (c): force password change → /force-password-change (unless already there)
    if (appUser.force_password_change && path !== FORCE_CHANGE_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = FORCE_CHANGE_PATH;
      return NextResponse.redirect(url);
    }

    // Inverse of (c): user has cleared force_password_change but is still on that page
    if (!appUser.force_password_change && path === FORCE_CHANGE_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Case (b): authed user on /login → /
    if (isPublicPath && path === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
