"""Regression backstop for the renderer. The primary correctness evidence is
the real-git-log render (Doer-Checker); these assert the contract invariants.

Run: python3 api/test_inkblot.py   (or: python3 -m pytest api/test_inkblot.py)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _inkblot import HOUR_MS, render_inkblot

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


def test_window_with_no_commits_raises():
    p = {**_sample(), "window": [8 * HOUR_MS, 9 * HOUR_MS]}  # alpha all-zero here
    # beta has a commit at bin 9, so this should still render; use a true gap:
    p["series"] = {"alpha": [5, 0, 0], "beta": [3, 0, 0]}
    p["window"] = [1 * HOUR_MS, 2 * HOUR_MS]
    try:
        render_inkblot(p)
    except ValueError:
        return
    raise AssertionError("expected ValueError when window has no commits")


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} passed")
