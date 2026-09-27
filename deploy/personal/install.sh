#!/usr/bin/env bash
set -euo pipefail
# Run as root; application state must never fall back onto the root filesystem.
mountpoint -q /mnt/storage
base=/mnt/storage/vaultwarden
stage=${1:?Pass the staging directory containing personal/ and dist/}
install -d -m 700 "$base" "$base/data" "$base/backups"
install -d -m 755 "$base/web"
cp -a "$stage/personal/." "$base/"
cp -a "$stage/dist/." "$base/web/"
if [ ! -f "$base/vaultwarden.env" ]; then
  install -m 600 "$base/vaultwarden.env.example" "$base/vaultwarden.env"
fi
install -m 644 "$base/vaultwarden.service" /etc/systemd/system/vaultwarden.service
install -m 644 "$base/vaultwarden-backup.service" /etc/systemd/system/vaultwarden-backup.service
install -m 644 "$base/vaultwarden-backup.timer" /etc/systemd/system/vaultwarden-backup.timer
install -m 644 "$base/vaultwarden.logrotate" /etc/logrotate.d/personal-vaultwarden
chmod 600 "$base/compose.yaml" "$base/vaultwarden.env"
systemctl daemon-reload
systemctl enable vaultwarden.service
systemctl restart vaultwarden.service
systemctl enable --now vaultwarden-backup.timer
docker inspect personal-vaultwarden --format '{{.State.Health.Status}}'
# Reverse-proxy activation is intentionally separate: review its certificate paths first.
