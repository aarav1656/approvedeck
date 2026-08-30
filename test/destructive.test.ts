import { describe, expect, it } from "vitest";
import {
  DESTRUCTIVE_NAME_RE,
  DESTRUCTIVE_PAYLOAD_RE,
  isDestructive,
} from "../src/destructive";
import { buildDemoCards, demoLatencyMs, isDemoCard } from "../src/demoCards";

describe("destructive: name-based detection (pre-existing behaviour)", () => {
  it("flags execute_approved_operation", () => {
    expect(isDestructive("execute_approved_operation", "{}")).toBe(true);
  });

  it("flags exec, delete, drop, truncate, write tools", () => {
    for (const name of ["exec", "delete_file", "drop_index", "truncate_logs", "write_file"]) {
      expect(isDestructive(name, "{}")).toBe(true);
    }
  });

  it("does not flag a plainly safe tool with a safe payload", () => {
    expect(isDestructive("fetch_metrics (analytics)", '{"metric":"revenue_net"}')).toBe(false);
  });
});

describe("destructive: payload-based detection (judge finding #4)", () => {
  // The hole: a benign tool NAME carrying a destructive SQL payload used to get
  // a one-click approve with no hold-to-arm and no red pulse.
  it("flags run_sql carrying DROP TABLE", () => {
    const args = JSON.stringify({ statement: "DROP TABLE payments" });
    expect(DESTRUCTIVE_NAME_RE.test("run_sql")).toBe(false); // name alone: safe
    expect(isDestructive("run_sql", args)).toBe(true);       // payload: destructive
  });

  it("flags run_sql carrying DELETE FROM", () => {
    const args = JSON.stringify({
      statement: "DELETE FROM payments WHERE status = 'stale'",
    });
    expect(isDestructive("run_sql (postgres)", args)).toBe(true);
  });

  it("flags TRUNCATE and ALTER payloads", () => {
    expect(isDestructive("query", '{"sql":"TRUNCATE users"}')).toBe(true);
    expect(isDestructive("query", '{"sql":"ALTER TABLE users DROP COLUMN x"}')).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDestructive("query", '{"sql":"drop table t"}')).toBe(true);
  });

  it("requires a word boundary, so substrings do not false-positive", () => {
    // "dropdown" / "deleted_at" are not destructive verbs
    expect(DESTRUCTIVE_PAYLOAD_RE.test("dropdown")).toBe(false);
    expect(isDestructive("render_ui", '{"component":"dropdown"}')).toBe(false);
    expect(isDestructive("select_rows", '{"sql":"SELECT deleted_at FROM users"}')).toBe(false);
  });

  it("treats a missing payload as name-only", () => {
    expect(isDestructive("run_sql")).toBe(false);
    expect(isDestructive("run_sql", undefined)).toBe(false);
    expect(isDestructive("delete_rows")).toBe(true);
  });
});

describe("demo cards", () => {
  const cards = buildDemoCards(Date.parse("2026-01-01T00:00:00Z"));

  it("builds three cards: two approvals and one question", () => {
    expect(cards).toHaveLength(3);
    expect(cards.filter((c) => c.kind === "approval")).toHaveLength(2);
    expect(cards.filter((c) => c.kind === "question")).toHaveLength(1);
  });

  it("marks every card as demo", () => {
    for (const c of cards) expect(isDemoCard(c)).toBe(true);
  });

  it("does not mark a real card as demo", () => {
    expect(isDemoCard({ toolCallId: "call_abc123" })).toBe(false);
  });

  it("includes a card that is destructive by payload only", () => {
    const sql = cards.find((c) => c.toolName.startsWith("run_sql"));
    expect(sql).toBeDefined();
    expect(DESTRUCTIVE_NAME_RE.test(sql!.toolName)).toBe(false);
    expect(isDestructive(sql!.toolName, sql!.toolArgs)).toBe(true);
  });

  it("includes a non-destructive tool card", () => {
    const safe = cards.find((c) => c.toolName.startsWith("fetch_metrics"));
    expect(safe).toBeDefined();
    expect(isDestructive(safe!.toolName, safe!.toolArgs)).toBe(false);
  });

  it("includes an ask_user_question card with options", () => {
    const q = cards.find((c) => c.kind === "question");
    expect(q!.toolName).toBe("ask_user_question");
    expect(q!.options).toEqual(["us-east-1", "eu-west-1", "hold for now"]);
    expect(q!.question).toBeTruthy();
  });

  it("emits parseable JSON payloads", () => {
    for (const c of cards) expect(() => JSON.parse(c.toolArgs)).not.toThrow();
  });

  it("records realistic 2-4s latencies, never the 118s own-goal", () => {
    for (let i = 0; i < 200; i++) {
      const ms = demoLatencyMs();
      expect(ms).toBeGreaterThanOrEqual(2000);
      expect(ms).toBeLessThan(4000);
    }
  });
});
