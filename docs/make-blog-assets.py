#!/usr/bin/env python3
"""Build the blog visuals for docs/BLOG-POST.md.

Every asset is derived from a real capture already in the repo:
  docs-shots/*.png        stills from the qa browser profile
  demo/screencast2/*.png  raw screencast frames (no burned-in caption)

Crop boxes were measured, not guessed: see docs/blog-assets/CROPS.md for the
row/column content bands each box came from.
"""
import os
import subprocess

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "blog-assets")
os.makedirs(OUT, exist_ok=True)

BG = (7, 8, 10)


def src(*p):
    return os.path.join(ROOT, *p)


def save(im, name, width=None):
    if width and im.width != width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path)
    print(f"{name:34s} {im.size[0]}x{im.size[1]}")
    return path


def crop(path, box, name, pad=0, width=None):
    im = Image.open(src(path)).convert("RGB")
    x0, y0, x1, y1 = box
    if pad:
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return save(im.crop((x0, y0, x1, y1)), name, width)


# 1. Hero: the whole deck with one gate waiting. Trim the dead space below the
#    session list so the card is not swimming in black.
crop("docs-shots/deck-final-gate.png", (440, 0, 2420, 1500), "hero-approval-gate.png",
     width=1600)

# 2. Keyboard hint bar, cropped out of the same shot. The divider rule sits on
#    row 114, the keycap glyphs run rows 135..166 and cols 545..1103, so the box
#    starts below the rule and clears the last hint.
crop("docs-shots/deck-final-gate.png", (520, 122, 1140, 182), "keyboard-map.png",
     width=1240)

# 3. Hold to approve button pair, caught mid fill. The red button chrome
#    measures rows 643..756, cols 582..1666; the box stays inside the card's
#    inner dividers on rows 597 and 720 so no stray rule is included.
crop("docs-shots/deck-hold-arming.png", (566, 628, 1684, 772), "hold-to-approve-button.png",
     width=1118)

# 4. The gate card on its own: agent, unwrapped tool, payload toggle, buttons.
#    The card body measures cols 545..1702 and rows 281..755; the box opens at
#    row 218 to keep the NEEDS A HUMAN heading (rows 231..247) attached.
crop("docs-shots/deck-final-gate.png", (520, 214, 1730, 784), "gate-card.png", width=1400)

# 5. Expanded payload on a destructive call: the unwrapped tool name plus the
#    full arguments the agent wants to run. Screencast frame 34 is the one where
#    the payload is open on run_sql; the card runs cols 240..1180.
crop("demo/screencast2/f0034.png", (240, 232, 1186, 790), "payload-expanded.png",
     width=1200)

# 6. Session rail: every session, its tool trail and its waiting state.
crop("docs-shots/deck-final-gate.png", (1730, 180, 2330, 1470), "session-rail.png",
     width=900)

# 7. Chain of custody spine with the gate event inline.
crop("docs-shots/timeline.png", (430, 190, 2510, 1330), "chain-of-custody.png", width=1500)

# 8. Decision log counters and the latency on the resolved gate. The green
#    APPROVED figure sits at rows 1007..1116 in screencast frame 76, so the box
#    opens at row 880 to take the section label with it.
crop("demo/screencast2/f0076.png", (200, 880, 1740, 1180), "decision-log.png", width=1400)

# 9. Mobile width, after the overflow fix.
crop("docs-shots/deslop-390.png", (0, 0, 780, 1400), "mobile-390.png", width=560)


# 10. hold-to-arm.gif. Frames 38..44 of the raw screencast are the mousedown
#     through to the release; the fill wipes left to right across them. Using
#     the raw frames rather than demo/build keeps the burned-in caption and the
#     synthetic cursor out of the crop.
def build_gif():
    box = (250, 782, 712, 874)  # left button, padded past its border
    frames = []
    for i in range(38, 45):
        im = Image.open(src("demo/screencast2/f%04d.png" % i)).convert("RGB").crop(box)
        im = im.resize((im.width, im.height), Image.LANCZOS)
        frames.append(im)
    # hold the last frame, then a short rest on the empty button so the loop
    # reads as a repeated press rather than a jitter
    rest = Image.open(src("demo/screencast2/f0037.png")).convert("RGB").crop(box)
    seq = frames + [frames[-1]] * 3 + [rest] * 2
    durations = [90] * 7 + [120] * 3 + [260] * 2
    out = os.path.join(OUT, "hold-to-arm.gif")
    seq[0].save(out, save_all=True, append_images=seq[1:], duration=durations,
                loop=0, optimize=True)
    print(f"{'hold-to-arm.gif':34s} {seq[0].size[0]}x{seq[0].size[1]} {len(seq)} frames")
    # extract two frames back out for verification
    g = Image.open(out)
    for idx, name in ((1, "verify-gif-frame1.png"), (6, "verify-gif-frame6.png")):
        g.seek(idx)
        g.convert("RGB").save(os.path.join("/tmp", name))
    return out


build_gif()

# The two mermaid diagrams are NOT built here. mermaid-cli needs puppeteer,
# which is not available in this environment, so they are rendered through the
# Brave harness instead. See docs/blog-assets/README.md for that recipe.
