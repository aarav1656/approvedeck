// Decision log: persists every approve/deny decision to localStorage.
// Key: approvedeck.decisions.v1

import { useCallback, useEffect, useState } from "react";

export const DECISION_LOG_KEY = "approvedeck.decisions.v1";

/** Maximum entries kept in localStorage. Oldest are dropped when exceeded. */
const MAX_ENTRIES = 500;

/** Custom event name dispatched on the same document after every write. */
export const DECISION_EVENT = "approvedeck:decision";

export interface DecisionEntry {
  id: string;            // crypto.randomUUID()
  timestamp: string;     // ISO-8601
  sessionId: string;
  toolName: string;
  decision: "approve" | "deny";
  latencyMs: number;     // gate appearance (since) -> click
}

export interface DecisionStats {
  totalApproved: number;
  totalDenied: number;
  /** median latency across all decisions (ms), or null when no entries */
  medianResponseMs: number | null;
}

// ---------- storage helpers (pure, no hooks) ----------

export function readLog(): DecisionEntry[] {
  try {
    const raw = localStorage.getItem(DECISION_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DecisionEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Append a decision entry to localStorage, then dispatch a same-document
 * CustomEvent so same-tab consumers (useDecisionLog) are notified immediately.
 *
 * Concurrent-write mitigation: we re-read the freshest array immediately
 * before writing, minimising (but not eliminating) the race window between
 * two tabs. Full multi-tab locking (e.g. Web Locks API) is out of scope for
 * this single-user local tool.
 *
 * Growth cap: at most MAX_ENTRIES (500) are retained; excess oldest entries
 * are dropped before writing.
 *
 * Quota handling: if setItem throws (storage full) we retry once after
 * dropping the oldest half; if still failing we console.warn and return the
 * entry without persisting.
 */
export function appendDecision(entry: Omit<DecisionEntry, "id" | "timestamp">): DecisionEntry {
  const full: DecisionEntry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Re-read immediately before write to minimise concurrent-overwrite loss.
  const current = readLog();
  current.push(full);

  // Cap to most recent MAX_ENTRIES entries.
  const capped = current.length > MAX_ENTRIES
    ? current.slice(current.length - MAX_ENTRIES)
    : current;

  const persist = (entries: DecisionEntry[]): boolean => {
    try {
      localStorage.setItem(DECISION_LOG_KEY, JSON.stringify(entries));
      return true;
    } catch {
      return false;
    }
  };

  if (!persist(capped)) {
    // Quota exceeded — retry with oldest half dropped.
    const half = capped.slice(Math.floor(capped.length / 2));
    if (!persist(half)) {
      console.warn(
        "[approvedeck] localStorage quota exceeded — decision entry not persisted:",
        full.id,
      );
    }
  }

  // Notify same-document consumers (StorageEvent only fires in other tabs).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DECISION_EVENT, { detail: full }));
  }

  return full;
}

export function computeStats(log: DecisionEntry[]): DecisionStats {
  let totalApproved = 0;
  let totalDenied = 0;
  const latencies: number[] = [];

  for (const e of log) {
    if (e.decision === "approve") totalApproved++;
    else totalDenied++;
    latencies.push(e.latencyMs);
  }

  let medianResponseMs: number | null = null;
  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianResponseMs =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return { totalApproved, totalDenied, medianResponseMs };
}

// ---------- hook ----------

export function useDecisionLog(): {
  log: DecisionEntry[];
  stats: DecisionStats;
  reload: () => void;
} {
  const [log, setLog] = useState<DecisionEntry[]>(() => readLog());

  const reload = useCallback(() => {
    setLog(readLog());
  }, []);

  useEffect(() => {
    // Cross-tab sync: StorageEvent only fires in tabs OTHER than the writer.
    const storageHandler = (e: StorageEvent) => {
      if (e.key === DECISION_LOG_KEY) reload();
    };
    // Same-tab sync: appendDecision dispatches this custom event after writing.
    const decisionHandler = () => reload();

    window.addEventListener("storage", storageHandler);
    window.addEventListener(DECISION_EVENT, decisionHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener(DECISION_EVENT, decisionHandler);
    };
  }, [reload]);

  const stats = computeStats(log);
  return { log, stats, reload };
}
