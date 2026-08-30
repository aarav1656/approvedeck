import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoldToArmController } from "../src/useHoldToArm";

describe("createHoldToArmController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onArmed after exactly 650ms", () => {
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    ctrl.start();
    vi.advanceTimersByTime(649);
    expect(onArmed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onArmed).toHaveBeenCalledOnce();
    ctrl.dispose();
  });

  it("does NOT call onArmed when cancelled before 650ms", () => {
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    ctrl.start();
    vi.advanceTimersByTime(400);
    ctrl.cancel();
    vi.advanceTimersByTime(500); // past the arm time
    expect(onArmed).not.toHaveBeenCalled();
    ctrl.dispose();
  });

  it("reports progress between 0 and 1 during hold", () => {
    const onArmed = vi.fn();
    const progress: number[] = [];
    const ctrl = createHoldToArmController(onArmed, (p) => progress.push(p));

    ctrl.start();
    // Initial call: 0
    expect(progress[0]).toBe(0);
    // After 325ms (~half way): progress should be ~0.5
    vi.advanceTimersByTime(325);
    const midProgress = progress[progress.length - 1];
    expect(midProgress).toBeGreaterThan(0.4);
    expect(midProgress).toBeLessThan(0.7);
    ctrl.dispose();
  });

  it("snaps fill back to 0 over ~120ms after cancel", () => {
    const onArmed = vi.fn();
    const progress: number[] = [];
    const ctrl = createHoldToArmController(onArmed, (p) => progress.push(p));

    ctrl.start();
    vi.advanceTimersByTime(400); // build up some progress
    const beforeCancel = progress[progress.length - 1];
    expect(beforeCancel).toBeGreaterThan(0.5);

    ctrl.cancel();
    // Immediately after cancel progress should still be near the cancelled value
    const rightAfter = progress[progress.length - 1];
    expect(rightAfter).toBeGreaterThan(0);

    // After snap duration: should be 0
    vi.advanceTimersByTime(200);
    expect(progress[progress.length - 1]).toBe(0);
    ctrl.dispose();
  });

  it("ignores a second start() while already holding", () => {
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    ctrl.start();
    vi.advanceTimersByTime(200);
    ctrl.start(); // redundant — should not reset timer
    vi.advanceTimersByTime(450); // 650 total from first start
    expect(onArmed).toHaveBeenCalledOnce();
    ctrl.dispose();
  });

  it("does nothing on cancel() when not holding", () => {
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    // cancel before start: no-op
    ctrl.cancel();
    expect(onProgress).not.toHaveBeenCalled();
    ctrl.dispose();
  });

  it("dispose() prevents armed callback from firing", () => {
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    ctrl.start();
    vi.advanceTimersByTime(300);
    ctrl.dispose();
    vi.advanceTimersByTime(500);
    expect(onArmed).not.toHaveBeenCalled();
  });

  // ── Fix 2: Enter auto-repeat — controller must not arm a second time ────────
  it("start() is idempotent: second call during hold does not restart the 650ms timer", () => {
    // Simulates the keyboard auto-repeat path: multiple keydown events fire before keyup.
    // The controller should arm exactly once, at 650ms from the *first* start().
    const onArmed = vi.fn();
    const onProgress = vi.fn();
    const ctrl = createHoldToArmController(onArmed, onProgress);

    ctrl.start();
    vi.advanceTimersByTime(300);
    // Simulate repeated keydown events — all ignored because startTime !== null
    ctrl.start();
    ctrl.start();
    vi.advanceTimersByTime(350); // 650ms total from the first start()
    expect(onArmed).toHaveBeenCalledOnce();
    ctrl.dispose();
  });

  // ── Fix 4: keyboard hold — keyup before 650ms must NOT arm ─────────────────
  it("cancel() before 650ms (keyboard keyup) prevents arming", () => {
    // The card's keydown effect calls start(); keyup calls cancel().
    // If the user releases before 650ms, onArmed must not fire.
    const onArmed = vi.fn();
    const progress: number[] = [];
    const ctrl = createHoldToArmController(onArmed, (p) => progress.push(p));

    ctrl.start();
    vi.advanceTimersByTime(500); // held for 500ms < 650ms
    ctrl.cancel();               // simulates keyup
    vi.advanceTimersByTime(300); // 800ms total — would have armed without the cancel
    expect(onArmed).not.toHaveBeenCalled();
    // Progress should snap back to 0
    expect(progress[progress.length - 1]).toBe(0);
    ctrl.dispose();
  });

  // ── Fix 5: onTouchCancel — cancel() from an interrupted touch ───────────────
  it("cancel() after start() when no progress built (immediate cancel) is a no-op for arming", () => {
    // onTouchCancel fires immediately after touchstart in some scenarios (e.g. scroll hijack).
    // Progress is 0 at that point; arming must not happen.
    const onArmed = vi.fn();
    const progress: number[] = [];
    const ctrl = createHoldToArmController(onArmed, (p) => progress.push(p));

    ctrl.start();
    // Cancel before the first tick (progress === 0)
    ctrl.cancel();
    vi.advanceTimersByTime(1000); // well past 650ms
    expect(onArmed).not.toHaveBeenCalled();
    // After the snap (fromProgress <= 0 => immediate 0, no interval)
    expect(progress[progress.length - 1]).toBe(0);
    ctrl.dispose();
  });
});
