"""
Beat 3d — the hop. A skill buying from another listing, mid-job.

Run inside a browser-harness heredoc while `rec.sh` is recording:

    browser-harness <<'PY'
    exec(open("scripts/demo/take-hop.py").read())
    PY

Prints a timesheet, same as `take-purchase.py`, because the cut's entry points are measured
off the footage rather than estimated — that mistake once cost a whole beat.

## What has to be on screen

The claim is "one buyer action, two settlements". Two things carry it:

1. The result itself, which names the listing it bought from, what that cost, and how much
   of its declared budget is left — `$0.0100` spent of `$0.0200`.
2. The hub's receipt feed, where BOTH settlements appear as separate rows with separate
   transactions and separate fee splits.

The second is the stronger evidence and it lives on a different page, so this take ends on
the chat and the receipts are a separate shot.
"""

import time

BUYER = "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8"
T0 = time.time()


def mark(label: str) -> None:
    print(f"  t={time.time() - T0:6.1f}s  {label}", flush=True)


exec(open("scripts/demo/drive.py").read())

goto_url("http://localhost:3000")
wait_for_load()
time.sleep(1.0)
mark("page ready")

focus_composer()
type_text(f"buy wallet-risk-note for {BUYER}")
time.sleep(0.6)
press_enter()
mark("buy sent")

for _ in range(240):
    if js("return !!document.querySelector('.approve')") is True:
        break
    time.sleep(0.25)
mark("CARD up")

# Shorter hold than the main purchase: this beat is about what comes BACK, not about the
# card — that shot has already had its 15 seconds earlier in the video.
time.sleep(5.0)
b = js(
    "const b=document.querySelector('.approve'); if(!b) return null;"
    "const r=b.getBoundingClientRect();"
    "return {x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2)};"
)
cdp("Input.dispatchMouseEvent", type="mouseMoved", x=b["x"], y=b["y"])
time.sleep(0.3)
cdp("Input.dispatchMouseEvent", type="mousePressed", x=b["x"], y=b["y"], button="left", clickCount=1)
time.sleep(1.25)
cdp("Input.dispatchMouseEvent", type="mouseReleased", x=b["x"], y=b["y"], button="left", clickCount=1)
mark("held to pay")

mark("WALLET — confirm now")
