import { useState } from "react";
import { type PendingApproval, type SessionActivity, useApprovalFeed } from "./useApprovalFeed";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const statusDot: Record<SessionActivity["status"], string> = {
  running: "bg-accent-blue",
  waiting: "bg-accent-red",
  idle: "bg-ash",
  error: "bg-accent-yellow",
};

function ApprovalCard({
  a,
  onDecide,
}: {
  a: PendingApproval;
  onDecide: (a: PendingApproval, allow: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const act = async (allow: boolean) => {
    setBusy(allow ? "allow" : "deny");
    try {
      await onDecide(a, allow);
    } finally {
      setBusy(null);
    }
  };
  const destructive = /execute|delete|drop|truncate|write/i.test(a.toolName);
  return (
    <div className={`slide-in rounded-xl bg-card hairline p-5 ${destructive ? "glow-red" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full bg-accent-red ${destructive ? "pulse-ring" : ""}`} />
        <span className="text-ink font-medium text-[15px]">{a.agentName}</span>
        <span className="text-ash text-[13px] truncate max-w-[220px]">{a.sessionTitle}</span>
        <span className="ml-auto text-ash text-[12px]">{timeAgo(a.since)}</span>
      </div>

      <div className="mt-4 rounded-lg bg-elevated hairline px-4 py-3">
        <div className="text-[12px] uppercase tracking-wider text-ash mb-1">
          {a.kind === "approval" ? "wants to run" : "is asking"}
        </div>
        <div className="font-mono text-[14px] text-accent-yellow break-all">{a.toolName}</div>
        {a.question && <div className="mt-2 text-body text-[14px]">{a.question}</div>}
        {a.toolArgs && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[12px] text-accent-blue hover:underline"
          >
            {expanded ? "hide payload" : "show payload"}
          </button>
        )}
        {expanded && (
          <pre className="mt-2 max-h-56 overflow-auto rounded bg-canvas p-3 text-[12px] leading-relaxed text-body whitespace-pre-wrap break-all">
            {a.toolArgs}
          </pre>
        )}
      </div>

      {a.kind === "approval" ? (
        <div className="mt-4 flex gap-3">
          <button
            disabled={busy !== null}
            onClick={() => act(true)}
            className="flex-1 rounded-lg bg-accent-green/15 text-accent-green hairline border-accent-green/40 py-2.5 text-[14px] font-medium hover:bg-accent-green/25 disabled:opacity-40 transition-colors"
          >
            {busy === "allow" ? "Approving…" : "Approve"}
          </button>
          <button
            disabled={busy !== null}
            onClick={() => act(false)}
            className="flex-1 rounded-lg bg-accent-red/15 text-accent-red py-2.5 text-[14px] font-medium hover:bg-accent-red/25 disabled:opacity-40 transition-colors"
          >
            {busy === "deny" ? "Denying…" : "Deny"}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-[13px] text-ash">
          Answer this question in the TrueForge chat — questions carry free-form context.
        </div>
      )}
    </div>
  );
}

function ActivityRow({ act }: { act: SessionActivity }) {
  const m = act.metrics;
  return (
    <div className="slide-in flex items-center gap-3 rounded-lg bg-surface hairline px-4 py-3">
      <span className={`h-2 w-2 rounded-full ${statusDot[act.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-ink">{act.session.title ?? act.session.id.slice(0, 12)}</div>
        <div className="truncate text-[12px] text-ash font-mono">
          {act.lastToolCalls.map((c) => c.name.split(" ")[0]).join(" · ") || "no tool calls"}
        </div>
      </div>
      <div className="text-right text-[12px] text-ash shrink-0">
        <div>{act.status}</div>
        {m.total_tokens ? <div>{(m.total_tokens / 1000).toFixed(1)}k tok</div> : null}
      </div>
    </div>
  );
}

export default function App() {
  const { approvals, activity, error, lastPoll, decide, refresh } = useApprovalFeed();
  const waiting = approvals.filter((a) => a.kind === "approval");
  const questions = approvals.filter((a) => a.kind === "question");

  return (
    <div className="min-h-screen bg-canvas font-sans">
      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-red/20 text-accent-red text-[15px]">
            ⏻
          </div>
          <h1 className="text-ink text-[17px] font-semibold tracking-tight">ApproveDeck</h1>
          <span className="text-ash text-[13px]">mission control for TrueForge approvals</span>
          <div className="ml-auto flex items-center gap-3 text-[12px] text-ash">
            {error ? (
              <span className="text-accent-red">harness unreachable</span>
            ) : (
              <span>
                {waiting.length > 0 ? (
                  <span className="text-accent-red font-medium">{waiting.length} pending</span>
                ) : (
                  "all clear"
                )}
                {lastPoll && ` · polled ${timeAgo(lastPoll.toISOString())}`}
              </span>
            )}
            <button
              onClick={refresh}
              className="rounded-md bg-elevated hairline px-3 py-1.5 text-body hover:text-ink transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-8 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-ash">
            Needs a human · {waiting.length}
          </h2>
          {waiting.length === 0 ? (
            <div className="rounded-xl bg-surface hairline px-6 py-14 text-center">
              <div className="text-3xl mb-3">🟢</div>
              <div className="text-ink text-[15px] font-medium">Nothing waiting on you</div>
              <div className="mt-1 text-[13px] text-ash">
                Agents keep working. When one hits an approval gate, it appears here.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {waiting.map((a) => (
                <ApprovalCard key={a.toolCallId} a={a} onDecide={decide} />
              ))}
            </div>
          )}

          {questions.length > 0 && (
            <>
              <h2 className="mb-4 mt-10 text-[13px] font-medium uppercase tracking-wider text-ash">
                Open questions · {questions.length}
              </h2>
              <div className="flex flex-col gap-4">
                {questions.map((a) => (
                  <ApprovalCard key={a.toolCallId} a={a} onDecide={decide} />
                ))}
              </div>
            </>
          )}
        </section>

        <aside>
          <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-ash">
            Agent sessions
          </h2>
          <div className="flex flex-col gap-2">
            {activity.map((act) => (
              <ActivityRow key={act.session.id} act={act} />
            ))}
            {activity.length === 0 && !error && (
              <div className="text-[13px] text-ash">No sessions yet.</div>
            )}
            {error && (
              <div className="rounded-lg bg-surface hairline p-4 text-[13px] text-ash">
                Can't reach TrueForge at <span className="font-mono">localhost:8790</span>.
                Start it with <span className="font-mono text-body">npx @truefoundry/trueforge</span>.
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
