#!/usr/bin/env bash
# Installs or upgrades ai-ops-assistant on this server. Safe to run again after every change to .env.
#   1. starts the containers chosen in COMPOSE_PROFILES
#   2. creates or upgrades the database tables
#   3. builds the n8n credentials and workflows from .env, imports and publishes them
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (docker compose)."

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  die "Created .env from .env.example. Fill in the empty values (report address, SMTP), then run ./install.sh again."
fi
chmod 600 .env

# Generate missing passwords once. They are written to .env and never printed.
gen() { openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
for key in POSTGRES_PASSWORD GRAFANA_ADMIN_PASSWORD; do
  if ! grep -qE "^${key}=.+" .env; then
    if grep -qE "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=$(gen)|" .env; else echo "${key}=$(gen)" >> .env; fi
    echo "generated ${key} in .env"
  fi
done

# Read single values from .env (not "source": values may contain spaces).
env_get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true; }
for key in ALERT_EMAIL_TO SMTP_HOST SMTP_USER SMTP_PASSWORD; do
  [ -n "$(env_get "$key")" ] || die "${key} is empty in .env."
done
N8N="$(env_get N8N_CONTAINER)"; N8N="${N8N:-ai-ops-n8n}"
PROFILES="$(env_get COMPOSE_PROFILES)"

say "Starting containers (profiles: ${PROFILES:-none})"
docker compose up -d

say "Waiting for the database"
pg="$(docker compose ps -q postgres)"
for _ in $(seq 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$pg")" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$pg")" = healthy ] || die "The database did not start. See: docker compose logs postgres"
docker compose exec -T postgres psql -q -v ON_ERROR_STOP=1 -U ops -d ops -p 5433 -h 127.0.0.1 < db/init.sql 2>&1 | grep -v NOTICE || true
echo "tables ready"

say "Waiting for n8n (container ${N8N})"
[ "$(docker inspect -f '{{.State.Running}}' "$N8N" 2>/dev/null)" = true ] \
  || die "n8n container '${N8N}' is not running. Add n8n to COMPOSE_PROFILES, or set N8N_CONTAINER to your n8n container."
for _ in $(seq 60); do curl -fs -o /dev/null http://127.0.0.1:5678/healthz && break; sleep 2; done
curl -fs -o /dev/null http://127.0.0.1:5678/healthz || die "n8n does not answer on 127.0.0.1:5678."

# The rendered files contain the SMTP and database passwords: remove them from the container in any case.
cleanup() { docker exec "$N8N" rm -rf /tmp/ai-ops 2>/dev/null || true; }
trap cleanup EXIT
n8n_cli() { docker exec -e N8N_RUNNERS_BROKER_PORT=5690 "$N8N" n8n "$@" 2>&1 | grep -E "Successfully|rror" || true; }

say "Building the workflows from .env"
cleanup
docker exec "$N8N" mkdir -p /tmp/ai-ops/in /tmp/ai-ops/out
docker cp n8n/app-watch.json "$N8N":/tmp/ai-ops/in/app-watch.json >/dev/null
docker cp n8n/alert-triage.json "$N8N":/tmp/ai-ops/in/alert-triage.json >/dev/null
docker cp scripts/render.js "$N8N":/tmp/ai-ops/render.js >/dev/null
docker exec --env-file .env "$N8N" node /tmp/ai-ops/render.js /tmp/ai-ops/in /tmp/ai-ops/out

say "Importing into n8n"
n8n_cli import:credentials --input=/tmp/ai-ops/out/credentials.json
n8n_cli import:workflow --input=/tmp/ai-ops/out/app-watch.json
workflows=(aiOpsAppWatch)
if [[ ",${PROFILES}," == *",metrics,"* ]]; then
  n8n_cli import:workflow --input=/tmp/ai-ops/out/alert-triage.json
  workflows+=(aiOpsAlertTriage)
fi
cleanup

say "Publishing"
for id in "${workflows[@]}"; do n8n_cli publish:workflow --id="$id"; done
docker restart "$N8N" >/dev/null
for _ in $(seq 60); do curl -fs -o /dev/null http://127.0.0.1:5678/healthz && break; sleep 2; done

say "Done"
echo "Watching every Docker Compose app on this server except: $(env_get IGNORE_APPS)"
echo "Reports go to $(env_get ALERT_EMAIL_TO). First scan within $(env_get SCAN_EVERY_MINUTES) minute(s)."
echo "n8n only listens on this machine. From your computer: ssh -L 5678:127.0.0.1:5678 <server>, then open http://localhost:5678"
