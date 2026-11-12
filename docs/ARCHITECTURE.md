# Architecture

Ce document décrit le fonctionnement du dépôt : flux de données, source des tweets,
couche base, scheduler, proxy IA et limites de sécurité.

## Vue d'ensemble

```text
Navigateur
  │
  ├── React (Vite, React Router, Tailwind)
  │     ├── pages Home / TweetDetail
  │     ├── TweetEmbed + TweetAvatar + VerifiedBadge
  │     ├── TweetMedia + QuotedTweet + TweetText
  │     └── tweetService ──► Axios ──► backend Express
  │
  └── Backend Express
        ├── app.js          factory testable
        ├── routes/         API tweets, profil et IA
        ├── services/       sources X, OpenCode, Anthropic
        ├── db/             SQLite ou PostgreSQL
        └── scheduler.js    cron de collecte et d'analyse
```

Le frontend ne parle jamais directement à X, OpenCode ou Anthropic. Il appelle le
backend pour la liste, le détail, le profil, les statistiques et les analyses. C'est
le backend qui détient les clés et qui construit les appels au provider IA.

Il n'y a qu'une seule application : pas de bascule locale, pas de jeu de tweets
frontend affiché à la place de la base.

## Flux frontend

`tweetService.js` expose une interface unique : `getTweets`, `getTweetById`,
`getStats`, `getBullshitmetre`, `getProfile`, `getAIStatus`, `analyzeTweet` et
`searchTweets`. Toutes les méthodes renvoient une forme de tweet plate, normalisée par
`normalizeTweet`.

La page d'accueil :

1. charge le profil (`GET /api/profile`) et le statut IA (`GET /api/ai/status`) ;
2. charge le BullshitMètre et les statistiques pour la période sélectionnée ;
3. charge la liste paginée (`GET /api/tweets?page=&limit=&period=&q=`) ;
4. sélectionne le tweet le plus bullshit de la page pour la une ;
5. affiche chaque tweet sous forme d'embed X complet.

La page détail charge `GET /api/tweets/:id`, puis affiche l'embed à gauche et le
panneau score/verdict/IA à droite sur desktop. L'analyse, les fact-checks et la pull
quote occupent toute la largeur sous la grille. Le bouton de réanalyse appelle
`POST /api/tweets/analyze` et remplace le tweet affiché par la version persistée.

En cas d'échec réseau, les pages affichent un état d'erreur avec nouvelle tentative.
Un tweet inconnu renvoie une page « Tweet introuvable » ; une route inconnue renvoie
la page 404 applicative.

## Flux backend

1. `server.js` charge `dotenv`, valide `PORT`, résout `DB_CLIENT` et `DEMO_MODE`.
2. `createApp()` initialise la base si nécessaire, puis choisit le routeur tweets :
   - SQLite → `routes/tweets-sqlite.js` ;
   - PostgreSQL → `routes/tweets.js`.
3. Les routes IA sont montées séparément et utilisent `services/aiService.js`.
4. Express applique CORS, puis les parsers JSON et URL-encoded avec une limite de
   64 ko.
5. Les routes fixes (`/stats`, `/bullshitmetre`, `/search`, `/analyze`) sont
   déclarées avant `/:id` pour éviter les collisions.
6. `GET /api/profile` lit la ligne unique de la table `profile` et renvoie `404` si
   elle est absente.
7. Une route inconnue renvoie `404 {error}`. Le middleware d'erreur renvoie `{error}`
   et n'expose la stack qu'en développement pour les erreurs 5xx.
8. À l'arrêt (`SIGINT`/`SIGTERM`), le serveur ferme le scheduler, la connexion HTTP
   et la base, avec un arrêt forcé après 10 secondes.

La séparation `app.js` / `server.js` permet de tester l'application sans ouvrir de
port fixe : les tests construisent l'app et écoutent sur un port éphémère.

## Source des tweets

### `profile` : page publique x.com

La source recommandée lit `https://x.com/Sardoche`. La page contient en SSR un flux
`profile_user_originals_timeline` avec le profil et les tweets originaux récents.

```text
GET https://x.com/Sardoche
  → HTML (User-Agent navigateur)
  → extractProfilePayload()
       regex sur les chaînes SSR, recherche de profile_user_originals_timeline
  → JSON.parse de la chaîne puis du JSON imbriqué
  → profileTimelineEntries()
       instructions TimelineAddEntries
  → parseProfileHtml()
       déduplication, dates, texte, média, citation, compteurs
  → { profile, tweets }
  → scheduler / sync-tweets
  → tables tweets + profile
  → API
  → embeds
```

Champs extraits :

- profil : `name`, `username`, `avatar_url`, `verified`, `followers` ;
- tweet : `id`, `content`, `posted_at`, `likes`, `retweets`, `replies`, `views`,
  `source='profile'`, `author` ;
- médias : `type`, `url`, `width`, `height`, `expanded_url` ;
- tweet cité : `id`, `content`, `author`, `media`.

Le parseur plafonne à **5 tweets** (`MAX_PROFILE_TWEETS`). Un cache mémoire de
60 secondes (`PROFILE_CACHE_TTL_MS`) évite de télécharger la page à chaque cycle ou
requête rapprochée. En cas d'échec réseau ou de parsing, il journalise l'erreur et
renvoie `{ profile: null, tweets: [] }` sans faire tomber le processus.

Le parsing du HTML de x.com est **non officiel** : une modification de la page, un
rate limit ou une protection Cloudflare peut vider la collecte. L'API X v2 officielle
reste la voie la plus robuste.

### `syndication` : repli public

`https://syndication.twitter.com/srv/timeline-profile/screen-name/Sardoche` renvoie
un HTML contenant `__NEXT_DATA__`. Le parseur `parseSyndicationHtml` filtre les
réponses et retweets, déduplique, nettoie le texte et trie par date. Cette source ne
demande pas de token mais expose souvent une archive plus ancienne et moins de détails
d'embed.

### `x` : API X v2

Avec un Bearer Token, le backend résout l'utilisateur par `SARDOCHE_USER_ID` ou
`SARDOCHE_USERNAME`, puis appelle `/2/users/:id/tweets` avec
`exclude=retweets,replies`. Les tweets retournés contiennent les métriques publiques
et la date. C'est la source officielle, soumise aux quotas X.

### `mock` : tests

`backend/mock/tweets.json` contient des tweets de test. `loadDemoTweets`
recale leurs dates au démarrage. Cette source sert aux tests automatisés et au
développement hors réseau ; elle n'est pas utilisée par la configuration locale.

### Sélection de la source

`getTwitterSource()` applique cet ordre :

1. `TWITTER_SOURCE` explicite (`profile`, `syndication`, `x`, `mock`) ;
2. sinon `mock` si `DEMO_MODE=true` ;
3. sinon `x` si `TWITTER_BEARER_TOKEN` est présent ;
4. sinon `syndication`.

Une valeur inconnue lève une erreur claire.

## Scheduler

`backend/scheduler.js` utilise `node-cron`.

Conditions de démarrage :

- `DEMO_MODE` différent de `true` ;
- source de tweets valide ;
- `TWITTER_BEARER_TOKEN` présent uniquement si la source est `x` ;
- provider IA configuré (`OPENCODE_API_KEY` pour OpenCode) ;
- `CRON_SCHEDULE` valide (défaut `0 * * * *`, configuration du projet
  `*/5 * * * *`).

Un cycle :

1. lit la source (`profile` par défaut) et récupère jusqu'à `TWITTER_SYNC_LIMIT`
   tweets (5 maximum avec `profile`) ;
2. récupère le snapshot du profil quand la source est `profile` ;
3. enregistre le profil dans `profile` ;
4. insère ou met à jour les tweets sans créer de doublon ;
5. analyse uniquement les tweets dont `analyzed` est faux ;
6. stocke l'analyse et passe `analyzed` à vrai.

Les anciens tweets restent en base : la collecte ne remplace pas l'archive. Un tweet
déjà analysé n'est pas rappelé à l'IA, ce qui limite le coût. `noOverlap: true`
empêche deux cycles simultanés **dans un même processus**. En déploiement
multi-instances, un bail `scheduler_leases` (table SQLite ou PostgreSQL) est acquis
au démarrage puis renouvelé toutes les `SCHEDULER_LOCK_TTL_MS / 3` : une seule
instance exécute le cron. Une instance qui perd le bail arrête son cron ; le bail est
libéré à l'arrêt ou expire après la TTL si le processus meurt.

Les erreurs réseau, de parsing ou d'API sont journalisées et n'arrêtent pas le
serveur.

## Modèle de données

Cinq tables :

```text
tweets
  id            TEXT PRIMARY KEY   (identifiant X ou mock)
  content       TEXT
  posted_at     TIMESTAMP / TEXT
  likes         INTEGER
  retweets      INTEGER
  replies       INTEGER
  views         INTEGER
  media         JSONB / TEXT JSON  (tableau)
  quoted_tweet  JSONB / TEXT JSON  (objet ou NULL)
  source        TEXT               (profile, syndication, x, mock)
  analyzed      BOOLEAN / INTEGER
  fetched_at / created_at

profile
  id            INTEGER PRIMARY KEY CHECK (id = 1)
  username      TEXT
  name          TEXT
  avatar_url    TEXT
  verified      BOOLEAN / INTEGER
  followers     BIGINT / INTEGER
  updated_at    TIMESTAMP

analyses
  id            SERIAL / INTEGER PRIMARY KEY
  tweet_id      TEXT UNIQUE REFERENCES tweets(id) ON DELETE CASCADE
  bullshit_score INTEGER 0..100
  verdict       VRAI | DOUTEUX | BULLSHIT | CHAUD BOUILLANT
  reasoning     TEXT
  fact_checks   JSONB (PostgreSQL) / TEXT JSON (SQLite)
  humor_comment TEXT
  analyzed_at   TIMESTAMP

scheduler_leases
  name          TEXT PRIMARY KEY   (scheduler)
  owner         TEXT               (pid + UUID de l'instance)
  expires_at    TIMESTAMPTZ / TEXT ISO

analyze_rate_limits
  client_key    TEXT PRIMARY KEY   (adresse IP)
  window_start  BIGINT / INTEGER   (début de fenêtre, ms)
  count         BIGINT / INTEGER
```

SQLite stocke les dates en texte ISO et les structures JSON en texte sérialisé ;
PostgreSQL utilise `TIMESTAMP`, `JSONB` et `BIGINT`. Les deux couches exposent la même
forme plate : la jointure `tweets`/`analyses` est mise à plat par `mapTweet`, avec
`LEFT JOIN` pour le détail afin de pouvoir afficher un tweet pas encore analysé.

Le profil est unique (`id = 1`). `saveProfile` fait un upsert et conserve les champs
absents (notamment `followers`). `authorForTweets` injecte ce profil dans chaque tweet
pour que les anciennes lignes sans auteur puissent tout de même afficher un embed
cohérent.

### Périodes

`db/periods.js` définit les fenêtres :

- `day` : 24 heures ;
- `week` : 7 jours ;
- `month` : 30 jours ;
- `all` : aucune borne.

Les bornes sont calculées par rapport à l'instant de la requête. Une période
invalide renvoie `400`.

### Recherche

La recherche est un `LIKE` insensible à la casse sur `tweets.content`, avec
échappement de `%`, `_` et `\`. Elle n'utilise pas d'index plein texte. La route
paginée accepte `q` ; `GET /api/tweets/search` reste disponible comme recherche
simple.

### Seed de test

`db/mock-data.js` lit `backend/mock/tweets.json`, trie les tweets et remplace leurs
dates : le plus récent à `maintenant − 2 h`, puis un toutes les 24 h. Le seed est
idempotent (`INSERT … ON CONFLICT DO UPDATE`). Il est exécuté par `npm run seed` et,
si `DEMO_MODE=true` avec la source `mock`, au démarrage. Il est réservé aux tests.

## Couche base de données

Le choix est centralisé dans `db/config.js` :

1. `DB_CLIENT` explicite (`sqlite` ou `postgres`) ;
2. sinon, `DATABASE_URL` commençant par `postgres://` ou `postgresql://` ;
3. sinon, SQLite.

`DEMO_MODE` est indépendant : il ne fait que réactiver le seed mock et désactiver le
scheduler.

### SQLite

- `better-sqlite3`, API synchrone.
- Base par défaut : `backend/sardochemetre.db`.
- `SQLITE_PATH` peut être absolu ou relatif au dossier `backend/`.
- Schéma créé/mis à jour au démarrage (`db/schema.js`), avec reconstruction de
  l'ancienne table `analyses` si les contraintes manquent et ajout des colonnes
  `source`, `replies`, `views`, `media`, `quoted_tweet`.
- WAL, `busy_timeout = 5000`, clés étrangères activées.
- Un seul processus backend conseillé.

### PostgreSQL

- Pool `pg` dans `db/postgres.js`.
- `DATABASE_URL` obligatoire.
- Schéma géré par `npm run migrate` (`001_initial_schema.sql`,
  `002_tweet_source.sql`, `003_profile_embed.sql`).
- Les routes sont asynchrones et utilisent des requêtes paramétrées.
- Le schéma et les requêtes sont implémentés, mais ce chemin n'a pas été exécuté ici
  contre un serveur PostgreSQL réel.

## API

| Méthode | Route | Réponse |
| --- | --- | --- |
| `GET` | `/health` | `{status, timestamp, mode, database, ai}` |
| `GET` | `/api/profile` | `{profile}` ou `404` |
| `GET` | `/api/tweets?page=&limit=&period=&q=` | `{tweets, pagination, period, query}` |
| `GET` | `/api/tweets/stats?period=` | `{period, avgScore, minScore, maxScore, totalAnalyzed, verdictDistribution}` |
| `GET` | `/api/tweets/bullshitmetre?period=` | `{period, globalScore, level, sampleSize, timestamp}` |
| `GET` | `/api/tweets/search?q=` | `{tweets, total}` |
| `GET` | `/api/tweets/:id` | `{tweet}` ou `404` |
| `POST` | `/api/tweets/analyze` | `{tweet}` si `tweet_id` existe, sinon `{analysis}` |
| `GET` | `/api/ai/status` | État du provider, du modèle et de l'offre, sans clé |
| `POST` | `/api/ai/analyze` | Analyse via OpenCode ; `503` sans clé, `502` en cas d'échec provider |

`period` vaut `day`, `week`, `month` ou `all`. Une période invalide renvoie `400`.
`content` est limité à 1000 caractères. Les erreurs sont de la forme `{error}`.

Forme de tweet plate :

```json
{
  "id": "2118400727941017874",
  "content": "…",
  "posted_at": "2026-11-05T17:51:06.000Z",
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
  "analyzed": true,
  "bullshit_score": 3,
  "verdict": "VRAI",
  "reasoning": "…",
  "fact_checks": [],
  "humor_comment": "…",
  "analyzed_at": "2026-11-06T14:27:52.877Z"
}
```

## Proxy IA OpenCode

Le backend joue le rôle de proxy entre le frontend et OpenCode. Il protège la clé,
choisit l'URL et normalise la réponse.

### Configuration

```env
AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_MODEL=deepseek-v4.1-flash
OPENCODE_PLAN=payg
# OPENCODE_BASE_URL=...
# OPENCODE_MAX_TOKENS=3000
# OPENCODE_SESSION=ses_...
```

### URLs

| Offre | URL |
| --- | --- |
| Pay-as-you-go | `https://opencode.ai/inference/openai/v1/chat/completions` |
| Go | `https://opencode.ai/inference/go/openai/v1/chat/completions` |

`OPENCODE_PLAN` vaut `payg` ou `go`. `OPENCODE_BASE_URL` permet de surcharger l'URL
de base.

### Requête

```http
POST /chat/completions
Authorization: Bearer oc_sk_...
Content-Type: application/json
```

Pour l'offre Go, le backend ajoute `x-opencode-session`. La clé et cet en-tête ne
quittent jamais le serveur.

### Endpoints exposés au frontend

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/ai/status` | Indique si le provider est configuré, le modèle actif, l'offre et la raison d'une indisponibilité. |
| `POST` | `/api/ai/analyze` | Reçoit le contenu à analyser, appelle OpenCode et renvoie une analyse normalisée. Répond `401` si `ANALYZE_API_KEY` est définie sans clé valide, `503` sans configuration. |
| `POST` | `/api/tweets/analyze` | Variante utilisée par le frontend : analyse et persiste le résultat quand `tweet_id` existe. Même authentification optionnelle ; `503` sans provider en production. |

La réponse d'analyse suit le même format que les analyses stockées : score borné à
0–100, verdict normalisé, raisonnement, fact-checks et punchline.

## Sécurité et limites

- **Authentification optionnelle** : sans `ANALYZE_API_KEY`, toutes les routes sont
  publiques. Si la variable est définie, les deux routes POST d'analyse exigent
  `Authorization: Bearer <clé>` ou `x-analyze-key` et répondent `401
  ANALYSIS_AUTH_REQUIRED` sinon. `GET /api/ai/status` expose seulement
  `analysisProtected`, jamais la clé. Le frontend masque la réanalyse dans ce cas.
- **Pas de repli mock en production** : `analyzeTweet` ne génère une analyse simulée
  que si `NODE_ENV=test`, `DEMO_MODE=true` ou `AI_PROVIDER=mock`. Sinon l'absence de
  provider produit `503 AI_NOT_CONFIGURED` et un échec fournisseur `502`.
- **Rate limiting** : `POST /api/ai/analyze` et `POST /api/tweets/analyze` partagent
  un compteur par adresse IP (10 requêtes par minute par défaut), configurable avec
  `ANALYZE_RATE_LIMIT` et `ANALYZE_RATE_WINDOW_MS`. Au-delà, la réponse est `429`
  avec `Retry-After`. Par défaut le compteur est en mémoire, donc propre à chaque
  processus ; `ANALYZE_RATE_LIMIT_SHARED=true` utilise la table
  `analyze_rate_limits` pour partager la limite entre instances. Derrière
  Railway/Render, activez `TRUST_PROXY=1` pour que `req.ip` lise
  `X-Forwarded-For` ; sans proxy de confiance, l'en-tête est ignoré et ne permet pas
  de contourner la limite.
- **CORS** : `*` par défaut. Configurez `CORS_ORIGIN` en production.
- **Taille des corps** : 64 ko pour JSON et URL-encoded ; `content` d'analyse limité
  à 1000 caractères.
- **Clé OpenCode** : uniquement côté backend, jamais dans une variable `VITE_*` ni
  dans le bundle frontend.
- **Injection SQL** : requêtes paramétrées. La recherche échappe les caractères
  spéciaux de `LIKE`.
- **Prompt injection** : le prompt système demande de traiter le tweet comme une
  donnée et de ne pas suivre ses instructions. Ce n'est pas une garantie absolue.
- **Validation des sorties IA** : score borné à 0–100, verdict normalisé, fact-checks
  filtrés. Une réponse invalide fait échouer l'analyse proprement.
- **Secrets** : `OPENCODE_API_KEY`, `ANTHROPIC_API_KEY`, `TWITTER_BEARER_TOKEN` et
  `DATABASE_URL` restent côté backend.
- **Stack d'erreur** : exposée seulement en `NODE_ENV=development` pour les 5xx.
- **Source `profile`** : requête vers une page publique non documentée ; X peut la
  modifier ou la bloquer à tout moment.
- **Données envoyées à OpenCode** : le contenu du tweet analysé quitte le backend.

## Choix techniques

- **Une seule application** : les tweets, le profil et les analyses viennent du
  backend ; l'interface n'a pas de second jeu de données à maintenir.
- **Source `profile` par défaut** : elle donne des tweets frais et des embeds complets
  sans clé X. Le compromis est un parsing non officiel, documenté comme tel.
- **Cache court** : 60 secondes suffisent à absorber les rafales de requêtes sans
  retarder la collecte de 5 minutes.
- **SQLite par défaut** : démarrage sans service externe, adapté à un test local et
  à un déploiement mono-instance avec disque persistant.
- **PostgreSQL optionnel** : chemin prévu pour un hébergement sans disque persistant
  ou multi-instances.
- **Deux routeurs tweets** : `better-sqlite3` est synchrone, `pg` est asynchrone. Les
  séparer garde chaque implémentation simple et testable.
- **Proxy OpenCode** : évite d'exposer la clé dans le navigateur et permet de changer
  d'offre ou de modèle sans reconstruire le frontend.
- **Forme de tweet plate** : l'UI n'a pas à connaître la jointure SQL ni les structures
  JSON stockées ; `normalizeTweet` et `mapTweet` produisent la même forme.
- **Provider IA interchangeable** : OpenCode reste le standard ; Anthropic et un mock
  de test subsistent derrière la même interface.
