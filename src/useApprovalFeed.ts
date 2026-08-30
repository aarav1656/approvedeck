import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Session,
  type TurnEvent,
  listSessions,
  listTurnEvents,
  listTurns,
  sendApproval,
} from "./api";
import { appendDecision } from "./decisionLog";
import { buildDemoCards, demoLatencyMs, isDemoCard } from "./demoCards";

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

export function collectToolCalls(events: TurnEvent[]): Map<string, { name: string; args: string }> {
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

export function prettyToolTarget(name: string, args: string): { toolName: string; toolArgs: string } {
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

/** Process one session: returns pending approvals and activity for that session. */
async function fetchSession(
  s: Session,
  signal: AbortSignal,
): Promise<{ approvals: PendingApproval[]; activity: SessionActivity | null }> {
  const turns = (await listTurns(s.id, signal)) as unknown as RawTurn[];
  const last = turns[turns.length - 1];
  if (!last) return { approvals: [], activity: null };

  const status = last.state?.status ?? "unknown";
  const required = last.state?.required_actions ?? [];

  let events: TurnEvent[] = [];
  try {
    events = await listTurnEvents(s.id, last.id, signal);
  } catch {
    /* events may expire from redis; approvals still resolvable from turn state */
  }

  const calls = collectToolCalls(events);
  const callList = [...calls.values()].map((c) => {
    const p = prettyToolTarget(c.name, c.args);
    return { name: p.toolName, args: p.toolArgs };
  });

  const pend: PendingApproval[] = [];
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

  const activity: SessionActivity = {
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
  };

  return { approvals: pend, activity };
}

// ---------- the hook ----------

export function useApprovalFeed(pollMs = 4000) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [demoCards, setDemoCards] = useState<PendingApproval[]>([]);
  const [activity, setActivity] = useState<SessionActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const busy = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;

    // Cancel any in-flight poll from a previous cycle
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      const sessions = await listSessions(signal);
      const slice = sessions.slice(0, 12);

      // Parallelize per-session fetches; failures skip that session
      const results = await Promise.allSettled(
        slice.map((s) => fetchSession(s, signal)),
      );

      const pend: PendingApproval[] = [];
      const acts: SessionActivity[] = [];

      for (const result of results) {
        if (result.status === "rejected") continue;
        pend.push(...result.value.approvals);
        if (result.value.activity) acts.push(result.value.activity);
      }

      setApprovals(pend);
      setActivity(acts);
      setError(null);
      setLastPoll(new Date());
    } catch (e) {
      // Ignore AbortError — not a real error
      if (e instanceof Error && e.name === "AbortError") return;
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [refresh, pollMs]);

  const decide = useCallback(
    async (a: PendingApproval, allow: boolean, reason?: string) => {
      // Demo cards resolve entirely client-side: no POST, realistic latency.
      if (isDemoCard(a)) {
        appendDecision({
          sessionId: a.sessionId,
          toolName: a.toolName,
          decision: allow ? "approve" : "deny",
          latencyMs: demoLatencyMs(),
        });
        setDemoCards((prev) => prev.filter((p) => p.toolCallId !== a.toolCallId));
        return;
      }

      const clickedAt = Date.now();
      const latencyMs = a.since
        ? Math.max(0, clickedAt - new Date(a.since).getTime())
        : 0;

      await sendApproval(a.sessionId, a.threadId, a.toolCallId, allow, reason);

      appendDecision({
        sessionId: a.sessionId,
        toolName: a.toolName,
        decision: allow ? "approve" : "deny",
        latencyMs,
      });

      setApprovals((prev) => prev.filter((p) => p.toolCallId !== a.toolCallId));
      setTimeout(refresh, 1500);
    },
    [refresh],
  );

  /** Toggle the canned demo deck on/off. Purely client-side. */
  const toggleDemo = useCallback(() => {
    setDemoCards((prev) => (prev.length > 0 ? [] : buildDemoCards()));
  }, []);

  return {
    approvals: [...demoCards, ...approvals],
    activity,
    error,
    lastPoll,
    decide,
    refresh,
    demoMode: demoCards.length > 0,
    toggleDemo,
  };
}
