// Tasks list page — server entry. Access gated client-side; RLS enforces the rest.
import { TasksClient } from './tasks-client';

export default function TasksPage() {
  return <TasksClient />;
}