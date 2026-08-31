#!/usr/bin/env python3
"""Generate docs/BLOG-POST-SUBSTACK.md from docs/BLOG-POST.md.

Substack cannot render markdown image syntax or mermaid, so every image becomes
a [IMAGE: path - caption] placeholder the author uploads in order, and the file
opens with a numbered checklist of those paths.

Deriving the Substack file rather than hand maintaining it means the two posts
cannot drift apart: run this after any edit to BLOG-POST.md.
"""
import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parent
SRC = DOCS / "BLOG-POST.md"
OUT = DOCS / "BLOG-POST-SUBSTACK.md"

IMG = re.compile(r"^!\[(?P<alt>[^\]]*)\]\((?P<path>[^)]+)\)\s*$")
CAPTION = re.compile(r"^\*(?P<text>[^*].*)$")

lines = SRC.read_text().split("\n")
out, assets = [], []
i = 0
while i < len(lines):
    m = IMG.match(lines[i])
    if not m:
        out.append(lines[i])
        i += 1
        continue

    path = "docs/" + m.group("path")
    # the caption is the italic block directly after the image, possibly
    # wrapped over several lines and ending in a closing asterisk
    caption, j = "", i + 1
    if j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and CAPTION.match(lines[j]):
        buf = []
        while j < len(lines) and lines[j].strip():
            buf.append(lines[j].strip())
            j += 1
        caption = " ".join(buf).strip("*").strip()

    out.append(f"[IMAGE: {path} - {caption}]")
    assets.append((path, caption))
    i = j

body = "\n".join(out)

# split the title off so the checklist sits under it rather than above it
first, rest = body.split("\n", 1)

checklist = ["", "## Upload checklist", "",
             "Upload these in this order. Each one replaces the matching",
             "`[IMAGE: ...]` line in the body below.", ""]
for n, (path, caption) in enumerate(assets, 1):
    checklist.append(f"{n}. `{path}`")
    checklist.append(f"   caption: {caption}")
checklist += ["",
              "Both diagrams are also checked in as mermaid source next to the",
              "PNGs (`docs/blog-assets/gate-roundtrip.mmd` and",
              "`docs/blog-assets/destructive-path.mmd`) for later edits.",
              "", "---"]

OUT.write_text(first + "\n" + "\n".join(checklist) + "\n" + rest)
print(f"wrote {OUT.name}: {len(assets)} placeholders")

missing = [p for p, _ in assets if not (DOCS.parent / p).exists()]
uncaptioned = [p for p, c in assets if not c]
for p in missing:
    print("MISSING FILE:", p, file=sys.stderr)
for p in uncaptioned:
    print("NO CAPTION:", p, file=sys.stderr)
sys.exit(1 if (missing or uncaptioned) else 0)
