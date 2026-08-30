import { describe, expect, it } from "vitest";
import { buildReceipt, payloadHash, receiptToMarkdown, receiptToText } from "../src/custodyReceipt";
import type { TimelineNode } from "../src/useFleetTimeline";

const SESSION = { id: "sess_1", title: "Delete the 2 oldest payments", agentName: "saferun" };

const nodes: TimelineNode[] = [
  { id: "session:sess_1", kind: "session", at: "2026-08-30T13:30:00.000Z", label: "Delete the 2 oldest payments" },
  { id: "tool:call_a", kind: "tool", at: "2026-08-30T13:33:17.319Z", label: "list_tools", durationMs: 2051 },
  {
    id: "thread:ev_thread",
    kind: "thread",
    at: "2026-08-30T13:34:12.426Z",
    label: "count-rentals-2020-store2",
    threadId: "d8e1409f-f88e-4f7b-9907-9087011c7cff",
    status: "pending",
  },
  {
    id: "thread-done:ev_done",
    kind: "thread",
    at: "2026-08-30T13:34:23.971Z",
    label: "count-rentals-2020-store2 returned",
    threadId: "d8e1409f-f88e-4f7b-9907-9087011c7cff",
    status: "ok",
  },
  {
    id: "gate:call_exec_1",
    kind: "gate",
    at: "2026-08-30T13:42:29.571Z",
    label: "execute_approved_operation (saferun-db)",
    toolCallId: "call_exec_1",
    payload: '{"op_id":"op_9"}',
    status: "ok",
  },
  {
    id: "decision:dec_1",
    kind: "decision",
    at: "2026-08-30T13:42:44.571Z",
    label: "approved by human",
    detail: "execute_approved_operation",
    toolCallId: "call_exec_1",
    decision: "approve",
    waitMs: 15000,
  },
  {
    id: "tool:call_exec_1",
    kind: "execution",
    at: "2026-08-30T13:42:55.000Z",
    label: "execute_approved_operation (saferun-db)",
    toolCallId: "call_exec_1",
    detail: "deleted 2 rows; rollback table payment_backup_op_9",
  },
];

const NOW = new Date("2026-08-30T14:00:00.000Z");

describe("payloadHash", () => {
  it("is stable for the same payload", () => {
    expect(payloadHash('{"op_id":"op_9"}')).toBe(payloadHash('{"op_id":"op_9"}'));
  });

  it("changes when a single character of the payload changes", () => {
    expect(payloadHash('{"op_id":"op_9"}')).not.toBe(payloadHash('{"op_id":"op_8"}'));
  });

  it("is prefixed so the algorithm is legible in the receipt", () => {
    expect(payloadHash("x")).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });
});

describe("buildReceipt", () => {
  const r = buildReceipt(SESSION, nodes, NOW);

  it("carries schema, session identity and generation time", () => {
    expect(r.schema).toBe("approvedeck.custody.v1");
    expect(r.session).toEqual({ id: "sess_1", title: "Delete the 2 oldest payments", agentName: "saferun" });
    expect(r.generatedAt).toBe("2026-08-30T14:00:00.000Z");
  });

  it("spans first to last observed event", () => {
    expect(r.span).toEqual({ from: "2026-08-30T13:30:00.000Z", to: "2026-08-30T13:42:55.000Z" });
  });

  it("counts tools, subagents and gate outcomes", () => {
    expect(r.counts).toEqual({ tools: 1, subagents: 1, gates: 1, approved: 1, denied: 0 });
  });

  it("records who approved what, when, and the wait", () => {
    const [gate] = r.gates;
    expect(gate.tool).toBe("execute_approved_operation (saferun-db)");
    expect(gate.raisedAt).toBe("2026-08-30T13:42:29.571Z");
    expect(gate.decision).toBe("approve");
    expect(gate.decidedAt).toBe("2026-08-30T13:42:44.571Z");
    expect(gate.waitMs).toBe(15000);
  });

  it("fingerprints the approved payload so tampering is detectable", () => {
    expect(r.gates[0].payloadHash).toBe(payloadHash('{"op_id":"op_9"}'));
    expect(r.gates[0].payloadBytes).toBe(16);
  });

  it("links the execution result that followed the approval", () => {
    expect(r.gates[0].executed).toBe(true);
    expect(r.gates[0].executionResult).toContain("deleted 2 rows");
  });

  it("lists spawned subagent threads once, not their completions", () => {
    expect(r.subagents).toEqual([
      {
        title: "count-rentals-2020-store2",
        threadId: "d8e1409f-f88e-4f7b-9907-9087011c7cff",
        at: "2026-08-30T13:34:12.426Z",
      },
    ]);
  });

  it("reports an unanswered gate as pending with no execution", () => {
    const pending = buildReceipt(
      SESSION,
      nodes.filter((n) => n.kind !== "decision" && n.kind !== "execution"),
      NOW,
    );
    expect(pending.gates[0].decision).toBe("pending");
    expect(pending.gates[0].decidedAt).toBeNull();
    expect(pending.gates[0].waitMs).toBeNull();
    expect(pending.gates[0].executed).toBe(false);
  });

  it("handles a session that never raised a gate", () => {
    const quiet = buildReceipt(SESSION, [nodes[0], nodes[1]], NOW);
    expect(quiet.gates).toEqual([]);
    expect(quiet.counts.gates).toBe(0);
  });
});

describe("receiptToMarkdown", () => {
  const md = receiptToMarkdown(buildReceipt(SESSION, nodes, NOW));

  it("titles the document with the session and lists the identity block", () => {
    expect(md.startsWith("# Chain of custody: Delete the 2 oldest payments")).toBe(true);
    expect(md).toContain("- Session: `sess_1`");
    expect(md).toContain("- Agent: saferun");
  });

  it("renders one table row per gate with the wait in seconds", () => {
    expect(md).toContain("| Tool | Raised | Decision | Decided | Wait | Payload hash | Executed |");
    expect(md).toContain("| approve |");
    expect(md).toContain("15.0s");
    expect(md).toContain(payloadHash('{"op_id":"op_9"}'));
  });

  it("lists subagent threads and execution results", () => {
    expect(md).toContain("## Subagent threads");
    expect(md).toContain("d8e1409f-f88e-4f7b-9907-9087011c7cff");
    expect(md).toContain("## Execution results");
    expect(md).toContain("deleted 2 rows");
  });

  it("says so plainly when no gate was raised", () => {
    const quiet = receiptToMarkdown(buildReceipt(SESSION, [nodes[0]], NOW));
    expect(quiet).toContain("No approval gates were raised in this session.");
  });

  it("uses no em-dashes in user-visible output", () => {
    expect(md).not.toContain("\u2014");
  });
});

describe("receiptToText", () => {
  it("carries the markdown plus a parseable JSON block", () => {
    const text = receiptToText(buildReceipt(SESSION, nodes, NOW));
    expect(text).toContain("# Chain of custody");
    const json = text.split("```json\n")[1].split("\n```")[0];
    expect(JSON.parse(json).schema).toBe("approvedeck.custody.v1");
  });
});
