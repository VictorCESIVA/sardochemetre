#!/usr/bin/env bash
# Alias historique : lance l'application complète, sans mode gratuit ni jeu local.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '%s\n' "$1"; }

info "SardocheMètre — alias historique"
info "================================="
info ""
info "Ce script lance l'application complète : backend + frontend."
info "Il n'y a plus de mode gratuit ni de jeu de données local."
info ""
info "Les tweets viennent de la source configurée dans backend/.env"
info "(profile par défaut : les 5 derniers tweets de @Sardoche)."
info "Le scheduler tourne toutes les 5 minutes et analyse les nouveaux tweets."
info "Une clé OPENCODE_API_KEY est nécessaire pour l'IA."
info ""
info "Démarrage de start-all.sh…"
info ""

exec "$ROOT/start-all.sh"
