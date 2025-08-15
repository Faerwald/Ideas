#!/usr/bin/env python3
"""
Append a 1‑page Copyright/License sheet to every PDF in a folder.

USAGE
-----
python append_copyright_page.py \
  --folder /path/to/pdfs \
  --owner "Jason" \
  --year 2025 \
  --license "All rights reserved" \
  --license-url "" \
  --doi-prefix "10.5281/zenodo." \
  --position back

This script will:
1) Compute SHA256 of the original PDF.
2) Generate a simple one-page PDF (ReportLab) with: title, owner, year, license text, DOI (if provided),
   original SHA256, timestamp.
3) Append (by default) that page to the *back* of the PDF. Use --position front to prepend.
4) Write the result next to the original as *_stamped.pdf

DEPENDENCIES
------------
pip install reportlab PyPDF2

NOTES
-----
- If you use Creative Commons, pass license like: "CC BY-NC-ND 4.0 — https://creativecommons.org/licenses/by-nc-nd/4.0/"
- If you know a DOI, pass --doi "10.5281/zenodo:XXXXXX". If not, you can run again later to update.
- For provenance, also run OpenTimestamps separately: `ots stamp yourfile_stamped.pdf`
"""

import os, io, argparse, hashlib, datetime, textwrap
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def make_notice_page(owner, year, license_text, license_url, doi, orig_sha, page_size='A4'):
    buf = io.BytesIO()
    size = A4 if page_size.upper()=='A4' else letter
    c = canvas.Canvas(buf, pagesize=size)
    width, height = size

    y = height - 1.5*inch
    left = 1.0*inch

    c.setFont("Helvetica-Bold", 18)
    c.drawString(left, y, "Copyright & License Notice")
    y -= 0.4*inch

    c.setFont("Helvetica", 12)
    lines = [
        f"© {year} {owner}. All rights reserved unless otherwise noted.",
        f"License: {license_text}" + (f"  ({license_url})" if license_url else ""),
    ]
    if doi:
        lines.append(f"DOI: https://doi.org/{doi}")
    now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    lines.append(f"Notice generated: {now} (UTC)")
    lines.append(f"Original file SHA256: {orig_sha}")

    for line in lines:
        c.drawString(left, y, line)
        y -= 0.28*inch

    c.setFont("Helvetica-Oblique", 10)
    note = "Draft shared for reading and citation. Redistribution, dataset creation, or AI training is prohibited without prior written consent (unless license for this file states otherwise)."
    for l in textwrap.wrap(note, width=90):
        c.drawString(left, y, l)
        y -= 0.22*inch

    c.showPage()
    c.save()
    buf.seek(0)
    return buf

def process_pdf(path, owner, year, license_text, license_url, doi, position='back'):
    orig_hash = sha256(path)
    notice_pdf = make_notice_page(owner, year, license_text, license_url, doi, orig_hash)

    reader = PdfReader(path)
    writer = PdfWriter()

    if position == 'front':
        writer.append(notice_pdf)
        writer.append(reader)
    else:
        writer.append(reader)
        writer.append(notice_pdf)

    # Propagate basic metadata
    info = writer._info.get_object()
    info.update({
        '/Author': owner,
        '/Subject': 'Rights notice and license',
        '/Keywords': 'copyright, license, provenance, DOI',
    })

    out_path = os.path.splitext(path)[0] + "_stamped.pdf"
    with open(out_path, 'wb') as f:
        writer.write(f)

    final_hash = sha256(out_path)
    return out_path, orig_hash, final_hash

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--folder', required=True, help='Folder containing PDFs (processed recursively)')
    ap.add_argument('--owner', required=True, help='Copyright owner name')
    ap.add_argument('--year', type=int, default=datetime.datetime.utcnow().year)
    ap.add_argument('--license', dest='license_text', default='All rights reserved')
    ap.add_argument('--license-url', default='')
    ap.add_argument('--doi', default='')
    ap.add_argument('--position', choices=['front','back'], default='back')
    args = ap.parse_args()

    stamped = []
    for root, _, files in os.walk(args.folder):
        for fn in files:
            if fn.lower().endswith('.pdf') and not fn.lower().endswith('_stamped.pdf'):
                p = os.path.join(root, fn)
                out, h1, h2 = process_pdf(p, args.owner, args.year, args.license_text, args.license_url, args.doi, args.position)
                print(f"[OK] {p} -> {out}")
                print(f"     original_sha256={h1}")
                print(f"     final_sha256   ={h2}")
                stamped.append((p, out, h1, h2))

    if not stamped:
        print("No PDFs found to process.")

if __name__ == '__main__':
    main()
