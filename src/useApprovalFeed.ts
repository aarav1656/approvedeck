import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Session,
  type TurnEvent,
  listSessions,
  listTurnEvents,
  listTurns,
  sendApproval,
} from "./api";

// ---------- domain model ----------

export interface PendingApproval {
  sessionId: string;
  sessionTitle: string;
  agentName: string;
  threadId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: string;
  since: string;
  kind: "approval" | "question";
  question?: string;
  options?: string[];
}

export interface SessionActivity {
  session: Session;
  status: "running" | "waiting" | "idle" | "error";
  lastToolCalls: { name: string; args: string }[];
  metrics: Record<string, number>;
  lastEventAt: string;
}

interface RawTurn {
  id: string;
  state?: {
    status?: string;
    metrics?: Record<string, number>;
    required_actions?: {
      type: string;
      thread_id?: string;
      created_at?: string;
      tool_calls?: { id: string }[];
    }[];
  };
}

// ---------- helpers ----------

function collectToolCalls(events: TurnEvent[]): Map<string, { name: string; args: string }> {
  const calls = new Map<string, { name: string; args: string }>();
  let currentId: string | null = null;
  for (const ev of events) {
    for (const tc of ev.tool_calls ?? []) {
      if (tc.id) {
        currentId = tc.id;
        if (!calls.has(tc.id)) {
          calls.set(tc.id, { name: tc.function?.name ?? tc.tool_info?.name ?? "tool", args: "" });
        }
      }
      const chunk = tc.function?.arguments;
      if (chunk && currentId) {
        const entry = calls.get(currentId);
        if (entry) entry.args += chunk;
      }
    }
  }
  return calls;
}

function prettyToolTarget(name: string, args: string): { toolName: string; toolArgs: string } {
  try {
    const parsed = JSON.parse(args);
    if (name === "call_tool" && parsed.tool_name) {
      return {
        toolName: `${parsed.tool_name} (${parsed.mcp_server ?? "mcp"})`,
        toolArgs: JSON.stringify(parsed.input ?? {}, null, 2),
      };
    }
    return { toolName: name, toolArgs: JSON.stringify(parsed, null, 2) };
  } catch {
    return { toolName: name, toolArgs: args };
  }
}

// ---------- the hook ----------

export function useApprovalFeed(pollMs = 4000) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [activity, setActivity] = useState<SessionActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const sessions = await listSessions();
      const pend: PendingApproval[] = [];
      const acts: SessionActivity[] = [];

      for (const s of sessions.slice(0, 12)) {
        try {
          const turns = (await listTurns(s.id)) as unknown as RawTurn[];
          const last = turns[0];
          if (!last) continue;
          const status = last.state?.status ?? "unknown";
          const required = last.state?.required_actions ?? [];

          let events: TurnEvent[] = [];
          try {
            events = await listTurnEvents(s.id, last.id);
          } catch {
            /* events may expire from redis; approvals still resolvable from turn state */
          }
          const calls = collectToolCalls(events);
          const callList = [...calls.values()].map((c) => {
            const p = prettyToolTarget(c.name, c.args);
            return { name: p.toolName, args: p.toolArgs };
          });

          for (const ra of required) {
            for (const tc of ra.tool_calls ?? []) {
              const call = calls.get(tc.id);
              const pretty = call ? prettyToolTarget(call.name, call.args) : { toolName: "pending tool", toolArgs: "" };
              const isQuestion = call?.name === "ask_user_question";
              let question: string | undefined;
              let options: string[] | undefined;
              if (isQuestion && call) {
                try {
                  const parsed = JSON.parse(call.args);
                  question = parsed.question;
                  options = (parsed.options ?? []).map((o: unknown) =>
                    typeof o === "string" ? o : JSON.stringify(o),
                  );
                } catch { /* partial args */ }
              }
              pend.push({
                sessionId: s.id,
                sessionTitle: s.title ?? s.id.slice(0, 8),
                agentName: s.agent?.name ?? "agent",
                threadId: ra.thread_id ?? "main",
                toolCallId: tc.id,
                toolName: pretty.toolName,
                toolArgs: pretty.toolArgs,
                since: ra.created_at ?? s.updated_at,
                kind: ra.type === "tool.approval_required" ? "approval" : "question",
                question,
                options,
              });
            }
          }

          acts.push({
            session: s,
            status:
              required.length > 0
                ? "waiting"
                : status === "running"
                  ? "running"
                  : status === "error"
                    ? "error"
                    : "idle",
            lastToolCalls: callList.slice(-4),
            metrics: last.state?.metrics ?? {},
            lastEventAt: s.updated_at,
          });
        } catch {
          /* skip unreadable session */
        }
      }

      setApprovals(pend);
      setActivity(acts);
      setError(null);
      setLastPoll(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const decide = useCallback(
    async (a: PendingApproval, allow: boolean) => {
      await sendApproval(a.sessionId, a.threadId, a.toolCallId, allow);
      setApprovals((prev) => prev.filter((p) => p.toolCallId !== a.toolCallId));
      setTimeout(refresh, 1500);
    },
    [refresh],
  );

  return { approvals, activity, error, lastPoll, decide, refresh };
}
