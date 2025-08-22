#!/usr/bin/env python3
"""
update_dates_from_dir.py
Update per-paper date (YYYY-MM-DD) and year in papers.json using local PDF timestamps.

Usage (from Ideas-main):
  python3 update_dates_from_dir.py papers.json --pdf-root ../Ideas -o papers.json --order name,birth,mtime

Date source order (comma-separated):
  - name  : use YYYY-MM-DD in filename if present
  - birth : filesystem creation time (if available)
  - mtime : file modification time (fallback)
"""

import argparse, json, re, sys, subprocess
from pathlib import Path
from datetime import datetime

# ---- matching (same spirit as your fulltext script) ----
def _norm(s: str) -> str:
    s = str(s or "").strip().replace(" ", "_")
    import re as _re
    return _re.sub(r"[^A-Za-z0-9_.-]+", "", s).lower()

def _score_match(title: str, fname: str) -> int:
    t = _norm(title); f = _norm(fname)
    if t == f: return 100
    t0 = t.replace(".pdf", ""); f0 = f.replace(".pdf", "")
    score = 0
    if t0 and t0 in f0: score += 40
    if f0 and f0 in t0: score += 30
    ts = set(re.split(r"[_\-\.]+", t0))
    fs = set(re.split(r"[_\-\.]+", f0))
    score += 3 * len(ts & fs)
    if t0 and f0.startswith(t0[:max(3, len(t0)//2)]): score += 5
    return score

def _find_best_pdf(title: str, all_pdfs):
    best, bestscore = None, -1
    for p in all_pdfs:
        sc = _score_match(title, p.name)
        if sc > bestscore:
            best, bestscore = p, sc
    return best, bestscore

# ---- date helpers ----
DATE_RE = re.compile(r"(?P<y>\d{4})[-_\.](?P<m>\d{2})[-_\.](?P<d>\d{2})")

def date_from_name(path: Path):
    m = DATE_RE.search(path.name)
    if not m: return None
    y, mth, d = int(m.group("y")), int(m.group("m")), int(m.group("d"))
    try: return datetime(y, mth, d).date()
    except ValueError: return None

def date_from_birthtime(path: Path):
    """Try true creation time. On many Linux filesystems it's unavailable."""
    # Try Python's stat first (macOS/BSD)
    st = path.stat()
    b = getattr(st, "st_birthtime", None)
    if b:
        return datetime.fromtimestamp(b).date()
    # Try GNU stat
    try:
        out = subprocess.run(
            ["stat", "-c", "%w", str(path)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        ).stdout.decode().strip()
        # returns '-' if unknown
        if out and out != "-":
            # out like: 2024-05-18 13:22:01.000000000 +0000
            dt = out.split()[0]
            return datetime.strptime(dt, "%Y-%m-%d").date()
    except Exception:
        pass
    return None

def date_from_mtime(path: Path):
    return datetime.fromtimestamp(path.stat().st_mtime).date()

# ---- main ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers_json")
    ap.add_argument("--pdf-root", required=True)
    ap.add_argument("-o","--out", default="papers.json")
    ap.add_argument("--order", default="name,birth,mtime",
                    help="comma list of sources: name,birth,mtime (default: name,birth,mtime)")
    args = ap.parse_args()

    pdf_root = Path(args.pdf_root).expanduser().resolve()
    if not pdf_root.exists():
        print(f"ERROR: --pdf-root not found: {pdf_root}", file=sys.stderr); sys.exit(1)

    with open(args.papers_json, "r", encoding="utf-8") as f:
        papers = json.load(f)
    if not isinstance(papers, list):
        print("ERROR: papers.json must be a list", file=sys.stderr); sys.exit(1)

    all_pdfs = list(pdf_root.rglob("*.pdf"))
    if not all_pdfs:
        print(f"WARNING: no PDFs under {pdf_root}", file=sys.stderr)

    order = [x.strip().lower() for x in args.order.split(",") if x.strip()]
    valid = {"name","birth","mtime"}
    if not all(o in valid for o in order):
        print("ERROR: --order must only contain: name,birth,mtime", file=sys.stderr); sys.exit(1)

    updated = 0
    for p in papers:
        title = p.get("title") or p.get("Name") or ""
        if not title: continue

        best, score = _find_best_pdf(title, all_pdfs)
        if not best or score < 10:
            print(f"[skip] no good match for: {title}")
            continue

        dt = None
        for src in order:
            if src == "name":
                dt = date_from_name(best)
            elif src == "birth":
                dt = date_from_birthtime(best)
            elif src == "mtime":
                dt = date_from_mtime(best)
            if dt: break

        if not dt:
            print(f"[skip] no date for: {title} ({best.name})")
            continue

        p["date"] = dt.strftime("%Y-%m-%d")
        p["year"] = dt.year
        updated += 1
        print(f"[ok] {title}  ←  {best.name}   date={p['date']}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    print(f"[done] wrote {args.out} (updated dates for {updated} items)")

if __name__ == "__main__":
    main()

