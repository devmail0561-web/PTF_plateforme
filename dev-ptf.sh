#!/usr/bin/env bash
# PTF — Lancement local complet (framework + service)
# Usage : bash dev-ptf.sh [start|stop|logs|status]
#
# Démarre :
#   - PostgreSQL 16 + Redis 7 (Docker)
#   - PTF Framework Backend   → http://localhost:4000/graphql
#   - PTF Service Backend     → http://localhost:4001/graphql
#   - PTF Service Frontend    → http://localhost:3001

set -euo pipefail

FRAMEWORK_DIR="$HOME/Documents/PTF_project"
SERVICE_DIR="$HOME/Documents/ptf_service"
PID_DIR="/tmp/ptf-dev"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${CYAN}→${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1" >&2; }

# ── ENV FILES ────────────────────────────────────────────────────────────────

setup_env() {
  if [ ! -f "$FRAMEWORK_DIR/backend/.env" ]; then
    cp "$FRAMEWORK_DIR/backend/.env.example" "$FRAMEWORK_DIR/backend/.env"
    # Adapter le DATABASE_URL pour le docker-compose du service (ports différents)
    sed -i 's|localhost:5432/ptf_dev|localhost:5433/ptf_dev|' "$FRAMEWORK_DIR/backend/.env"
    ok "Framework .env créé (port DB: 5433)"
  fi

  if [ ! -f "$SERVICE_DIR/backend/.env" ]; then
    cp "$SERVICE_DIR/backend/.env.example" "$SERVICE_DIR/backend/.env"
    sed -i 's|localhost:5432/ptf_service|localhost:5432/ptf_service|' "$SERVICE_DIR/backend/.env"
    sed -i 's|password@|ptf_secret@|' "$SERVICE_DIR/backend/.env"
    sed -i 's|postgres:|ptf:|' "$SERVICE_DIR/backend/.env"
    ok "Service backend .env créé"
  fi

  if [ ! -f "$SERVICE_DIR/frontend/.env.local" ]; then
    cp "$SERVICE_DIR/frontend/.env.local.example" "$SERVICE_DIR/frontend/.env.local"
    ok "Service frontend .env.local créé"
  fi
}

# ── DOCKER (postgres + redis) ────────────────────────────────────────────────

start_infra() {
  log "Démarrage PostgreSQL + Redis..."

  # Framework DB (port 5433 pour ne pas conflicte avec le service)
  if ! docker ps --format '{{.Names}}' | grep -q ptf-framework-db; then
    docker run -d --name ptf-framework-db \
      -e POSTGRES_USER=ptf \
      -e POSTGRES_PASSWORD=ptf \
      -e POSTGRES_DB=ptf_dev \
      -p 5433:5432 \
      --health-cmd="pg_isready -U ptf -d ptf_dev" \
      --health-interval=5s \
      postgres:16-alpine >/dev/null 2>&1 || true
    ok "PostgreSQL framework (port 5433)"
  else
    ok "PostgreSQL framework déjà lancé"
  fi

  # Service DB (port 5432)
  if ! docker ps --format '{{.Names}}' | grep -q ptf-service-db; then
    docker run -d --name ptf-service-db \
      -e POSTGRES_USER=ptf \
      -e POSTGRES_PASSWORD=ptf_secret \
      -e POSTGRES_DB=ptf_service \
      -p 5432:5432 \
      --health-cmd="pg_isready -U ptf -d ptf_service" \
      --health-interval=5s \
      postgres:16-alpine >/dev/null 2>&1 || true
    ok "PostgreSQL service (port 5432)"
  else
    ok "PostgreSQL service déjà lancé"
  fi

  # Redis (port 6379) — utilise le Redis local s'il répond, sinon lance Docker
  if redis-cli ping >/dev/null 2>&1; then
    ok "Redis local détecté (port 6379)"
  elif ! docker ps --format '{{.Names}}' | grep -q ptf-redis; then
    docker run -d --name ptf-redis \
      -p 6379:6379 \
      --health-cmd="redis-cli ping" \
      --health-interval=5s \
      redis:7-alpine >/dev/null 2>&1 || true
    ok "Redis Docker (port 6379)"
  else
    ok "Redis Docker déjà lancé"
  fi

  # Attendre que les DB soient prêtes
  log "Attente santé des conteneurs..."
  for i in $(seq 1 30); do
    local pg1 pg2 rd
    docker exec ptf-framework-db pg_isready -U ptf -d ptf_dev >/dev/null 2>&1 && pg1=1 || pg1=0
    docker exec ptf-service-db pg_isready -U ptf -d ptf_service >/dev/null 2>&1 && pg2=1 || pg2=0
    # Redis : check local d'abord, puis Docker
    (redis-cli ping >/dev/null 2>&1 || docker exec ptf-redis redis-cli ping >/dev/null 2>&1) && rd=1 || rd=0
    if [ "$pg1" = "1" ] && [ "$pg2" = "1" ] && [ "$rd" = "1" ]; then
      ok "Infra prête"
      return 0
    fi
    sleep 1
  done
  err "Timeout attente infra"
  return 1
}

# ── MIGRATIONS ───────────────────────────────────────────────────────────────

run_migrations() {
  log "Migrations Prisma..."

  cd "$FRAMEWORK_DIR/backend"
  npx prisma generate --schema=prisma/schema.prisma 2>/dev/null
  DATABASE_URL="postgresql://ptf:ptf@localhost:5433/ptf_dev" npx prisma migrate dev --name init --skip-generate 2>/dev/null || true
  ok "Framework DB migrée"

  cd "$SERVICE_DIR/backend"
  npx prisma generate --schema=prisma/schema.prisma 2>/dev/null
  DATABASE_URL="postgresql://ptf:ptf_secret@localhost:5432/ptf_service" npx prisma migrate dev --name init --skip-generate 2>/dev/null || true
  ok "Service DB migrée"
}

# ── SERVEURS ─────────────────────────────────────────────────────────────────

setup_cli() {
  log "Configuration CLI ptf → backend local..."
  cd "$FRAMEWORK_DIR/cli"

  # Rebuild si les sources sont plus récentes que le dist
  if [ "src/index.ts" -nt "dist/index.js" ] 2>/dev/null; then
    log "Rebuild CLI..."
    npx tsup 2>/dev/null
    ok "CLI rebuilt"
  fi

  # Pointer le CLI vers le backend local
  ptf config set ptfApiUrl http://localhost:4000 2>/dev/null || \
    npx tsx src/index.ts config set ptfApiUrl http://localhost:4000 2>/dev/null || true
  ok "CLI configuré → http://localhost:4000"
}

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log "Port $port occupé — libération..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    ok "Port $port libéré"
  fi
}

start_servers() {
  mkdir -p "$PID_DIR"

  free_port 4000
  log "Démarrage Framework Backend (port 4000)..."
  cd "$FRAMEWORK_DIR/backend"
  DATABASE_URL="postgresql://ptf:ptf@localhost:5433/ptf_dev" \
  REDIS_URL="redis://localhost:6379" \
  npx tsx watch src/server.ts > "$PID_DIR/framework-backend.log" 2>&1 &
  echo $! > "$PID_DIR/framework-backend.pid"
  ok "Framework Backend PID $(cat $PID_DIR/framework-backend.pid)"

  free_port 4001
  log "Démarrage Service Backend (port 4001)..."
  cd "$SERVICE_DIR/backend"
  DATABASE_URL="postgresql://ptf:ptf_secret@localhost:5432/ptf_service" \
  REDIS_URL="redis://localhost:6379" \
  PTF_NODE_URL="http://localhost:4000/graphql" \
  npx tsx watch src/server.ts > "$PID_DIR/service-backend.log" 2>&1 &
  echo $! > "$PID_DIR/service-backend.pid"
  ok "Service Backend PID $(cat $PID_DIR/service-backend.pid)"

  free_port 3001
  log "Démarrage Service Frontend (port 3001)..."
  cd "$SERVICE_DIR/frontend"
  # Purger le cache Next.js si le CSS compilé est absent ou corrompu
  if [ -d .next ] && ! find .next/static/css -name "*.css" -size +0 2>/dev/null | grep -q .; then
    log "Cache .next corrompu — purge..."
    rm -rf .next
    ok "Cache .next purgé"
  fi
  npx next dev -p 3001 > "$PID_DIR/service-frontend.log" 2>&1 &
  echo $! > "$PID_DIR/service-frontend.pid"
  ok "Service Frontend PID $(cat $PID_DIR/service-frontend.pid)"

  sleep 3
  echo ""
  echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  PTF Dev Environment — Running${NC}"
  echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BOLD}Frontend (navigateur)${NC}"
  echo -e "    → ${CYAN}http://localhost:3001${NC}"
  echo ""
  echo -e "  ${BOLD}CLI (terminal)${NC}"
  echo -e "    → ${CYAN}ptf tasks list${NC}"
  echo -e "    → ${CYAN}ptf wallet create${NC}"
  echo -e "    → ${CYAN}ptf auth login${NC}"
  echo ""
  echo -e "  ${BOLD}APIs GraphQL${NC}"
  echo -e "    Framework  ${CYAN}http://localhost:4000/graphql${NC}"
  echo -e "    Service    ${CYAN}http://localhost:4001/graphql${NC}"
  echo ""
  echo -e "  ${BOLD}Commandes${NC}"
  echo -e "    Logs   : ${CYAN}bash ~/Documents/dev-ptf.sh logs${NC}"
  echo -e "    Status : ${CYAN}bash ~/Documents/dev-ptf.sh status${NC}"
  echo -e "    Stop   : ${CYAN}bash ~/Documents/dev-ptf.sh stop${NC}"
  echo ""
}

# ── STOP ─────────────────────────────────────────────────────────────────────

kill_tree() {
  local pid=$1
  # Récupérer tous les enfants récursivement (descendance complète)
  local children
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  for child in $children; do
    kill_tree "$child"
  done
  kill -9 "$pid" 2>/dev/null || true
}

stop_all() {
  log "Arrêt des serveurs..."
  for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    name=$(basename "$pidfile" .pid)
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
      ok "Arrêté $name (PID $pid + enfants)"
    fi
    rm -f "$pidfile"
  done

  # Libérer tous les ports PTF (processus orphelins ou lancés manuellement)
  for port in 4000 4001 3001; do
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      for p in $pids; do
        kill_tree "$p"
      done
      ok "Port $port libéré (processus orphelins tués)"
    fi
  done

  rm -f "$PID_DIR"/*.pid

  log "Arrêt des conteneurs Docker..."
  docker stop ptf-framework-db ptf-service-db ptf-redis 2>/dev/null || true
  docker rm ptf-framework-db ptf-service-db ptf-redis 2>/dev/null || true
  ok "Infra arrêtée"
}

# ── STATUS ───────────────────────────────────────────────────────────────────

show_status() {
  echo -e "${BOLD}Conteneurs Docker :${NC}"
  docker ps --filter "name=ptf-" --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (aucun)"
  echo ""
  echo -e "${BOLD}Processus PTF :${NC}"
  for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || { echo "  (aucun)"; break; }
    pid=$(cat "$pidfile")
    name=$(basename "$pidfile" .pid)
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "  ${GREEN}●${NC} $name (PID $pid)"
    else
      echo -e "  ${RED}●${NC} $name (mort — PID $pid)"
    fi
  done
}

# ── LOGS ─────────────────────────────────────────────────────────────────────

show_logs() {
  tail -f "$PID_DIR"/*.log
}

# ── MAIN ─────────────────────────────────────────────────────────────────────

CMD="${1:-start}"

case "$CMD" in
  start)
    echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  PTF — Démarrage environnement local    ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
    echo ""
    setup_env
    start_infra
    run_migrations
    setup_cli
    start_servers
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    sleep 2
    exec "$0" start
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  *)
    echo "Usage: $0 [start|stop|restart|status|logs]"
    exit 1
    ;;
esac
