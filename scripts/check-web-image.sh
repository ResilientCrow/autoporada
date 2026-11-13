#!/bin/sh
# Boots the web image the way production runs it (read-only root, uid 65532,
# no capabilities, configuration and secrets from files) with a throwaway
# certificate, then checks what one page answers. Nothing is contacted:
# Entra and the database are reached only on first use.
#   scripts/check-web-image.sh autoporada-web:<version>
set -eu

image=${1:?usage: check-web-image.sh <image>}
name="autoporada-web-check-$$"
work=$(mktemp -d)
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

fail() {
  echo "check-web-image: $1" >&2
  docker logs "$name" >&2 2>&1 || true
  exit 1
}

# The command of docs/ENTRA-SETUP.md §6, for one day.
openssl req -x509 -newkey rsa:3072 -sha256 -days 1 -nodes \
  -keyout "$work/entra_key" -out "$work/entra_cert" -subj '/CN=autoporada-check' 2>/dev/null
openssl rand -base64 32 >"$work/server_actions_key"
# Throwaway files; the container's user must be able to read them.
chmod 0755 "$work"
chmod 0444 "$work"/*

tenant=00000000-0000-4000-8000-000000000001
docker run -d --name "$name" \
  --read-only --user 65532:65532 --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp --tmpfs /app/.next/cache \
  --publish 127.0.0.1::3000 \
  --volume "$work:/run/secrets:ro" \
  --env APP_ENV=production \
  --env APP_ORIGIN=https://autoporada.example \
  --env DATABASE_URL=postgres://nobody:nothing@127.0.0.1:9/none \
  --env OIDC_ISSUER="https://login.microsoftonline.com/$tenant/v2.0" \
  --env OIDC_TENANT_ID="$tenant" \
  --env OIDC_CLIENT_ID=autoporada-check \
  --env OIDC_CLIENT_KEY_FILE=/run/secrets/entra_key \
  --env OIDC_CLIENT_CERT_FILE=/run/secrets/entra_cert \
  --env NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_FILE=/run/secrets/server_actions_key \
  --env MAIL_TRANSPORT=graph \
  --env MAIL_FROM=autoporada@example.org \
  --env GOTENBERG_URL=http://gotenberg:3000 \
  "$image" >/dev/null

port=$(docker port "$name" 3000/tcp | head -n 1 | sed 's/.*://')
url="http://127.0.0.1:$port/"
i=0
until curl -fsS -o /dev/null "$url" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || fail "no answer from $url"
  [ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ] || fail 'the server exited'
  sleep 1
done

headers=$(curl -sS -D - -o /dev/null "$url" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
expect() {
  printf '%s\n' "$headers" | grep -q "$1" || fail "missing: $1"
}
expect '^http/1.1 200'
expect "^content-security-policy: default-src 'self'; script-src 'self' 'nonce-"
expect '^x-content-type-options: nosniff$'
expect '^x-frame-options: deny$'
expect '^cache-control: .*no-store'
if printf '%s\n' "$headers" | grep -q '^x-powered-by'; then fail 'x-powered-by is sent'; fi

# `/` is a page built by hand: check the client bundle, and Next's own rendering through the 404.
curl -fsS -o /dev/null "${url}arch/app.js" || fail 'no client bundle at /arch/app.js'
missing=$(curl -sS -w '\n%{http_code}' "${url}klasicke")
[ "$(printf '%s\n' "$missing" | tail -n 1)" = 404 ] || fail '/klasicke does not answer 404'
printf '%s\n' "$missing" | grep -q 'id="obsah"' || fail 'the 404 page did not render'
if docker logs "$name" 2>&1 | grep -q '"level":"\(error\|fatal\)"'; then fail 'the server logged an error'; fi
echo "check-web-image: $image answers $url as production would"
