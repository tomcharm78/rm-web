'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  // Create once per browser session. State, not module-level, so each user/test gets a clean instance.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds — sensible default for an internal app
            refetchOnWindowFocus: false, // disruptive for a desktop app
            retry: 1,
          },
          mutations: {
            retry: 0, // don't auto-retry destructive operations
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
