#!/usr/bin/env python3
"""Verify every composed frame really carries a burned-in caption.

The naive check (bottom strip is dark AND has some bright pixels) passes on a
raw uncaptioned frame too, because the app's own UI is dark and has light
text. That check proves nothing. This one keys on properties only the drawn
caption bar has, with thresholds measured from both populations rather than
guessed:

                     captioned          raw screencast
    contrast         45.4 .. 56.4        6.2 .. 24.2
    step              7.3 .. 12.4       -0.0 ..  3.2
    text            7298   .. 11554        0   .. 1857

  1. contrast: big 40px white text on a flat dark wash gives the strip a far
     wider spread than the live UI underneath it,
  2. step: compositing rgba(0,0,0,0.72) darkens the bar against the row just
     above it, a discontinuity the raw frames never have,
  3. text: thousands of bright pixels, centre-aligned.

Run directly to self-test: it asserts captioned frames pass AND that raw
screencast frames fail, so a regression that stops drawing captions is caught
instead of silently passing.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
BAR_H = 120


def caption_signals(path):
    a = np.array(Image.open(path).convert("L")).astype(np.float32)
    bar = a[-BAR_H + 6:, :]
    above = a[-BAR_H - 40:-BAR_H - 4, :]

    flat = float(bar.std())
    # step change at the bar's top edge: the wash darkens whatever was there
    step = float(above.mean() - a[-BAR_H + 4:-BAR_H + 30, :].mean())

    bright = bar > 180
    cols = bright.sum(axis=0)
    total = int(bright.sum())
    if total < 200:
        centred = 0.0
    else:
        idx = np.nonzero(cols)[0]
        centre = a.shape[1] / 2.0
        # fraction of lit columns inside the middle 70% of the width
        centred = float(np.mean(np.abs(idx - centre) < a.shape[1] * 0.35))
    return {"contrast": flat, "step": step, "text": total, "centred": centred}


# Midpoints of the measured gaps, so both populations sit well clear of the
# boundary: contrast 24.2|45.4, step 3.2|7.3, text 1857|7298.
MIN_CONTRAST, MIN_STEP, MIN_TEXT, MIN_CENTRED = 35.0, 5.0, 4000, 0.85


def has_caption(path):
    s = caption_signals(path)
    return (s["contrast"] > MIN_CONTRAST and s["step"] > MIN_STEP and
            s["text"] > MIN_TEXT and s["centred"] > MIN_CENTRED), s


def main():
    built = sorted(glob.glob(os.path.join(ROOT, "build", "b*.png")))
    raw = sorted(glob.glob(os.path.join(ROOT, "screencast2", "f*.png")))
    if not built:
        print("no composed frames")
        return 1

    fails = [(p, s) for p in built for ok, s in [has_caption(p)] if not ok]
    print("composed frames: %d, without a caption: %d" % (len(built), len(fails)))
    for p, s in fails[:5]:
        print("  MISSING", os.path.basename(p), s)

    # negative control: the same detector must REJECT uncaptioned frames
    wrong = [p for p in raw if has_caption(p)[0]]
    print("raw frames: %d, wrongly detected as captioned: %d" % (len(raw), len(wrong)))
    for p in wrong[:5]:
        print("  FALSE POSITIVE", os.path.basename(p), caption_signals(p))

    ok = not fails and not wrong
    print("VERDICT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
