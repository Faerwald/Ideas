#!/usr/bin/env python3
# Merge fields from LinkList.csv into papers.json by Drive File ID.
# - Locked : 0/1 (or true/false/yes/no)
# - Wait   : 1..7  (optional)
# - Eval   : free text (from "Eval", "Evaluation", "AI Eval", "Description", or "Notes")

import csv, json, argparse, sys

def norm(s: str) -> str:
    return str(s or "").strip().lower().replace(" ", "").replace("-", "").replace("_", "")

def parse_bool(v):
    s = str(v).strip().lower()
    return s in ("1","true","yes","y")

def parse_wait(v):
    s = str(v).strip()
    if not s: return None
    try:
        n = int(float(s))
        if 1 <= n <= 7: return n
    except:
        return None
    return n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers_json", help="existing papers.json to update")
    ap.add_argument("csv_with_flags", help="LinkList.csv with File ID, and optionally Locked/Wait/Eval")
    ap.add_argument("-o","--out", default="papers.json")
    args = ap.parse_args()

    # load JSON
    try:
        with open(args.papers_json, "r", encoding="utf-8") as f:
            papers = json.load(f)
    except Exception as e:
        print(f"ERROR reading {args.papers_json}: {e}", file=sys.stderr); sys.exit(1)
    if not isinstance(papers, list):
        print("ERROR: papers.json must be a JSON array.", file=sys.stderr); sys.exit(1)

    by_id = {p.get("driveId",""): p for p in papers if p.get("driveId")}
    if not by_id:
        print("WARNING: No driveId keys found in papers.json; nothing to merge.", file=sys.stderr)

    # read CSV
    with open(args.csv_with_flags, newline="", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        if not reader.fieldnames:
            print("ERROR: CSV has no header row.", file=sys.stderr); sys.exit(1)
        header_map = {norm(h): h for h in reader.fieldnames}

        def get(row, *candidates):
            for key in candidates:
                real = header_map.get(norm(key))
                if real in row:
                    return row.get(real, "")
            return ""

        updated = 0
        for row in reader:
            fid = get(row, "File ID", "Drive ID", "ID", "fileid", "drivefileid", "driveid").strip()
            if not fid: continue
            p = by_id.get(fid)
            if not p: continue

            touched = False

            # Locked
            locked_raw = get(row, "Locked", "Private", "Lock")
            if locked_raw != "":
                locked = parse_bool(locked_raw)
                if p.get("locked") != locked:
                    p["locked"] = locked
                    touched = True

            # Wait
            wait_raw = get(row, "Wait", "W", "Rating", "Score")
            if wait_raw != "":
                w = parse_wait(wait_raw)
                if w is None:
                    if "wait" in p:
                        del p["wait"]; touched = True
                else:
                    if p.get("wait") != w:
                        p["wait"] = w; touched = True

            # Eval (free text)
            eval_raw = get(row, "Eval", "Evaluation", "AI Eval", "Description", "Notes")
            if eval_raw != "":
                eval_text = str(eval_raw).strip()
                if p.get("eval","") != eval_text:
                    p["eval"] = eval_text
                    touched = True

            if touched:
                updated += 1

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)

    print(f"[done] wrote {args.out} (updated {updated} items)")

if __name__ == "__main__":
    main()

