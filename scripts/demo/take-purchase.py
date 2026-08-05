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

## It prints a TIMESHEET, and the cut is built from that

The first version printed only milestones, so the assembler's entry points were guesses —
and one of them cost thirteen seconds of near-blank screen in the hero beat, under narration
describing a card that had not appeared yet. Nothing caught it: the take was healthy, the
segment was the right length, the caption was the right words. It was simply pointed at the
wrong part of the take.

So every beat now prints the second it happened, measured from the moment recording started.
The cut is set from those numbers.

## The card is HELD

`beat-3b` is 22.85 seconds of narration about the confirmation card — what it shows, whose
address it is, why the full 42 characters are on screen. So the card stays up for a long,
deliberate beat before anything touches it, because a shot has to last as long as the
sentence describing it.
"""

import time

HUB = "https://arcade-hub-production.up.railway.app"
BUYER = "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8"

# Seconds the card stays on screen before the hold fires. Sized to beat-3b's narration.
CARD_HOLD = 15.0

# Set once recording has started, so every mark is in the take's own timebase.
T0 = time.time()


def mark(label: str) -> None:
    print(f"  t={time.time() - T0:6.1f}s  {label}", flush=True)


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
time.sleep(1.0)
mark("page ready")

# 3a — discover. The catalogue, with prices the hub computed.
mark("ask: what's for sale?")
ask("what's for sale?")
mark("catalogue on screen        <- beat-3a can enter here")
time.sleep(1.4)

# 3b — quote, then the card. The address PASTES; the prose types.
focus_composer()
type_text(f"buy usdc-flow-check and check {BUYER}")
time.sleep(0.6)
press_enter()
mark("buy sent")

# Wait for the card rather than sleeping a guessed interval — a fixed sleep here is how a
# take ends up holding on an empty space because the model was half a second slower.
appeared = False
for _ in range(120):
    if js("return !!document.querySelector('.approve')") is True:
        appeared = True
        break
    time.sleep(0.25)
if not appeared:
    mark("NO CARD — abort this take")
    raise SystemExit(1)

mark("CARD up                    <- beat-3b enters ~1s before this")

# The long beat. This is the frame the storyboard calls the one that has to be beautiful,
# and the narration talks about it for 22.85 seconds, so it stays up.
time.sleep(CARD_HOLD)
mark("holding to pay")
hold_to_pay()

# The wallet prompt opens over the page; cua clicks Confirm from the shell.
mark("WALLET — confirm now")
