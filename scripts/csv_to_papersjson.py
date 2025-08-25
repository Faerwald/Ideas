#!/usr/bin/env python3
"""
csv_to_papersjson.py  (robust for Google Sheets CSV/TSV)
Build papers.json from LinkList.csv.

- Auto-detects delimiter (TAB/comma/semicolon/pipe)
- Accepts many header variants used in your sheet:
  title/name/file/title_like, DriveID, Date/SourceDate/AddedDate,
  Locked, Wait, Evaluation/Evaluation_like/AI Eval/Description/Notes
- Produces: title, date (YYYY-MM-DD), year, venue, driveId
  and passes through locked/wait/eval if present.

Usage:
  python3 scripts/csv_to_papersjson.py LinkList.csv papers.json --year 2025 --venue "Working Draft"
"""
import csv, json, argparse, sys, re
from datetime import datetime

def norm(s:str)->str:
    return str(s or "").strip().lower().replace(" ", "").replace("-", "").replace("_", "")

# header buckets
COL_TITLE = {"title","name","filename","file","text","titlelike","title_like"}
COL_ID    = {"driveid","fileid","id","drivefileid"}
COL_DATE  = {"date","sourcedate","addeddate","created","createddate","createdtime"}
COL_LOCK  = {"locked","private","lock"}
COL_WAIT  = {"wait","w","rating","score"}
COL_EVAL  = {"eval","evaluation","evaluationlike","evaluation_like","aieval","description","notes","textlink","text-link"}

def parse_date(v):
    s = str(v or "").strip()
    if not s: return None
    # common formats
    for fmt in ("%Y-%m-%d","%Y/%m/%d","%m/%d/%Y","%m/%d/%y","%Y.%m.%d"):
        try: return datetime.strptime(s, fmt).date()
        except: pass
    # take ISO date part if there is time
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        try: return datetime.strptime(m.group(1), "%Y-%m-%d").date()
        except: pass
    return None

def parse_bool(v):
    return str(v).strip().lower() in ("1","true","yes","y")

def parse_wait(v):
    s = str(v).strip()
    if not s: return None
    try:
        n = int(float(s))
        if 1 <= n <= 7: return n
    except: pass
    return None

def detect_delimiter(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as fp:
        first = fp.readline()
        # manual vote wins (tabs vs commas etc.)
        counts = { "\t": first.count("\t"), ",": first.count(","), ";": first.count(";"), "|": first.count("|") }
        delim = max(counts, key=counts.get)
        if counts[delim] > 0:
            return delim
        # fallback to sniffer
        fp.seek(0)
        sample = fp.read(4096)
        try:
            return csv.Sniffer().sniff(sample, delimiters=[",",";","\t","|"]).delimiter
        except Exception:
            return ","  # last resort

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_in")
    ap.add_argument("json_out")
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--venue", default="Working Draft")
    args = ap.parse_args()

    delim = detect_delimiter(args.csv_in)
    with open(args.csv_in, "r", encoding="utf-8-sig", newline="") as fp:
        dr = csv.DictReader(fp, delimiter=delim)
        if not dr.fieldnames:
            open(args.json_out,"w",encoding="utf-8").write("[]")
            print(f"Wrote {args.json_out} with 0 items (no header).")
            return

        header_map = {norm(h): h for h in dr.fieldnames if h}

        def get(row, bucket):
            for n in bucket:
                real = header_map.get(n)
                if real in row:
                    return row.get(real, "")
            return ""

        out=[]
        for row in dr:
            if None in row: row.pop(None, None)  # ignore Google extras

            title_raw = get(row, COL_TITLE)
            fid       = get(row, COL_ID)
            dstr      = get(row, COL_DATE)
            locked    = get(row, COL_LOCK)
            wait      = get(row, COL_WAIT)
            evaltxt   = get(row, COL_EVAL)

            title = str(title_raw or "").strip()
            if title.lower().endswith(".pdf"): title = title[:-4]
            if not (title and fid):  # need both
                continue

            d = parse_date(dstr)
            item = {
                "title": title,
                "year": (d.year if d else args.year),
                "date": (d.strftime("%Y-%m-%d") if d else ""),
                "venue": args.venue,
                "tags": [],
                "abstract": "",
                "driveId": str(fid).strip()
            }
            if locked != "": item["locked"] = parse_bool(locked)
            w = parse_wait(wait)
            if w is not None: item["wait"] = w
            if str(evaltxt).strip(): item["eval"] = str(evaltxt).strip()

            out.append(item)

    with open(args.json_out, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"Wrote {args.json_out} with {len(out)} items.")

if __name__ == "__main__":
    main()
