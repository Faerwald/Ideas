#!/usr/bin/env python3
import csv, json, argparse
from datetime import datetime
def infer_year(created, default_year):
    if not created: return default_year
    for fmt in ("%Y-%m-%dT%H:%M:%S%z","%m/%d/%Y %H:%M:%S","%m/%d/%Y"):
        try: return datetime.strptime(created.replace('Z','+0000'), fmt).year
        except Exception: pass
    return default_year
ap = argparse.ArgumentParser()
ap.add_argument("csv_in"); ap.add_argument("json_out")
ap.add_argument("--year", type=int, default=2025); ap.add_argument("--venue", default="Working Draft")
args = ap.parse_args()
rows=[]
with open(args.csv_in, newline="", encoding="utf-8") as fp:
    r=csv.DictReader(fp)
    for row in r:
        name=row.get("Name","").strip(); fid=row.get("File ID","").strip(); created=row.get("Created","").strip()
        if not name or not fid: continue
        title = name[:-4] if name.lower().endswith(".pdf") else name
        year = infer_year(created, args.year)
        rows.append({"title":title,"year":year,"venue":args.venue,"tags":[],"abstract":"","driveId":fid,"doi":"","ots":"","hash_sha256":""})
with open(args.json_out,"w",encoding="utf-8") as out: json.dump(rows,out,indent=2,ensure_ascii=False)
print(f"Wrote {args.json_out} with {len(rows)} items.")
