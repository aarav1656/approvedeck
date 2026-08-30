// Chain of custody receipt: the artifact a compliance team keeps.
// JSON for machines, markdown for the incident doc. Pure, so it is testable.

import type { TimelineNode } from "./useFleetTimeline";

export interface ReceiptSession {
  id: string;
  title?: string | null;
  agentName?: string;
}

export interface ReceiptGate {
  tool: string;
  raisedAt: string;
  payloadHash: string;
  payloadBytes: number;
  decision: "approve" | "deny" | "pending";
  decidedAt: string | null;
  waitMs: number | null;
  executed: boolean;
  executionResult: string | null;
}

export interface CustodyReceipt {
  schema: "approvedeck.custody.v1";
  generatedAt: string;
  session: ReceiptSession;
  span: { from: string | null; to: string | null };
  counts: {
    tools: number;
    subagents: number;
    gates: number;
    approved: number;
    denied: number;
  };
  subagents: { title: string; threadId: string | null; at: string }[];
  gates: ReceiptGate[];
}

/**
 * FNV-1a, 32-bit, hex. Not a security hash: this is a stable fingerprint so
 * two receipts can be compared for "same payload" without storing the payload.
 */
export function payloadHash(payload: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a32:${h.toString(16).padStart(8, "0")}`;
}

function baseTool(name: string): string {
  return name.split(" ")[0];
}

export function buildReceipt(
  session: ReceiptSession,
  nodes: TimelineNode[],
  now: Date = new Date(),
): CustodyReceipt {
  const gates: ReceiptGate[] = [];
  const decisions = nodes.filter((n) => n.kind === "decision");
  const executions = nodes.filter((n) => n.kind === "execution");
  const usedDecisions = new Set<string>();

  for (const gate of nodes.filter((n) => n.kind === "gate")) {
    const gateMs = new Date(gate.at).getTime();
    const match = decisions.find(
      (d) =>
        !usedDecisions.has(d.id) &&
        new Date(d.at).getTime() >= gateMs &&
        (d.toolCallId === gate.toolCallId || baseTool(d.detail ?? "") === baseTool(gate.label)),
    );
    if (match) usedDecisions.add(match.id);

    const decidedMs = match ? new Date(match.at).getTime() : null;
    const exec = executions.find((e) => decidedMs === null || new Date(e.at).getTime() >= decidedMs);
    const payload = gate.payload ?? "";

    gates.push({
      tool: gate.label,
      raisedAt: gate.at,
      payloadHash: payloadHash(payload),
      payloadBytes: payload.length,
      decision: match?.decision ?? "pending",
      decidedAt: match?.at ?? null,
      waitMs: match?.waitMs ?? null,
      executed: Boolean(exec),
      executionResult: exec?.detail ?? null,
    });
  }

  const subagents = nodes
    .filter((n) => n.kind === "thread" && n.status === "pending")
    .map((n) => ({ title: n.label, threadId: n.threadId ?? null, at: n.at }));

  const sorted = [...nodes].sort((a, b) => a.at.localeCompare(b.at));

  return {
    schema: "approvedeck.custody.v1",
    generatedAt: now.toISOString(),
    session: {
      id: session.id,
      title: session.title ?? null,
      agentName: session.agentName,
    },
    span: { from: sorted[0]?.at ?? null, to: sorted[sorted.length - 1]?.at ?? null },
    counts: {
      tools: nodes.filter((n) => n.kind === "tool").length,
      subagents: subagents.length,
      gates: gates.length,
      approved: gates.filter((g) => g.decision === "approve").length,
      denied: gates.filter((g) => g.decision === "deny").length,
    },
    subagents,
    gates,
  };
}

function seconds(ms: number | null): string {
  if (ms === null) return "n/a";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function receiptToMarkdown(r: CustodyReceipt): string {
  const lines: string[] = [];
  lines.push(`# Chain of custody: ${r.session.title ?? r.session.id}`);
  lines.push("");
  lines.push(`- Session: \`${r.session.id}\``);
  if (r.session.agentName) lines.push(`- Agent: ${r.session.agentName}`);
  if (r.span.from) lines.push(`- Span: ${r.span.from} to ${r.span.to}`);
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(
    `- Totals: ${r.counts.tools} tool calls, ${r.counts.subagents} subagents, ` +
      `${r.counts.gates} gates (${r.counts.approved} approved, ${r.counts.denied} denied)`,
  );
  lines.push("");

  lines.push("## Approval gates");
  lines.push("");
  if (r.gates.length === 0) {
    lines.push("No approval gates were raised in this session.");
  } else {
    lines.push("| Tool | Raised | Decision | Decided | Wait | Payload hash | Executed |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const g of r.gates) {
      lines.push(
        `| \`${g.tool}\` | ${g.raisedAt} | ${g.decision} | ${g.decidedAt ?? "n/a"} | ` +
          `${seconds(g.waitMs)} | \`${g.payloadHash}\` | ${g.executed ? "yes" : "no"} |`,
      );
    }
  }
  lines.push("");

  if (r.subagents.length > 0) {
    lines.push("## Subagent threads");
    lines.push("");
    for (const s of r.subagents) {
      lines.push(`- \`${s.threadId ?? "unknown"}\` ${s.title} (${s.at})`);
    }
    lines.push("");
  }

  const executed = r.gates.filter((g) => g.executed && g.executionResult);
  if (executed.length > 0) {
    lines.push("## Execution results");
    lines.push("");
    for (const g of executed) {
      lines.push(`- \`${g.tool}\`: ${g.executionResult}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** The clipboard/file artifact: markdown up top, the machine-readable JSON below. */
export function receiptToText(r: CustodyReceipt): string {
  return `${receiptToMarkdown(r)}\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\`\n`;
}
