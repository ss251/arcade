#!/usr/bin/env python3
"""
Mark the subtitle track NOT-enabled in an MP4, so players do not show it unless asked.

    python3 scripts/demo/subs_off.py design/arcade-cp3.mp4

## Why this exists

`ffmpeg -disposition:s:0 0` is the documented way to say this, and in this build it does
nothing — the flag reads back as `default=1` however it is spelled, including on a
straight `-c copy` remux. So the bit gets set where it actually lives.

## What it edits

An MP4 is a tree of boxes. Each track is a `trak`, whose `tkhd` (track header) carries a
24-bit flags field; bit 0 is `track_enabled`. A track with that bit clear is present, fully
readable, and switched off — which is precisely "subtitles available, not burned on".

The track's kind comes from `mdia > hdlr`, whose handler type is `sbtl` or `text` for
subtitles. Only that track is touched; video and audio keep their flags.

This is a surgical two-byte edit, not a re-encode, so the picture and sound are the exact
bytes that came out of the encoder.
"""

import struct
import sys
from pathlib import Path

CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl"}


def boxes(buf: bytes, start: int, end: int):
    """Yield (type, header_start, payload_start, payload_end) for each box in a range."""
    pos = start
    while pos + 8 <= end:
        size = struct.unpack(">I", buf[pos : pos + 4])[0]
        typ = buf[pos + 4 : pos + 8]
        payload = pos + 8
        if size == 1:  # 64-bit extended size
            size = struct.unpack(">Q", buf[pos + 8 : pos + 16])[0]
            payload = pos + 16
        elif size == 0:  # extends to end
            size = end - pos
        if size < 8:
            return
        yield typ, pos, payload, min(pos + size, end)
        pos += size


def find(buf: bytes, path: list[bytes], start: int, end: int):
    """Walk a box path like [b'moov', b'trak'], yielding (payload_start, payload_end)."""
    head, rest = path[0], path[1:]
    for typ, _, ps, pe in boxes(buf, start, end):
        if typ != head:
            continue
        if not rest:
            yield ps, pe
        elif head in CONTAINERS:
            yield from find(buf, rest, ps, pe)


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "design/arcade-cp3.mp4")
    buf = bytearray(path.read_bytes())
    n = len(buf)

    changed = 0
    for tps, tpe in find(bytes(buf), [b"moov", b"trak"], 0, n):
        # Handler type says what this track carries.
        kind = None
        for hps, _ in find(bytes(buf), [b"mdia", b"hdlr"], tps, tpe):
            # hdlr: version(1) flags(3) pre_defined(4) handler_type(4)
            kind = bytes(buf[hps + 8 : hps + 12])
            break
        if kind not in (b"sbtl", b"text"):
            continue

        for kps, _ in find(bytes(buf), [b"tkhd"], tps, tpe):
            # tkhd: version(1) flags(3) ...
            flags = int.from_bytes(buf[kps + 1 : kps + 4], "big")
            if flags & 0x1:
                buf[kps + 1 : kps + 4] = (flags & ~0x1).to_bytes(3, "big")
                changed += 1
            break

    if changed == 0:
        sys.exit("no enabled subtitle track found — nothing changed")

    path.write_bytes(bytes(buf))
    print(f"{path}: cleared track_enabled on {changed} subtitle track(s)")


if __name__ == "__main__":
    main()
