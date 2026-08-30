import { describe, expect, it } from "vitest";
import type { TurnEvent } from "../src/api";
import { deriveTimeline, type TurnRecord } from "../src/useFleetTimeline";
import type { DecisionEntry } from "../src/decisionLog";

// Fixtures below are trimmed copies of real TrueForge event payloads captured
// from localhost:8790 (session 01m19dsedw3t7b9ygp1bjexcc3): model.message with
// tool_calls, thread.created with parent + agent_info, tool.approval_required
// carrying only ids, tool.response, and turn.done with state.metrics.

const SESSION = {
  id: "sess_1",
  title: "Delete the 2 oldest payments",
  created_at: "2026-08-30T13:30:00.000Z",
  agent: { name: "saferun" },
};

const turns: TurnRecord[] = [
  { id: "turn_1.local", created_at: "2026-08-30T13:33:12.220Z", state: { status: "done" } },
];

const events: TurnEvent[] = [
  {
    type: "turn.created",
    id: "ev_turn_created",
    created_at: "2026-08-30T13:33:12.220Z",
    thread_id: null,
  },
  {
    type: "model.message.delta",
    id: "ev_m1",
    created_at: "2026-08-30T13:33:15.268Z",
    thread_id: "main",
    tool_calls: [
      {
        id: "call_list_tools",
        function: { name: "list_tools", arguments: '{"mcp_server": "saferun-db"}' },
        tool_info: { name: "list_tools" },
      },
    ],
  },
  {
    type: "tool.response",
    id: "ev_r1",
    created_at: "2026-08-30T13:33:17.319Z",
    thread_id: "main",
    tool_call_id: "call_list_tools",
    content: "saferun-db:\n  inspect_database, run_readonly_query",
  },
  {
    type: "thread.created",
    id: "ev_thread",
    created_at: "2026-08-30T13:34:12.426Z",
    thread_id: "d8e1409f-f88e-4f7b-9907-9087011c7cff",
    title: "count-rentals-2020-store2",
    agent_info: { type: "dynamic", name: "count-rentals-2020-store2", input: "You are a read-only subagent." },
    parent: { tool_call_id: "call_spawn_1", thread_id: "main" },
  },
  {
    type: "thread.done",
    id: "ev_thread_done",
    created_at: "2026-08-30T13:34:23.971Z",
    thread_id: "d8e1409f-f88e-4f7b-9907-9087011c7cff",
    title: "count-rentals-2020-store2",
    state: { status: "done", output: { content: '{"n": 7992}' } },
  },
  {
    type: "model.message",
    id: "ev_m2",
    created_at: "2026-08-30T13:42:20.000Z",
    thread_id: "main",
    tool_calls: [
      {
        id: "call_exec_1",
        function: {
          name: "call_tool",
          arguments: '{"mcp_server":"saferun-db","tool_name":"execute_approved_operation","input":{"op_id":"op_9"}}',
        },
      },
    ],
  },
  {
    type: "tool.approval_required",
    id: "ev_gate",
    created_at: "2026-08-30T13:42:29.571Z",
    thread_id: "main",
    tool_calls: [{ id: "call_exec_1" }],
  },
  {
    type: "tool.response",
    id: "ev_exec_done",
    created_at: "2026-08-30T13:42:55.000Z",
    thread_id: "main",
    tool_call_id: "call_exec_1",
    content: "deleted 2 rows; rollback table payment_backup_op_9",
  },
  {
    type: "turn.done",
    id: "ev_turn_done",
    created_at: "2026-08-30T13:43:00.000Z",
    state: { status: "done", metrics: { total_tokens: 234230 } },
  },
];

const decisions: DecisionEntry[] = [
  {
    id: "dec_1",
    timestamp: "2026-08-30T13:42:44.571Z",
    sessionId: "sess_1",
    toolName: "execute_approved_operation (saferun-db)",
    decision: "approve",
    latencyMs: 15000,
  },
  {
    id: "dec_other_session",
    timestamp: "2026-08-30T13:42:44.571Z",
    sessionId: "sess_2",
    toolName: "execute_approved_operation (saferun-db)",
    decision: "deny",
    latencyMs: 100,
  },
];

const build = (d: DecisionEntry[] = decisions) =>
  deriveTimeline({
    session: SESSION,
    turns,
    eventsByTurn: { "turn_1.local": events },
    decisions: d,
  });

describe("deriveTimeline", () => {
  it("opens with the session node and orders every node chronologically", () => {
    const nodes = build();
    expect(nodes[0].kind).toBe("session");
    expect(nodes[0].label).toBe("Delete the 2 oldest payments");
    const times = nodes.map((n) => new Date(n.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("names tool calls and times them from request to response", () => {
    const tool = build().find((n) => n.id === "tool:call_list_tools");
    expect(tool).toBeDefined();
    expect(tool!.kind).toBe("tool");
    expect(tool!.label).toBe("list_tools");
    // 13:33:15.268 -> 13:33:17.319
    expect(tool!.durationMs).toBe(2051);
    expect(tool!.payload).toContain("saferun-db");
  });

  it("surfaces subagent threads with their thread ids and brief", () => {
    const spawned = build().find((n) => n.id === "thread:ev_thread")!;
    expect(spawned.kind).toBe("thread");
    expect(spawned.label).toBe("count-rentals-2020-store2");
    expect(spawned.threadId).toBe("d8e1409f-f88e-4f7b-9907-9087011c7cff");
    expect(spawned.payload).toContain("read-only subagent");

    const returned = build().find((n) => n.id === "thread-done:ev_thread_done")!;
    expect(returned.status).toBe("ok");
    expect(returned.payload).toContain("7992");
  });

  it("raises a gate node resolved against the tool call id, not the event", () => {
    const gate = build().find((n) => n.kind === "gate")!;
    expect(gate.toolCallId).toBe("call_exec_1");
    expect(gate.label).toBe("execute_approved_operation (saferun-db)");
    expect(gate.payload).toContain("op_9");
  });

  it("pairs the gate with the human decision and carries response latency", () => {
    const decision = build().find((n) => n.kind === "decision")!;
    expect(decision.decision).toBe("approve");
    expect(decision.waitMs).toBe(15000);
    // gate stops being pending once answered
    expect(build().find((n) => n.kind === "gate")!.status).toBe("ok");
  });

  it("ignores decisions belonging to another session", () => {
    expect(build().filter((n) => n.kind === "decision")).toHaveLength(1);
  });

  it("leaves the gate pending when no decision was recorded", () => {
    const nodes = build([]);
    expect(nodes.find((n) => n.kind === "gate")!.status).toBe("pending");
    expect(nodes.filter((n) => n.kind === "decision")).toHaveLength(0);
  });

  it("classifies execute_approved_operation as an execution node", () => {
    const exec = build().find((n) => n.kind === "execution")!;
    expect(exec.toolCallId).toBe("call_exec_1");
    expect(exec.detail).toContain("deleted 2 rows");
  });

  it("summarises a pretty-printed JSON response instead of a bare brace", () => {
    const nodes = deriveTimeline({
      session: SESSION,
      turns,
      eventsByTurn: {
        "turn_1.local": [
          {
            type: "model.message",
            id: "m",
            created_at: "2026-08-30T13:33:00.000Z",
            tool_calls: [{ id: "c1", function: { name: "run_readonly_query", arguments: "{}" } }],
          },
          {
            type: "tool.response",
            id: "r",
            created_at: "2026-08-30T13:33:01.000Z",
            tool_call_id: "c1",
            content: '{\n  "rows": 7992,\n  "ok": true\n}',
          },
        ],
      },
    });
    const tool = nodes.find((n) => n.kind === "tool")!;
    expect(tool.detail).toBe('{ "rows": 7992, "ok": true }');
  });

  it("closes the turn with its status and token count", () => {
    const end = build().find((n) => n.kind === "turn-end")!;
    expect(end.label).toBe("turn done");
    expect(end.detail).toBe("234.2k tokens");
    expect(end.status).toBe("ok");
  });

  it("marks a failed turn as an error", () => {
    const nodes = deriveTimeline({
      session: SESSION,
      turns,
      eventsByTurn: {
        "turn_1.local": [
          {
            type: "turn.done",
            id: "ev_err",
            created_at: "2026-08-30T13:35:34.767Z",
            state: { status: "error", message: "Request failed (429): Provider returned error" },
          },
        ],
      },
    });
    const end = nodes.find((n) => n.kind === "turn-end")!;
    expect(end.label).toBe("turn failed");
    expect(end.status).toBe("error");
    expect(end.detail).toContain("429");
  });

  it("survives a turn whose events expired from redis", () => {
    const nodes = deriveTimeline({
      session: SESSION,
      turns,
      eventsByTurn: {},
    });
    // still yields the session node plus the turn node from the turn record
    expect(nodes.map((n) => n.kind)).toEqual(["session", "turn"]);
  });
});
