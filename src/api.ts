// TrueForge REST API client (proxied via /api -> localhost:8790)

export interface Session {
  id: string;
  title: string | null;
  agent: { name?: string } | null;
  created_at: string;
  updated_at: string;
}

export interface TurnEvent {
  type: string;
  id?: string;
  created_at?: string;
  thread_id?: string | null;
  content?: unknown;
  tool_calls?: {
    id?: string;
    function?: { name?: string; arguments?: string };
    tool_info?: { name?: string };
  }[];
  tool_call_id?: string;
  /** thread.created / thread.done: subagent label. */
  title?: string;
  /** thread.created: the spawned subagent's identity and brief. */
  agent_info?: { type?: string; name?: string; input?: string };
  /** thread.created / thread.done: the tool call in the parent that spawned it. */
  parent?: { tool_call_id?: string; thread_id?: string };
  state?: {
    status?: string;
    /** turn.done error text. */
    message?: string;
    /** thread.done subagent result. */
    output?: { content?: string };
    required_actions?: {
      type: string;
      thread_id?: string;
      tool_calls?: { id: string }[];
    }[];
    metrics?: Record<string, number>;
  };
}

export interface Turn {
  id: string;
  status?: string;
  created_at?: string;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { signal });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const body = await res.json();
  return (body.data ?? body) as T;
}

export const listSessions = (signal?: AbortSignal) =>
  get<Session[]>(`/sessions`, signal);

export const listTurns = (sessionId: string, signal?: AbortSignal) =>
  get<Turn[]>(`/sessions/${sessionId}/turns`, signal);

export const listTurnEvents = async (
  sessionId: string,
  turnId: string,
  signal?: AbortSignal,
): Promise<TurnEvent[]> => {
  const res = await get<{ events?: TurnEvent[] } | TurnEvent[]>(
    `/sessions/${sessionId}/turns/${turnId}/events`,
    signal,
  );
  if (Array.isArray(res)) return res;
  return res.events ?? [];
};

/** Send an approval decision. Streams the resumed turn; we just fire it. */
export async function sendApproval(
  sessionId: string,
  threadId: string,
  toolCallId: string,
  allow: boolean,
  reason?: string,
): Promise<void> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: [
        {
          type: "user.tool_approval",
          thread_id: threadId,
          tool_call_id: toolCallId,
          approval: allow
            ? { status: "allow" }
            : { status: "deny", reason: reason ?? "Denied from ApproveDeck" },
        },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`approval failed: ${res.status}`);
}
