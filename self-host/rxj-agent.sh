#!/usr/bin/env bash
# Looks after an RXJ server. public/install.sh runs it from systemd timers:
#
#   rxj-agent.sh heartbeat   every 15 minutes: tells RXJ the server is up
#   rxj-agent.sh backup      every night: a database dump in ./backups
#   rxj-agent.sh update      every week: new RXJ files and images
#   rxj-agent.sh installed   once, at the end of the install
#
# The heartbeat only runs on a managed private server (.env.agent holds its
# install token). It sends the domain, version, container states, disk use
# and the time of the last backup. Never workflows, credentials or data.
#
# Pause every managed server's updates from the RXJ app with
# MANAGED_SERVER_UPDATES_PAUSED=true; one server's with
# RXJ_AUTO_UPDATE=false in its .env.agent.

set -euo pipefail

SELF_HOST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SELF_HOST")"
BACKUPS="$SELF_HOST/backups"
KEEP_DAYS=14
cd "$SELF_HOST"

RXJ_PLATFORM_URL=""
RXJ_MANAGED_TOKEN=""
RXJ_AUTO_UPDATE="true"
if [ -f .env.agent ]; then
  # Plain KEY=value lines, read without running them
  while IFS='=' read -r key value; do
    case "$key" in
      RXJ_PLATFORM_URL) RXJ_PLATFORM_URL="$value" ;;
      RXJ_MANAGED_TOKEN) RXJ_MANAGED_TOKEN="$value" ;;
      RXJ_AUTO_UPDATE) RXJ_AUTO_UPDATE="$value" ;;
    esac
  done <.env.agent
fi

log() { printf '[rxj-agent] %s\n' "$*"; }

# Only letters, digits and . _ - : + stay, so a value cannot break the JSON
clean() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._:+-'; }

domain() { clean "$(sed -n 's/^RXJ_DOMAIN=//p' .env 2>/dev/null | head -n 1)"; }

version() {
  local commit image container
  commit=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
  container=$(docker compose ps -q app 2>/dev/null | head -n 1 || true)
  image=""
  if [ -n "$container" ]; then
    image=$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null | sed 's/^sha256://' | cut -c1-12 || true)
  fi
  clean "$commit${image:++$image}"
}

containers_json() {
  local first="yes" service state
  printf '['
  while read -r service state; do
    [ -n "$service" ] || continue
    service=$(clean "$service" | tr 'A-Z' 'a-z')
    state=$(printf '%s' "$state" | tr -cd 'a-z')
    [ -n "$service" ] && [ -n "$state" ] || continue
    [ "$first" = "yes" ] || printf ','
    printf '{"name":"%s","state":"%s"}' "$service" "$state"
    first="no"
  done < <(docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null || true)
  printf ']'
}

last_backup() {
  local newest
  newest=$(ls -1t "$BACKUPS"/rxj-*.sql.gz 2>/dev/null | head -n 1 || true)
  [ -n "$newest" ] && date -u -r "$newest" +%Y-%m-%dT%H:%M:%SZ
  return 0
}

disk_used() { df -P "$ROOT" | awk 'NR == 2 { gsub("%", "", $5); print $5 }'; }

# Sends a heartbeat and prints RXJ's answer. Without a token: nothing.
report() {
  local event="$1"
  [ -n "$RXJ_MANAGED_TOKEN" ] && [ -n "$RXJ_PLATFORM_URL" ] || return 0

  local body backup disk name
  name=$(domain)
  backup=$(last_backup)
  disk=$(disk_used || true)
  body="{\"event\":\"$event\",\"version\":\"$(version)\",\"containers\":$(containers_json)"
  [ -z "$name" ] || body="$body,\"domain\":\"$name\""
  [ -z "$backup" ] || body="$body,\"lastBackupAt\":\"$backup\""
  if printf '%s' "$disk" | grep -Eq '^[0-9]{1,3}$'; then
    body="$body,\"diskUsedPercent\":$disk"
  fi
  body="$body}"

  curl -fsS -m 30 -X POST \
    -H "Authorization: Bearer $RXJ_MANAGED_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$body" \
    "$RXJ_PLATFORM_URL/api/managed-servers/heartbeat"
}

backup() {
  mkdir -p "$BACKUPS"
  chmod 700 "$BACKUPS"
  local file
  file="$BACKUPS/rxj-$(date -u +%Y-%m-%d).sql.gz"

  log "Backing up the database to $file"
  docker compose exec -T postgres pg_dump -U rxj rxj | gzip >"$file.partial"
  mv "$file.partial" "$file"
  chmod 600 "$file"
  # The secrets the dump needs (ENCRYPTION_KEY) next to it
  install -m 600 .env "$BACKUPS/env.backup"

  find "$BACKUPS" -name 'rxj-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  report heartbeat >/dev/null || log "Could not report to RXJ"
}

update() {
  if [ "$RXJ_AUTO_UPDATE" = "false" ]; then
    log "Updates are off for this server (RXJ_AUTO_UPDATE=false)"
    return 0
  fi

  local answer
  if answer=$(report heartbeat 2>/dev/null) && printf '%s' "$answer" | grep -q '"updatesPaused":true'; then
    log "RXJ has paused updates; trying again next week"
    return 0
  fi

  log "Updating RXJ"
  git -C "$ROOT" pull --ff-only -q || log "Could not update the files (local changes?); updating the images only"
  docker compose pull -q
  # The app applies new database migrations when it starts
  docker compose up -d
  docker image prune -f >/dev/null || true
  report heartbeat >/dev/null || log "Could not report to RXJ"
}

case "${1:-}" in
  heartbeat) report heartbeat >/dev/null ;;
  installed) report installed >/dev/null ;;
  backup) backup ;;
  update) update ;;
  *)
    echo "Usage: rxj-agent.sh heartbeat|backup|update|installed" >&2
    exit 2
    ;;
esac
