#!/usr/bin/env node
// Creates a TrueForge session that drives an agent toward an approval gate,
// so ApproveDeck has something live to display.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ⚠  DEMO SCRIPT — READ BEFORE RUNNING                                   ║
// ║                                                                          ║
// ║  Approving the gate that appears in ApproveDeck will cause the agent     ║
// ║  to EXECUTE the prompt below against whatever database the configured    ║
// ║  saferun agent is wired to.                                              ║
// ║                                                                          ║
// ║  The default prompt is intentionally narrow and read-only scoped:        ║
// ║    • targets one inactive demo customer (customer_id = 999)              ║
// ║    • only the 3 most recent payments                                     ║
// ║    • explicitly requests a backup-table rollback approach                ║
// ║                                                                          ║
// ║  Run this script ONLY against your LOCAL Pagila demo database.           ║
// ║  Do NOT point TF at a production TrueForge instance.                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const TF = process.env.TF ?? "http://localhost:8790";
const AGENT = process.env.AGENT ?? "saferun";

// Safe demo default: targets a single inactive demo customer, read-path only,
// and asks the agent to stage changes in a backup table before committing.
// Override with PROMPT="..." env var if you need a different gate scenario.
const PROMPT =
  process.env.PROMPT ??
  "Using the Pagila demo database: find the 3 most recent payments for " +
  "customer_id 999 (an inactive demo account). Write their IDs to a " +
  "backup_payments_demo table first, then summarise what you found — " +
  "do not delete or modify any rows without explicit approval.";

// Warn loudly so no one accidentally fires this at a production database.
console.warn("╔═══════════════════════════════════════════════════════╗");
console.warn("║  DEMO GATE — targets LOCAL Pagila DB only             ║");
console.warn("║  Approving the gate in ApproveDeck executes the query ║");
console.warn(`║  TF endpoint: ${TF.padEnd(39)}║`);
console.warn(`║  Agent:       ${AGENT.padEnd(39)}║`);
console.warn("╚═══════════════════════════════════════════════════════╝");
console.warn("");

async function main() {
  const sres = await fetch(`${TF}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: { name: AGENT } }),
  });
  if (!sres.ok) throw new Error(`create session: ${sres.status}`);
  const session = (await sres.json()).data;
  console.log(`session ${session.id} created — driving agent toward an approval gate…`);

  const tres = await fetch(`${TF}/api/v1/sessions/${session.id}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: [{ type: "user.message", content: PROMPT }],
      stream: false,
    }),
  });
  if (!tres.ok) throw new Error(`create turn: ${tres.status}`);
  console.log("Turn started. Watch ApproveDeck — a gate will appear when the agent reaches it.");
  console.log("Only click Approve if you are running against the local Pagila demo DB.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
