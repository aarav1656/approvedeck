# How the blog assets were produced

Everything in this folder is derived from captures already in the repo. Nothing
was drawn by hand and nothing is a mockup of UI that does not exist.

## Screenshots and the GIF

`python3 docs/make-blog-assets.py`

Sources:

- `docs-shots/deck-final-gate.png`, `docs-shots/deck-hold-arming.png` (from
  `main`), `docs-shots/timeline.png` (from `feat/fleet-timeline`),
  `docs-shots/deslop-390.png`
- `demo/screencast2/f00NN.png`, the raw screencast frames. These are used in
  preference to `demo/build/b00NN.png` because the build frames have the demo
  video's caption bar and synthetic cursor composited on top.

Crop boxes were measured rather than guessed. Each one is a row/column content
band found by thresholding against the page background (`#07080a`), and the
numbers are recorded in the comment above each `crop()` call.

`hold-to-arm.gif` uses screencast frames 38 to 44, which are the mousedown
through to the release. The fill is monotonic across them: mean red in the
button band rises 40.7, 48.5, 55.0, 65.7, 71.6, 79.2, 88.2 before the reset
frame. Frames 45 onward show the card already resolved.

## Diagrams

Source of truth is the mermaid in `gate-roundtrip.mmd` and
`destructive-path.mmd`. Substack does not render mermaid, so both are exported
to PNG.

`npx @mermaid-js/mermaid-cli` does not work here: it needs puppeteer, which is
not installed and which the local agent rules forbid launching. Instead the
diagrams are rendered by the same mermaid build in a real browser through the
Brave harness, then trimmed and downscaled.

```bash
# serve the mermaid runtime, Inter, and a render page
cp ~/.npm/_npx/*/node_modules/mermaid/dist/mermaid.esm.min.mjs /tmp/mmd/
cp -r ~/.npm/_npx/*/node_modules/mermaid/dist/chunks /tmp/mmd/
cd /tmp/mmd && python3 -m http.server 8899
```

The render page must await `document.fonts.load(...)` *before* calling
`mermaid.initialize`. Mermaid measures every label at render time, so if Inter
arrives afterwards each node box is sized against the fallback face and the
text overflows its box on the right. That failure is visible in the output as
labels clipped mid word.

Capture is done at `deviceScaleFactor: 2` with roughly 140x200 px of slack
around the SVG's own bounding rect, then trimmed back to the content bbox in
PIL. The slack matters: sizing the viewport to the measured rect exactly cut
the last node off both diagrams.
