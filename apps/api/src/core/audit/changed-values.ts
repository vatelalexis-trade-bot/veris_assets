/**
 * Old and new values of the fields a change touches, for the audit log: only the fields sent,
 * and only those whose value actually changes.
 */
export function changedValues<T extends object>(
  before: T,
  changes: Partial<T>,
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(changes)) {
    const previous = (before as Record<string, unknown>)[field];
    if (value === undefined || previous === value) continue;
    oldValue[field] = previous ?? null;
    newValue[field] = value;
  }
  return { oldValue, newValue };
}
