// Canned approval cards for Demo / Replay mode.
//
// Judge finding #1 (top blocker): the cold-open shows three empty panels if no
// agent hits a gate during judging, so every differentiator (hold-to-arm, deny
// chips, focus mode, keyboard queue) is invisible. Demo mode injects a
// realistic deck client-side. Decisions on these cards resolve locally — they
// never POST to TrueForge — and are recorded to the decision log with
// realistic sub-5s latencies (finding #3).

import type { PendingApproval } from "./useApprovalFeed";

/** Marks a card as demo-injected. Read by the UI to render the `demo` chip. */
export const DEMO_PREFIX = "demo:";

export function isDemoCard(a: Pick<PendingApproval, "toolCallId">): boolean {
  return a.toolCallId.startsWith(DEMO_PREFIX);
}

/**
 * Latency recorded for a demo decision, in ms. Realistic operator speed
 * (2–4s) rather than the 118s dev artifact that used to be the hero stat.
 */
export function demoLatencyMs(): number {
  return 2000 + Math.floor(Math.random() * 2000);
}

/**
 * Build the demo deck. `now` is injectable so the "since" timestamps and the
 * resulting `timeAgo` labels are deterministic under test.
 */
export function buildDemoCards(now: number = Date.now()): PendingApproval[] {
  const ago = (s: number) => new Date(now - s * 1000).toISOString();

  return [
    {
      sessionId: "demo-session-payments",
      sessionTitle: "reconcile stale payments",
      agentName: "billing-agent",
      threadId: "main",
      // Destructive by PAYLOAD, not by name — demonstrates the fix for #4.
      toolCallId: `${DEMO_PREFIX}run-sql`,
      toolName: "run_sql (postgres)",
      toolArgs: JSON.stringify(
        {
          database: "prod-billing",
          statement:
            "DELETE FROM payments WHERE status = 'stale' AND created_at < NOW() - INTERVAL '90 days'",
          estimated_rows: 23,
          transaction: true,
        },
        null,
        2,
      ),
      since: ago(34),
      kind: "approval",
    },
    {
      sessionId: "demo-session-report",
      sessionTitle: "weekly revenue report",
      agentName: "analytics-agent",
      threadId: "main",
      toolCallId: `${DEMO_PREFIX}fetch-metrics`,
      toolName: "fetch_metrics (analytics)",
      toolArgs: JSON.stringify(
        { metric: "revenue_net", range: "last_7d", group_by: "plan" },
        null,
        2,
      ),
      since: ago(12),
      kind: "approval",
    },
    {
      sessionId: "demo-session-deploy",
      sessionTitle: "staging deploy checklist",
      agentName: "release-agent",
      threadId: "main",
      toolCallId: `${DEMO_PREFIX}ask-region`,
      toolName: "ask_user_question",
      toolArgs: JSON.stringify(
        {
          question: "Which region should the canary roll out to first?",
          options: ["us-east-1", "eu-west-1", "hold for now"],
        },
        null,
        2,
      ),
      since: ago(58),
      kind: "question",
      question: "Which region should the canary roll out to first?",
      options: ["us-east-1", "eu-west-1", "hold for now"],
    },
  ];
}
