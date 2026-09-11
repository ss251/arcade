"""Compose review contact sheets from the real, unmodified Chrome viewport PNGs."""
from pathlib import Path
import json
import sys
import hashlib
from PIL import Image, ImageDraw

directory = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "evidence" / "ui-redesign"
manifest = json.loads((directory / "capture.json").read_text())
if manifest["status"] != "captured" or not manifest["sourceStable"]:
    raise SystemExit("Complete a stable capture before composing contact sheets.")
source = Path(__file__).resolve().parents[1] / "src"
digest = hashlib.sha256()
for path in sorted((path for path in source.rglob("*") if path.suffix in {".ts", ".tsx", ".css", ".svg"}), key=lambda path: path.relative_to(source).as_posix()):
    digest.update(path.relative_to(source).as_posix().encode())
    digest.update(path.read_bytes())
if digest.hexdigest() != manifest["sourceAfter"]:
    raise SystemExit("Web source changed after this capture; compose sheets from a fresh matching run.")
recorded = {frame["file"] for frame in manifest["frames"]}
groups = {
    "contact": ["market", "skill", "buyer", "seller", "publish", "publish-preview", "chat", "chat-approval"],
    "journey": ["chat-context", "chat-approval", "chat-working", "chat-result", "buyer-result", "buyer-tree", "buyer-empty", "seller-start"],
    "features": ["market-filtered", "market-activity", "skill-input", "skill-api", "buyer-tree-list", "buyer-unavailable", "market-no-results", "market-unavailable"],
    "states": ["buyer-wallet", "buyer-wallet-unavailable", "route-not-found", "chat-working"],
    "controls": ["buyer-job-focus", "buyer-job-hover", "buyer-job-pressed", "buyer-action-focus", "buyer-action-hover", "buyer-action-pressed"],
}
for group, names in groups.items():
  for width in [390, 834, 1440]:
    for scheme in ["light", "dark"]:
        files = [directory / f"{name}-{width}-{scheme}.png" for name in names]
        if not all(path.exists() and path.name in recorded for path in files):
            continue
        tile_width = 390 if width == 390 else 420
        thumbs = []
        for name, path in zip(names, files):
            image = Image.open(path).convert("RGB")
            image.thumbnail((tile_width, 900), Image.Resampling.LANCZOS)
            thumbs.append((name, image))
        tile_height = max(image.height for _, image in thumbs) + 32
        sheet = Image.new("RGB", (tile_width * 4, tile_height * ((len(names) + 3) // 4)), "#d9d7d2")
        draw = ImageDraw.Draw(sheet)
        for index, (name, image) in enumerate(thumbs):
            x = index % 4 * tile_width
            y = index // 4 * tile_height
            draw.text((x + 10, y + 9), f"{name} / {width}px / {scheme}", fill="#211f1c")
            sheet.paste(image, (x, y + 32))
        path = directory / f"{group}-{width}-{scheme}.png"
        sheet.save(path)
        print(path)

# A local-only review index keeps the final sheets distinct from retained iteration evidence.
from html import escape
labels = {"contact": "Primary routes", "journey": "Buyer journey", "features": "Discovery, input, and recovery", "states": "Wallet and route states", "controls": "Keyboard focus, hover, and pointer-down"}
sections = []
for group in groups:
    links = []
    for width in [390, 834, 1440]:
        for scheme in ["light", "dark"]:
            name = f"{group}-{width}-{scheme}.png"
            if (directory / name).exists() and any(frame["width"] == width and frame["scheme"] == scheme for frame in manifest["frames"]):
                links.append(f'<a class="sheet" href="{name}"><img src="{name}" loading="lazy" alt="{escape(labels[group])}, {width} pixels, {scheme} scheme"><span>{width}px · {scheme}</span></a>')
    if links:
        sections.append(f'<section id="{group}"><h2>{escape(labels[group])}</h2><div class="sheets">{"".join(links)}</div></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARCADE — UI review</title>
<style>:root{color-scheme:light dark;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#211f1c;background:#faf9f6}body{max-width:1200px;margin:0 auto;padding:32px 24px}h1{font-size:clamp(32px,5vw,48px);letter-spacing:-.04em;line-height:1.1;margin:0 0 16px}h2{font-size:24px;letter-spacing:-.02em;margin:48px 0 20px}p{max-width:75ch}a{color:inherit;text-underline-offset:.2em}nav{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}.sheets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}.sheet{display:block;text-decoration:none}.sheet img{display:block;width:100%;height:320px;object-fit:contain;object-position:top;background:#deddd7;border-radius:8px}.sheet span{display:block;margin-top:8px;font-weight:600}a:focus-visible{outline:3px solid currentColor;outline-offset:6px}@media(prefers-color-scheme:dark){:root{color:#e8e6e1;background:#161513}.sheet img{background:#292824}}</style>
<main><h1>ARCADE UI review</h1><p>Actual TanStack Start routes, rendered in headless Chrome at 390, 834, and 1440 pixels in both schemes. The hub, model messages, balance, signatures, and receipts are synthetic offline fixtures. These images do not demonstrate a real payment or chain settlement.</p>
'''
page += f'<p>{len(manifest["frames"])} route and state frames · source stable · captured {escape(manifest["capturedAt"])}.</p>'
page += '<nav><a href="README.md">Capture notes and individual PNGs</a><a href="capture.json">Checks and source fingerprint</a>'
accessibility_manifest = directory / "capture-accessibility.json"
if accessibility_manifest.exists():
    accessible = json.loads(accessibility_manifest.read_text())
    if accessible.get("status") == "captured" and accessible.get("sourceAfter") == manifest["sourceAfter"]:
        page += '<a href="README-accessibility.md">200% type and reduced motion</a>'
page += '</nav>' + ''.join(sections) + '</main></html>\n'
(directory / "index.html").write_text(page)
print(directory / "index.html")
