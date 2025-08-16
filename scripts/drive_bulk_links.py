#!/usr/bin/env python3
import argparse, csv, os, json, sys
from datetime import datetime
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
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

def list_files(service, folder_id):
    q = f"'{folder_id}' in parents and trashed = false"
    fields = "nextPageToken, files(id, name, createdTime, modifiedTime, mimeType)"
    files = []
    page_token = None
    while True:
        res = service.files().list(q=q, fields=fields, pageToken=page_token, pageSize=1000).execute()
        files.extend(res.get('files', []))
        page_token = res.get('nextPageToken')
        if not page_token:
            break
    return files

def ensure_anyone_view(service, file_id):
    perms = service.permissions().list(fileId=file_id, fields="permissions(id,type,role)").execute().get('permissions', [])
    has_anyone_view = any(p['type']=='anyone' and p['role']=='reader' for p in perms)
    if not has_anyone_view:
        service.permissions().create(fileId=file_id, body={"type":"anyone", "role":"reader"}, fields="id").execute()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--folder', required=True, help='Google Drive folder ID')
    ap.add_argument('--out', default='manifest.csv', help='CSV output path')
    args = ap.parse_args()

    svc = get_service()
    files = list_files(svc, args.folder)
    print(f"Found {len(files)} files")

    rows = []
    for f in files:
        fid = f['id']
        ensure_anyone_view(svc, fid)
        rows.append({
            'name': f['name'],
            'id': fid,
            'preview': f"https://drive.google.com/file/d/{fid}/preview",
            'download': f"https://drive.google.com/uc?export=download&id={fid}",
            'created': f.get('createdTime',''),
            'modified': f.get('modifiedTime',''),
        })

    with open(args.out, 'w', newline='', encoding='utf-8') as fp:
        w = csv.DictWriter(fp, fieldnames=['name','id','preview','download','created','modified'])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Wrote {args.out}")

    pj = []
    for r in rows:
        year = None
        if r['created']:
            try:
                year = datetime.fromisoformat(r['created'].replace('Z','+00:00')).year
            except Exception:
                pass
        pj.append({
            "title": os.path.splitext(r['name'])[0],
            "year": year or 2025,
            "venue": "Working Draft",
            "tags": [],
            "abstract": "",
            "driveId": r['id'],
            "doi": "",
            "ots": "",
            "hash_sha256": ""
        })
    with open('papers.stub.json', 'w', encoding='utf-8') as fp:
        json.dump(pj, fp, indent=2, ensure_ascii=False)
    print("Wrote papers.stub.json (fill tags/abstracts and copy into your site).")

if __name__ == '__main__':
    try:
        main()
    except HttpError as e:
        print("Drive API error:", e)
        sys.exit(1)
