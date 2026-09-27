# Personal deployment on rain

URL: `https://secret.krahsu.top`.

The 100 GB XFS data disk is mounted at `/mnt/storage`. Everything specific to the
vault is under `/mnt/storage/vaultwarden`: `data/` (SQLite, attachments, RSA key,
logs), `web/` (Vue build), `backups/`, environment and Compose files. The existing
Docker daemon still stores shared images/runtime metadata on the system disk.
Small systemd/logrotate/nginx configuration files are installed in system paths.

## Install / update

1. Build `personal-web` using the committed lockfile.
2. Stage `deploy/personal` as `personal/` and the frontend build as `dist/` on the
   data disk, then run `sudo bash personal/install.sh <staging-directory>`.
3. Review the nginx certificate paths and install `secret.krahsu.top.conf` in the
   existing 1Panel OpenResty `www/conf.d` directory; run `nginx -t` in its container
   before reloading. The existing blog wildcard certificate covers the vault too.
4. Reserve the desired account with `sudo python3 /mnt/storage/vaultwarden/invite.py
   <your-email>`. This uses a temporary loopback-only admin token, sends no email,
   and removes the token after reserving the invitation. The user opens the Vue
   app, chooses 激活账号, and sets their own master password.

Public signups and organization invitations are disabled. `/admin` is blocked at
the proxy and the permanent admin token is unset. No email/password/token belongs
in this repository. The account invitation itself exists only in the private DB.

The container only publishes `127.0.0.1:8222`. HTTPS comes from the existing
OpenResty service. Its own CSP and security headers remain in force. Site request
logging is disabled; application warning/error logs reside on the data disk and
are rotated. No changes to other sites' routes are required.

The systemd unit requires the data-disk mount and checks it explicitly before
starting Compose. Bind mounts disable implicit directory creation to avoid
silently creating a replacement data directory on the root disk.

## Operations

```sh
sudo systemctl status vaultwarden.service
sudo docker inspect personal-vaultwarden --format '{{.State.Health.Status}}'
sudo systemctl list-timers vaultwarden-backup.timer
sudo python3 /mnt/storage/vaultwarden/backup.py
```

Daily backups run at approximately 04:20 Asia/Shanghai and retain the latest 30
archives. The backup uses SQLite's online backup API, checks DB integrity, and
includes attachments, account RSA key, configuration and frontend files. This is
a same-disk recovery copy, not protection against disk loss. Copy the private
archive off this server if an independent disaster-recovery copy is needed.

## Restore

Stop `vaultwarden.service`; preserve the current data directory before making
changes. Extract the selected archive into a separate directory on the data disk,
verify `data/db.sqlite3` with SQLite `PRAGMA integrity_check`, and restore its
`data/` together with the saved configuration and frontend. With the container
stopped, make sure no stale `db.sqlite3-wal`/`db.sqlite3-shm` from the replaced DB
is carried across. Retain root-only access to the parent directory. Restart the
service and verify health and user login. Do not run two instances against the
same SQLite directory.

For a frontend rollback, restore the `web/` files from a backup. For upstream
updates, pin a new Vaultwarden version/digest and rerun both crypto and integration
tests before replacing the running version. Back up first.
