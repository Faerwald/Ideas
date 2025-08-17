#!/usr/bin/env python3
# Merge "Locked" flags from CSV into papers.json by File ID (driveId).

import csv, json, argparse

def normcol(name): return name.strip().lower().replace(" ", "")
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers_json")
    ap.add_argument("csv_with_locked")   # the export from your sheet
    ap.add_argument("-o","--out", default="papers.json")
    args = ap.parse_args()

    # load current papers.json
    with open(args.papers_json, "r", encoding="utf-8") as f:
        papers = json.load(f)

    # map by driveId for quick lookup
    by_id = {p.get("driveId",""): p for p in papers if p.get("driveId")}

    # read CSV; find columns (case-insensitive)
    with open(args.csv_with_locked, newline="", encoding="utf-8") as fp:
        r = csv.reader(fp)
        rows = list(r)
    header = [normcol(h) for h in rows[0]]
    try:
        idx_id = header.index("fileid")
    except ValueError:
        raise SystemExit("CSV must contain a 'File ID' column.")
    # Locked column may be 'Locked' or 'Private'
    idx_lock = None
    for want in ("locked","private"):
        if want in header:
            idx_lock = header.index(want)
    if idx_lock is None:
        raise SystemExit("CSV must contain a 'Locked' (or 'Private') column with 0/1.")

    updates = 0
    for row in rows[1:]:
        fid = row[idx_id].strip()
        if not fid or fid not in by_id: 
            continue
        val = row[idx_lock].strip().lower()
        locked = val in ("1","true","yes","y")
        if by_id[fid].get("locked") != locked:
            by_id[fid]["locked"] = locked
            updates += 1

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    print(f"[done] wrote {args.out} (updated {updates} items)")

if __name__ == "__main__":
    main()
