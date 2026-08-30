import { useCallback, useMemo, useState } from "react";
import type { Session } from "../api";
import { type TimelineNode, useFleetTimeline } from "../useFleetTimeline";
import { buildReceipt, receiptToText } from "../custodyReceipt";

// ─── node vocabulary ──────────────────────────────────────────────────────────

const DOT: Record<TimelineNode["kind"], string> = {
  session: "tl-dot-session",
  turn: "tl-dot-turn",
  tool: "tl-dot-tool",
  thread: "tl-dot-thread",
  gate: "tl-dot-gate",
  decision: "tl-dot-decision",
  question: "tl-dot-question",
  execution: "tl-dot-exec",
  "turn-end": "tl-dot-turn",
};

const MONO_KINDS = new Set<TimelineNode["kind"]>(["tool", "gate", "execution", "question"]);

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

// ─── one node ─────────────────────────────────────────────────────────────────

function TimelineRow({ node, index }: { node: TimelineNode; index: number }) {
  const [open, setOpen] = useState(false);
  const hasPayload = Boolean(node.payload);
  const mono = MONO_KINDS.has(node.kind);

  const decided = node.kind === "decision";
  const labelTone = decided
    ? node.decision === "approve"
      ? "text-accent-green"
      : "text-accent-red"
    : node.kind === "gate"
      ? "text-accent-yellow"
      : node.status === "error"
        ? "text-accent-red"
        : "text-ink";

  return (
    <li
      className="tl-node card-enter"
      data-kind={node.kind}
      data-decision={node.decision}
      style={{ "--enter-delay": `${Math.min(index * 24, 320)}ms` } as React.CSSProperties}
    >
      <span className={`tl-dot ${DOT[node.kind]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <button
            type="button"
            disabled={!hasPayload}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={hasPayload ? open : undefined}
            className={[
              "tl-label text-left",
              mono ? "font-mono" : "",
              labelTone,
              hasPayload ? "tl-label-clickable" : "cursor-default",
            ].join(" ")}
          >
            {node.label}
          </button>
          {node.durationMs !== undefined && (
            <span className="tl-chip tabular-nums">{duration(node.durationMs)}</span>
          )}
          {node.waitMs !== undefined && (
            <span
              className={`tl-chip tabular-nums ${node.decision === "approve" ? "tl-chip-green" : "tl-chip-red"}`}
            >
              {duration(node.waitMs)} wait
            </span>
          )}
          {node.threadId && node.kind === "thread" && (
            <span className="tl-chip tl-chip-blue font-mono">{node.threadId.slice(0, 8)}</span>
          )}
          <span className="tl-time ml-auto tabular-nums">{clockTime(node.at)}</span>
        </div>
        {node.detail && <div className="tl-detail">{node.detail}</div>}
        {open && node.payload && (
          <pre className="tl-payload expand-pre">{node.payload}</pre>
        )}
      </div>
    </li>
  );
}

// ─── the pane ─────────────────────────────────────────────────────────────────

export function Timeline({
  session,
  onClose,
}: {
  session: Session | null;
  onClose?: () => void;
}) {
  const { nodes, loading, error } = useFleetTimeline(session);
  const [copied, setCopied] = useState(false);

  const receipt = useMemo(
    () =>
      session
        ? buildReceipt(
            { id: session.id, title: session.title, agentName: session.agent?.name },
            nodes,
          )
        : null,
    [session, nodes],
  );

  const copyReceipt = useCallback(async () => {
    if (!receipt) return;
    const text = receiptToText(receipt);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      download(text, receipt.session.id);
    }
  }, [receipt]);

  const downloadReceipt = useCallback(() => {
    if (!receipt) return;
    download(receiptToText(receipt), receipt.session.id);
  }, [receipt]);

  if (!session) {
    return (
      <div className="tl-pane">
        <h2 className="tl-title">Chain of custody</h2>
        <p className="tl-empty">
          Pick a session on the right to replay every tool call, subagent and approval gate in
          order.
        </p>
      </div>
    );
  }

  const gates = receipt?.counts.gates ?? 0;

  return (
    <div className="tl-pane">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="tl-title">Chain of custody</h2>
        <span className="tl-chip tabular-nums">{nodes.length} events</span>
        {gates > 0 && <span className="tl-chip tl-chip-amber tabular-nums">{gates} gates</span>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={copyReceipt} className="tl-btn">
            {copied ? "Copied" : "Copy receipt"}
          </button>
          <button type="button" onClick={downloadReceipt} className="tl-btn">
            Download
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="tl-btn" aria-label="Close timeline">
              Close
            </button>
          )}
        </div>
      </div>
      <div className="tl-sub">
        {session.title ?? session.id}
        {session.agent?.name ? ` · ${session.agent.name}` : ""}
      </div>

      {error && <div className="tl-error">Timeline unavailable: {error}</div>}
      {!error && nodes.length === 0 && (
        <p className="tl-empty">{loading ? "Reading harness events…" : "No events recorded yet."}</p>
      )}

      {nodes.length > 0 && (
        <ol className="tl-spine">
          {nodes.map((n, i) => (
            <TimelineRow key={n.id} node={n} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function download(text: string, sessionId: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `custody-${sessionId.slice(0, 12)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
