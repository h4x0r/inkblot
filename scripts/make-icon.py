"""Generate the app icon: a tiny symmetric stacked-streamgraph 'inkblot' in the
turbo palette on the dark theme — a miniature of what the app renders.

Outputs the Next.js App Router icon files into src/app/:
  icon.png (512), apple-icon.png (180), favicon.ico (16/32/48).

    python3 scripts/make-icon.py
"""

import io
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

BG = (13, 17, 23)  # #0d1117
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "src", "app")


def render_streamgraph(px: int) -> Image.Image:
    rng = np.random.default_rng(7)
    x = np.linspace(0, 1, 240)
    # fat-in-the-middle envelope so the stream forms a centered lens/inkblot
    env = np.exp(-((x - 0.5) ** 2) / (2 * 0.24**2))

    n = 7
    bands = []
    for i in range(n):
        freq = 5 + 2.2 * i
        phase = rng.uniform(0, 2 * np.pi)
        wig = 0.45 + 0.55 * (0.5 + 0.5 * np.sin(freq * np.pi * x + phase))
        amp = 0.7 + 0.6 * rng.random()
        bands.append(wig * env * amp)

    cmap = plt.get_cmap("turbo")
    colors = [cmap(0.06 + 0.88 * i / (n - 1)) for i in range(n)]

    fig, ax = plt.subplots(figsize=(6, 6), dpi=px / 6)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")
    ax.stackplot(x, *bands, colors=colors, baseline="sym", linewidth=0, alpha=0.98)
    total = np.sum(bands, axis=0)
    lim = total.max() / 2 * 1.18
    ax.set_ylim(-lim, lim)
    ax.set_xlim(0.02, 0.98)
    ax.axis("off")
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", transparent=True, dpi=px / 6)
    plt.close(fig)
    buf.seek(0)
    stream = Image.open(buf).convert("RGBA").resize((px, px), Image.LANCZOS)

    # dark rounded-square background, then the streamgraph on top
    icon = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    radius = int(px * 0.22)
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, px - 1, px - 1], radius, fill=255)
    bg = Image.new("RGBA", (px, px), (*BG, 255))
    icon.paste(bg, (0, 0), mask)
    icon.paste(stream, (0, 0), stream)
    # re-apply the rounded mask so the stream doesn't bleed past the corners
    out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    out.paste(icon, (0, 0), mask)
    return out


def main() -> None:
    master = render_streamgraph(512)
    master.save(os.path.join(APP, "icon.png"))

    # apple touch icon: a little padding inside a filled rounded square
    apple = render_streamgraph(180)
    apple.save(os.path.join(APP, "apple-icon.png"))

    master.save(
        os.path.join(APP, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("wrote icon.png, apple-icon.png, favicon.ico to src/app/")


if __name__ == "__main__":
    main()
