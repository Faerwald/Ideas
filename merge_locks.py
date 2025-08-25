#!/usr/bin/env python3
# Merge Locked (0/1), Wait (1..7), Eval (text) from LinkList.csv into papers.json by File ID.

import csv, json, argparse, sys

def norm(s:str)->str:
    return str(s or "").strip().lower().replace(" ", "").replace("-", "").replace("_", "")

def parse_bool(v): return str(v).strip().lower() in ("1","true","yes","y")
def parse_wait(v):
    s=str(v).strip()
    if not s: return None
    try:
        n=int(float(s));  return n if 1<=n<=7 else None
    except: return None

COL_ID   = {"driveid","fileid","id","drivefileid"}
COL_LOCK = {"locked","private","lock"}
COL_WAIT = {"wait","w","rating","score"}
COL_EVAL = {"eval","evaluation","evaluationlike","evaluation_like","aieval","description","notes","textlink","text-link"}

def detect_delimiter(path):
    with open(path,"r",encoding="utf-8-sig",newline="") as fp:
        first=fp.readline()
        counts={"\t":first.count("\t"), ",":first.count(","), ";":first.count(";"), "|":first.count("|")}
        d=max(counts,key=counts.get)
        if counts[d]>0: return d
        fp.seek(0); sample=fp.read(4096)
        try: import csv as _csv; return _csv.Sniffer().sniff(sample,delimiters=[",",";","\t","|"]).delimiter
        except Exception: return ","

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers_json")
    ap.add_argument("csv_with_flags")
    ap.add_argument("-o","--out", default="papers.json")
    args = ap.parse_args()

    with open(args.papers_json,"r",encoding="utf-8") as f:
        papers=json.load(f)
    if not isinstance(papers,list):
        print("ERROR: papers.json must be an array.",file=sys.stderr); sys.exit(1)

    by_id={str(p.get("driveId","")).strip():p for p in papers if p.get("driveId")}
    if not by_id:
        print("WARNING: No driveId keys found in papers.json; nothing to merge.",file=sys.stderr)

    delim = detect_delimiter(args.csv_with_flags)
    with open(args.csv_with_flags,"r",encoding="utf-8-sig",newline="") as fp:
        dr=csv.DictReader(fp, delimiter=delim)
        if not dr.fieldnames:
            print("ERROR: CSV has no header.",file=sys.stderr); sys.exit(1)
        header_map={norm(h):h for h in dr.fieldnames if h}

        def get(row, bucket):
            for n in bucket:
                real=header_map.get(n)
                if real and real in row: return row.get(real,"")
            return ""

        updated=0
        for row in dr:
            if None in row: row.pop(None,None)
            fid=str(get(row,COL_ID)).strip()
            if not fid: continue
            p=by_id.get(fid)
            if not p: continue

            touched=False
            lraw=get(row,COL_LOCK)
            if lraw!="":
                val=parse_bool(lraw)
                if p.get("locked")!=val: p["locked"]=val; touched=True

            wraw=get(row,COL_WAIT)
            if wraw!="":
                val=parse_wait(wraw)
                if val is None:
                    if "wait" in p: del p["wait"]; touched=True
                else:
                    if p.get("wait")!=val: p["wait"]=val; touched=True

            eraw=get(row,COL_EVAL)
            if eraw!="":
                ev=str(eraw).strip()
                if p.get("eval","")!=ev: p["eval"]=ev; touched=True

            if touched: updated+=1

    with open(args.out,"w",encoding="utf-8") as f:
        json.dump(papers,f,indent=2,ensure_ascii=False)
    print(f"[done] wrote {args.out} (updated {updated} items)")

if __name__=="__main__":
    main()

