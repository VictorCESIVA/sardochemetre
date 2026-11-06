#!/usr/bin/env bash
# Démarre le backend puis le frontend, avec arrêt propre sur Ctrl+C.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

BACKEND_PORT="${PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_LOG="${TMPDIR:-/tmp}/sardochemetre-backend.log"
FRONTEND_LOG="${TMPDIR:-/tmp}/sardochemetre-frontend.log"
BACKEND_PID=""
FRONTEND_PID=""

info() { printf '%s\n' "$1"; }
fail() { printf 'Erreur : %s\n' "$1" >&2; exit 1; }

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  else
    (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
  fi
}

cleanup() {
  trap - INT TERM
  info ""
  info "Arrêt des serveurs..."
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    info "  Frontend arrêté"
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    info "  Backend arrêté"
  fi
  wait 2>/dev/null || true
}

on_signal() {
  cleanup
  exit 130
}

wait_for_url() {
  local url="$1" pid="$2" label="$3"
  local attempt=0

  while [ "$attempt" -lt 30 ]; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  info "Délai dépassé en attendant ${label}."
  return 1
}

info "SardocheMètre — démarrage complet"
info "==================================="

command -v node >/dev/null 2>&1 || fail "Node.js n'est pas installé (version 20 ou plus requise)."
command -v npm >/dev/null 2>&1 || fail "npm n'est pas installé."
command -v curl >/dev/null 2>&1 || fail "curl est requis pour vérifier le démarrage."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  fail "Node.js $(node --version) détecté ; la version 20 ou plus récente est requise."
fi

if port_in_use "$BACKEND_PORT"; then
  fail "le port ${BACKEND_PORT} est déjà utilisé. Arrêtez le processus ou changez PORT."
fi
if port_in_use "$FRONTEND_PORT"; then
  fail "le port ${FRONTEND_PORT} est déjà utilisé. Arrêtez le processus ou choisissez FRONTEND_PORT."
fi

if [ ! -d "backend/node_modules" ]; then
  info "Installation des dépendances backend..."
  npm --prefix backend install || fail "installation backend impossible."
fi

if [ ! -d "frontend/node_modules" ]; then
  info "Installation des dépendances frontend..."
  npm --prefix frontend install || fail "installation frontend impossible."
fi

trap on_signal INT TERM

info "Démarrage du backend sur le port ${BACKEND_PORT}..."
( cd backend && exec node server.js ) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

if ! wait_for_url "http://localhost:${BACKEND_PORT}/health" "$BACKEND_PID" "le backend"; then
  info "Le backend n'a pas répondu. Dernières lignes du journal :"
  tail -n 20 "$BACKEND_LOG" 2>/dev/null || true
  cleanup
  exit 1
fi
info "  Backend prêt : http://localhost:${BACKEND_PORT}"

info "Démarrage du frontend sur le port ${FRONTEND_PORT}..."
( cd frontend && exec env VITE_API_URL="http://localhost:${BACKEND_PORT}" npm run dev -- --port "$FRONTEND_PORT" ) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

if ! wait_for_url "http://localhost:${FRONTEND_PORT}/" "$FRONTEND_PID" "le frontend"; then
  info "Le frontend n'a pas répondu. Dernières lignes du journal :"
  tail -n 20 "$FRONTEND_LOG" 2>/dev/null || true
  cleanup
  exit 1
fi

info ""
info "Tout est prêt."
info "  Frontend : http://localhost:${FRONTEND_PORT}"
info "  Backend  : http://localhost:${BACKEND_PORT}"
info "  Santé    : http://localhost:${BACKEND_PORT}/health"
info ""
info "Journaux :"
info "  ${BACKEND_LOG}"
info "  ${FRONTEND_LOG}"
info ""
info "L'application démarre avec les vrais tweets de @Sardoche."
info "  Source    : profile (5 derniers tweets, backend/.env)"
info "  Scheduler : toutes les 5 minutes (CRON_SCHEDULE=*/5 * * * *)"
info ""
info "L'IA nécessite une clé OpenCode dans backend/.env (OPENCODE_API_KEY)."
info "Sans clé, le scheduler ne démarre pas et la réanalyse est désactivée ;"
info "les analyses déjà en base restent consultables."
info ""
info "Ctrl+C pour arrêter proprement."

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

info ""
info "Un des serveurs s'est arrêté."
cleanup
exit 1
