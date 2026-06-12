// Sessions list page — /sessions route.
// Server component. Renders the client list.
// Auth gating is in the dashboard layout.

import { SessionsPageClient } from './sessions-client';

export default function SessionsPage() {
  return <SessionsPageClient />;
}
