"""
Demo choreography for the CP3 video, over CDP.

Loaded by the recording driver and usable on its own from a browser-harness heredoc:

    exec(open("scripts/demo/drive.py").read())
    ask("/skills")

## Why typing is dispatched key by key

Every earlier drive of this app set the composer through the native `value` setter — one
assignment, then submit. That is right for a TEST and wrong for a CAMERA: the sentence
appears whole, in one frame, which reads as a scripted screenshot rather than a person
using software. The demo has to survive a viewer asking "is this real?", and a prompt that
materialises is the first thing that makes them ask.

So `Input.dispatchKeyEvent` sends genuine `keyDown`/`char`/`keyUp` per character, through
the same path a keyboard uses. React sees ordinary input events, the slash menu opens and
filters as it would for anyone, and the caret moves. The cost is real time — a 40-character
prompt takes about two seconds — which is exactly the time the shot wants anyway.

Rate is a human one: ~18 characters per second with per-key jitter. Perfectly even keystrokes
are their own tell, and the jitter is what stops the typing reading as a macro.
"""

import random
import time

CPS = 18.0
JITTER = 0.35


def _sleep_between_keys(cps: float) -> None:
    base = 1.0 / cps
    time.sleep(base * (1.0 + random.uniform(-JITTER, JITTER)))


def focus_composer() -> None:
    """Click the composer the way a person would, so the caret is visibly placed."""
    box = js(
        "const r=document.querySelector('.prompt').getBoundingClientRect();"
        "return {x: Math.round(r.left + 40), y: Math.round(r.top + r.height/2)};"
    )
    click_at_xy(box["x"], box["y"])
    time.sleep(0.25)


def type_text(text: str, cps: float = CPS) -> None:
    """Dispatch real keystrokes. Assumes the composer already has focus."""
    for ch in text:
        # EXACTLY ONE event may carry `text`. Chrome inserts on any key event that has it,
        # so sending keyDown-with-text AND char-with-text types every character twice —
        # "/" arrived as "//" and the command menu correctly matched nothing, which looked
        # like a broken menu rather than a broken typist. keyUp carries no text.
        cdp("Input.dispatchKeyEvent", type="keyDown", text=ch, unmodifiedText=ch)
        cdp("Input.dispatchKeyEvent", type="keyUp")
        _sleep_between_keys(cps)


def press_enter() -> None:
    cdp(
        "Input.dispatchKeyEvent",
        type="keyDown",
        key="Enter",
        code="Enter",
        windowsVirtualKeyCode=13,
        nativeVirtualKeyCode=13,
        text="\r",
    )
    time.sleep(0.03)
    cdp(
        "Input.dispatchKeyEvent",
        type="keyUp",
        key="Enter",
        code="Enter",
        windowsVirtualKeyCode=13,
        nativeVirtualKeyCode=13,
    )


def settle(timeout: float = 75.0) -> float:
    """
    Block until the turn is finished, and return how long it took.

    "Finished" is the send button leaving its busy label AND no tool row still running —
    the button alone flips back a beat before the last tool row resolves, and a cut made on
    the button lands on a frame with a live pulse still in it.
    """
    began = time.time()
    while time.time() - began < timeout:
        state = js(
            "return {busy: document.querySelector('.send')?.textContent?.trim() === '…',"
            " running: document.querySelectorAll('.marker.is-running').length};"
        )
        if not state["busy"] and state["running"] == 0:
            # A short hold so the final layout is settled before the next beat starts.
            time.sleep(0.6)
            return time.time() - began
        time.sleep(0.3)
    return time.time() - began


def ask(prompt: str, cps: float = CPS, pause_before_send: float = 0.5) -> float:
    """Focus, type visibly, pause on the finished sentence, send, wait for the answer."""
    focus_composer()
    type_text(prompt, cps=cps)
    # The beat where a viewer reads what was typed before it disappears into the transcript.
    time.sleep(pause_before_send)
    press_enter()
    return settle()


def open_slash(prefix: str = "/", cps: float = CPS) -> None:
    """Type just enough to raise the command menu, and leave it open for the camera."""
    focus_composer()
    type_text(prefix, cps=cps)
    time.sleep(1.2)


def clear_composer() -> None:
    js(
        "const el=document.querySelector('.prompt');"
        "const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
        "s.call(el,''); el.dispatchEvent(new Event('input',{bubbles:true})); return true;"
    )
