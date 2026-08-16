#!/usr/bin/env python3
"""Render the Android launcher icons from the master logo.

Android wants the mark twice, at two different scales, and the difference is the
part that is easy to get wrong:

* **Legacy** (`ic_launcher`, `ic_launcher_round`) — drawn as-is on Android 7 and
  older. The mark nearly fills the canvas.
* **Adaptive foreground** (`ic_launcher_foreground`, Android 8+) — a 108dp layer
  of which only the central **72dp** is guaranteed visible; the launcher masks the
  rest into whatever shape it likes, and animates within it. Art drawn to the edge
  of this layer gets its corners eaten. So the mark occupies 66% of the canvas and
  the rest is deliberate empty space.

The background layer stays the white already defined in
`values/ic_launcher_background.xml`, which is what the mark was drawn against.

    python3 tools/android_icons.py            # writes into android/…/res/mipmap-*
    python3 tools/android_icons.py --check    # verify only, changes nothing

Needs Pillow. Not a project dependency and not needed to build the app — this is
a one-off asset step, run when the logo changes.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "icons" / "logo-1024.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

#: density -> (legacy px, adaptive foreground px). Android's own table.
DENSITIES = {
    "mdpi":    (48, 108),
    "hdpi":    (72, 162),
    "xhdpi":   (96, 216),
    "xxhdpi":  (144, 324),
    "xxxhdpi": (192, 432),
}

#: Share of the legacy canvas the mark fills, inside its own plate.
LEGACY_FILL = 0.78

#: `minSdkVersion` is 24, and adaptive icons arrived in 26 — so Android 7 really
#: does fall back to these PNGs, drawn exactly as given with no mask and no
#: background. The mark has a white interior and a transparent surround, which on
#: a pale wallpaper would leave a floating gradient outline. So the legacy icons
#: carry the same white plate the adaptive background uses, with rounded corners
#: rather than a bare square.
LEGACY_PLATE = (255, 255, 255, 255)
LEGACY_RADIUS = 0.22

#: Share of the adaptive foreground the mark fills — the 72dp safe zone inside
#: the 108dp layer, and the whole reason this script exists.
ADAPTIVE_FILL = 72 / 108


def render(source, canvas_px: int, fill: float, plate: tuple | None = None):
    """The mark, centred on a square canvas, filling `fill` of it.

    With `plate`, the canvas is that colour behind a rounded-rectangle mask;
    without it, transparent.
    """
    from PIL import Image, ImageDraw

    art = source.crop(source.getchannel("A").getbbox())   # trim transparent margin
    target = max(1, round(canvas_px * fill))
    scale = target / max(art.size)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                     Image.LANCZOS)

    out = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    if plate:
        backing = Image.new("RGBA", (canvas_px, canvas_px), plate)
        mask = Image.new("L", (canvas_px, canvas_px), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, canvas_px - 1, canvas_px - 1),
            radius=max(1, round(canvas_px * LEGACY_RADIUS)), fill=255)
        out.paste(backing, (0, 0), mask)
    out.paste(art, ((canvas_px - art.width) // 2, (canvas_px - art.height) // 2), art)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="report what exists and its size; write nothing")
    args = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        print("Pillow is needed: python3 -m venv .venv && .venv/bin/pip install Pillow",
              file=sys.stderr)
        return 2

    if not SOURCE.exists():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 2
    source = Image.open(SOURCE).convert("RGBA")

    for density, (legacy_px, adaptive_px) in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        if not folder.is_dir():
            print(f"missing {folder}", file=sys.stderr)
            return 2
        wanted = {
            "ic_launcher.png": (legacy_px, LEGACY_FILL, LEGACY_PLATE),
            "ic_launcher_round.png": (legacy_px, LEGACY_FILL, LEGACY_PLATE),
            # No plate: the launcher supplies the background layer and the mask.
            "ic_launcher_foreground.png": (adaptive_px, ADAPTIVE_FILL, None),
        }
        for name, (px, fill, plate) in wanted.items():
            path = folder / name
            if args.check:
                have = Image.open(path).size if path.exists() else None
                ok = have == (px, px)
                print(f"{'ok ' if ok else 'BAD'} {path.relative_to(ROOT)} {have} want {(px, px)}")
                continue
            render(source, px, fill, plate).save(path, "PNG", optimize=True)
            print(f"wrote {path.relative_to(ROOT)} ({px}x{px})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
