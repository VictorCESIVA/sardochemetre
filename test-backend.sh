#!/usr/bin/env bash
# Lance les tests backend, puis des smoke tests HTTP si un backend écoute déjà.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

API="${API_URL:-http://localhost:3001}"
FAILED=0

info() { printf '%s\n' "$1"; }
fail() { printf 'Échec : %s\n' "$1" >&2; FAILED=1; }

json_value() {
  local json="$1" expr="$2"
  node -e '
    const data = JSON.parse(process.argv[1]);
    const value = Function("data", "return (" + process.argv[2] + ")")(data);
    if (value === undefined || value === null || Number.isNaN(value)) process.exit(1);
    process.stdout.write(String(value));
  ' "$json" "$expr" 2>/dev/null
}

check_exact() {
  local label="$1" url="$2" expr="$3" expected="$4"
  local body value

  if ! body="$(curl -fsS --max-time 8 "$url")"; then
    fail "${label} : requête impossible (${url})"
    return
  fi
  if ! value="$(json_value "$body" "$expr")"; then
    fail "${label} : réponse JSON invalide ou champ absent"
    return
  fi
  if [ "$value" != "$expected" ]; then
    fail "${label} : attendu « ${expected} », obtenu « ${value} »"
    return
  fi
  info "  OK  ${label} : ${value}"
}

check_min() {
  local label="$1" url="$2" expr="$3" minimum="$4"
  local body value

  if ! body="$(curl -fsS --max-time 8 "$url")"; then
    fail "${label} : requête impossible (${url})"
    return
  fi
  if ! value="$(json_value "$body" "$expr")"; then
    fail "${label} : réponse JSON invalide ou champ absent"
    return
  fi
  if ! node -e 'process.exit(Number(process.argv[1]) >= Number(process.argv[2]) ? 0 : 1)' "$value" "$minimum"; then
    fail "${label} : valeur « ${value} » inférieure à ${minimum}"
    return
  fi
  info "  OK  ${label} : ${value}"
}

check_max() {
  local label="$1" url="$2" expr="$3" maximum="$4"
  local body value

  if ! body="$(curl -fsS --max-time 8 "$url")"; then
    fail "${label} : requête impossible (${url})"
    return
  fi
  if ! value="$(json_value "$body" "$expr")"; then
    fail "${label} : réponse JSON invalide ou champ absent"
    return
  fi
  if ! node -e 'process.exit(Number(process.argv[1]) <= Number(process.argv[2]) ? 0 : 1)' "$value" "$maximum"; then
    fail "${label} : valeur « ${value} » supérieure à ${maximum}"
    return
  fi
  info "  OK  ${label} : ${value}"
}

check_nonempty() {
  local label="$1" url="$2" expr="$3"
  local body value

  if ! body="$(curl -fsS --max-time 8 "$url")"; then
    fail "${label} : requête impossible (${url})"
    return
  fi
  if ! value="$(json_value "$body" "$expr")"; then
    fail "${label} : réponse JSON invalide ou champ absent"
    return
  fi
  if [ -z "$value" ] || [ "$value" = "null" ] || [ "$value" = "undefined" ]; then
    fail "${label} : valeur vide"
    return
  fi
  info "  OK  ${label} : ${value}"
}

# Extrait un mot réel du premier tweet, pour un smoke test de recherche
# qui reste valide quand les tweets de la base changent.
first_keyword() {
  node -e '
    const text = process.argv[1] || "";
    const stop = new Set([
      "dans", "pour", "avec", "cette", "cest", "c\u2019est", "les", "des",
      "une", "que", "qui", "sur", "pas", "plus", "mais", "est", "sont",
      "etre", "\u00eatre", "avoir", "faire", "tout", "tous", "comme", "nous",
      "vous", "ils", "elles", "elle", "son", "sa", "ses", "leur", "leurs",
      "aussi", "tres", "tr\u00e8s", "bien", "juste", "encore", "alors", "donc",
      "quand", "meme", "m\u00eame", "https", "grm_off"
    ]);
    const words = text
      .replace(/https?:\/\/\S+/g, " ")
      .match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9\u2019-]{3,}/g) || [];
    const word = words.find(
      (entry) =>
        !stop.has(entry.toLowerCase()) &&
        !/^\d+$/.test(entry) &&
        !entry.startsWith("@")
    );
    if (!word) process.exit(1);
    process.stdout.write(word);
  ' "$1" 2>/dev/null
}

search_total() {
  local term="$1" body
  if ! body="$(curl -fsS --max-time 8 --get --data-urlencode "q=${term}" "${API}/api/tweets/search")"; then
    return 1
  fi
  json_value "$body" 'data.total'
}

info "Tests backend SardocheMètre"
info "============================"
info ""

if ! npm --prefix backend test; then
  info ""
  fail "les tests backend ont échoué."
  exit 1
fi

info ""

if ! command -v curl >/dev/null 2>&1; then
  info "curl n'est pas installé : smoke tests ignorés."
  exit 0
fi

HEALTH="$(curl -fsS --max-time 3 "${API}/health" 2>/dev/null || true)"

if [ -z "$HEALTH" ]; then
  info "Aucun backend ne répond sur ${API}."
  info "Smoke tests ignorés. Démarrez-le avec ./start-backend.sh ou ./start-all.sh."
  exit 0
fi

info "Backend détecté sur ${API} — smoke tests"
info "-----------------------------------------"

check_exact "health" "${API}/health" 'data.status' "ok"
check_min "liste des tweets" "${API}/api/tweets?period=all&limit=1" 'data.tweets.length' 1
check_min "pagination" "${API}/api/tweets?period=all&limit=1" 'data.pagination.total' 1

LIST_BODY="$(curl -fsS --max-time 8 "${API}/api/tweets?period=all&limit=1" 2>/dev/null || true)"
TWEET_ID="$(json_value "$LIST_BODY" 'data.tweets[0] && data.tweets[0].id' || true)"
FIRST_CONTENT="$(json_value "$LIST_BODY" 'data.tweets[0] && data.tweets[0].content' || true)"

if [ -z "$TWEET_ID" ]; then
  fail "impossible de lire le premier tweet de la liste"
else
  info "  → premier tweet : ${TWEET_ID}"

  check_exact "détail du premier tweet" "${API}/api/tweets/${TWEET_ID}" 'data.tweet.id' "$TWEET_ID"
  check_min "contenu du détail" "${API}/api/tweets/${TWEET_ID}" 'data.tweet.content.length' 1
  check_exact "détail analysé" "${API}/api/tweets/${TWEET_ID}" 'data.tweet.analyzed' "true"
  check_nonempty "verdict du détail" "${API}/api/tweets/${TWEET_ID}" 'data.tweet.verdict'
  check_nonempty "source du détail" "${API}/api/tweets/${TWEET_ID}" 'data.tweet.source'
fi

SEARCH_TERM="perkz"
if SEARCH_TOTAL="$(search_total "$SEARCH_TERM")" && [ "$SEARCH_TOTAL" -ge 1 ]; then
  info "  OK  recherche « ${SEARCH_TERM} » : ${SEARCH_TOTAL}"
else
  SEARCH_TERM="$(first_keyword "$FIRST_CONTENT" || true)"

  if [ -z "$SEARCH_TERM" ]; then
    fail "recherche : « perkz » sans résultat et aucun mot-clé de repli"
  elif SEARCH_TOTAL="$(search_total "$SEARCH_TERM")" && [ "$SEARCH_TOTAL" -ge 1 ]; then
    info "  OK  recherche « ${SEARCH_TERM} » (repli) : ${SEARCH_TOTAL}"
  else
    fail "recherche « ${SEARCH_TERM} » : aucun résultat"
  fi
fi

check_nonempty "profil (username)" "${API}/api/profile" 'data.profile.username'
check_min "statistiques (total analysé)" "${API}/api/tweets/stats?period=all" 'data.totalAnalyzed' 1
check_min "statistiques (score moyen)" "${API}/api/tweets/stats?period=all" 'data.avgScore' 0
check_max "statistiques (score moyen borné)" "${API}/api/tweets/stats?period=all" 'data.avgScore' 100
check_min "bullshitmètre (score)" "${API}/api/tweets/bullshitmetre?period=all" 'data.globalScore' 0
check_max "bullshitmètre (score borné)" "${API}/api/tweets/bullshitmetre?period=all" 'data.globalScore' 100
check_min "bullshitmètre (échantillon)" "${API}/api/tweets/bullshitmetre?period=all" 'data.sampleSize' 1

info ""
if [ "$FAILED" -ne 0 ]; then
  info "Des smoke tests ont échoué."
  exit 1
fi

info "Tests backend et smoke tests terminés avec succès."
