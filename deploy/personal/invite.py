#!/usr/bin/env python3
"""Reserve one user's signup without sending mail or setting their master password.
Run on the host as root. A temporary local-only admin token is removed afterwards.
"""
import http.cookiejar
import json
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.request
import urllib.parse
import urllib.error

base=Path('/mnt/storage/vaultwarden')
email=sys.argv[1].strip().lower()
if '@' not in email:
    raise SystemExit('Provide a valid email address')
env=base/'vaultwarden.env'
original=env.read_text()
if 'ADMIN_TOKEN=' in original:
    raise SystemExit('Existing admin configuration detected; use the existing admin workflow.')
token=secrets.token_urlsafe(48)
try:
    env.write_text(original.rstrip()+'\nADMIN_TOKEN='+token+'\n')
    subprocess.run(['docker','compose','up','-d','--wait'],cwd=base,check=True,stdout=subprocess.DEVNULL)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args): return None
    opener=urllib.request.build_opener(NoRedirect())
    request=urllib.request.Request('http://127.0.0.1:8222/admin/',data=urllib.parse.urlencode({'token':token}).encode())
    try:
        response=opener.open(request)
    except urllib.error.HTTPError as response:
        if response.code not in (302,303): raise
        cookie=response.headers['Set-Cookie'].split(';',1)[0]
    else:
        cookie=response.headers.get('Set-Cookie','').split(';',1)[0]
        if not cookie.startswith('VW_ADMIN='):
            raise RuntimeError('Admin login did not return a session cookie')
    request=urllib.request.Request('http://127.0.0.1:8222/admin/invite',data=json.dumps({'email':email}).encode(),headers={'Cookie':cookie,'Content-Type':'application/json'})
    with urllib.request.urlopen(request) as response:
        assert response.status==200
    print('Invitation reserved; user must set their own master password.')
finally:
    env.write_text(original)
    subprocess.run(['docker','compose','up','-d','--wait'],cwd=base,check=True,stdout=subprocess.DEVNULL)
