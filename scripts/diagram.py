#!/usr/bin/env python3
"""
Build docs/architecture.excalidraw from a compact spec.

    python3 scripts/diagram.py

## Why a generator instead of a checked-in blob

An .excalidraw file is a flat list of elements carrying seeds, version nonces, bound-text
back-references and absolute coordinates. Hand-editing one is miserable and diffing one is
worse — a nudged box rewrites unrelated fields. The spec below is the part a human changes;
everything else is derived.

It also expands LABELS. Excalidraw has no "labelled rectangle": a label is a separate text
element carrying `containerId`, with the container carrying `boundElements` back. Getting
that pairing wrong yields a file that opens with the text floating loose in the corner.

## Typography

`fontFamily: 2` is Helvetica and `3` is Cascadia (mono). Neither is `1`, which is Virgil —
Excalidraw's hand-drawn default and the reason its diagrams read as cartoons. `roughness: 0`
is the other half of that look: it turns off the sketchy stroke simulation, so lines are
drawn straight. Both are needed; changing only the font leaves wobbling boxes.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "architecture.excalidraw"

# Real rendered widths, measured once in a browser with canvas measureText against the same
# font stacks Excalidraw uses, and baked in here.
#
# They are baked rather than estimated because an estimate CLIPS. A text element stores its
# own width, and Excalidraw draws to that box: the first version guessed
# `len × fontSize × 0.55`, which is about right for lowercase Helvetica and far too narrow
# for capitals and for mono. The title rendered as "ARCAD", the hub as "ARCADE HU", and the
# USDC line lost its last two words — three silent truncations in a diagram whose whole job
# is to be read.
#
# Regenerate with scripts/measure_text.js if a string changes; an id missing here falls back
# to a deliberately generous estimate, which over-runs rather than cuts.
MEASURED: dict[str, int] = json.loads((ROOT / "docs" / ".text-widths.json").read_text())

SANS, MONO = 2, 3
INK, MUTED = "#1e1e1e", "#757575"
GREEN, GREEN_D = "#22c55e", "#15803d"
PURPLE, PURPLE_D = "#8b5cf6", "#6d28d9"
BLUE, BLUE_D = "#4a9eed", "#2563eb"
USDC = "#0b53bf"
AMBER = "#f59e0b"

# type, id, x, y, w, h, and per-type extras. Labels are expanded below.
SPEC: list[dict] = [
    {"t": "text", "id": "ti", "x": 494, "y": 10, "text": "ARCADE", "size": 30, "color": INK},
    {"t": "text", "id": "sub", "x": 268, "y": 52, "size": 16, "color": MUTED,
     "text": "Publish a skill as a paid endpoint on Arc. Agents hire agents, per call, in USDC."},

    # ── seller ────────────────────────────────────────────────────────────
    {"t": "rect", "id": "zs", "x": 20, "y": 110, "w": 270, "h": 300, "bg": "#d3f9d8",
     "stroke": GREEN, "sw": 1, "opacity": 30},
    {"t": "text", "id": "zsl", "x": 40, "y": 122, "text": "SELLER  ·  own machine",
     "size": 15, "color": GREEN_D},
    {"t": "rect", "id": "sk", "x": 45, "y": 155, "w": 220, "h": 78, "bg": "#b2f2bb",
     "stroke": GREEN, "label": "skill/\nprompts · code · secrets", "size": 16},
    {"t": "text", "id": "nl", "x": 52, "y": 246, "text": "never leaves this machine",
     "size": 16, "color": GREEN_D},
    {"t": "rect", "id": "rn", "x": 45, "y": 285, "w": 220, "h": 72, "bg": "#b2f2bb",
     "stroke": GREEN, "label": "runner (daemon)", "size": 16},
    {"t": "text", "id": "rnl", "x": 52, "y": 368, "text": "dials out · no open ports",
     "size": 15, "color": MUTED},

    # ── hub ───────────────────────────────────────────────────────────────
    {"t": "rect", "id": "zh", "x": 410, "y": 110, "w": 280, "h": 300, "bg": "#e5dbff",
     "stroke": PURPLE, "sw": 1, "opacity": 30},
    {"t": "text", "id": "zhl", "x": 430, "y": 122, "text": "ARCADE HUB", "size": 15,
     "color": PURPLE_D},
    {"t": "rect", "id": "h1", "x": 432, "y": 152, "w": 236, "h": 52, "bg": "#d0bfff",
     "stroke": PURPLE, "label": "registry — listings, prices", "size": 15},
    {"t": "rect", "id": "h2", "x": 432, "y": 216, "w": 236, "h": 52, "bg": "#d0bfff",
     "stroke": PURPLE, "label": "paywall — x402", "size": 15},
    {"t": "rect", "id": "h3", "x": 432, "y": 280, "w": 236, "h": 52, "bg": "#d0bfff",
     "stroke": PURPLE, "label": "broker — dispatch, bounded", "size": 15},
    {"t": "rect", "id": "h4", "x": 432, "y": 344, "w": 236, "h": 52, "bg": "#d0bfff",
     "stroke": PURPLE, "label": "settle — on success only", "size": 15},

    # ── buyer ─────────────────────────────────────────────────────────────
    {"t": "rect", "id": "zb", "x": 810, "y": 110, "w": 270, "h": 300, "bg": "#dbe4ff",
     "stroke": BLUE, "sw": 1, "opacity": 30},
    {"t": "text", "id": "zbl", "x": 830, "y": 122, "text": "BUYER  ·  any agent",
     "size": 15, "color": BLUE_D},
    {"t": "rect", "id": "b1", "x": 835, "y": 155, "w": 220, "h": 78, "bg": "#a5d8ff",
     "stroke": BLUE, "label": "wallet\nin the browser", "size": 16},
    {"t": "text", "id": "b1l", "x": 842, "y": 246, "text": "signs EIP-3009 · no gas",
     "size": 16, "color": BLUE_D},
    {"t": "rect", "id": "b2", "x": 835, "y": 285, "w": 220, "h": 72, "bg": "#a5d8ff",
     "stroke": BLUE, "label": "x402 client", "size": 16},
    {"t": "text", "id": "b2l", "x": 842, "y": 368, "text": "probe · sign · retry",
     "size": 15, "color": MUTED},

    # ── the flow ──────────────────────────────────────────────────────────
    {"t": "arrow", "id": "f1", "x": 808, "y": 178, "dx": -116, "dy": 0, "stroke": BLUE_D,
     "label": "1 probe", "size": 14},
    {"t": "arrow", "id": "f2", "x": 692, "y": 242, "dx": 116, "dy": 0, "stroke": PURPLE,
     "label": "2  402", "size": 14},
    {"t": "arrow", "id": "f3", "x": 808, "y": 306, "dx": -116, "dy": 0, "stroke": BLUE_D,
     "label": "3 signed", "size": 14},
    {"t": "arrow", "id": "f4", "x": 408, "y": 210, "dx": -116, "dy": 0, "stroke": PURPLE,
     "label": "4 job", "size": 14},
    {"t": "arrow", "id": "f5", "x": 292, "y": 306, "dx": 116, "dy": 0, "stroke": GREEN,
     "label": "5 result", "size": 14},
    # A "socket opened by the runner" note used to sit here. It was ~200px of text in a
    # 116px gap, so it ran under the settle box — and the seller zone already says "dials
    # out · no open ports", which is the same fact where it belongs.
    {"t": "arrow", "id": "f6", "x": 550, "y": 410, "dx": 0, "dy": 62, "stroke": USDC,
     "label": "6 settle", "size": 14},

    # ── chain ─────────────────────────────────────────────────────────────
    {"t": "rect", "id": "arc", "x": 390, "y": 474, "w": 320, "h": 76, "bg": "#a5d8ff",
     "stroke": USDC, "label": "Arc testnet  ·  eip155:5042002", "size": 16},
    {"t": "text", "id": "arcl", "x": 330, "y": 562, "size": 14, "color": MUTED, "mono": True,
     "text": "USDC 0x3600...0000  —  native gas token AND the ERC-20 prices use"},

    # ── the law ───────────────────────────────────────────────────────────
    {"t": "rect", "id": "law", "x": 170, "y": 606, "w": 760, "h": 46, "bg": "#fff3bf",
     "stroke": AMBER, "sw": 1, "opacity": 45, "size": 16,
     "label": "verify payment  →  execute in sandbox  →  validate output  →  settle"},
    {"t": "text", "id": "lawl", "x": 236, "y": 664, "size": 15, "color": MUTED,
     "text": "A job that refuses, times out or returns the wrong shape settles nothing. That is the refund."},
]


def base(el_id: str, x: float, y: float, w: float, h: float) -> dict:
    """Fields every Excalidraw element carries. Deterministic — no randomness, so reruns diff clean."""
    seed = abs(hash(el_id)) % 2_000_000_000
    return {
        "id": el_id, "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": INK, "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
        # 0 = straight lines. Excalidraw's default 1 simulates a shaky hand.
        "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": None, "seed": seed, "version": 1, "versionNonce": seed,
        "isDeleted": False, "boundElements": [], "updated": 1, "link": None, "locked": False,
    }


def width_of(el_id: str, text: str, size: int, mono: bool) -> int:
    """Measured width when we have one; a generous estimate when we do not."""
    if el_id in MEASURED:
        return MEASURED[el_id]
    longest = max(len(ln) for ln in text.split("\n"))
    # 0.68 rather than 0.55: erring wide leaves harmless empty space, erring narrow cuts
    # glyphs off the end and looks like a typo.
    return int(longest * size * 0.68) + 8


def text_el(el_id: str, x: float, y: float, text: str, size: int, color: str,
            mono: bool = False, container: str | None = None) -> dict:
    lines = text.split("\n")
    w = width_of(el_id, text, size, mono)
    h = len(lines) * size * 1.25
    e = base(el_id, x, y, w, h)
    e.update({
        "type": "text", "text": text, "originalText": text, "fontSize": size,
        "fontFamily": MONO if mono else SANS, "strokeColor": color,
        "textAlign": "center" if container else "left",
        "verticalAlign": "middle" if container else "top",
        "containerId": container, "lineHeight": 1.25, "autoResize": True,
    })
    return e


def build() -> list[dict]:
    out: list[dict] = []
    for s in SPEC:
        kind = s["t"]
        if kind == "text":
            out.append(text_el(s["id"], s["x"], s["y"], s["text"], s["size"],
                               s.get("color", INK), s.get("mono", False)))
            continue

        if kind == "rect":
            e = base(s["id"], s["x"], s["y"], s["w"], s["h"])
            e.update({
                "type": "rectangle", "backgroundColor": s.get("bg", "transparent"),
                "strokeColor": s.get("stroke", INK), "strokeWidth": s.get("sw", 2),
                "opacity": s.get("opacity", 100), "roundness": {"type": 3},
            })
        else:  # arrow
            dx, dy = s["dx"], s["dy"]
            e = base(s["id"], s["x"], s["y"], abs(dx), abs(dy))
            e.update({
                "type": "arrow", "strokeColor": s.get("stroke", INK),
                "points": [[0, 0], [dx, dy]], "lastCommittedPoint": None,
                "startBinding": None, "endBinding": None,
                "startArrowhead": None, "endArrowhead": "arrow",
                "elbowed": False,
            })

        out.append(e)

        # A label is its own text element pointing back at the container, and the container
        # has to point at it. One direction alone opens as loose text in the corner.
        if "label" in s:
            tid = f"{s['id']}_t"
            size = s.get("size", 16)
            lines = s["label"].split("\n")
            tw = width_of(tid, s["label"], size, False)
            th = len(lines) * size * 1.25
            t = text_el(tid, s["x"] + (s["w"] if kind == "rect" else abs(s["dx"])) / 2 - tw / 2,
                        s["y"] + (s["h"] if kind == "rect" else abs(s["dy"])) / 2 - th / 2,
                        s["label"], size, INK, container=s["id"])
            e["boundElements"] = [{"id": tid, "type": "text"}]
            out.append(t)
    return out


def main() -> None:
    scene = {
        "type": "excalidraw",
        "version": 2,
        "source": "https://github.com/ss251/arcade",
        "elements": build(),
        "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
        "files": {},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(scene, indent=2) + "\n")
    print(f"{OUT}  ({len(scene['elements'])} elements)")


if __name__ == "__main__":
    main()
