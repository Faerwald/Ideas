#!/usr/bin/env python3
"""
csv_to_papersjson.py  (robust for Google Sheets CSV/TSV)

Build papers.json from LinkList.csv.

- Auto-detects delimiter, or force with --delimiter (auto|tab|comma|semicolon|pipe)
- Accepts header variants used in your sheet:
  title/name/file/title_like/text, DriveID or DriveViewURL/DriveDownloadURL/Link/Text-Link,
  Date/SourceDate/AddedDate/Created*, Locked, Wait, Evaluation/Evaluation_like/AI Eval/Description/Notes
- Produces: title, date (YYYY-MM-DD), year, venue, driveId (may be empty)
  and passes through locked/wait/eval if present.

Usage:
  python3 scripts/csv_to_papersjson.py LinkList.csv papers.json --year 2025 --venue "Working Draft" --delimiter tab
"""
import csv, json, argparse, sys, re
from datetime import datetime

def norm(s:str)->str:
    return str(s or "").strip().lower().replace(" ", "").replace("-", "").replace("_", "")

# header buckets
COL_TITLE = {"title","name","filename","file","text","titlelike","title_like"}
COL_ID    = {"driveid","fileid","id","drivefileid"}
COL_ID_URL = {"driveviewurl","drivedownloadurl","link","textlink","text-link","url"}
COL_DATE  = {"date","sourcedate","addeddate","created","createddate","createdtime"}
COL_LOCK  = {"locked","private","lock"}
COL_WAIT  = {"wait","w","rating","score"}
COL_EVAL  = {"eval","evaluation","evaluationlike","evaluation_like","aieval","description","notes","text"}

ID_RE_1 = re.compile(r"/d/([A-Za-z0-9_-]{10,})")
ID_RE_2 = re.compile(r"[?&]id=([A-Za-z0-9_-]{10,})")
def extract_id_from_url(url:str)->str|None:
    if not url: return None
    m = ID_RE_1.search(url)
    if m: return m.group(1)
    m = ID_RE_2.search(url)
    if m: return m.group(1)
    return None

def parse_date(v):
    s = str(v or "").strip()
    if not s: return None
    for fmt in ("%Y-%m-%d","%Y/%m/%d","%m/%d/%Y","%m/%d/%y","%Y.%m.%d"):
        try: return datetime.strptime(s, fmt).date()
        except: pass
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        try: return datetime.strptime(m.group(1), "%Y-%m-%d").date()
        except: pass
    return None

def parse_bool(v): return str(v).strip().lower() in ("1","true","yes","y")
def parse_wait(v):
    s=str(v).strip()
    if not s: return None
    try:
        n=int(float(s));  return n if 1<=n<=7 else None
    except: return None

def detect_delimiter_auto(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as fp:
        first = fp.readline()
        counts = { "\t": first.count("\t"), ",": first.count(","), ";": first.count(";"), "|": first.count("|") }
        d = max(counts, key=counts.get)
        if counts[d] > 0:
            return d
        fp.seek(0)
        sample = fp.read(4096)
        try:
            return csv.Sniffer().sniff(sample, delimiters=[",",";","\t","|"]).delimiter
        except Exception:
            return ","

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_in")
    ap.add_argument("json_out")
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--venue", default="Working Draft")
    ap.add_argument("--delimiter", choices=["auto","tab","comma","semicolon","pipe"], default="auto")
    args = ap.parse_args()

    if args.delimiter == "auto":
        delim = detect_delimiter_auto(args.csv_in)
    else:
        delim = {"tab":"\t","comma":",","semicolon":";","pipe":"|"}[args.delimiter]

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
                if real and real in row:
                    return row.get(real, "")
            return ""

        out=[]
        for row in dr:
            if None in row: row.pop(None, None)  # ignore extras

            title_raw = get(row, COL_TITLE)
            fid_raw   = get(row, COL_ID)
            url_any   = get(row, COL_ID_URL)
            dstr      = get(row, COL_DATE)
            locked    = get(row, COL_LOCK)
            wait      = get(row, COL_WAIT)
            evaltxt   = get(row, COL_EVAL)

            title = str(title_raw or "").strip()
            if title.lower().endswith(".pdf"): title = title[:-4]
            if not title:
                continue  # must have a title, otherwise skip

            fid = (str(fid_raw or "").strip()
                   or extract_id_from_url(str(url_any) or "")) or ""

            d = parse_date(dstr)
            item = {
                "title": title,
                "year": (d.year if d else args.year),
                "date": (d.strftime("%Y-%m-%d") if d else ""),
                "venue": args.venue,
                "tags": [],
                "abstract": "",
                "driveId": fid  # may be ""
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
