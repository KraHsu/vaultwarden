#!/usr/bin/env python3
"""Online SQLite snapshot plus attachments/config; keep 30 daily local backups."""
import datetime
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile

os.umask(0o077)
base = Path('/mnt/storage/vaultwarden')
if not os.path.ismount('/mnt/storage'):
    raise SystemExit('Data disk is not mounted; refusing backup')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
archive = base / 'backups' / f'vaultwarden-{stamp}.tar.gz'
with tempfile.TemporaryDirectory(prefix='.snapshot-', dir=base / 'backups') as stage:
    snapshot = Path(stage) / 'db.sqlite3'
    with sqlite3.connect(f'file:{base}/data/db.sqlite3?mode=ro', uri=True) as source:
        with sqlite3.connect(snapshot) as target:
            source.backup(target)
            assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    with tarfile.open(str(archive) + '.partial', 'w:gz') as tar:
        tar.add(snapshot, arcname='data/db.sqlite3')
        for path in (base / 'data').iterdir():
            if path.name.startswith(('db.sqlite3', 'vaultwarden.log')) or path.name in ('tmp', 'icon_cache'):
                continue
            tar.add(path, arcname=f'data/{path.name}')
        for name in ('compose.yaml', 'vaultwarden.env', 'web', 'secret.krahsu.top.conf', 'README.md'):
            if (base / name).exists():
                tar.add(base / name, arcname=name)
    os.replace(str(archive) + '.partial', archive)
for old in sorted((base / 'backups').glob('vaultwarden-*.tar.gz'), reverse=True)[30:]:
    old.unlink()
print(f'Backup complete: {archive.name} ({archive.stat().st_size} bytes)')
