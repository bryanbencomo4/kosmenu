/**
 * Who may send a staff message while a conversation is in human_handling.
 * Assignee always; administrador (or owner mapped as administrador) may assist.
 */
export function canSendStaffMessage(input: {
  assignedUserId: string | null | undefined;
  actorUserId: string;
  role: string;
}): boolean {
  const assigned = String(input.assignedUserId || '').trim();
  const actor = String(input.actorUserId || '').trim();
  if (!actor) return false;
  if (!assigned || assigned === actor) return true;
  return String(input.role || '') === 'administrador';
}
