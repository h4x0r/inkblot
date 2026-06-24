"""Render a developer's GitHub commit activity as a symmetric stacked
streamgraph — the "inkblot".

Data-driven port of the issen fleet inkblot script. The caller supplies per-repo
hourly commit counts (no git access here); this module filters to the selected
repos, slices to the requested time window, Gaussian-smooths each repo's series,
and stacks the bands about a symmetric centerline (matplotlib baseline="sym").
Total stream thickness at any moment is the whole selection's hourly commit
rate; the busiest repo straddles the centerline to minimise wiggle.

The single entry point is `render_inkblot(payload: dict) -> bytes`.
"""

from __future__ import annotations

import datetime as dt
import io
import os
import urllib.request
from typing import Any
from urllib.parse import urlparse

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Patch
from PIL import Image, ImageDraw

HOUR_MS = 3_600_000

# Paranoid-gatekeeper caps for the public render endpoint: range-check every
# size field from the (untrusted) payload before allocating, so a crafted body
# cannot turn /api/render into an allocation/CPU bomb. Generous for real users
# (e.g. 6 years of hourly bins, hundreds of repos) but bounded.
MAX_REPOS = 1_000
MAX_HOURS = 24 * 366 * 6  # ~6 years of hourly bins
MAX_POINTS = 5_000_000  # repos * hours product ceiling

BG = "#0d1117"
GRID = "#30363d"
MUTED = "#8b949e"
FAINT = "#6e7681"
TEXT = "#c9d1d9"
TITLE = "#f0f6fc"

# Attribution credit drawn bottom-left of every chart.
_ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
LOGO_PATH = os.path.join(_ASSETS, "securityronin-logo.png")
QR_PATH = os.path.join(_ASSETS, "app-qr.png")
CREDIT_NAME = 'Albert Hui "4n6h4x0r"'
# Text under the handle links to the author's LinkedIn; the QR (app-qr.png)
# stays pointed at the app so viewers can plot their own.
CREDIT_LINK = "https://www.linkedin.com/in/alberthui"
CREDIT_URL = "https://www.linkedin.com/in/alberthui"


def _allowed_avatar_host(url: str) -> bool:
    """Only fetch avatars from GitHub. /api/render is public, so an arbitrary
    avatar_url would be an SSRF vector — restrict scheme + host."""
    try:
        p = urlparse(url)
    except (ValueError, TypeError):
        return False
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").lower()
    return host == "github.com" or host.endswith(".githubusercontent.com")


def _draw_avatar(fig, url: str | None) -> None:
    """Top-left circular GitHub avatar so a shared chart is unmistakably the
    developer's. Decorative — any failure (bad host, fetch error, bad image)
    silently skips rather than breaking the chart."""
    if not url or not _allowed_avatar_host(url):
        return
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "inkblot"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read(2_000_000)
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        side = min(im.size)
        left = (im.width - side) // 2
        top = (im.height - side) // 2
        im = im.crop((left, top, left + side, top + side)).resize(
            (180, 180), Image.LANCZOS
        )
        mask = Image.new("L", (180, 180), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 179, 179), fill=255)
        im.putalpha(mask)
        ax = fig.add_axes((0.028, 0.905, 0.062, 0.085), zorder=11)
        ax.imshow(np.asarray(im), interpolation="antialiased")
        ax.axis("off")
    except Exception:  # avatar is decorative; never let it break the render
        pass


def _draw_credit(fig) -> None:
    """Branding: bottom-left Security Ronin logo + handle + app link; bottom-right
    QR code to the app.

    The link text carries a real hyperlink (clickable in SVG/PDF exports; plain
    text in PNG); the QR makes the app scannable from a shared image. Missing
    assets degrade gracefully rather than failing the whole render.
    """
    # bottom-left: Security Ronin logo + handle + app link
    x = 0.014
    if os.path.exists(LOGO_PATH):
        try:
            logo = plt.imread(LOGO_PATH)
            ax = fig.add_axes((x, 0.032, 0.075, 0.072), zorder=10)
            ax.imshow(logo, interpolation="antialiased")
            ax.axis("off")
            x += 0.084
        except Exception:  # never let branding break the chart
            pass
    fig.text(
        x, 0.074, CREDIT_NAME, fontsize=10, color=TEXT, fontweight="bold", va="center"
    )
    fig.text(
        x, 0.046, CREDIT_LINK, fontsize=7.5, color=MUTED, va="center", url=CREDIT_URL
    )
    # bottom-right: QR to the app
    if os.path.exists(QR_PATH):
        try:
            qr = plt.imread(QR_PATH)
            axq = fig.add_axes((0.946, 0.024, 0.045, 0.084), zorder=10)
            axq.imshow(qr, interpolation="antialiased")
            axq.axis("off")
            fig.text(
                0.9685,
                0.013,
                "scan to plot yours",
                fontsize=6,
                color=FAINT,
                ha="center",
            )
        except Exception:
            pass


def _require(payload: dict[str, Any], key: str) -> Any:
    if key not in payload:
        raise ValueError(f"render_inkblot: missing required field '{key}'")
    return payload[key]


def _nice_step(peak: float) -> float:
    raw = peak / 4.0
    if raw <= 0:
        return 1.0
    mag = 10 ** np.floor(np.log10(raw))
    for m in (1, 2, 2.5, 5, 10):
        if m * mag >= raw:
            return float(m * mag)
    return float(10 * mag)


def render_inkblot(payload: dict[str, Any]) -> bytes:
    """Render the inkblot PNG/SVG from a JSON-shaped payload.

    Required: ``start`` (epoch ms), ``series`` (repo -> hourly counts).
    Optional: ``step_hours`` (1), ``selected`` (repo list; default all),
    ``window`` ([from_ms, to_ms]; default full range), ``sigma_hours`` (8),
    ``title``, ``subtitle``, ``format`` ("png"|"svg").
    """
    start_ms = int(_require(payload, "start"))
    series_in: dict[str, list[float]] = _require(payload, "series")
    if not series_in:
        raise ValueError("render_inkblot: 'series' is empty — nothing to draw")

    step_hours = float(payload.get("step_hours", 1) or 1)
    step_ms = step_hours * HOUR_MS
    fmt = str(payload.get("format", "png")).lower()
    sigma_hours = float(payload.get("sigma_hours", 8.0) or 8.0)

    if len(series_in) > MAX_REPOS:
        raise ValueError(
            f"render_inkblot: too many repos ({len(series_in)} > {MAX_REPOS})"
        )

    n_hours = len(next(iter(series_in.values())))
    if n_hours > MAX_HOURS:
        raise ValueError(
            f"render_inkblot: series too long ({n_hours} > {MAX_HOURS} hours)"
        )
    if len(series_in) * n_hours > MAX_POINTS:
        raise ValueError(
            f"render_inkblot: too many data points "
            f"({len(series_in)} repos x {n_hours} hours > {MAX_POINTS})"
        )

    for repo, arr in series_in.items():
        if len(arr) != n_hours:
            raise ValueError(
                f"render_inkblot: series length mismatch for '{repo}' "
                f"({len(arr)} != {n_hours})"
            )
        for v in arr:
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                raise ValueError(
                    f"render_inkblot: non-numeric count in '{repo}': {v!r}"
                )
            if v < 0:
                raise ValueError(f"render_inkblot: negative count in '{repo}': {v!r}")

    # --- selection -----------------------------------------------------------
    selected = payload.get("selected")
    if selected:
        repos_set = [r for r in selected if r in series_in]
    else:
        repos_set = list(series_in.keys())
    if not repos_set:
        raise ValueError("render_inkblot: no selected repos present in 'series'")

    # --- window slice --------------------------------------------------------
    window = payload.get("window")
    if window:
        from_ms, to_ms = int(window[0]), int(window[1])
        i0 = max(0, int((from_ms - start_ms) // step_ms))
        i1 = min(n_hours, int((to_ms - start_ms) // step_ms) + 1)
    else:
        i0, i1 = 0, n_hours
    if i1 <= i0:
        raise ValueError("render_inkblot: window selects zero bins")

    win_start_ms = start_ms + i0 * step_ms
    win_hours = i1 - i0
    counts = {r: np.asarray(series_in[r][i0:i1], dtype=float) for r in repos_set}
    totals = {r: float(counts[r].sum()) for r in repos_set}

    # busiest first (drop repos with no commits in this window)
    repos = sorted(
        (r for r in repos_set if totals[r] > 0), key=lambda r: totals[r], reverse=True
    )
    if not repos:
        raise ValueError("render_inkblot: selection has no commits in the window")

    x = np.array(
        [
            dt.datetime.utcfromtimestamp((win_start_ms + i * step_ms) / 1000.0)
            for i in range(win_hours)
        ]
    )

    sigma_bins = max(1e-9, sigma_hours / step_hours)
    # Clamp the kernel so it never exceeds the window: np.convolve(mode="same")
    # returns max(len(input), len(kernel)), so a kernel longer than a short
    # window would silently produce a mismatched-length series.
    half = min(int(sigma_bins * 4), (win_hours - 1) // 2)
    if half < 1:
        smooth = {r: counts[r].copy() for r in repos}  # too short to smooth
    else:
        k = np.arange(-half, half + 1)
        kernel = np.exp(-(k**2) / (2 * sigma_bins**2))
        kernel /= kernel.sum()
        smooth = {r: np.convolve(counts[r], kernel, mode="same") for r in repos}

    total_series = np.sum([smooth[r] for r in repos], axis=0)
    total_peak = float(total_series.max()) if total_series.size else 0.0
    di = int(np.argmax(total_series)) if total_series.size else 0

    # inside-out band order: busiest straddles the centre, rest alternate outward
    order: list[str] = []
    for i, r in enumerate(repos):
        if i % 2 == 0:
            order.append(r)
        else:
            order.insert(0, r)

    cmap = plt.get_cmap("turbo")
    n = len(repos)
    color_of = {r: cmap(0.04 + 0.92 * i / max(1, n - 1)) for i, r in enumerate(repos)}

    # --- draw ----------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(16, 8))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)

    ax.stackplot(
        x,
        *[smooth[r] for r in order],
        colors=[color_of[r] for r in order],
        baseline="sym",
        linewidth=0.0,
        alpha=0.95,
    )

    lim = max(1e-6, total_peak / 2 * 1.12)
    ax.set_ylim(-lim, lim)
    step = _nice_step(total_peak)
    mags: list[float] = []
    m = step
    while m / 2 <= lim:
        mags.append(m)
        m += step
    positions = [-q / 2 for q in reversed(mags)] + [0] + [q / 2 for q in mags]
    labels = [f"{q:g}" for q in reversed(mags)] + ["0"] + [f"{q:g}" for q in mags]
    ax.set_yticks(positions)
    ax.set_yticklabels(labels)
    ax.set_ylabel("commits / hour (stacked total)", color=MUTED, fontsize=10)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color(GRID)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(axis="x", colors=MUTED)
    ax.tick_params(axis="y", colors=MUTED, labelsize=8, length=3)
    for q in mags:
        ax.axhline(q / 2, color=GRID, lw=0.4, alpha=0.5, zorder=5)
        ax.axhline(-q / 2, color=GRID, lw=0.4, alpha=0.5, zorder=5)
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.margins(x=0.01)

    # cap the legend so a many-repo selection doesn't overflow the figure
    legend_max = 28
    handles = [
        Patch(
            facecolor=color_of[r], edgecolor="none", label=f"{r}  ({int(totals[r]):,})"
        )
        for r in repos[:legend_max]
    ]
    if len(repos) > legend_max:
        handles.append(
            Patch(
                facecolor="none",
                edgecolor="none",
                label=f"…and {len(repos) - legend_max} more",
            )
        )
    # anchored just right of the plot (axes coords) so it sits close to the
    # chart; the fixed axes width below makes it reach the right edge too
    leg = ax.legend(
        handles=handles,
        loc="center left",
        bbox_to_anchor=(1.015, 0.5),
        ncol=1,
        fontsize=6.4,
        framealpha=0.0,
        labelcolor=TEXT,
        handlelength=1.0,
        handleheight=1.0,
        labelspacing=0.28,
        title="repo (commits)",
        title_fontsize=7.5,
    )
    leg.get_title().set_color(MUTED)

    title = payload.get("title") or "GitHub Activity History"
    subtitle = payload.get("subtitle") or (
        "stacked streamgraph (symmetric) · total thickness = commits/hour · "
        "busiest band centered"
    )
    fig.text(
        0.5, 0.965, title, ha="center", fontsize=16, fontweight="bold", color=TITLE
    )
    fig.text(0.5, 0.938, subtitle, ha="center", fontsize=9, color=MUTED)

    total_commits = int(sum(totals[r] for r in repos))
    cap = (
        f"{len(repos)} repos · {total_commits:,} commits · "
        f"{x[0].date().isoformat()} → {x[-1].date().isoformat()} · "
        f"Gaussian-smoothed hourly rate (sigma={sigma_hours:g}h) · "
        f"peak ~{total_peak:,.1f}/h around {x[di].strftime('%b %d %H:%M')}"
    )
    fig.text(0.5, 0.012, cap, ha="center", fontsize=8, color=FAINT)

    # Fixed margins (not tight_layout, which shrinks the axes to fit the legend
    # and leaves a wide chart→legend gap). The axes runs to 0.86; the adjacent
    # legend then fills 0.86→right-edge, so it's both close to the chart and
    # hugging the edge. Bottom band reserved for the credit.
    fig.subplots_adjust(left=0.055, right=0.86, top=0.90, bottom=0.14)
    _draw_credit(fig)
    _draw_avatar(fig, payload.get("avatar_url"))

    buf = io.BytesIO()
    out_fmt = "svg" if fmt == "svg" else "png"
    fig.savefig(buf, format=out_fmt, dpi=140, facecolor=fig.get_facecolor())
    plt.close(fig)
    return buf.getvalue()
