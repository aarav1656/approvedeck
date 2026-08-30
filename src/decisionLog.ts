// Decision log: persists every approve/deny decision to localStorage.
// Key: approvedeck.decisions.v1

import { useCallback, useEffect, useState } from "react";

export const DECISION_LOG_KEY = "approvedeck.decisions.v1";

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

export function appendDecision(entry: Omit<DecisionEntry, "id" | "timestamp">): DecisionEntry {
  const full: DecisionEntry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const current = readLog();
  current.push(full);
  try {
    localStorage.setItem(DECISION_LOG_KEY, JSON.stringify(current));
  } catch {
    // storage full — best-effort
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

  // Sync when other tabs write to localStorage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === DECISION_LOG_KEY) reload();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [reload]);

  const stats = computeStats(log);
  return { log, stats, reload };
}
