# SardocheMètre — contexte projet

## Vision

**SardocheMètre** est un site satirique qui analyse les tweets de Sardoche et leur
attribue un score de bullshit de 0 à 100, avec un verdict, un raisonnement, des
fact-checks et une punchline. Le ton est mordant mais il ne s'agit pas de harceler :
on commente des tweets publics, pas la personne.

Le projet est pédagogique et assumé comme imparfait : l'IA peut se tromper, et les
analyses ne constituent pas un fact-checking professionnel.

## Stack actuelle

- **Frontend** : React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, Vitest 4.
- **Backend** : Node.js ≥ 20, Express 4, `better-sqlite3` 12 (défaut), `pg` 8
  (PostgreSQL optionnel), `node-cron` 4, SDK Anthropic, Axios.
- **IA** : OpenCode via un proxy backend, modèle `deepseek-v4.1-flash` par défaut.
  Anthropic reste disponible via `AI_PROVIDER=anthropic`; un provider mock sert aux
  tests.
- **OpenCode** : API compatible OpenAI, clé `oc_sk_...` côté backend uniquement.
  Offres `payg` et `go` ; l'offre Go ajoute `x-opencode-session`.
- **Twitter/X** : source `profile` par défaut (page publique `x.com/Sardoche`,
  jusqu'à 5 tweets récents, sans token), fallback `syndication`, API X v2 officielle
  avec `TWITTER_BEARER_TOKEN`, et `mock` pour les tests.
- **Scheduler** : `node-cron`, `*/5 * * * *` en configuration projet, collecte et
  analyse des nouveaux tweets.
- **Dossier élection 2027** : détection lexicale des tweets politiques
  (`politicsService.js`, dictionnaire calibré sur la présidentielle 2027),
  mentions de personnalités avec ton (soutien/attaque/neutre) produites par
  l'IA, route `GET /api/tweets/election` et page frontend `/election`.
- **Déploiement** : frontend statique (Vercel/Netlify) + backend
  (Railway/Render) avec SQLite sur disque persistant ou PostgreSQL.

## Application unique

Il n'y a plus de sélecteur de source ni de second jeu de données. Le frontend appelle
toujours le backend :

| Élément | Source |
| --- | --- |
| Tweets | Table `tweets` (SQLite ou PostgreSQL), alimentée par le scheduler |
| Profil | Table `profile` (ligne unique), exposée par `GET /api/profile` |
| Analyses | Table `analyses`, produites par OpenCode |
| Statistiques | Requêtes backend sur les tweets analysés |

`DEMO_MODE` ne choisit pas la base : `DB_CLIENT=sqlite|postgres`, avec détection
automatique d'une `DATABASE_URL` PostgreSQL si `DB_CLIENT` est absent. `DEMO_MODE`
réactive seulement le seed mock et désactive le scheduler ; la configuration normale
utilise `DEMO_MODE=false`.

## Arborescence

```text
backend/
  app.js                 # factory Express testable
  server.js              # démarrage et arrêt propre
  scheduler.js           # cron de collecte et d'analyse
  sync-tweets.js         # import manuel (--source, --limit, --analyze)
  db/
    config.js            # choix SQLite/PostgreSQL
    schema.js            # schéma, colonnes d'embed, migrations douces
    sqlite.js            # repository SQLite (tweets, profil, analyses)
    postgres.js          # pool PostgreSQL
    schedulerLeaseStore.js # bail du scheduler (SQLite/PostgreSQL)
    rateLimitStore.js    # compteur de débit partagé
    periods.js           # day/week/month/all
    mock-data.js         # chargement du mock de test
  routes/                # routes tweets + routes IA
  middleware/            # rate limiting, authentification des analyses
  services/
    twitterService.js    # sources profile, syndication, x, mock
    opencodeService.js   # appels OpenCode et normalisation
    aiService.js         # sélection du provider
    politicsService.js   # détection électorale et mentions (dictionnaire 2027)
    schedulerLock.js     # bail renouvelable du scheduler
    claudeService.js     # prompt, parsing, provider Anthropic historique
  migrations/            # migrations PostgreSQL (source, profil, embed, bail, élection)
  mock/tweets.json       # tweets de test
  test/                  # tests node:test

frontend/src/
  components/            # TweetEmbed, TweetAvatar, VerifiedBadge, TweetMedia,
                         # QuotedTweet, TweetText, BullshitMètre, cartes, états…
  lib/                   # normalisation, profil, formatage, calculs
  pages/                 # Home, Election, TweetDetail
  services/              # client API (tweets, profil, IA, dossier élection)

docs/                    # documentation de référence
docs/screenshots/        # captures de l'application
archive/                 # ancien squelette de projet
```

## Commandes

```bash
# Démarrage
./start-all.sh           # backend + frontend
./start-free.sh          # alias historique : lance la même application complète
./start-backend.sh       # backend seul

# Backend
cd backend
npm start                # serveur
npm run dev              # serveur avec rechargement
npm test                 # 131 tests
npm run sync             # collecte les tweets de la source configurée
npm run sync:analyze     # collecte + analyse les nouveaux tweets
npm run seed             # données mock (tests uniquement)
npm run init-db          # schéma SQLite
npm run migrate          # migrations PostgreSQL

# Frontend
cd frontend
npm run dev
npm run build
npm run preview
npm run lint
npm test                 # 48 tests

# Vérification complète
./test-install.sh
./test-backend.sh        # tests + smoke tests dynamiques si le backend tourne
```

## API

| Méthode | Route | Réponse |
| --- | --- | --- |
| GET | `/health` | `{status, timestamp, mode, database, ai}` |
| GET | `/api/profile` | `{profile}` ou 404 |
| GET | `/api/tweets?page=&limit=&period=&q=&theme=politics` | `{tweets, pagination, period, query, theme}` ; `theme=politics` filtre les tweets politiques, un thème inconnu répond 400 |
| GET | `/api/tweets/stats?period=` | `{period, avgScore, minScore, maxScore, totalAnalyzed, verdictDistribution}` |
| GET | `/api/tweets/bullshitmetre?period=` | `{period, globalScore, level, sampleSize, timestamp}` |
| GET | `/api/tweets/election?period=&limit=` | `{period, politicalCount, totalAnalyzed, avgPoliticalScore, mentions, tweets, updatedAt}` |
| GET | `/api/tweets/search?q=` | `{tweets, total}` |
| GET | `/api/tweets/:id` | `{tweet}` ou 404 |
| POST | `/api/tweets/analyze` | `{tweet}` si `tweet_id` existe, sinon `{analysis}` |
| GET | `/api/ai/status` | État du provider IA et du modèle, sans exposer la clé |
| POST | `/api/ai/analyze` | Analyse via OpenCode ; `503` sans clé, `502` en cas d'échec |

`period` vaut `day`, `week`, `month` ou `all`. Une période invalide renvoie 400.
`content` est limité à 1000 caractères. Les erreurs sont de la forme `{error}`.

Forme de tweet plate :

```json
{
  "id": "2118400727941017874",
  "content": "…",
  "posted_at": "…",
  "likes": 87,
  "retweets": 3,
  "replies": 9,
  "views": 17850,
  "source": "profile",
  "author": {
    "name": "Sardoche 🇫🇷",
    "username": "Sardoche",
    "avatar_url": "https://pbs.twimg.com/…",
    "verified": true
  },
  "media": [
    {
      "type": "photo",
      "url": "https://pbs.twimg.com/media/…",
      "width": 1303,
      "height": 732,
      "expanded_url": "https://x.com/…"
    }
  ],
  "quoted_tweet": null,
  "reply_to": null,
  "analyzed": true,
  "political": true,
  "bullshit_score": 3,
  "verdict": "VRAI",
  "reasoning": "…",
  "fact_checks": [],
  "mentions": [
    { "label": "David Lisnard", "type": "candidat", "stance": "soutien" }
  ],
  "humor_comment": "…",
  "analyzed_at": "…"
}
```

Profil :

```json
{
  "profile": {
    "username": "Sardoche",
    "name": "Sardoche 🇫🇷",
    "avatar_url": "https://pbs.twimg.com/…",
    "verified": true,
    "followers": 593075,
    "updated_at": "2026-11-06T14:45:00.886Z"
  }
}
```

## Source des tweets

- `profile` : lit `https://x.com/Sardoche`, extrait le JSON SSR
  `profile_user_originals_timeline`, renvoie jusqu'à 5 tweets originaux avec profil,
  médias, citations et compteurs. Cache mémoire de 60 s. Aucune clé. Parsing non
  officiel, sensible aux changements de X et à Cloudflare.
- `syndication` : flux public de secours, archive plus ancienne et moins détaillée.
- `x` : API X v2 officielle, `TWITTER_BEARER_TOKEN` requis, réponses et retweets
  exclus.
- `mock` : `backend/mock/tweets.json`, dates recalées, réservé aux tests.

Le scheduler démarre si `DEMO_MODE` n'est pas `true`, si la source est valide, si
`CRON_SCHEDULE` est valide et si l'instance obtient le bail `scheduler_leases`. Il
récupère `TWITTER_SYNC_LIMIT` tweets (5 avec `profile`), les enrichit via le détail
public X (tweet parent d'une réponse, citation, médias), enregistre le profil, upsert
les tweets et conserve les anciens en base. L'analyse IA est lancée uniquement si une
clé réelle est configurée ; sans clé, l'import continue. Le bail est renouvelé par
heartbeat et libéré à l'arrêt. `CRON_RUN_ON_START` vaut `true` par défaut.

## Variables principales

```env
DEMO_MODE=false
DB_CLIENT=sqlite
TWITTER_SOURCE=profile
TWITTER_SYNC_LIMIT=5
CRON_SCHEDULE=*/5 * * * *
CRON_RUN_ON_START=true
ANALYZE_RATE_LIMIT=10
ANALYZE_RATE_WINDOW_MS=60000
# TRUST_PROXY=1            # derrière Railway/Render
# ANALYZE_API_KEY=...      # protège les routes POST d'analyse (Bearer / x-analyze-key)
# ANALYZE_RATE_LIMIT_SHARED=true  # compteur partagé entre instances
# SCHEDULER_LOCK_TTL_MS=900000    # bail du scheduler
AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_MODEL=deepseek-v4.1-flash
OPENCODE_PLAN=payg          # ou go
# OPENCODE_BASE_URL=...
# OPENCODE_MAX_TOKENS=3000
```

Sans clé OpenCode, `POST /api/ai/analyze` répond `503`, le scheduler continue en
import seul et le bouton de réanalyse est masqué. Les tweets déjà analysés restent
consultables.

Les modèles « free » OpenCode ne sont pas utilisables depuis un client externe
(`403`). Les appels sont facturés selon l'offre ; protéger les routes d'analyse est
nécessaire.

## Règles de développement

- Ne pas modifier les contrats d'API sans mettre à jour le frontend, les tests et
  la documentation.
- Le frontend doit toujours recevoir une forme de tweet plate ; `normalizeTweet`
  gère la réponse backend et ses structures imbriquées.
- Il n'y a qu'une seule source d'affichage : le backend. Ne pas réintroduire de
  tweets locaux ni de sélecteur de source dans l'interface.
- Ne jamais exposer de clé IA dans le frontend. Seules les variables `VITE_*`
  publiques sont autorisées ; la clé OpenCode reste côté backend.
- Les routes `/api/ai/analyze` et `/api/tweets/analyze` utilisent une clé payante :
  le rate limiting en mémoire (10 req/IP/min) est toujours actif. `ANALYZE_API_KEY`
  ajoute une authentification optionnelle ; quand elle est définie, le frontend
  masque la réanalyse.
- Le repli mock de `/api/tweets/analyze` est interdit en production : il n'est
  autorisé qu'avec `NODE_ENV=test`, `DEMO_MODE=true` ou `AI_PROVIDER=mock`.
- Les appels Twitter/IA ne doivent pas bloquer le démarrage du serveur ni faire
  tomber le processus.
- Le scheduler est protégé par un bail (`scheduler_leases`) renouvelé
  périodiquement : une seule instance exécute le cron. Ne pas contourner ce verrou
  ni supprimer la libération à l'arrêt.
- L'import ne doit pas dépendre de la clé IA : sans clé, les tweets sont collectés et
  restent non analysés. L'analyse doit utiliser le contexte du tweet (parent,
  citation) et lire les images jointes.
- La source `profile` est non officielle : toute évolution du parseur doit rester
  tolérante et testée avec un HTML de référence.
- Le ton reste satirique, pas harcelant. Pas d'attaque personnelle, pas de doxxing.
- Le dossier élection doit rester factuel et satirique, jamais militant : le
  dictionnaire de `politicsService.js` reflète les candidatures officielles de
  la présidentielle 2027 (pas de jugement de valeur dans les labels), et le ton
  soutien/attaque est attribué par l'IA tweet par tweet, jamais par le
  dictionnaire. Toute évolution de la liste des candidats doit mettre à jour le
  dictionnaire, les tests et la documentation.
- Toute nouvelle route ou variable d'environnement doit être documentée dans
  `README.md` et `docs/`.

## Tests

- Backend : **131 tests** (`node --test test/*.test.js`, `npm test`).
- Frontend : **48 tests** (`vitest run`, `npm test`).
- `npm run lint` et `npm run build` passent.
- `npm audit` : backend propre ; le frontend signale le ReDoS picomatch
  (CVE-2026-112366) via les devDependencies vite/vitest. Aucune version corrigée
  n'existe à ce jour, et le bundle de production n'embarque pas picomatch.
- GitHub Actions exécute les tests backend (Node 20 et 24), les tests, le lint et le build frontend sur chaque push et pull request.
- `./test-install.sh` enchaîne tests, lint et build.
- `./test-backend.sh` lance les tests puis des smoke tests dynamiques contre le
  backend courant : premier tweet de la liste, détail, recherche réelle, profil,
  statistiques et BullshitMètre.

## Limites connues

- **Parsing `profile` non officiel** : X peut changer sa page, limiter le débit ou
  bloquer la requête. L'API X v2 officielle est la solution durable.
- **Cinq tweets par cycle** : la source `profile` est plafonnée à 5 ; la base ne
  grandit que des tweets observés.
- PostgreSQL est implémenté mais n'a pas été exécuté ici contre un serveur réel.
- Authentification optionnelle : sans `ANALYZE_API_KEY`, les routes d'analyse sont
  publiques et payantes, limitées à 10 requêtes par IP et par minute
  (`ANALYZE_RATE_LIMIT`). Le compteur est en mémoire par défaut ;
  `ANALYZE_RATE_LIMIT_SHARED=true` le partage entre instances via la base.
- SQLite est mono-instance et nécessite un disque persistant en production.
- L'IA est faillible : elle peut se tromper, inventer une source ou mal interpréter
  un tweet.
- Le repli d'analyse déterministe est limité aux tests et à la démo
  (`NODE_ENV=test`, `DEMO_MODE=true` ou `AI_PROVIDER=mock`). En production,
  `POST /api/tweets/analyze` répond `503` sans provider et n'écrit rien en base.
- L'offre Go est supportée mais destinée aux agents de codage ; le payg est
  recommandé pour un service public.

## Documentation

- `README.md` — présentation, démarrage, sources, API, déploiement.
- `docs/SETUP.md` — installation, variables, base, scheduler, dépannage.
- `docs/ARCHITECTURE.md` — flux, source `profile`, base, scheduler, sécurité.
- `docs/AI_MODE.md` — OpenCode, plans payg/Go, coûts, limites.
- `docs/DEPLOYMENT.md` — Vercel, Netlify, Railway, Render.
- `docs/screenshots/README.md` — inventaire des captures.
- `docs/archive/` — documents historiques potentiellement obsolètes.
