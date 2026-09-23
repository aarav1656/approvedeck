// Destructive-intent detection.
//
// Judge finding #4: matching only the tool *name* is a hole — a benign-sounding
// tool like `run_sql` can carry `DROP TABLE payments` in its payload and would
// have sailed through as a one-click approve. We raise the flag on the name OR
// the serialized arguments.

/** Tool names that are destructive by construction. */
export const DESTRUCTIVE_NAME_RE = /execute|exec|delete|drop|truncate|write/i;

/** Verbs that make a *payload* destructive regardless of the tool name. */
export const DESTRUCTIVE_PAYLOAD_RE = /\b(drop|delete|truncate|alter)\b/i;

/** True when either the tool name or its payload indicates a destructive op. */
export function isDestructive(toolName: string, toolArgs?: string): boolean {
  if (DESTRUCTIVE_NAME_RE.test(toolName)) return true;
  return !!toolArgs && DESTRUCTIVE_PAYLOAD_RE.test(toolArgs);
}
