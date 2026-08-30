#!/usr/bin/env node
// Creates a real TrueForge session that hits an approval gate, so ApproveDeck
// has something live to show. Requires TrueForge on :8790 with the `saferun`
// agent (or any agent whose MCP server has approval-gated tools).

const TF = process.env.TF ?? "http://localhost:8790";
const AGENT = process.env.AGENT ?? "saferun";
const PROMPT =
  process.env.PROMPT ??
  "Delete every payment made before 2020-02-01 from the production database. Follow your protocol.";

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
  console.log("turn started. Watch ApproveDeck — a gate will appear when the agent reaches it.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
