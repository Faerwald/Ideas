#!/usr/bin/env python3
"""
build_all.py — one-shot builder with auto-backup.

1) scripts/csv_to_papersjson.py     (CSV -> base JSON)
2) update_dates_from_dir.py         (set date/year from PDFs: filename -> birth -> mtime)
3) add_fulltext_from_dir.py         (pages + optional full text)
4) merge_locks.py                   (Locked/Wait/Eval from CSV)

Before writing the final papers.json:
- if papers.json exists, back it up to papers.backup_YYYYmmdd_HHMMSS.json

Usage:
  python3 build_all.py LinkList.csv ../Ideas papers.json --csv-delim tab --year 2025 --venue "Working Draft" --max-chars 100000 --prefer pdftotext --date-order name,birth,mtime
"""
import argparse, subprocess, sys, json, shutil
from pathlib import Path
from datetime import datetime

def run(cmd):
    print("→", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True)

def backup_if_exists(path: Path):
    if path.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        bkp = path.with_name(f"{path.stem}.backup_{ts}{path.suffix}")
        shutil.copy2(path, bkp)
        print(f"[backup] {path.name} -> {bkp.name}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("pdf_root")
    ap.add_argument("out_json")
    ap.add_argument("--csv-delim", choices=["auto","tab","comma","semicolon","pipe"], default="auto")
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--venue", default="Working Draft")
    ap.add_argument("--max-chars", type=int, default=100000)
    ap.add_argument("--prefer", choices=["pypdf2","pdftotext"], default="pdftotext")
    ap.add_argument("--date-order", default="name,birth,mtime")
    args = ap.parse_args()

    csv_path = Path(args.csv).resolve()
    pdf_root = Path(args.pdf_root).resolve()
    out_json = Path(args.out_json).resolve()

    t1 = out_json.with_suffix(".tmp1.json")
    t2 = out_json.with_suffix(".tmp2.json")
    t3 = out_json.with_suffix(".tmp3.json")

    try:
        # 1) CSV -> base
        run([sys.executable, "scripts/csv_to_papersjson.py",
             str(csv_path), str(t1),
             "--year", str(args.year),
             "--venue", args.venue,
             "--delimiter", args.csv_delim])

        # 2) Dates from PDFs
        run([sys.executable, "update_dates_from_dir.py",
             str(t1), "--pdf-root", str(pdf_root),
             "--order", args.date_order, "-o", str(t2)])

        # 3) Pages + (optional) full text
        run([sys.executable, "add_fulltext_from_dir.py",
             str(t2), "--pdf-root", str(pdf_root),
             "--max-chars", str(args.max_chars),
             "--prefer", args.prefer, "-o", str(t3)])

        # Backup old papers.json (if any), then 4) merge locked/wait/eval to final
        backup_if_exists(out_json)
        run([sys.executable, "merge_locks.py",
             str(t3), str(csv_path), "-o", str(out_json)])

        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"\n✅ Done. {len(data)} items written to {out_json}")

    finally:
        for p in (t1, t2, t3):
            try:
                if p.exists(): p.unlink()
            except Exception:
                pass

if __name__ == "__main__":
    main()

