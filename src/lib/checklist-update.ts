/**
 * Compute the update object for a checklist item.
 * Pure function for testing idempotency.
 */
export function computeChecklistUpdate(isCompleted: boolean) {
  return {
    is_completed: isCompleted,
    completed_at: isCompleted ? new Date().toISOString() : null,
  }
}
