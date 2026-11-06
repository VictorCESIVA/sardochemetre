# Installation et configuration

Ce guide couvre l'installation locale, les variables d'environnement, le choix de la
base, les sources de tweets, le scheduler, OpenCode et le dépannage. Pour une mise en
ligne, voir [`DEPLOYMENT.md`](DEPLOYMENT.md).

L'application est unique : le frontend React consomme l'API Express, qui collecte les
tweets de Sardoche, les stocke et les analyse avec OpenCode. Il n'y a pas de jeu de
données local affiché par défaut.

## 1. Prérequis

| Outil | Version / remarque |
| --- | --- |
| Node.js | **20 ou plus récent** (`node --version`) |
| npm | Fourni avec Node.js |
| Navigateur | Version récente (Chrome, Firefox, Safari, Edge) |
| Compte OpenCode | Pour l'analyse IA (`OPENCODE_API_KEY`) |
| Python 3, make, compilateur C/C++ | Optionnels ; utiles si `better-sqlite3` doit être compilé |
| PostgreSQL | Optionnel ; SQLite est le défaut |
| Accès API X | Optionnel ; uniquement pour `TWITTER_SOURCE=x` |

La source `profile` ne nécessite aucune clé X : elle lit la page publique
`x.com/Sardoche`. Le backend déclare `"engines": { "node": ">=20" }`.

## 2. Installation

Depuis la racine du dépôt :

```bash
npm install --prefix backend
npm install --prefix frontend
```

Ou avec les scripts fournis, qui installent automatiquement les dépendances
manquantes :

```bash
./start-all.sh    # backend + frontend
./start-free.sh   # alias historique : lance exactement la même application
```

`start-free.sh` conserve son nom pour compatibilité. Il n'y a plus de lancement
frontend seul ni de jeu de données local : le script exécute `start-all.sh`.

### Fichiers d'environnement

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Les fichiers `.env` sont ignorés par Git. Ne versionnez jamais de clé réelle.

## 3. Variables d'environnement

### Backend (`backend/.env`)

| Variable | Valeur usuelle | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` masque les stacks d'erreur et adapte les logs. |
| `PORT` | `3001` | Port HTTP du backend. |
| `DEMO_MODE` | `false` | Compatibilité : `true` réactive le seed mock et désactive le scheduler. Ne choisit **pas** la base. Doit rester `false` pour collecter de vrais tweets. |
| `DB_CLIENT` | `sqlite` | `sqlite` ou `postgres`. Si absent, une `DATABASE_URL` PostgreSQL est détectée automatiquement. |
| `SQLITE_PATH` | `./sardochemetre.db` | Chemin absolu ou relatif au dossier `backend/`. |
| `DATABASE_URL` | — | Chaîne de connexion PostgreSQL ; obligatoire si `DB_CLIENT=postgres`. |
| `CORS_ORIGIN` | `*` | `*` ou plusieurs origines séparées par des virgules. |
| `ANALYZE_RATE_LIMIT` | `10` | Requêtes d'analyse par IP et par fenêtre. |
| `ANALYZE_RATE_WINDOW_MS` | `60000` | Durée de la fenêtre de limitation (ms). |
| `TRUST_PROXY` | — | `1` (ou un nombre de sauts) derrière un proxy de confiance. |
| `TWITTER_SOURCE` | `profile` | `profile`, `syndication`, `x` ou `mock`. Voir la section 5. |
| `TWITTER_SYNC_LIMIT` | `5` | Tweets récupérés par cycle ou par `npm run sync` (1–50 ; `profile` plafonne à 5). |
| `TWITTER_BEARER_TOKEN` | — | Bearer Token de l'API X v2 ; requis uniquement pour `TWITTER_SOURCE=x`. |
| `TWITTER_PROFILE_URL` | — | Surcharge optionnelle de l'URL de la page profil (tests). |
| `TWITTER_SYNDICATION_URL` | — | Surcharge optionnelle de l'URL de syndication (tests). |
| `SARDOCHE_USERNAME` | `Sardoche` | Compte dont les tweets sont récupérés. |
| `SARDOCHE_USER_ID` | — | ID numérique du compte pour l'API X ; prioritaire sur le username s'il est fourni. |
| `CRON_SCHEDULE` | `*/5 * * * *` | Expression cron du scheduler. |
| `CRON_RUN_ON_START` | `false` | `true` lance un cycle immédiat au démarrage. |
| `AI_PROVIDER` | `opencode` | Provider d'analyse : `opencode` (standard), `anthropic` (historique) ou `mock` (tests). |
| `OPENCODE_API_KEY` | — | Clé `oc_sk_...` créée sur la console OpenCode. Obligatoire pour l'IA réelle. |
| `OPENCODE_MODEL` | `deepseek-v4.1-flash` | Modèle OpenCode utilisé. |
| `OPENCODE_PLAN` | `payg` ou `go` | Sélectionne l'URL et le mode de facturation OpenCode. |
| `OPENCODE_BASE_URL` | — | Surcharge optionnelle de l'URL de base OpenCode. |
| `OPENCODE_MAX_TOKENS` | `3000` | Limite de génération par analyse. |
| `OPENCODE_SESSION` | — | Session stable pour l'offre Go ; générée automatiquement si vide. |
| `ANTHROPIC_API_KEY` | — | Uniquement si `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Modèle Anthropic historique. |

`DEMO_MODE` ne pilote que le seed mock et le scheduler. Il ne choisit pas la base et
ne remplace pas la configuration IA.

### Frontend (`frontend/.env`)

| Variable | Valeur usuelle | Rôle |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3001` | URL du backend pour les tweets, le profil et l'IA. |

Les variables `VITE_*` sont figées au démarrage du serveur Vite et **au moment du
build**. Après modification, redémarrez `npm run dev` ou reconstruisez le frontend.

Aucune clé OpenCode ou Anthropic ne doit être placée dans le frontend : elle serait
visible dans le bundle.

## 4. Configurer OpenCode

1. Créez une clé sur <https://opencode.ai/console>.
2. Renseignez `backend/.env` :

```env
AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_MODEL=deepseek-v4.1-flash
OPENCODE_PLAN=payg
# OPENCODE_BASE_URL=...
```

3. Redémarrez le backend.

Les URLs utilisées par le backend sont :

| Offre | URL |
| --- | --- |
| Pay-as-you-go (`payg`) | `https://opencode.ai/inference/openai/v1/chat/completions` |
| Go (`go`) | `https://opencode.ai/inference/go/openai/v1/chat/completions` |

L'authentification est `Authorization: Bearer oc_sk_...`. Pour l'offre Go, le backend
ajoute l'en-tête `x-opencode-session`.

Vérification :

```bash
curl http://localhost:3001/api/ai/status
```

Sans clé, le statut signale une configuration incomplète, le scheduler ne démarre
pas et `POST /api/ai/analyze` répond `503`. Les tweets déjà analysés restent
consultables et le bouton de réanalyse est masqué. Le fallback d'analyse de test
reste toutefois accessible par un appel direct à `POST /api/tweets/analyze` : ne
l'exposez pas sans protection.

**Payg ou Go.** Le pay-as-you-go est recommandé pour cette application : il est
prévu pour les appels API classiques et se facture à l'usage. L'offre Go est conçue
pour les agents de codage ; elle est supportée par le backend, mais son usage pour ce
type de trafic doit être vérifié. La configuration locale de ce dépôt utilise une clé
Go (`OPENCODE_PLAN=go`) car le compte payg n'a pas de crédits. Un appel sans crédits
renvoie `402 - Insufficient account funds`.

Les modèles « free » OpenCode ne sont pas utilisables depuis un client externe :
l'API renvoie `403`. Choisissez un modèle autorisé par votre offre. Pour les tarifs
et les limites, voir [`AI_MODE.md`](AI_MODE.md).

## 5. Sources de tweets et scheduler

Le backend collecte les tweets puis les analyse ; le frontend ne contacte jamais X
directement.

| Source | `TWITTER_SOURCE` | Clé | Comportement |
| --- | --- | --- | --- |
| Profil public | `profile` | Non | Page `x.com/Sardoche`, jusqu'à 5 tweets originaux récents, profil, médias, citations, compteurs. |
| Syndication | `syndication` | Non | Ancien flux public, archive plus ancienne et moins détaillée. |
| API X v2 | `x` | `TWITTER_BEARER_TOKEN` | Source officielle, quota X, réponses et retweets exclus. |
| Mock | `mock` | Non | Tweets de test, dates recalées ; réservé aux tests. |

### Flux `profile`

```text
x.com/Sardoche (HTML SSR)
  → extractProfilePayload()
  → profile_user_originals_timeline
  → parseProfileHtml()
  → { profile, tweets }
  → tables tweets + profile
  → GET /api/tweets, GET /api/tweets/:id, GET /api/profile
  → embeds X du frontend
```

Le parseur récupère le JSON SSR présent dans la page, parcourt les instructions
`TimelineAddEntries`, écarte les entrées sans date ou sans contenu, déduplique par
identifiant et trie par date décroissante. Il renvoie au plus 5 tweets. Un cache
mémoire de 60 secondes évite les téléchargements répétés.

Le scheduler :

- démarre si `DEMO_MODE` n'est pas `true`, si la source est valide, si
  `CRON_SCHEDULE` est valide et si l'IA est configurée ;
- avec `profile` ou `syndication`, ne demande aucun token X ;
- avec `x`, exige `TWITTER_BEARER_TOKEN` ;
- récupère `TWITTER_SYNC_LIMIT` tweets (5 avec `profile`), enregistre le profil,
  insère ou met à jour les tweets, puis analyse uniquement ceux qui ne le sont pas
  encore ;
- conserve les anciens tweets en base ;
- ne lance pas deux cycles simultanés dans le même processus (`noOverlap`) ;
- journalise les erreurs réseau sans arrêter le serveur.

Configuration recommandée :

```env
DEMO_MODE=false
TWITTER_SOURCE=profile
TWITTER_SYNC_LIMIT=5
CRON_SCHEDULE=*/5 * * * *
CRON_RUN_ON_START=false
```

En production, **une seule instance backend** doit exécuter le scheduler.

### Import manuel

```bash
cd backend

# Récupérer et analyser les nouveaux tweets
npm run sync:analyze

# Forcer la source et remplacer une ancienne archive
npm run sync:analyze -- --source=profile --limit=5 --replace-source=syndication

# Vérifier sans écrire en base ni appeler l'IA
TWITTER_SOURCE=profile DEMO_MODE=false node sync-tweets.js --dry-run --limit=5
```

## 6. SQLite (défaut)

SQLite est le choix par défaut : aucune installation de serveur, aucun compte.

```env
DB_CLIENT=sqlite
SQLITE_PATH=./sardochemetre.db
```

Le chemin relatif est résolu depuis le dossier `backend/`. Le schéma est créé ou mis
à niveau automatiquement au démarrage (`ensureSchema`), avec :

- `journal_mode = WAL` ;
- `busy_timeout = 5000` ;
- clés étrangères activées.

Le schéma contient trois tables :

- `tweets` : `id`, `content`, `posted_at`, `likes`, `retweets`, `replies`, `views`,
  `media`, `quoted_tweet`, `source`, `analyzed`, `fetched_at` ;
- `profile` : ligne unique (`id = 1`) avec `username`, `name`, `avatar_url`,
  `verified`, `followers`, `updated_at` ;
- `analyses` : score, verdict, raisonnement, fact-checks JSON, punchline et date.

Commandes utiles :

```bash
cd backend

npm run init-db   # crée le schéma
npm run seed      # charge le mock de test (SQLite ou PostgreSQL)
npm start         # démarre l'API
npm run dev       # démarre l'API avec rechargement Node
```

Le seed mock est destiné aux tests : ne l'exécutez pas sur une base de production.

> SQLite ne doit être ouvert que par un seul processus backend à la fois. Pour un
> déploiement multi-instances, utilisez PostgreSQL.

## 7. PostgreSQL (optionnel)

1. Créez une base et un utilisateur.
2. Configurez `backend/.env` :

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/sardochemetre
```

3. Appliquez les migrations :

```bash
cd backend
npm run migrate
```

La commande crée la table de suivi `schema_migrations` et applique les fichiers
`migrations/*.sql` dans l'ordre. Elle ne fait rien si `DB_CLIENT=sqlite` (le schéma
SQLite est automatique). Les migrations `002_tweet_source.sql` et
`003_profile_embed.sql` ajoutent la source, les compteurs d'embed et la table
`profile`.

4. Démarrez le backend :

```bash
npm start
```

Vérification :

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"…","mode":"production","database":"postgres",…}
```

PostgreSQL évite le disque persistant et permet plusieurs instances, mais le
scheduler doit rester sur une seule instance. Ce chemin est implémenté et testé au
niveau du schéma, mais n'a pas été exécuté ici contre un serveur PostgreSQL réel.

## 8. Lancer le frontend

```bash
cd frontend
npm run dev       # serveur de développement, http://localhost:5173
npm run build     # build de production dans dist/
npm run preview   # prévisualisation du build
```

Le frontend charge le profil via `GET /api/profile`, les tweets via
`GET /api/tweets` et affiche les embeds X. Il n'y a plus de sélecteur de source dans
l'interface.

## 9. Vérifications

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
./test-install.sh             # tout ci-dessus, depuis la racine
./test-backend.sh             # tests + smoke tests si le backend tourne
```

État attendu : **91 tests backend**, **41 tests frontend**, lint et build sans
erreur. Les smoke tests vérifient le premier tweet réellement présent, son détail, une
recherche, le profil, les statistiques et le BullshitMètre.

## 10. Dépannage

### `better-sqlite3` ne s'installe pas

Le module tente d'utiliser un binaire précompilé. S'il doit être compilé :

```bash
# Debian / Ubuntu
sudo apt install python3 make g++

# macOS
xcode-select --install
```

Puis relancez `npm install --prefix backend`.

### Le port 3001 est déjà utilisé

```bash
lsof -i :3001
# ou
ss -ltnp | grep 3001
```

Arrêtez le processus concerné ou changez `PORT`. Si vous changez le port du backend,
mettez aussi `VITE_API_URL` à jour et redémarrez Vite.

### `DATABASE_URL est requis quand DB_CLIENT=postgres`

Ajoutez `DATABASE_URL` dans `backend/.env`, ou repassez à `DB_CLIENT=sqlite`.

### `DB_CLIENT invalide`

Seules les valeurs `sqlite` et `postgres` sont acceptées. La détection automatique ne
s'applique que si `DB_CLIENT` est absent.

### Erreur CORS dans le navigateur

Définissez `CORS_ORIGIN` avec l'origine exacte du frontend, par exemple
`http://localhost:5173` ou `https://mon-site.vercel.app`. Pour plusieurs origines,
séparez-les par des virgules, sans espaces inutiles.

### Le frontend ne joint pas le backend

- Vérifiez `curl http://localhost:3001/health`.
- Vérifiez `VITE_API_URL` dans `frontend/.env`.
- Redémarrez Vite après toute modification de `.env`.

### Aucun tweet ne s'affiche

- Vérifiez `curl http://localhost:3001/api/tweets?period=all`.
- Vérifiez `curl http://localhost:3001/api/profile`.
- Consultez les logs `[Twitter]` : la page x.com peut être bloquée, vide ou avoir
  changé de structure.
- Vérifiez que le scheduler a démarré : `DEMO_MODE=false`, clé IA présente,
  `CRON_SCHEDULE` valide.
- Lancez un cycle manuel : `cd backend && npm run sync:analyze`.

### `503` sur `/api/ai/analyze`

- Vérifiez `AI_PROVIDER=opencode`.
- Vérifiez `OPENCODE_API_KEY` dans `backend/.env`.
- Redémarrez le backend.
- Consultez `GET /api/ai/status` et les logs.

### `401` ou `403` chez OpenCode

- Vérifiez la clé et l'offre (`OPENCODE_PLAN`).
- Un modèle « free » peut renvoyer `403` depuis un client externe.
- Pour Go, vérifiez la session ; l'en-tête `x-opencode-session` est ajouté par le
  backend.

### `402` : compte sans crédits

Ajoutez des crédits sur la console OpenCode (payg), ou basculez sur une clé Go avec
`OPENCODE_PLAN=go`. Voir [`AI_MODE.md`](AI_MODE.md).

### `SQLITE_BUSY` ou base verrouillée

Un autre processus utilise probablement le même fichier. Arrêtez les backends en
double, puis relancez. Le mode WAL tolère mieux les lectures concurrentes, mais
SQLite reste mono-écrivain.

### Le scheduler ne démarre pas

Consultez les logs `[Scheduler]`. Causes fréquentes : `DEMO_MODE=true`, source
invalide, `TWITTER_BEARER_TOKEN` manquant avec `TWITTER_SOURCE=x`, provider IA mal
configuré, `CRON_SCHEDULE` invalide ou `DB_CLIENT` mal configuré.

### La source `profile` échoue

Le message `flux profile_user_originals_timeline introuvable` ou
`JSON SSR du profil X invalide` indique que X a changé sa page ou renvoyé autre chose.
Vérifiez la page dans un navigateur, puis :

- réessayez plus tard (rate limit / Cloudflare) ;
- utilisez `TWITTER_SOURCE=syndication` en secours ;
- passez à `TWITTER_SOURCE=x` avec un Bearer Token pour un usage durable.

### Les analyses sont lentes

Un appel IA peut prendre plusieurs secondes. Le scheduler analyse les nouveaux tweets
un par un ; l'interface affiche un état de chargement pendant une réanalyse.
