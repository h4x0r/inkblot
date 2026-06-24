/**
 * Structured audit line → Vercel function logs → Axiom (filterable per project).
 * Deliberately log-only (no database): a who/what/when trail for operability,
 * retained per the platform's log retention, not stored by the app.
 */
export function audit(event: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- structured audit log (drains to Axiom)
  console.log(
    JSON.stringify({ kind: "inkblot.audit", ts: Date.now(), ...event }),
  );
}
