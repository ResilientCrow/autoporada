#!/bin/sh
# Prepares this directory for `docker compose up`; safe to run again. It
# creates the state and secret directories, generates every password and
# key that is missing, and sets the owners and modes Compose itself does not
# (outside Swarm, a secret keeps its host owner and mode).
#   sudo ./install.sh
set -eu
cd "$(dirname "$0")"
umask 077

if [ "$(id -u)" -ne 0 ]; then
  echo 'install.sh: run as root (it sets the owners of the secret files)' >&2
  exit 1
fi
command -v openssl >/dev/null || {
  echo 'install.sh: openssl is required' >&2
  exit 1
}

APP_UID=65532 # web, worker, migrate, cli and Caddy
PG_UID=999    # postgres

mkdir -p secrets state/caddy/data state/caddy/config
chown -R "$APP_UID:$APP_UID" state/caddy

generate() { # <file> <command…>: only when missing, never overwritten
  file="secrets/$1"
  shift
  if [ ! -s "$file" ]; then
    "$@" >"$file"
    echo "install.sh: generated $file"
  fi
}
# Hex keeps the database URLs free of characters that need escaping.
generate pg_superuser_password openssl rand -hex 24
generate pg_owner_password openssl rand -hex 24
generate pg_web_password openssl rand -hex 24
generate pg_worker_password openssl rand -hex 24
generate server_actions_key openssl rand -base64 32

# Derived, so rewritten every time to stay in step with the passwords.
url() { printf 'postgres://%s:%s@postgres:5432/autoporada\n' "$1" "$(cat "secrets/$2")"; }
url autoporada_owner pg_owner_password >secrets/owner_database_url
url autoporada_web pg_web_password >secrets/web_database_url
url autoporada_worker pg_worker_password >secrets/worker_database_url

missing=''
for file in entra_key entra_cert web_entra_key web_entra_cert; do
  [ -s "secrets/$file" ] || missing="$missing $file"
done

chown "$PG_UID:$PG_UID" secrets/pg_*
for file in owner_database_url web_database_url worker_database_url server_actions_key entra_key entra_cert web_entra_key web_entra_cert; do
  [ ! -e "secrets/$file" ] || chown "$APP_UID:$APP_UID" "secrets/$file"
done
chmod 0400 secrets/*
chmod 0700 secrets

if [ ! -e .env ]; then
  cp .env.example .env
  echo 'install.sh: created .env; fill it in'
fi
# No secret in it, and every compose command reads it.
chmod 0644 .env
if [ -n "$missing" ]; then
  echo "install.sh: missing Entra certificate files:$missing"
  echo '  Create the two pairs as in docs/ENTRA-SETUP.md §6 and save them as secrets/entra_key,'
  echo '  secrets/entra_cert (the mail registration) and secrets/web_entra_key,'
  echo '  secrets/web_entra_cert (the web registration), then run ./install.sh again.'
  exit 2
fi
echo 'install.sh: ready. The database passwords take effect on the first start'
echo '  of an empty volume only; changing one later needs ALTER ROLE as well.'
echo
echo 'install.sh: a data volume made before the worker existed (M7) needs its database roles'
echo '  once, or migrate fails. Run this before docker compose up -d (safe to repeat):'
echo '    docker compose up -d --wait postgres'
echo '    docker compose exec -T postgres psql -X -U pgadmin -d postgres -v ON_ERROR_STOP=1 -f - <postgres/upgrade/m7-roles.sql'
