#!/usr/bin/env python3
"""
Add page counts (and optional full text) to papers.json by scanning a local PDF folder.

USAGE (your layout)
  cd ~/Dropbox/Ideas-main
  # pages only (keeps JSON small)
  python3 add_fulltext_from_dir.py papers.json --pdf-root ../Ideas --max-chars 0 -o papers.json
  # or include full text (cap to keep size reasonable)
  python3 add_fulltext_from_dir.py papers.json --pdf-root ../Ideas --max-chars 100000 --prefer pdftotext -o papers.json

Options:
  --pdf-root     Folder containing PDFs (searched recursively)
  --max-chars    Characters of text to keep per doc (0 = no text, pages only)
  --prefer       Which extractor to try first: pypdf2 (default) or pdftotext
  -o/--out       Output JSON path (default papers.json)
"""

import argparse, json, os, re, sys, subprocess
from pathlib import Path

# -------- optional dependency --------
try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

# --------- matching helpers ----------
def norm(s: str) -> str:
    s = str(s or "").strip()
    s = s.replace(" ", "_")
    return re.sub(r"[^A-Za-z0-9_.-]+", "", s).lower()

def score_match(title: str, fname: str) -> int:
    t = norm(title)
    f = norm(fname)
    if t == f:
        return 100
    t0 = t.replace(".pdf", "")
    f0 = f.replace(".pdf", "")
    score = 0
    if t0 and t0 in f0:
        score += 40
    if f0 and f0 in t0:
        score += 30
    ts = set(re.split(r"[_\-\.]+", t0))
    fs = set(re.split(r"[_\-\.]+", f0))
    score += 3 * len(ts & fs)
    # small prefix boost for short titles
    if t0 and f0.startswith(t0[: max(3, len(t0)//2)]):
        score += 5
    return score

def find_best_pdf(title: str, all_pdfs):
    best, bestscore = None, -1
    for p in all_pdfs:
        sc = score_match(title, p.name)
        if sc > bestscore:
            best, bestscore = p, sc
    return best, bestscore

# --------- extractors ----------
def extract_text_pypdf2(path: Path):
    if PdfReader is None:
        return None, None
    try:
        reader = PdfReader(str(path))
        pages = len(reader.pages)
        parts = []
        for i in range(pages):
            try:
                parts.append(reader.pages[i].extract_text() or "")
            except Exception:
                parts.append("")
        return ("\n".join(parts), pages)
    except Exception:
        return None, None

def extract_text_pdftotext(path: Path):
    # text
    try:
        out = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        text = out.stdout.decode("utf-8", "ignore")
    except Exception:
        text = None
    # pages via pdfinfo if available
    pages = None
    try:
        info = subprocess.run(["pdfinfo", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        m = re.search(r"^Pages:\s+(\d+)", info.stdout.decode("utf-8","ignore"), re.MULTILINE)
        if m: pages = int(m.group(1))
    except Exception:
        pass
    return (text, pages)

def clean_text(s: str) -> str:
    s = re.sub(r"\s+\n", "\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s

# --------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("papers_json", help="path to existing papers.json")
    ap.add_argument("--pdf-root", required=True, help="folder containing PDFs (recursively searched)")
    ap.add_argument("--max-chars", type=int, default=80000, help="cap text per doc (0 = pages only)")
    ap.add_argument("--prefer", choices=["pypdf2","pdftotext"], default="pypdf2", help="extractor to try first")
    ap.add_argument("-o","--out", default="papers.json", help="output JSON path")
    args = ap.parse_args()

    pdf_root = Path(args.pdf_root).expanduser().resolve()
    if not pdf_root.exists():
        print(f"ERROR: --pdf-root not found: {pdf_root}", file=sys.stderr)
        sys.exit(1)

    with open(args.papers_json, "r", encoding="utf-8") as f:
        papers = json.load(f)
    if not isinstance(papers, list):
        print("ERROR: papers.json must be a list of objects", file=sys.stderr)
        sys.exit(1)

    all_pdfs = [p for p in pdf_root.rglob("*.pdf")]
    if not all_pdfs:
        print(f"WARNING: no PDFs found under {pdf_root}", file=sys.stderr)

    updated = 0
    for p in papers:
        title = p.get("title") or p.get("Name") or ""
        if not title:
            continue

        best, sc = find_best_pdf(title, all_pdfs)
        if not best or sc < 10:
            print(f"[skip] no good match for: {title}")
            continue

        text, pages = None, None
        order = ["pypdf2","pdftotext"] if args.prefer == "pypdf2" else ["pdftotext","pypdf2"]

        for method in order:
            if method == "pypdf2":
                t, n = extract_text_pypdf2(best)
            else:
                t, n = extract_text_pdftotext(best)

            if t is not None and text is None:
                text = t
            if n is not None and pages is not None:
                pages = pages  # do nothing
            elif n is not None:
                pages = n

            # Stop conditions
            if args.max_chars == 0 and pages is not None:
                break
            if args.max_chars > 0 and text is not None and pages is not None:
                break

        if pages is not None:
            try: p["pages"] = int(pages)
            except Exception: p["pages"] = pages

        if args.max_chars > 0 and text:
            text = clean_text(text)
            if args.max_chars > 0 and len(text) > args.max_chars:
                text = text[:args.max_chars]
            p["full"] = text

        updated += 1
        print(f"[ok] {title}  ←  {best.name}   pages={pages if pages is not None else 'unknown'}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    print(f"[done] wrote {args.out} (updated {updated} items)")

if __name__ == "__main__":
    main()

