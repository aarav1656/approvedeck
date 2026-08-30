# Screencast capture for the ApproveDeck demo video.
# Runs inside the browser-harness qa profile (helpers are pre-imported).
# Emits demo/screencast2/NNN.png plus a beats.json describing, per frame,
# the beat label and the synthetic-cursor position, so the PIL overlay pass
# draws the pointer exactly where the real click landed.

import json, os, time

OUT = "/Users/kamal/Desktop/bright/approvedeck/demo/screencast2"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

CSS_W, CSS_H, DSF = 1280, 800, 1.5  # -> 1920x1200 screenshots
frames = []          # {file, beat, cursor:[x,y]|None, click:bool}
n = [0]
cursor = [640, 400]  # current synthetic pointer position, CSS px


def rect(js_find):
    """Return [cx, cy] centre of the first element matching a JS finder expr."""
    raw = js("(()=>{const b=%s; if(!b) return 'null'; const r=b.getBoundingClientRect();"
             "return JSON.stringify([r.x+r.width/2, r.y+r.height/2])})()" % js_find)
    raw = (raw or "").strip().strip('"')
    if not raw or raw == "null":
        return None
    return json.loads(raw)


def shot(beat, click=False, cur=True):
    p = os.path.join(OUT, "f%04d.png" % n[0])
    capture_screenshot(p)
    frames.append({
        "file": os.path.basename(p),
        "beat": beat,
        "cursor": list(cursor) if cur else None,
        "click": bool(click),
    })
    n[0] += 1


def hold(beat, count, click=False, cur=True):
    for i in range(count):
        shot(beat, click=(click and i == 0), cur=cur)


BTN = ("[...document.querySelectorAll('button')]"
       ".find(x=>x.innerText.trim().toLowerCase()===%r)")

cdp("Emulation.setDeviceMetricsOverride",
    width=CSS_W, height=CSS_H, deviceScaleFactor=DSF, mobile=False)
goto_url("http://localhost:5199")
wait_for_load()
wait(1.2)

# ── (a) resting deck: the queue is clear, nothing needs a human ──
js("window.scrollTo(0,0)")
cursor[:] = [640, 430]
hold("resting", 6)

# ── (b) click Demo so sample approval cards appear ──
xy = rect(BTN % "demo")
if xy:
    cursor[:] = xy
hold("aim-demo", 3)
js("(%s).click()" % (BTN % "demo"))
hold("click-demo", 4, click=True)
wait(0.9)
js("window.scrollTo(0,0)")
hold("cards-in", 6)

# ── (c) keyboard nav: press j to select the top card ──
js("""document.dispatchEvent(new KeyboardEvent('keydown',
     {key:'j', code:'KeyJ', bubbles:true, cancelable:true}))""")
wait(0.35)
hold("keyboard-j", 6, cur=False)

# ── (d) expand the proposed payload ──
xy = rect(BTN % "show payload") or rect(BTN % "hide payload")
if xy:
    cursor[:] = xy
    hold("aim-payload", 3)
    js("(%s)?.click()" % (BTN % "show payload"))
    wait(0.5)
    hold("payload-open", 7, click=True)

# ── (e) mousedown on Hold to approve; capture the fill wiping across ──
xy = rect(BTN % "hold to approve")
if xy:
    cursor[:] = xy
    hold("aim-hold", 3)
    # real mousedown on the real button, then sample the fill as it grows
    js("""(()=>{const b=%s; const r=b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,
          clientX:r.x+r.width/2, clientY:r.y+r.height/2, button:0}));
        return 'down'})()""" % (BTN % "hold to approve"))
    for i in range(7):
        shot("holding", click=(i == 0))
    # ── (f) release; the card resolves ──
    js("""(()=>{const b=%s; if(b) b.dispatchEvent(new MouseEvent('mouseup',
        {bubbles:true,cancelable:true,button:0})); return 'up'})()"""
       % (BTN % "hold to approve"))
    wait(0.8)
    hold("approved", 8, cur=False)

# ── (g) the session spine / agent sessions, scrolled into view ──
js("""(()=>{const h=[...document.querySelectorAll('*')].find(e=>
      /agent sessions|chain of custody/i.test(e.textContent||'') && e.children.length<9);
     if(h) h.scrollIntoView({block:'center'}); else window.scrollTo(0, 700);
     return 'scrolled'})()""")
wait(0.7)
hold("custody", 9, cur=False)

# ── (h) the decision log updating ──
js("""(()=>{const h=[...document.querySelectorAll('*')].find(e=>
      /decision log/i.test(e.textContent||'') && e.children.length<9);
     if(h) h.scrollIntoView({block:'center'}); else window.scrollTo(0,document.body.scrollHeight);
     return 'scrolled'})()""")
wait(0.7)
hold("log", 9, cur=False)

meta = {"css": [CSS_W, CSS_H], "dsf": DSF, "frames": frames}
with open(os.path.join(OUT, "beats.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("CAPTURED", len(frames))
print(json.dumps([f["beat"] for f in frames]))
