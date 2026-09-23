import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 650;
const TICK_MS = 16;
const SNAP_MS = 120;

/** Pure timing controller, extracted so it can be unit-tested with vi.useFakeTimers. */
export function createHoldToArmController(
  onArmed: () => void,
  onProgress: (p: number) => void,
) {
  let tickId: ReturnType<typeof setInterval> | null = null;
  let armId: ReturnType<typeof setTimeout> | null = null;
  let snapId: ReturnType<typeof setInterval> | null = null;
  let startTime: number | null = null;
  let currentProgress = 0;

  function stopSnap() {
    if (snapId !== null) { clearInterval(snapId); snapId = null; }
  }
  function stopHold() {
    if (tickId !== null) { clearInterval(tickId); tickId = null; }
    if (armId !== null) { clearTimeout(armId); armId = null; }
  }

  return {
    start() {
      if (startTime !== null) return; // already holding — ignore
      stopSnap();
      startTime = Date.now();
      currentProgress = 0;
      onProgress(0);

      tickId = setInterval(() => {
        const elapsed = Date.now() - startTime!;
        currentProgress = Math.min(elapsed / HOLD_MS, 1);
        onProgress(currentProgress);
      }, TICK_MS);

      armId = setTimeout(() => {
        stopHold();
        startTime = null;
        currentProgress = 1;
        onProgress(1);
        onArmed();
      }, HOLD_MS);
    },

    cancel() {
      if (startTime === null) return; // not holding — no-op
      const fromProgress = currentProgress;
      stopHold();
      startTime = null;

      if (fromProgress <= 0) {
        onProgress(0);
        return;
      }

      // Snap the fill back to 0 over SNAP_MS.
      const snapStart = Date.now();
      snapId = setInterval(() => {
        const elapsed = Date.now() - snapStart;
        const t = Math.min(elapsed / SNAP_MS, 1);
        const p = fromProgress * (1 - t);
        currentProgress = p;
        onProgress(p);
        if (t >= 1) {
          stopSnap();
          currentProgress = 0;
          onProgress(0);
        }
      }, TICK_MS);
    },

    dispose() {
      stopHold();
      stopSnap();
      startTime = null;
    },
  };
}

/** React hook wrapping the hold-to-arm controller. */
export function useHoldToArm(onArmed: () => void) {
  const [progress, setProgress] = useState(0);
  const onArmedRef = useRef(onArmed);
  onArmedRef.current = onArmed;
  const ctrlRef = useRef<ReturnType<typeof createHoldToArmController> | null>(null);

  useEffect(() => {
    const ctrl = createHoldToArmController(
      () => onArmedRef.current(),
      (p) => setProgress(p),
    );
    ctrlRef.current = ctrl;
    return () => ctrl.dispose();
  }, []);

  return {
    progress,
    start: useCallback(() => ctrlRef.current?.start(), []),
    cancel: useCallback(() => ctrlRef.current?.cancel(), []),
  };
}
