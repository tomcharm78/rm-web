// Session detail page — /sessions/[id] route.
// Server component reads the route param and passes it to the client component.

import { SessionDetailClient } from './session-detail-client';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionDetailClient id={id} />;
}
