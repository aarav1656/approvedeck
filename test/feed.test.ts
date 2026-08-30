import { describe, expect, it } from "vitest";
import type { TurnEvent } from "../src/api";
import { collectToolCalls, prettyToolTarget } from "../src/useApprovalFeed";

// Events below mirror the real TrueForge SSE shapes captured in
// saferun's docs/evidence: tool call ids arrive on the first delta,
// arguments stream as later chunks with no id.

describe("collectToolCalls", () => {
  it("assembles streamed argument chunks under the right call id", () => {
    const events: TurnEvent[] = [
      {
        type: "model.message.delta",
        tool_calls: [{ id: "call_1", function: { name: "call_tool", arguments: "" } }],
      },
      { type: "model.message.delta", tool_calls: [{ function: { arguments: '{"mcp_server":"saferun-db",' } }] },
      { type: "model.message.delta", tool_calls: [{ function: { arguments: '"tool_name":"simulate_operation"}' } }] },
    ];
    const calls = collectToolCalls(events);
    expect(calls.get("call_1")).toEqual({
      name: "call_tool",
      args: '{"mcp_server":"saferun-db","tool_name":"simulate_operation"}',
    });
  });

  it("keeps separate tool calls separate", () => {
    const events: TurnEvent[] = [
      { type: "model.message.delta", tool_calls: [{ id: "a", function: { name: "exec", arguments: "" } }] },
      { type: "model.message.delta", tool_calls: [{ function: { arguments: '{"command":"ls"}' } }] },
      { type: "model.message.delta", tool_calls: [{ id: "b", function: { name: "ask_user_question", arguments: "" } }] },
      { type: "model.message.delta", tool_calls: [{ function: { arguments: '{"question":"scope?"}' } }] },
    ];
    const calls = collectToolCalls(events);
    expect(calls.size).toBe(2);
    expect(calls.get("a")?.args).toBe('{"command":"ls"}');
    expect(calls.get("b")?.name).toBe("ask_user_question");
  });

  it("returns empty map for events with no tool calls", () => {
    expect(collectToolCalls([{ type: "model.message" }]).size).toBe(0);
  });
});

describe("prettyToolTarget", () => {
  it("unwraps MCP call_tool to the inner tool and server", () => {
    const r = prettyToolTarget(
      "call_tool",
      '{"mcp_server":"saferun-db","tool_name":"execute_approved_operation","input":{"simulation_id":"abc"}}',
    );
    expect(r.toolName).toBe("execute_approved_operation (saferun-db)");
    expect(JSON.parse(r.toolArgs)).toEqual({ simulation_id: "abc" });
  });

  it("passes through non-MCP tools with pretty-printed args", () => {
    const r = prettyToolTarget("exec", '{"command":"ls /"}');
    expect(r.toolName).toBe("exec");
    expect(r.toolArgs).toContain('"command"');
  });

  it("survives truncated JSON from an interrupted stream", () => {
    const r = prettyToolTarget("call_tool", '{"mcp_server":"saferun-db","tool_na');
    expect(r.toolName).toBe("call_tool");
    expect(r.toolArgs).toBe('{"mcp_server":"saferun-db","tool_na');
  });
});
