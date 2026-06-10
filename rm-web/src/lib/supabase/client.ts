// Supabase client for use in CLIENT components.
// Wraps `createBrowserClient` from @supabase/ssr — handles auth cookies + storage events.
//
// USAGE in a client component:
//   'use client';
//   import { createClient } from '@/lib/supabase/client';
//   const supabase = createClient();
//   const { data } = await supabase.from('users').select('*');

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
