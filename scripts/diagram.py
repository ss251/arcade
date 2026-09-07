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

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Two palettes, one geometry.
#
# The README wants light — GitHub renders it on white and a dark plate would float. The
# VIDEO wants dark, because every other frame in it is #161513 and cutting to a white card
# is a flash in the face. Same spec, same coordinates, different colours: keeping one
# geometry means the two cannot drift into different diagrams.
DARK = "--dark" in sys.argv
OUT = ROOT / "docs" / ("architecture-dark.excalidraw" if DARK else "architecture.excalidraw")

# Widths are conservative estimates, not measurements. Do not reuse historical
# ID-only cached widths after changing a label; inspect the real DOM export.
SANS, MONO = 2, 3

if DARK:
    # Fills are dark and strokes/text are the bright variants — on #161513 the light-mode
    # "dark" text colours (#15803d, #6d28d9) are unreadable, so they invert rather than
    # being reused.
    PAPER = "#161513"
    INK, MUTED = "#e8e6e1", "#b3aea4"
    GREEN, GREEN_D, FILL_G, ZONE_G = "#2ca96c", "#4ade80", "#1a4d2e", "#12281c"
    PURPLE, PURPLE_D, FILL_P, ZONE_P = "#a78bfa", "#c4b5fd", "#2d1b69", "#1d1435"
    BLUE, BLUE_D, FILL_B, ZONE_B = "#4e94dc", "#93c5fd", "#1e3a5f", "#152838"
    USDC, FILL_ARC = "#4e94dc", "#1e3a5f"
    AMBER, FILL_LAW = "#f59e0b", "#3a2c10"
else:
    PAPER = "#ffffff"
    INK, MUTED = "#1e1e1e", "#595959"
    GREEN, GREEN_D, FILL_G, ZONE_G = "#22c55e", "#15803d", "#b2f2bb", "#d3f9d8"
    PURPLE, PURPLE_D, FILL_P, ZONE_P = "#8b5cf6", "#6d28d9", "#d0bfff", "#e5dbff"
    BLUE, BLUE_D, FILL_B, ZONE_B = "#4a9eed", "#2563eb", "#a5d8ff", "#dbe4ff"
    USDC, FILL_ARC = "#0b53bf", "#a5d8ff"
    AMBER, FILL_LAW = "#f59e0b", "#fff3bf"

# type, id, x, y, w, h, and per-type extras. Labels are expanded below.
SPEC: list[dict] = [
    {"t": "text", "id": "title", "x": 20, "y": 14, "text": "ARCADE", "size": 32, "color": INK},
    {"t": "text", "id": "subtitle", "x": 20, "y": 60, "text": "Agent capabilities → paid endpoints on Arc · implemented architecture, not a claim of live readiness", "size": 20, "color": MUTED},
    {"t": "rect", "id": "canary", "x": 550, "y": 103, "w": 340, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "canary · paid healthcheck", "size": 18},
    {"t": "arrow", "id": "canary_flow", "x": 720, "y": 144, "dx": 0, "dy": 16, "stroke": PURPLE},
    {"t": "rect", "id": "seller", "x": 20, "y": 165, "w": 400, "h": 360, "bg": ZONE_G, "stroke": GREEN},
    {"t": "text", "id": "seller_title", "x": 42, "y": 180, "text": "SELLER · own machine", "size": 20, "color": GREEN_D},
    {"t": "rect", "id": "capability", "x": 42, "y": 220, "w": 356, "h": 78, "bg": FILL_G, "stroke": GREEN, "label": "Agent Skill · MCP · OpenAPI\nlocal code + scoped secrets", "size": 18},
    {"t": "rect", "id": "runner", "x": 42, "y": 365, "w": 356, "h": 65, "bg": FILL_G, "stroke": GREEN, "label": "runner · outbound socket\nbounded work + child hires", "size": 17},
    {"t": "text", "id": "seller_limit", "x": 42, "y": 459, "text": "Public metadata omits secrets.\nOutputs need exfiltration care.", "size": 17, "color": MUTED},
    {"t": "rect", "id": "hub", "x": 520, "y": 165, "w": 400, "h": 360, "bg": ZONE_P, "stroke": PURPLE},
    {"t": "text", "id": "hub_title", "x": 542, "y": 180, "text": "HUB · admission + dispatch", "size": 20, "color": PURPLE_D},
    {"t": "rect", "id": "registry", "x": 542, "y": 220, "w": 356, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "registry · prices + rails", "size": 17},
    {"t": "rect", "id": "input_gate", "x": 542, "y": 270, "w": 356, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "input gate → verify payment", "size": 17},
    {"t": "rect", "id": "lineage", "x": 542, "y": 320, "w": 356, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "lineage · hops + tree ledger", "size": 17},
    {"t": "rect", "id": "broker", "x": 542, "y": 370, "w": 356, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "dispatch → output validation", "size": 17},
    {"t": "rect", "id": "terminal", "x": 542, "y": 470, "w": 356, "h": 40, "bg": FILL_P, "stroke": PURPLE, "label": "terminal outcome + receipt", "size": 17},
    {"t": "rect", "id": "buyer", "x": 1020, "y": 165, "w": 400, "h": 360, "bg": ZONE_B, "stroke": BLUE},
    {"t": "text", "id": "buyer_title", "x": 1042, "y": 180, "text": "BUYER · agent or browser", "size": 20, "color": BLUE_D},
    {"t": "rect", "id": "selection", "x": 1042, "y": 220, "w": 356, "h": 78, "bg": FILL_B, "stroke": BLUE, "label": "probe → select a rail\nsign → submit → reconcile", "size": 18},
    {"t": "rect", "id": "sessions", "x": 1042, "y": 325, "w": 356, "h": 65, "bg": FILL_B, "stroke": BLUE, "label": "Gateway · bounded session\n20-call proof: offline only", "size": 18},
    {"t": "rect", "id": "delegate", "x": 1032, "y": 418, "w": 376, "h": 82, "bg": FILL_B, "stroke": BLUE, "label": "Owner custody → delegate → Arc\nUnified Balance funding\nlive signing / CLI buy paused", "size": 17},
    {"t": "arrow", "id": "f1", "x": 1018, "y": 238, "dx": -96, "dy": 0, "stroke": BLUE_D, "label": "1 probe", "size": 14},
    {"t": "arrow", "id": "f2", "x": 922, "y": 291, "dx": 96, "dy": 0, "stroke": PURPLE, "label": "2 402", "size": 14},
    {"t": "arrow", "id": "f3", "x": 1018, "y": 345, "dx": -96, "dy": 0, "stroke": BLUE_D, "label": "3 submit", "size": 14},
    {"t": "arrow", "id": "f4", "x": 518, "y": 387, "dx": -96, "dy": 0, "stroke": PURPLE, "label": "4 job", "size": 14},
    {"t": "arrow", "id": "f5", "x": 422, "y": 442, "dx": 96, "dy": 0, "stroke": GREEN_D, "label": "5 result", "size": 14},
    {"t": "arrow", "id": "rail_flow", "x": 720, "y": 577, "dx": 0, "dy": 18, "stroke": PURPLE},
    {"t": "text", "id": "rails_heading", "x": 20, "y": 550, "text": "SETTLEMENT · Arc testnet 5042002 · advertised preference: Gateway → exact → escrow", "size": 20, "color": INK},
    {"t": "rect", "id": "gateway", "x": 20, "y": 600, "w": 440, "h": 148, "bg": FILL_B, "stroke": BLUE, "label": "1 · CIRCLE GATEWAY\nSpend from funded balance\nAcceptance ≠ mined batch\nRetained: deposit + acceptance", "size": 18},
    {"t": "rect", "id": "exact", "x": 500, "y": 600, "w": 440, "h": 148, "bg": FILL_P, "stroke": PURPLE, "label": "2 · EXACT / EIP-3009\nRelay after validated success\nFeeSplitterV2 · tree commitment\nRetained: mined lineage proof", "size": 18},
    {"t": "rect", "id": "escrow", "x": 980, "y": 600, "w": 440, "h": 148, "bg": FILL_LAW, "stroke": AMBER, "label": "3 · ERC-8183 ESCROW\nPrincipal locked before work\nHub evaluates · receipt-tree hook\nComplete pays / reject refunds\nOffline · deployment blocked", "size": 17},
    {"t": "text", "id": "evidence_heading", "x": 20, "y": 786, "text": "DISCOVERY + EVIDENCE · separate from the settlement decision", "size": 20, "color": INK},
    {"t": "rect", "id": "ens", "x": 20, "y": 833, "w": 440, "h": 115, "bg": FILL_G, "stroke": GREEN, "label": "ENSv2 · Sepolia → discovery\nNames · payTo lock · expiry\nExpiry is not service health\nDemo stopped; re-point pending", "size": 17},
    {"t": "rect", "id": "erc8004", "x": 500, "y": 833, "w": 440, "h": 115, "bg": FILL_B, "stroke": BLUE, "label": "ERC-8004 on Arc\nIdentity · validation · feedback\nBest-effort settlement evidence\nRetained: six-role live proof", "size": 17},
    {"t": "rect", "id": "graph", "x": 980, "y": 833, "w": 440, "h": 115, "bg": FILL_P, "stroke": PURPLE, "label": "Arc events → The Graph → web\nSelected lineage, not all totals\nBase paid-query hop NOT RUN\nEscrow sources inactive", "size": 17},
    {"t": "rect", "id": "limits", "x": 20, "y": 986, "w": 1400, "h": 72, "bg": FILL_LAW, "stroke": AMBER, "label": "Before-settlement failure can avoid a charge. Unknown settlement is not a refund.\nA failed parent does not reverse paid children, external API costs or gas. Escrow has custody and admin risks.", "size": 18},
]


def base(el_id: str, x: float, y: float, w: float, h: float) -> dict:
    """Fields every Excalidraw element carries. Deterministic — no randomness, so reruns diff clean."""
    seed = int.from_bytes(hashlib.sha256(el_id.encode()).digest()[:8], "big") % 2_000_000_000
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
    """Conservative estimate. Real browser rendering remains the visual gate."""
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
            t = text_el(tid, s["x"] + (s["w"] if kind == "rect" else s["dx"]) / 2 - tw / 2,
                        s["y"] + (s["h"] if kind == "rect" else s["dy"]) / 2 - th / 2,
                        s["label"], size, INK, container=s["id"])
            if kind == "rect" and (tw > s["w"] - 16 or th > s["h"] - 12):
                raise ValueError(f"diagram label exceeds container: {s['id']}")
            e["boundElements"] = [{"id": tid, "type": "text"}]
            out.append(t)
    return out


def mermaid_source() -> str:
    """Semantic companion from the same labels; geometry remains in SPEC."""
    flows = [
        ("canary", "registry", "paid probe"), ("capability", "registry", "publish metadata"),
        ("selection", "registry", "probe"), ("registry", "selection", "ordered 402"),
        ("selection", "input_gate", "selected payment"), ("input_gate", "lineage", "admit"),
        ("lineage", "broker", "bounded dispatch"), ("broker", "runner", "job"),
        ("runner", "broker", "result"), ("broker", "terminal", "validated outcome"),
        ("terminal", "gateway", "Gateway rail"), ("terminal", "exact", "exact rail"),
        ("terminal", "escrow", "escrow rail"), ("delegate", "selection", "funding path"),
        ("sessions", "input_gate", "session bounds"), ("ens", "registry", "discovery"),
        ("terminal", "erc8004", "best effort evidence"), ("exact", "graph", "on-chain events"),
        ("escrow", "graph", "inactive data sources"),
    ]
    nodes = {s["id"]: s for s in SPEC if s["t"] == "rect" and "label" in s}
    lines = ["%% Generated by scripts/diagram.py; implemented paths, not live readiness.", "flowchart TB"]
    for key, node in nodes.items():
        label = node["label"].replace('"', "&quot;").replace("\n", " — ")
        # Prefix avoids Mermaid keywords such as the evidence node named graph.
        lines.append(f'  n_{key}["{label}"]')
    for source, target, label in flows:
        if source not in nodes or target not in nodes:
            raise ValueError("unknown diagram flow node")
        lines.append(f"  n_{source} -->|{label}| n_{target}")
    return "\n".join(lines) + "\n"


def main() -> None:
    if sys.argv[1:] not in ([], ["--dark"]):
        raise SystemExit("usage: python3 scripts/diagram.py [--dark]")
    scene = {
        "type": "excalidraw",
        "version": 2,
        "source": "https://github.com/ss251/arcade",
        "elements": build(),
        "appState": {"gridSize": None, "viewBackgroundColor": PAPER},
        "files": {},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(scene, indent=2) + "\n")
    if not DARK:
        (ROOT / "docs" / "architecture.mmd").write_text(mermaid_source())
    print(f"docs/{OUT.name} ({len(scene['elements'])} elements)")


if __name__ == "__main__":
    main()
