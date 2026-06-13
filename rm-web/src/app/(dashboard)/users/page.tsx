// Users (members) page — server entry. Renders the client roster.
// Access is gated client-side in UsersClient (manage_users / admin / super_admin)
// and enforced server-side by RLS on every query.

import { UsersClient } from './users-client';

export default function UsersPage() {
  return <UsersClient />;
}