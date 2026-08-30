#!/usr/bin/env python3
"""Compose the ApproveDeck demo video frames.

Reads demo/screencast2/*.png plus beats.json, and for every frame burns in:
  - a synthetic mouse cursor (white arrow, black outline) at the real
    coordinates the capture pass clicked,
  - a click ripple (expanding translucent ring) for 4 frames after a click,
  - a caption bar (rgba(0,0,0,0.72), ~120px) with the beat's line.

Output frames land in demo/build/ ready for the ffmpeg concat demuxer, since
this ffmpeg has neither drawtext nor the subtitles filter.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "screencast2")
OUT = os.path.join(ROOT, "build")

BAR_H = 120
BAR_ALPHA = int(0.72 * 255)
FPS = 6
RIPPLE_FRAMES = 4

# One short caption per beat, tracking the narration.
CAPTIONS = {
    "resting":      "ApproveDeck: every agent waiting on a human, in one deck",
    "aim-demo":     "Demo mode injects real approval cards",
    "click-demo":   "Demo mode injects real approval cards",
    "cards-in":     "Two agents are blocked, waiting on a human decision",
    "keyboard-j":   "Press j / k to move through the queue, no mouse needed",
    "aim-payload":  "Expand the payload: the exact command the agent proposes",
    "payload-open": "DELETE on prod-billing, 23 rows, inside a transaction",
    "aim-hold":     "Destructive tools cannot be approved by a stray click",
    "holding":      "Hold to approve: 650ms of deliberate intent",
    "approved":     "Approved. The agent resumes through the harness API",
    "aim-session":  "Pick any session to replay what the agent actually did",
    "custody":      "Chain of custody: the audit spine for that session",
    "custody-spine": "Real harness events in order, with real durations",
    "log":          "Decision log: who decided what, and how long it waited",
}


def font(size, bold=False):
    names = (
        ["Inter-SemiBold", "HelveticaNeue-Bold", "Arial Bold"] if bold
        else ["Inter-Regular", "HelveticaNeue", "Arial"]
    )
    paths = [
        "/System/Library/Fonts/Supplemental/Arial{}.ttf".format(" Bold" if bold else ""),
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial{}.ttf".format(" Bold" if bold else ""),
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_cursor(img, x, y):
    """White arrow with a black outline, drawn as a polygon at (x, y)."""
    s = 1.0
    pts = [(0, 0), (0, 34), (9, 26), (15, 39), (22, 36), (16, 23), (26, 22)]
    poly = [(x + px * s, y + py * s) for px, py in pts]
    d = ImageDraw.Draw(img)
    # outline first (thick black stroke), then the white body
    d.polygon(poly, fill=(0, 0, 0, 255))
    inner = [(x + px * 0.78 + 2, y + py * 0.78 + 2) for px, py in pts]
    d.polygon(inner, fill=(255, 255, 255, 255))


def draw_ripple(img, x, y, step):
    """Expanding translucent ring, step 0..RIPPLE_FRAMES-1."""
    frac = (step + 1) / float(RIPPLE_FRAMES)
    r = int(18 + 46 * frac)
    alpha = int(200 * (1 - frac))
    if alpha <= 0:
        return
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.ellipse([x - r, y - r, x + r, y + r],
              outline=(255, 255, 255, alpha), width=max(3, int(7 * (1 - frac)) + 3))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(120, 180, 255, int(alpha * 0.18)))
    img.alpha_composite(ov)


def draw_caption(img, text, f, fsmall):
    w, h = img.size
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rectangle([0, h - BAR_H, w, h], fill=(0, 0, 0, BAR_ALPHA))
    # a hairline accent so the bar reads as chrome, not a crop artifact
    d.rectangle([0, h - BAR_H, w, h - BAR_H + 2], fill=(255, 255, 255, 40))
    img.alpha_composite(ov)

    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - tw) // 2
    y = h - BAR_H + (BAR_H - th) // 2 - bbox[1]
    # a soft shadow keeps it legible over any bar transparency
    d.text((x + 2, y + 2), text, font=f, fill=(0, 0, 0, 220))
    d.text((x, y), text, font=f, fill=(255, 255, 255, 255))


def main():
    meta = json.load(open(os.path.join(SRC, "beats.json")))
    frames = meta["frames"]
    dsf = meta.get("dsf", 1.5)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))

    f_cap = font(40, bold=True)
    f_small = font(26)

    # a click at frame i ripples over frames i..i+RIPPLE_FRAMES-1
    ripple_at = {}
    for i, fr in enumerate(frames):
        if fr.get("click") and fr.get("cursor"):
            for k in range(RIPPLE_FRAMES):
                ripple_at.setdefault(i + k, (fr["cursor"], k))

    for i, fr in enumerate(frames):
        img = Image.open(os.path.join(SRC, fr["file"])).convert("RGBA")

        if i in ripple_at:
            (cx, cy), step = ripple_at[i]
            draw_ripple(img, int(cx * dsf), int(cy * dsf), step)

        cur = fr.get("cursor")
        if cur:
            draw_cursor(img, int(cur[0] * dsf), int(cur[1] * dsf))

        cap = CAPTIONS.get(fr["beat"], "")
        if cap:
            draw_caption(img, cap, f_cap, f_small)

        img.convert("RGB").save(os.path.join(OUT, "b%04d.png" % i), quality=95)

    print("COMPOSED", len(frames), "->", OUT)


if __name__ == "__main__":
    sys.exit(main())
