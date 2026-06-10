// Supabase client for use in SERVER components and route handlers.
// Reads auth cookies via Next.js cookies() API — keeps the session SSR-aware.
//
// USAGE in a server component or route handler:
//   import { createClient } from '@/lib/supabase/server';
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component — that's allowed when
            // we're inside an action or route handler; otherwise it throws,
            // which we swallow because middleware will refresh the session anyway.
          }
        },
      },
    }
  );
}
