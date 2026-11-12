#!/usr/bin/env bash
# Backup example: run on a trusted machine, NOT inside Netlify.
set -euo pipefail
umask 077
if [ -z "${DATABASE_URL:-}" ]; then echo 'DATABASE_URL missing' >&2; exit 1; fi
if ! command -v pg_dump >/dev/null; then echo 'Install pg_dump for your PostgreSQL version' >&2;exit 1;fi
if ! command -v age >/dev/null; then echo 'Install age encryption first' >&2;exit 1;fi
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ];then echo 'BACKUP_AGE_RECIPIENT missing' >&2;exit 1;fi
mkdir -p backups
filename="backups/abmil-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
pg_dump --no-owner --no-privileges --format=custom "$DATABASE_URL" | age -r "$BACKUP_AGE_RECIPIENT" -o "$filename"
echo "Encrypted backup created: $filename"
echo 'Copy to a separate encrypted storage account, test restoration, and follow retention policy.'
