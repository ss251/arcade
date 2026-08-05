"""
The demo spine, as ONE continuous take: discover → quote → 402 → card → sign → settle.

Run inside a browser-harness heredoc while `rec.sh` is recording:

    browser-harness <<'PY'
    exec(open("scripts/demo/take-purchase.py").read())
    PY

## Why one take and not three

The storyboard splits this into 3a (discover), 3b (the card and the signature) and 3c (the
settlement), and the narration is cut to match. The RECORDING is still one run, because the
beats share state: the card in 3b only exists because of the quote in 3a, and the receipt in
3c only exists because of the signature in 3b. Three separate takes would each have to
re-establish the state of the one before it, and the single biggest risk in a demo video is
a beat that needs a retake because the state was wrong three beats earlier.

Cutting a continuous take to fit three narration clips is an edit. Stitching three takes into
something that *looks* continuous is a lie the viewer can usually spot.

## The wallet is not driven from here

`Input.dispatchMouseEvent` reaches the page. MetaMask's confirmation is a separate window and
is clicked through cua, from the shell, at the point this script prints WALLET. Everything
before and after is timed so that click lands inside the take.
"""

import time

HUB = "https://arcade-hub-production.up.railway.app"
BUYER = "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8"


def hold_to_pay() -> bool:
    """Press and hold the approve button for the full 900ms, the way a hand would."""
    b = js(
        "const b=document.querySelector('.approve');"
        "if(!b) return null;"
        "const r=b.getBoundingClientRect();"
        "return {x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2)};"
    )
    if b is None:
        return False
    # Move first, so the cursor is visibly ON the button before it depresses — a press that
    # happens with the pointer somewhere else reads as a script, which it is, but the point
    # is to show the interaction rather than the automation.
    cdp("Input.dispatchMouseEvent", type="mouseMoved", x=b["x"], y=b["y"])
    time.sleep(0.4)
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=b["x"], y=b["y"], button="left", clickCount=1)
    # 900ms is the hold; a little over so the fill visibly completes before release.
    time.sleep(1.25)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=b["x"], y=b["y"], button="left", clickCount=1)
    return True


exec(open("scripts/demo/drive.py").read())

goto_url("http://localhost:3000")
wait_for_load()
time.sleep(1.2)

# 3a — discover. The catalogue, with prices the hub computed.
ask("what's for sale?")
time.sleep(1.6)

# 3b — quote, then the card. The address PASTES; the prose types.
focus_composer()
type_text(f"buy usdc-flow-check and check {BUYER}")
time.sleep(0.7)
press_enter()

# Wait for the card rather than sleeping a guessed interval — a fixed sleep here is how a
# take ends up holding on an empty space because the model was half a second slower.
for _ in range(80):
    if js("return !!document.querySelector('.approve')") is True:
        break
    time.sleep(0.25)

# Let the card land and be read before anything touches it. This is the frame the storyboard
# calls the one that has to be beautiful.
time.sleep(2.6)
print("CARD" if hold_to_pay() else "NO CARD")

# The wallet prompt opens over the page; cua clicks Confirm from the shell.
print("WALLET", flush=True)
