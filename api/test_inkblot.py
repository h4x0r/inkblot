"""Regression backstop for the renderer. The primary correctness evidence is
the real-git-log render (Doer-Checker); these assert the contract invariants.

Run: python3 api/test_inkblot.py   (or: python3 -m pytest api/test_inkblot.py)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _inkblot import (
    HOUR_MS,
    MAX_HOURS,
    MAX_POINTS,
    MAX_REPOS,
    _allowed_avatar_host,
    _emoji_codepoint,
    render_inkblot,
)

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _sample():
    return {
        "start": 0,
        "step_hours": 1,
        "series": {
            "alpha": [0, 0, 1, 2, 3, 2, 1, 0, 0, 0],
            "beta": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        },
    }


def test_returns_png_bytes():
    img = render_inkblot(_sample())
    assert img.startswith(PNG_SIG), "expected a PNG signature"
    assert len(img) > 1000


def test_svg_format():
    img = render_inkblot({**_sample(), "format": "svg"})
    assert b"<svg" in img[:4000]


def test_empty_series_raises():
    try:
        render_inkblot({"start": 0, "series": {}})
    except ValueError:
        return
    raise AssertionError("expected ValueError on empty series")


def test_selection_filters_repos():
    img = render_inkblot({**_sample(), "selected": ["alpha"]})
    assert img.startswith(PNG_SIG)


def test_window_slices_to_subrange():
    # window covering only bins 2..5 still renders
    p = {**_sample(), "window": [2 * HOUR_MS, 5 * HOUR_MS]}
    img = render_inkblot(p)
    assert img.startswith(PNG_SIG)


def test_window_with_no_commits_renders_placeholder():
    # A valid window in which the selection happens to have zero commits must
    # NOT raise — a README/OG embed image must never break. It degrades to a
    # clear "no activity in this window" placeholder PNG instead.
    p = {**_sample(), "series": {"alpha": [5, 0, 0], "beta": [3, 0, 0]}}
    p["window"] = [1 * HOUR_MS, 2 * HOUR_MS]  # bins 1..2 are all-zero
    img = render_inkblot(p)
    assert img.startswith(PNG_SIG), "empty window should degrade to a placeholder"
    assert len(img) > 1000


def test_selected_repos_absent_renders_placeholder():
    # A stale URL repo-mask can decode to names no longer in the series; that
    # must also degrade to a placeholder rather than 502.
    img = render_inkblot({**_sample(), "selected": ["ghost", "vanished"]})
    assert img.startswith(PNG_SIG)
    assert len(img) > 1000


def test_zero_width_window_raises():
    # from >= to is a genuinely malformed range (the slider can't produce it);
    # keep failing loud on that, distinct from a valid-but-empty window.
    p = {**_sample(), "window": [5 * HOUR_MS, 2 * HOUR_MS]}
    try:
        render_inkblot(p)
    except ValueError:
        return
    raise AssertionError("expected ValueError on a zero-width (from>=to) window")


def test_too_many_repos_raises():
    series = {f"r{i}": [1, 0] for i in range(MAX_REPOS + 1)}
    try:
        render_inkblot({"start": 0, "series": series})
    except ValueError:
        return
    raise AssertionError("expected ValueError when repo count exceeds MAX_REPOS")


def test_too_many_hours_raises():
    series = {"a": [0] * (MAX_HOURS + 1)}
    try:
        render_inkblot({"start": 0, "series": series})
    except ValueError:
        return
    raise AssertionError("expected ValueError when series longer than MAX_HOURS")


def test_total_points_cap_raises():
    # repos * hours over the product cap, while each axis is individually legal
    repos = 200
    hours = (MAX_POINTS // repos) + 10
    if hours > MAX_HOURS:
        hours = MAX_HOURS  # keep the per-axis cap legal; product still huge
        repos = (MAX_POINTS // hours) + 10
    series = {f"r{i}": [0] * hours for i in range(repos)}
    try:
        render_inkblot({"start": 0, "series": series})
    except ValueError:
        return
    raise AssertionError("expected ValueError when repos*hours exceeds MAX_POINTS")


def test_negative_counts_raise():
    try:
        render_inkblot({"start": 0, "series": {"a": [1, -3, 2]}})
    except ValueError:
        return
    raise AssertionError("expected ValueError on negative commit counts")


def test_non_numeric_counts_raise():
    try:
        render_inkblot({"start": 0, "series": {"a": [1, "boom", 2]}})
    except (ValueError, TypeError):
        return
    raise AssertionError("expected an error on non-numeric counts")


def test_emoji_codepoint():
    assert _emoji_codepoint("🌙") == "1f319"
    assert _emoji_codepoint("🛠️") == "1f6e0"  # FE0F variation selector stripped
    assert _emoji_codepoint("⚡") == "26a1"
    assert _emoji_codepoint("🐢") == "1f422"
    assert _emoji_codepoint("") is None


def test_allowed_avatar_host_accepts_github():
    assert _allowed_avatar_host("https://avatars.githubusercontent.com/u/123?v=4")
    assert _allowed_avatar_host("https://github.com/h4x0r.png")


def test_allowed_avatar_host_rejects_ssrf_and_other_hosts():
    # arbitrary hosts, internal targets, and non-http schemes must be rejected
    for bad in (
        "https://evil.example.com/x.png",
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:3000/api/activity",
        "https://githubusercontent.com.evil.com/x.png",
        "file:///etc/passwd",
        "not-a-url",
        "",
    ):
        assert not _allowed_avatar_host(bad), bad


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} passed")
