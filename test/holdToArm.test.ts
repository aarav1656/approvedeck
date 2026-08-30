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
});
