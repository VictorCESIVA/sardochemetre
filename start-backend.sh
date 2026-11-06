#!/usr/bin/env bash
# Démarre uniquement le backend SardocheMètre, au premier plan.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/backend" || exit 1

PORT="${PORT:-3001}"

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

info "SardocheMètre — backend"
info "========================"

command -v node >/dev/null 2>&1 || fail "Node.js n'est pas installé (version 20 ou plus requise)."
command -v npm >/dev/null 2>&1 || fail "npm n'est pas installé."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  fail "Node.js $(node --version) détecté ; la version 20 ou plus récente est requise."
fi

if port_in_use "$PORT"; then
  info "Le port ${PORT} est déjà utilisé par un autre processus."
  if command -v lsof >/dev/null 2>&1; then
    info "Processus concerné(s) :"
    lsof -Pi :"$PORT" -sTCP:LISTEN || true
  fi
  fail "arrêtez le processus qui écoute sur ${PORT}, ou définissez PORT avec une autre valeur."
fi

if [ ! -d node_modules ]; then
  info "Installation des dépendances backend..."
  npm install || fail "installation impossible."
fi

info "Démarrage sur http://localhost:${PORT}"
info "Source de tweets : TWITTER_SOURCE (profile par défaut dans backend/.env)."
info "Scheduler : CRON_SCHEDULE=*/5 * * * * si DEMO_MODE=false et clé IA présente."
info "IA : OpenCode / deepseek-v4.1-flash via OPENCODE_API_KEY."
info "Sans clé, les tweets déjà analysés restent consultables."
info "Ctrl+C pour arrêter."
info ""

exec node server.js
