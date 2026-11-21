#!/usr/bin/env bash
# RXJ installer: RXJ on your own Linux server in one command.
#
#   curl -fsSL https://<rxj app>/install.sh | sudo bash -s -- --domain rxj.example.com --email you@example.com
#
# A managed private server adds --platform <rxj app> --token rxjms_... (the
# command in Settings -> Private server). The server then reports to RXJ
# every 15 minutes: its domain, version, container states, disk use and last
# backup. Nothing else: no workflows, credentials or data.
#
# What it does (docs/SELF_HOSTING.md has the same steps by hand):
#   1. installs Docker and git if they are missing
#   2. downloads RXJ to /opt/rxj and writes self-host/.env with new secrets
#   3. starts RXJ with Docker Compose (HTTPS through Caddy)
#   4. adds systemd timers: a heartbeat every 15 minutes, a database backup
#      every night (kept 14 days in /opt/rxj/self-host/backups) and an
#      update every week (self-host/rxj-agent.sh)
#
# Running it again is safe: an existing .env and its secrets are kept.

set -euo pipefail

REPO_URL="https://github.com/rjumair711/n8n_clone.git"
BRANCH="main"
INSTALL_DIR="/opt/rxj"
DOMAIN=""
ADMIN_EMAIL=""
PLATFORM_URL=""
TOKEN=""
FORCE="no"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWarning: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: install.sh [options]
  --domain <name>      The domain RXJ will answer on, e.g. rxj.example.com
  --email <address>    The admin's email (ADMIN_EMAILS)
  --platform <url>     The RXJ app a managed server reports to
  --token <token>      The install token of a managed server (rxjms_...)
  --dir <path>         Where to install (default /opt/rxj)
  --branch <name>      The branch of RXJ to install (default main)
  --force              Install on a server with less than 2 GB of memory
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --platform) PLATFORM_URL="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --force) FORCE="yes"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done

DOMAIN_RE='^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'

# Questions are read from the terminal: with curl | bash, stdin is the script
ask() {
  local prompt="$1" answer=""
  if [ -r /dev/tty ]; then
    read -r -p "$prompt" answer </dev/tty || true
  fi
  printf '%s' "$answer"
}

# --- Checks ------------------------------------------------------------

[ "$(id -u)" -eq 0 ] || die "Run it as root: curl -fsSL ... | sudo bash -s -- ..."
[ "$(uname -s)" = "Linux" ] || die "RXJ installs on Linux."
[ "$(uname -m)" = "x86_64" ] || die "The RXJ image is built for x86-64 (amd64); this server is $(uname -m)."
command -v curl >/dev/null 2>&1 || die "curl is needed."

MEM_MB=$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)
if [ "$MEM_MB" -lt 1900 ] && [ "$FORCE" != "yes" ]; then
  die "RXJ needs at least 2 GB of memory; this server has ${MEM_MB} MB. Add --force to try anyway."
elif [ "$MEM_MB" -lt 3800 ]; then
  warn "This server has ${MEM_MB} MB of memory. 4 GB is comfortable."
fi

if [ -n "$TOKEN" ] || [ -n "$PLATFORM_URL" ]; then
  [ -n "$TOKEN" ] && [ -n "$PLATFORM_URL" ] || die "--token and --platform go together."
  printf '%s' "$TOKEN" | grep -Eq '^rxjms_[0-9a-f]{64}$' || die "That is not an RXJ install token."
  printf '%s' "$PLATFORM_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' || die "--platform must be an https:// address."
  PLATFORM_URL="${PLATFORM_URL%/}"
fi

# The managed server's token is checked before anything is installed
SERVER_IP=""
if [ -n "$TOKEN" ]; then
  say "Checking the install token with $PLATFORM_URL"
  RESPONSE_FILE=$(mktemp)
  STATUS=$(curl -sS -m 30 -o "$RESPONSE_FILE" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data '{"event":"install-start"}' "$PLATFORM_URL/api/managed-servers/heartbeat" || echo "000")
  RESPONSE=$(cat "$RESPONSE_FILE"); rm -f "$RESPONSE_FILE"
  case "$STATUS" in
    200) ;;
    401) die "RXJ does not know this install token. Make a new install command in Settings -> Private server." ;;
    000) die "Could not reach $PLATFORM_URL. Check the server's internet connection." ;;
    *) die "RXJ answered $STATUS: $RESPONSE" ;;
  esac
  printf '%s' "$RESPONSE" | grep -q '"subscriptionActive":true' \
    || die "The subscription of this server has ended. See Settings -> Private server."
  SERVER_IP=$(printf '%s' "$RESPONSE" | sed -n 's/.*"ip":"\([0-9a-fA-F:.]*\)".*/\1/p')
fi

# --- Domain and admin --------------------------------------------------

EXISTING_ENV="$INSTALL_DIR/self-host/.env"
if [ -z "$DOMAIN" ] && [ -f "$EXISTING_ENV" ]; then
  DOMAIN=$(sed -n 's/^RXJ_DOMAIN=//p' "$EXISTING_ENV" | head -n 1)
fi
[ -n "$DOMAIN" ] || DOMAIN=$(ask "Domain for RXJ (e.g. rxj.example.com): ")
DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')
printf '%s' "$DOMAIN" | grep -Eq "$DOMAIN_RE" || die "Give a domain such as rxj.example.com (--domain)."

if [ ! -f "$EXISTING_ENV" ]; then
  [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL=$(ask "Admin email (signs up first, manages templates): ")
  printf '%s' "$ADMIN_EMAIL" | grep -Eq "$EMAIL_RE" || die "Give the admin's email address (--email)."
fi

# --- Packages -----------------------------------------------------------

install_package() {
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q "$@"
  else
    die "Install $* by hand, then run this again."
  fi
}

command -v git >/dev/null 2>&1 || { say "Installing git"; install_package git; }
command -v openssl >/dev/null 2>&1 || { say "Installing openssl"; install_package openssl; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker is installed without the Compose plugin. Install docker-compose-plugin, then run this again."
systemctl enable --now docker >/dev/null 2>&1 || true

# --- DNS ----------------------------------------------------------------

DOMAIN_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)
if [ -z "$DOMAIN_IP" ]; then
  warn "$DOMAIN does not resolve yet. Add a DNS A record for it with this server's IP address; HTTPS starts working once it does."
elif [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
  warn "$DOMAIN points at $DOMAIN_IP, but this server's address is $SERVER_IP. HTTPS will not work until the DNS A record is changed."
fi

# --- Download -----------------------------------------------------------

if [ -d "$INSTALL_DIR/.git" ]; then
  say "Updating RXJ in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only -q || warn "Could not update the files in $INSTALL_DIR (local changes?). Going on with what is there."
else
  say "Downloading RXJ to $INSTALL_DIR"
  [ ! -e "$INSTALL_DIR" ] || [ -z "$(ls -A "$INSTALL_DIR")" ] || die "$INSTALL_DIR exists and is not an RXJ download. Remove it or use --dir."
  git clone -q --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

SELF_HOST="$INSTALL_DIR/self-host"
cd "$SELF_HOST"

# --- Settings ------------------------------------------------------------

secret() { openssl rand -hex 32; }

set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^$key=" "$file"; then
    sed -i "s|^$key=.*|$key=$value|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

if [ -f .env ]; then
  say "Keeping the settings in $SELF_HOST/.env"
  set_env RXJ_DOMAIN "$DOMAIN" .env
else
  say "Writing $SELF_HOST/.env with new secrets"
  umask 077
  cp env.example .env
  set_env RXJ_DOMAIN "$DOMAIN" .env
  set_env ADMIN_EMAILS "$ADMIN_EMAIL" .env
  for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET ENCRYPTION_KEY INNGEST_SIGNING_KEY INNGEST_EVENT_KEY; do
    set_env "$key" "$(secret)" .env
  done
  umask 022
fi
chmod 600 .env

# The agent's own settings: not in .env, so the app never sees the token
if [ -n "$TOKEN" ]; then
  umask 077
  printf 'RXJ_PLATFORM_URL=%s\nRXJ_MANAGED_TOKEN=%s\n' "$PLATFORM_URL" "$TOKEN" >.env.agent
  umask 022
  chmod 600 .env.agent
fi

# --- Start --------------------------------------------------------------

say "Downloading the images and starting RXJ (a few minutes the first time)"
docker compose pull -q
docker compose up -d

say "Waiting for RXJ to start"
READY="no"
for _ in $(seq 1 60); do
  # Read whole, not piped to grep -q: with pipefail an early grep exit
  # would make docker fail the test
  LOGS=$(docker compose logs app 2>/dev/null || true)
  case "$LOGS" in *Ready*) READY="yes"; break ;; esac
  sleep 5
done
[ "$READY" = "yes" ] || warn "RXJ has not said it is ready after 5 minutes. See: cd $SELF_HOST && docker compose logs app"

# --- Timers ---------------------------------------------------------------

chmod +x "$SELF_HOST/rxj-agent.sh"

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  say "Adding the heartbeat, backup and update timers"

  unit() {
    local name="$1" command="$2" schedule="$3"
    cat >"/etc/systemd/system/rxj-$name.service" <<UNIT
[Unit]
Description=RXJ $name
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$SELF_HOST/rxj-agent.sh $command
UNIT
    cat >"/etc/systemd/system/rxj-$name.timer" <<UNIT
[Unit]
Description=RXJ $name

[Timer]
$schedule
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  }

  unit heartbeat heartbeat "OnBootSec=2min
OnUnitActiveSec=15min
RandomizedDelaySec=60"
  unit backup backup "OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=30min"
  # Spread over Sunday morning, so a bad release does not reach every
  # server in the same minute
  unit update update "OnCalendar=Sun *-*-* 04:00:00
RandomizedDelaySec=3h"

  systemctl daemon-reload
  systemctl enable --now rxj-heartbeat.timer rxj-backup.timer rxj-update.timer >/dev/null
else
  warn "No systemd: add the heartbeat, backup and update to cron by hand (see $SELF_HOST/rxj-agent.sh)."
fi

if [ -n "$TOKEN" ]; then
  "$SELF_HOST/rxj-agent.sh" installed || warn "Could not report the install to RXJ. The next heartbeat will try again."
fi

cat <<DONE

RXJ is installed.

  Open:     https://$DOMAIN  (the first HTTPS certificate can take a minute)
  Sign up:  with ${ADMIN_EMAIL:-the address in ADMIN_EMAILS} to be the admin
  Files:    $SELF_HOST
  Backups:  $SELF_HOST/backups (every night, kept 14 days)

Keep a copy of $SELF_HOST/.env somewhere other than this server.
Its ENCRYPTION_KEY is needed to read saved credentials again.
DONE
