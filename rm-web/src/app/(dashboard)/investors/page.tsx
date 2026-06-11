// Investors page — the /investors route.
//
// Server component. Renders the InvestorsPageClient, passing it nothing —
// the client component does its own data fetching via the data layer. We
// keep it that way (vs. SSR'ing the initial data) because:
//   1. Investors data changes frequently — stale SSR would force refetch anyway
//   2. Mutations (add/edit/delete) need to refresh the list, which is easier
//      with a client-side data-fetch hook
//   3. The shell already provides server-side auth gating
//
// Auth check is in the dashboard layout (defense in depth) — no need to
// repeat it here.

import { InvestorsPageClient } from './investors-client';

export default function InvestorsPage() {
  return <InvestorsPageClient />;
}
