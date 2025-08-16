#!/usr/bin/env python3
"""
Upload new versions for many Drive files, preserving IDs, using a manifest.csv created by drive_bulk_links.py.

Usage:
  python drive_upload_versions.py --manifest manifest.csv --local-dir /path/to/stamped

It will try to match each manifest row's file name to a local file:
- exact match, or
- "<name_without_ext>_stamped.pdf"

Requires: same OAuth setup as drive_bulk_links.py (credentials.json + token.json).
"""

import os, csv, argparse
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/drive']

def get_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('drive', 'v3', credentials=creds)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True, help='CSV from drive_bulk_links.py')
    ap.add_argument('--local-dir', required=True, help='Directory containing new PDFs')
    args = ap.parse_args()

    svc = get_service()

    with open(args.manifest, newline='', encoding='utf-8') as fp:
        rows = list(csv.DictReader(fp))

    for r in rows:
        name = r['name']
        fid = r['id']
        base = os.path.splitext(name)[0]
        candidates = [
            os.path.join(args.local_dir, name),
            os.path.join(args.local_dir, base + "_stamped.pdf"),
            os.path.join(args.local_dir, base + ".pdf"),
        ]
        path = next((p for p in candidates if os.path.isfile(p)), None)
        if not path:
            print(f"[skip] no local file for {name}")
            continue

        media = MediaFileUpload(path, mimetype='application/pdf', resumable=True)
        print(f"[upload] {name} -> {fid}")
        svc.files().update(fileId=fid, media_body=media).execute()

    print("Done")

if __name__ == '__main__':
    main()
