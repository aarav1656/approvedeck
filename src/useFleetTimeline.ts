// Chain of custody: derives a chronological spine of harness events for ONE
// session. Everything below the hook is pure so it can be tested against
// fixtures captured from real TrueForge SSE logs.

import { useCallback, useEffect, useRef, useState } from "react";
import { type Session, type Turn, type TurnEvent, listTurnEvents, listTurns } from "./api";
import { type DecisionEntry, readLog } from "./decisionLog";
import { collectToolCalls, prettyToolTarget } from "./useApprovalFeed";

// ---------- domain model ----------

export type TimelineKind =
  | "session"
  | "turn"
  | "tool"
  | "thread"
  | "gate"
  | "decision"
  | "question"
  | "execution"
  | "turn-end";

export interface TimelineNode {
  id: string;
  kind: TimelineKind;
  /** ISO-8601 timestamp used for ordering. */
  at: string;
  /** Primary label. Tool-ish nodes render this monospace. */
  label: string;
  /** Short secondary line. */
  detail?: string;
  /** Wall time from call to response, when both were observed. */
  durationMs?: number;
  /** Human response latency for decision nodes. */
  waitMs?: number;
  threadId?: string;
  toolCallId?: string;
  /** Revealed inline when a tool node is clicked. */
  payload?: string;
  status?: "ok" | "error" | "pending";
  decision?: "approve" | "deny";
}

/** Tools whose execution is the point of the whole gate. */
const EXECUTION_TOOLS = new Set(["execute_approved_operation"]);

function baseToolName(name: string): string {
  return name.split(" ")[0];
}

/** Turn state as returned by /turns (a superset of the exported Turn shape). */
interface TurnState {
  status?: string;
  completed_at?: string;
  message?: string;
  metrics?: Record<string, number>;
}
export type TurnRecord = Turn & { state?: TurnState };

export interface DeriveInput {
  session: Pick<Session, "id" | "title" | "created_at"> & { agent?: { name?: string } | null };
  turns: TurnRecord[];
  /** turn id -> that turn's events, oldest first. */
  eventsByTurn: Record<string, TurnEvent[]>;
  /** Decision log entries, any session; filtered here. */
  decisions?: DecisionEntry[];
}

// ---------- derivation ----------

/**
 * Build the per-session spine. O(events): one pass per turn plus a pass to
 * pair gates with decisions. Deterministic, so it snapshots cleanly in tests.
 */
export function deriveTimeline(input: DeriveInput): TimelineNode[] {
  const { session, turns, eventsByTurn } = input;
  const nodes: TimelineNode[] = [];

  nodes.push({
    id: `session:${session.id}`,
    kind: "session",
    at: session.created_at,
    label: session.title ?? session.id.slice(0, 12),
    detail: session.agent?.name ? `agent ${session.agent.name}` : undefined,
  });

  for (const turn of turns) {
    const events = eventsByTurn[turn.id] ?? [];
    const calls = collectToolCalls(events);

    // tool_call_id -> when the model asked for it, so responses can be timed.
    const askedAt = new Map<string, string>();
    // Gates keyed by tool call, resolved into decision nodes further down.
    const gateNodes: TimelineNode[] = [];

    const turnStart = events.find((e) => e.type === "turn.created")?.created_at ?? turn.created_at;
    if (turnStart) {
      nodes.push({
        id: `turn:${turn.id}`,
        kind: "turn",
        at: turnStart,
        label: "turn started",
        detail: turn.id.replace(/\.local$/, "").slice(0, 12),
      });
    }

    for (const ev of events) {
      const at = ev.created_at;
      if (!at) continue;

      switch (ev.type) {
        case "model.message":
        case "model.message.delta": {
          for (const tc of ev.tool_calls ?? []) {
            if (!tc.id) continue;
            askedAt.set(tc.id, at);
          }
          break;
        }

        case "thread.created": {
          nodes.push({
            id: `thread:${ev.id ?? at}`,
            kind: "thread",
            at,
            label: ev.title ?? ev.agent_info?.name ?? "subagent",
            detail: ev.thread_id ? `thread ${ev.thread_id.slice(0, 8)}` : undefined,
            threadId: ev.thread_id ?? undefined,
            payload: ev.agent_info?.input,
            status: "pending",
          });
          break;
        }

        case "thread.done": {
          const status = ev.state?.status === "error" ? "error" : "ok";
          nodes.push({
            id: `thread-done:${ev.id ?? at}`,
            kind: "thread",
            at,
            label: `${ev.title ?? "subagent"} returned`,
            detail: ev.thread_id ? `thread ${ev.thread_id.slice(0, 8)}` : undefined,
            threadId: ev.thread_id ?? undefined,
            payload: ev.state?.output?.content,
            status,
          });
          break;
        }

        case "tool.approval_required": {
          for (const tc of ev.tool_calls ?? []) {
            if (!tc.id) continue;
            const call = calls.get(tc.id);
            const pretty = call
              ? prettyToolTarget(call.name, call.args)
              : { toolName: "pending tool", toolArgs: "" };
            gateNodes.push({
              id: `gate:${tc.id}`,
              kind: "gate",
              at,
              label: pretty.toolName,
              detail: "approval gate raised",
              threadId: ev.thread_id ?? undefined,
              toolCallId: tc.id,
              payload: pretty.toolArgs || undefined,
              status: "pending",
            });
          }
          break;
        }

        case "tool.response": {
          const id = ev.tool_call_id;
          if (!id) break;
          const call = calls.get(id);
          if (!call) break;
          const pretty = prettyToolTarget(call.name, call.args);
          const start = askedAt.get(id);
          const bare = baseToolName(pretty.toolName);
          const isQuestion = call.name === "ask_user_question";
          const isExecution = EXECUTION_TOOLS.has(bare) || EXECUTION_TOOLS.has(call.name);
          nodes.push({
            id: `tool:${id}`,
            kind: isExecution ? "execution" : isQuestion ? "question" : "tool",
            at,
            label: pretty.toolName,
            durationMs: start ? Math.max(0, new Date(at).getTime() - new Date(start).getTime()) : undefined,
            threadId: ev.thread_id ?? undefined,
            toolCallId: id,
            payload: pretty.toolArgs || undefined,
            detail: typeof ev.content === "string" ? firstLine(ev.content) : undefined,
            status: "ok",
          });
          break;
        }

        case "turn.done": {
          const st = ev.state?.status;
          nodes.push({
            id: `turn-end:${ev.id ?? at}`,
            kind: "turn-end",
            at,
            label: st === "error" ? "turn failed" : `turn ${st ?? "done"}`,
            detail: ev.state?.message ? firstLine(ev.state.message) : tokenLine(ev.state?.metrics),
            status: st === "error" ? "error" : "ok",
          });
          break;
        }

        default:
          break;
      }
    }

    nodes.push(...gateNodes);
  }

  // Pair each gate with the human decision that answered it: first decision
  // for this session, on the same tool, at or after the gate appeared.
  const decisions = (input.decisions ?? [])
    .filter((d) => d.sessionId === session.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const used = new Set<string>();

  for (const gate of nodes.filter((n) => n.kind === "gate")) {
    const gateMs = new Date(gate.at).getTime();
    const match = decisions.find(
      (d) =>
        !used.has(d.id) &&
        new Date(d.timestamp).getTime() >= gateMs &&
        baseToolName(d.toolName) === baseToolName(gate.label),
    );
    if (!match) continue;
    used.add(match.id);
    gate.status = "ok";
    nodes.push({
      id: `decision:${match.id}`,
      kind: "decision",
      at: match.timestamp,
      label: match.decision === "approve" ? "approved by human" : "denied by human",
      detail: baseToolName(match.toolName),
      waitMs: match.latencyMs,
      decision: match.decision,
      toolCallId: gate.toolCallId,
      status: match.decision === "approve" ? "ok" : "error",
    });
  }

  nodes.sort((a, b) => {
    const d = new Date(a.at).getTime() - new Date(b.at).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  return nodes;
}

function firstLine(s: string): string {
  const line = s.split("\n")[0].trim();
  return line.length > 96 ? `${line.slice(0, 96)}…` : line;
}

function tokenLine(metrics?: Record<string, number>): string | undefined {
  const total = metrics?.total_tokens;
  if (!total) return undefined;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k tokens` : `${total} tokens`;
}

// ---------- events cache ----------

/**
 * Events for a finished turn never change, so they are cached forever.
 * Running turns are always refetched. Keeps the extra fetch to at most one
 * turn per poll for the single selected session.
 */
const eventCache = new Map<string, TurnEvent[]>();

function isTerminal(status?: string): boolean {
  return status === "done" || status === "error" || status === "cancelled";
}

export function clearTimelineCache(): void {
  eventCache.clear();
}

// ---------- hook ----------

export interface FleetTimeline {
  nodes: TimelineNode[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Timeline for the SELECTED session only. Piggybacks on the same cadence as
 * the approval feed but issues at most (turns not yet cached) event fetches.
 */
export function useFleetTimeline(
  session: Session | null,
  pollMs = 4000,
): FleetTimeline {
  const [nodes, setNodes] = useState<TimelineNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionEntry[]>(() => readLog());
  const busy = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionId = session?.id ?? null;

  const load = useCallback(async () => {
    if (!session) {
      setNodes([]);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const turns = (await listTurns(session.id, signal)) as TurnRecord[];
      const eventsByTurn: Record<string, TurnEvent[]> = {};

      for (const turn of turns) {
        const key = `${session.id}:${turn.id}`;
        const cached = eventCache.get(key);
        if (cached && isTerminal(turn.state?.status)) {
          eventsByTurn[turn.id] = cached;
          continue;
        }
        try {
          const evs = await listTurnEvents(session.id, turn.id, signal);
          eventsByTurn[turn.id] = evs;
          if (isTerminal(turn.state?.status)) eventCache.set(key, evs);
        } catch {
          // Events expire from redis; the turn still contributes its spine.
          eventsByTurn[turn.id] = cached ?? [];
        }
      }

      setNodes(deriveTimeline({ session, turns, eventsByTurn, decisions: readLog() }));
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(String(e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    setNodes([]);
    load();
    const t = setInterval(load, pollMs);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [load, pollMs, sessionId]);

  // A local decision changes the spine without any harness round-trip.
  useEffect(() => {
    const onDecision = () => setDecisions(readLog());
    window.addEventListener("approvedeck:decision", onDecision);
    return () => window.removeEventListener("approvedeck:decision", onDecision);
  }, []);

  useEffect(() => {
    if (decisions.length > 0) load();
  }, [decisions, load]);

  return { nodes, loading, error, reload: load };
}
