#!/usr/bin/env bash
# Vérifie l'installation : Node, dépendances, tests, lint et build.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

info() { printf '%s\n' "$1"; }
fail() { printf 'Échec : %s\n' "$1" >&2; exit 1; }

run_step() {
  local label="$1"
  shift
  info ""
  info "▶ ${label}"
  if "$@"; then
    info "  OK"
  else
    fail "${label}"
  fi
}

info "Vérification de l'installation SardocheMètre"
info "============================================="

# 1. Node et npm
info ""
info "▶ Node.js et npm"
command -v node >/dev/null 2>&1 || fail "Node.js n'est pas installé (version 20 ou plus requise)."
command -v npm >/dev/null 2>&1 || fail "npm n'est pas installé."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  fail "Node.js $(node --version) détecté ; la version 20 ou plus récente est requise."
fi
info "  Node.js $(node --version) — npm $(npm --version)"

# 2. Dépendances
info ""
info "▶ Dépendances"
[ -d "backend/node_modules" ] || fail "backend/node_modules absent. Lancez : npm install --prefix backend"
[ -d "frontend/node_modules" ] || fail "frontend/node_modules absent. Lancez : npm install --prefix frontend"

for path in \
  "backend/node_modules/express" \
  "backend/node_modules/better-sqlite3" \
  "backend/node_modules/node-cron" \
  "frontend/node_modules/react" \
  "frontend/node_modules/vite" \
  "frontend/node_modules/axios"; do
  [ -e "$path" ] || fail "dépendance manquante : ${path}. Relancez npm install."
done
info "  Dépendances backend et frontend présentes"

# 3. Tests backend
run_step "Tests backend" npm --prefix backend test

# 4. Tests frontend
run_step "Tests frontend" npm --prefix frontend test

# 5. Lint
run_step "Lint frontend" npm --prefix frontend run lint

# 6. Build
run_step "Build frontend" npm --prefix frontend run build

[ -d "frontend/dist" ] || fail "le build n'a pas produit frontend/dist."
info "  Build disponible dans frontend/dist/"

info ""
info "============================================="
info "Installation vérifiée : tests, lint et build OK."
info ""
info "Démarrage :"
info "  ./start-all.sh    # backend + frontend (vrais tweets + scheduler)"
info "  ./start-free.sh   # alias historique de start-all.sh"
info "  ./start-backend.sh # backend seul"
info ""
info "La source profile lit les 5 derniers tweets de @Sardoche."
info "Le scheduler tourne toutes les 5 minutes et analyse les nouveaux tweets."
info "L'IA nécessite une clé OpenCode côté backend (OPENCODE_API_KEY)."
