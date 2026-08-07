#!/usr/bin/env python3
"""
Render an .excalidraw file to PNG by driving excalidraw.com through CDP.

    python3 scripts/render_diagram.py docs/architecture.excalidraw docs/architecture.png

## Why CDP and not a screenshot of the screen

The first version photographed the desktop. That captures whatever window has focus — one
attempt caught QuickTime playing the demo video — and it forces a crop, which then has to
guess where the browser's own chrome ends. It guessed 92px when Chrome's tab sidebar ends at
56, and sliced 36px off the diagram, which is why the left and right margins came out
unequal.

`Page.captureScreenshot` takes the PAGE, not the screen: focus-independent, no window
chrome, and it accepts an exact clip rectangle.

## Why the clip is computed, not detected

Scroll and zoom are set explicitly from the scene's own bounding box, so where the content
lands in page coordinates is KNOWN rather than discovered by scanning for non-white pixels.
No threshold, no heuristics, and the margin is equal on all four sides by construction —
which is the property that kept failing when it was measured after the fact.
"""

import base64
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VW, VH = 1864, 1080
PAD = 48
SCALE = 2


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/architecture.excalidraw")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/architecture.png")

    scene = json.loads(src.read_text())
    els = scene["elements"]
    paper = scene["appState"].get("viewBackgroundColor", "#ffffff")

    bx1 = min(e["x"] for e in els)
    by1 = min(e["y"] for e in els)
    bx2 = max(e["x"] + e["width"] for e in els)
    by2 = max(e["y"] + e["height"] for e in els)
    w, h = bx2 - bx1, by2 - by1
    sx, sy = (VW - w) / 2 - bx1, (VH - h) / 2 - by1

    # The scene goes via a FILE, not inlined into the script source. Inlining round-trips the
    # JSON through Python's own string escaping: `json.dumps` emits `\\n` for a newline inside
    # a label, Python then reads that back as a real newline when the script is built, and the
    # JS string literal terminates mid-value with "Invalid or unexpected token".
    tmp = ROOT / "docs" / ".scene.tmp.json"
    tmp.write_text(json.dumps(els))

    script = f"""
import base64, json, pathlib, time
els = json.load(open("{tmp}"))
# Navigate FIRST. localStorage is origin-scoped, so seeding it before the tab is on
# excalidraw.com raises "Access is denied for this document" — the tab was still wherever
# the previous run left it. Load, seed, then reload so the app boots from the seeded state.
goto_url("https://excalidraw.com")
wait_for_load()
time.sleep(4)
js("localStorage.setItem('excalidraw', JSON.stringify(%s)); "
   "localStorage.setItem('excalidraw-state', JSON.stringify(%s)); return 1"
   % (json.dumps(els), json.dumps({{"scrollX": {sx}, "scrollY": {sy}, "zoom": {{"value": 1}},
      "viewBackgroundColor": "{paper}", "theme": "light", "gridSize": None}})))
goto_url("https://excalidraw.com")
wait_for_load()
time.sleep(9)
js("document.querySelectorAll('.excalidraw .layer-ui__wrapper, .excalidraw footer, .excalidraw .App-bottom-bar').forEach(e=>e.style.display='none'); return 1")
time.sleep(1.5)
r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True, clip={{
  "x": {bx1 + sx - PAD}, "y": {by1 + sy - PAD},
  "width": {w + PAD * 2}, "height": {h + PAD * 2}, "scale": {SCALE}}})
pathlib.Path("{dst}").write_bytes(base64.b64decode(r["data"]))
print("captured")
"""
    p = subprocess.run(["browser-harness"], input=script, text=True,
                       capture_output=True, cwd=ROOT)
    if "captured" not in p.stdout:
        sys.exit(f"render failed:\n{p.stdout[-800:]}\n{p.stderr[-800:]}")

    from PIL import Image
    im = Image.open(dst).convert("RGB")

    # Trim edges that are not the paper colour.
    #
    # `captureBeyondViewport` can run past the drawing canvas into the page's own white
    # background, which on the DARK variant left a 35px white band along the bottom — a
    # bright bar across the foot of a frame in an otherwise near-black video. Rather than
    # tune the clip, drop any edge row or column that is uniformly something other than the
    # paper: it is self-correcting and does nothing when the capture was already clean.
    want = tuple(int(paper.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    px = im.load()
    w, h = im.size

    # An edge band to remove is UNIFORM and not the paper colour. A row containing the
    # drawing is neither uniform nor paper, which is what stops the scan — the first version
    # tested only "not paper" and marched straight through the diagram, trimming every
    # column in the image.
    def junk(line: list[tuple[int, int, int]]) -> bool:
        first = line[0]
        uniform = all(abs(p[c] - first[c]) < 6 for p in line for c in range(3))
        off_paper = any(abs(first[c] - want[c]) > 12 for c in range(3))
        return uniform and off_paper

    row = lambda y: [px[x, y] for x in range(0, w, 40)]
    col = lambda x: [px[x, y] for y in range(0, h, 40)]

    top, bot, left, right = 0, h - 1, 0, w - 1
    while top < bot and junk(row(top)):
        top += 1
    while bot > top and junk(row(bot)):
        bot -= 1
    while left < right and junk(col(left)):
        left += 1
    while right > left and junk(col(right)):
        right -= 1
    if (top, left, right, bot) != (0, 0, w - 1, h - 1):
        print(f"  trimmed non-paper edges: top {top}, bottom {h-1-bot}, "
              f"left {left}, right {w-1-right}")
        im = im.crop((left, top, right + 1, bot + 1))

    # Halve to a natural 2x — 4600px is oversized for a README and for a 1080p frame.
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(dst)
    tmp.unlink(missing_ok=True)
    print(f"{dst}  {Image.open(dst).size}")


if __name__ == "__main__":
    main()
