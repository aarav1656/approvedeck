import { useState } from "react";
import { type PendingApproval, type SessionActivity, useApprovalFeed } from "./useApprovalFeed";

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Cap a token count to a proportion 0–1 against a soft max. */
function tokenRatio(tokens: number, softMax = 80_000): number {
  return Math.min(tokens / softMax, 1);
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({
  waiting,
  error,
  lastPoll,
}: {
  waiting: number;
  error: string | null;
  lastPoll: Date | null;
}) {
  if (error) {
    return (
      <span className="status-pill status-pill-error">
        <span className="status-pill-dot" />
        harness unreachable
      </span>
    );
  }
  if (waiting > 0) {
    return (
      <span className="status-pill status-pill-pending">
        <span className="status-pill-dot pulse-ring" />
        {waiting} waiting
      </span>
    );
  }
  return (
    <span className="status-pill status-pill-clear">
      <span className="status-pill-dot" />
      all clear
      {lastPoll && (
        <span className="text-[#59d499]/60 ml-1">· {timeAgo(lastPoll.toISOString())}</span>
      )}
    </span>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-xl bg-surface hairline px-6 py-14 text-center overflow-hidden">
      {/* animated rings + shield icon */}
      <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
        {/* outer ring */}
        <span
          className="ring-pulse absolute inset-0 rounded-full border border-accent-green/30"
          aria-hidden
        />
        {/* inner ring delayed */}
        <span
          className="ring-pulse ring-pulse-delay absolute inset-0 rounded-full border border-accent-green/20"
          aria-hidden
        />
        {/* icon container */}
        <span className="shield-enter relative flex h-16 w-16 items-center justify-center rounded-full bg-accent-green/10 border border-accent-green/25">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            className="text-accent-green"
            aria-hidden
          >
            <path
              d="M14 2.5L4.5 6.5V13.5C4.5 18.8 8.7 23.7 14 25.5C19.3 23.7 23.5 18.8 23.5 13.5V6.5L14 2.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="rgba(89,212,153,0.08)"
            />
            <path
              d="M9.5 14L12.5 17L18.5 11"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <div className="text-ink text-[15px] font-semibold">Nothing waiting on you</div>
      <div className="mt-1.5 text-[13px] text-ash max-w-[280px] mx-auto leading-relaxed">
        Agents keep working autonomously. When one hits an approval gate it appears here instantly.
      </div>
    </div>
  );
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

function ApprovalCard({
  a,
  onDecide,
  enterDelay,
}: {
  a: PendingApproval;
  onDecide: (a: PendingApproval, allow: boolean) => Promise<void>;
  enterDelay: number;
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
    <div
      className={`card-enter card-hover rounded-xl bg-card hairline p-5 ${destructive ? "glow-red" : ""}`}
      style={{ "--enter-delay": `${enterDelay}ms` } as React.CSSProperties}
    >
      {/* card header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full bg-accent-red ${destructive ? "pulse-ring" : ""}`}
        />
        <span className="text-ink font-semibold text-[15px]">{a.agentName}</span>
        <span className="text-ash text-[13px] truncate min-w-0">{a.sessionTitle}</span>
        <span className="ml-auto text-ash text-[12px] shrink-0 tabular-nums">{timeAgo(a.since)}</span>
      </div>

      {/* tool block */}
      <div className="mt-4 rounded-lg bg-elevated hairline px-4 py-3">
        <div className="text-[11px] uppercase tracking-widest text-ash/70 mb-1.5 font-medium">
          {a.kind === "approval" ? "wants to run" : "is asking"}
        </div>
        <div className="font-mono text-[13px] text-accent-yellow break-all leading-snug">
          {a.toolName}
        </div>
        {a.question && (
          <div className="mt-2 text-body text-[14px] leading-relaxed">{a.question}</div>
        )}
        {a.toolArgs && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[12px] text-accent-blue hover:text-accent-blue/80 transition-colors inline-flex items-center gap-1"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            >
              <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {expanded ? "hide payload" : "show payload"}
          </button>
        )}
        {expanded && (
          <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-canvas border border-hairline p-3 text-[12px] leading-relaxed text-body whitespace-pre-wrap break-all expand-pre">
            {a.toolArgs}
          </pre>
        )}
      </div>

      {/* actions */}
      {a.kind === "approval" ? (
        <div className="mt-4 flex gap-3">
          <button
            disabled={busy !== null}
            onClick={() => act(true)}
            className="btn-approve flex-1 rounded-lg bg-accent-green/12 text-accent-green border border-accent-green/30 py-2.5 text-[14px] font-medium hover:bg-accent-green/22 hover:border-accent-green/50 disabled:opacity-40 transition-colors"
          >
            {busy === "allow" ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> Approving…
              </span>
            ) : (
              "Approve"
            )}
          </button>
          <button
            disabled={busy !== null}
            onClick={() => act(false)}
            className="btn-deny flex-1 rounded-lg bg-accent-red/12 text-accent-red border border-accent-red/25 py-2.5 text-[14px] font-medium hover:bg-accent-red/22 hover:border-accent-red/45 disabled:opacity-40 transition-colors"
          >
            {busy === "deny" ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> Denying…
              </span>
            ) : (
              "Deny"
            )}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-[13px] text-ash leading-relaxed">
          Answer this question in TrueForge — questions carry free-form context.
        </div>
      )}
    </div>
  );
}

// ─── ActivityRow ──────────────────────────────────────────────────────────────

const statusDot: Record<SessionActivity["status"], string> = {
  running: "bg-accent-blue",
  waiting: "bg-accent-red pulse-ring",
  idle: "bg-ash idle-dot",
  error: "bg-accent-yellow",
};

const statusTokenColor: Record<SessionActivity["status"], string> = {
  running: "token-fill-blue",
  waiting: "token-fill-red",
  idle: "token-fill-idle",
  error: "token-fill-idle",
};

function ActivityRow({ act, enterDelay }: { act: SessionActivity; enterDelay: number }) {
  const m = act.metrics;
  const totalTok = m.total_tokens ?? 0;
  const ratio = tokenRatio(totalTok);
  const label = act.session.title ?? act.session.id.slice(0, 12);

  return (
    <div
      className="card-enter flex items-center gap-3 rounded-lg bg-surface hairline px-4 py-3 transition-colors hover:bg-elevated"
      style={{ "--enter-delay": `${enterDelay}ms` } as React.CSSProperties}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[act.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-ink font-medium">{label}</div>
        {/* sparkline token bar */}
        {totalTok > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="token-track">
              <div
                className={`token-fill ${statusTokenColor[act.status]}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-ash tabular-nums shrink-0">
              {totalTok >= 1000 ? `${(totalTok / 1000).toFixed(1)}k` : totalTok}
            </span>
          </div>
        )}
        {totalTok === 0 && (
          <div className="truncate text-[12px] text-ash font-mono mt-0.5">
            {act.lastToolCalls.map((c) => c.name.split(" ")[0]).join(" · ") || "no activity"}
          </div>
        )}
      </div>
      <div className="text-right text-[12px] shrink-0">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
          act.status === "waiting"
            ? "bg-accent-red/12 text-accent-red"
            : act.status === "running"
              ? "bg-accent-blue/12 text-accent-blue"
              : act.status === "error"
                ? "bg-accent-yellow/12 text-accent-yellow"
                : "bg-surface text-ash"
        }`}>
          {act.status}
        </span>
      </div>
    </div>
  );
}

// ─── SpinnerIcon ──────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── ErrorBanner ──────────────────────────────────────────────────────────────

function ErrorBanner() {
  return (
    <div className="card-enter rounded-lg bg-surface hairline p-4 text-[13px] text-ash">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-yellow" />
        <span className="text-accent-yellow font-medium">TrueForge unreachable</span>
      </div>
      <p>
        Can't reach{" "}
        <span className="font-mono text-body">localhost:8790</span>. Start it with{" "}
        <span className="font-mono text-body">npx @truefoundry/trueforge</span>.
      </p>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { approvals, activity, error, lastPoll, decide, refresh } = useApprovalFeed();
  const waiting = approvals.filter((a) => a.kind === "approval");
  const questions = approvals.filter((a) => a.kind === "question");
  const hasPending = waiting.length > 0;

  return (
    <div className="min-h-screen bg-canvas font-sans">
      {/* ── header ── */}
      <header className="header-enter sticky top-0 z-10 border-b border-hairline bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-4">
          {/* logo mark */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-red/15 text-accent-red text-[15px] border border-accent-red/20">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="7" cy="7" r="2" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-ink text-[17px] font-semibold tracking-tight">ApproveDeck</h1>
          <span className="hidden sm:block text-ash text-[13px]">mission control</span>
          {/* status pill — right-aligned, wraps below on 390 */}
          <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
            <StatusPill waiting={waiting.length} error={error} lastPoll={lastPoll} />
            <button
              onClick={refresh}
              className="rounded-md bg-elevated hairline px-3 py-1.5 text-[12px] text-body hover:text-ink hover:bg-surface transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ── main ── */}
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[1fr_300px]">

        {/* ── approval column ── */}
        <section className={hasPending ? "pending-orb" : ""}>
          <h2 className="card-enter mb-4 text-[12px] font-semibold uppercase tracking-widest text-ash/80"
              style={{ "--enter-delay": "40ms" } as React.CSSProperties}>
            Needs a human
            <span className="ml-2 tabular-nums font-mono text-ash">{waiting.length}</span>
          </h2>

          {waiting.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-4">
              {waiting.map((a, i) => (
                <ApprovalCard
                  key={a.toolCallId}
                  a={a}
                  onDecide={decide}
                  enterDelay={80 + i * 60}
                />
              ))}
            </div>
          )}

          {questions.length > 0 && (
            <>
              <h2 className="card-enter mb-4 mt-10 text-[12px] font-semibold uppercase tracking-widest text-ash/80"
                  style={{ "--enter-delay": "120ms" } as React.CSSProperties}>
                Open questions
                <span className="ml-2 tabular-nums font-mono text-ash">{questions.length}</span>
              </h2>
              <div className="flex flex-col gap-4">
                {questions.map((a, i) => (
                  <ApprovalCard
                    key={a.toolCallId}
                    a={a}
                    onDecide={decide}
                    enterDelay={120 + i * 60}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── sessions rail ── */}
        <aside>
          <h2 className="card-enter mb-4 text-[12px] font-semibold uppercase tracking-widest text-ash/80"
              style={{ "--enter-delay": "60ms" } as React.CSSProperties}>
            Agent sessions
            <span className="ml-2 tabular-nums font-mono text-ash">{activity.length}</span>
          </h2>
          <div className="flex flex-col gap-2">
            {activity.map((act, i) => (
              <ActivityRow key={act.session.id} act={act} enterDelay={100 + i * 40} />
            ))}
            {activity.length === 0 && !error && (
              <div className="card-enter rounded-lg bg-surface hairline px-4 py-6 text-center"
                   style={{ "--enter-delay": "120ms" } as React.CSSProperties}>
                <div className="text-[13px] text-ash">No active sessions</div>
                <div className="mt-1 text-[12px] text-ash/60">Start a TrueForge agent to see activity here.</div>
              </div>
            )}
            {error && <ErrorBanner />}
          </div>
        </aside>
      </main>
    </div>
  );
}
