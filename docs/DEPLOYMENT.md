# Déploiement

L'application est full-stack : le frontend React lit les tweets, le profil et les
analyses du backend. Un déploiement purement statique ne suffit plus, même avec une
clé IA, car les tweets viennent de la base et le scheduler doit tourner côté serveur.

Deux composants sont à déployer :

1. **Frontend statique** : build Vercel ou Netlify, `VITE_API_URL` vers le backend.
2. **Backend** : Express + SQLite ou PostgreSQL + scheduler + accès OpenCode.

## 1. Frontend sur Vercel

### Configuration du projet

- Importez le dépôt dans Vercel.
- **Root Directory** : `frontend`.
- **Framework Preset** : Vite (détecté automatiquement).
- **Build Command** : `npm run build`.
- **Output Directory** : `dist`.
- **Install Command** : `npm install` (ou `npm ci`).

Le fichier `frontend/vercel.json` contient le rewrite SPA :

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Il permet à React Router de servir `/tweet/:id` et la page 404 sans erreur 404 du
serveur statique.

### Variables

| Variable | Obligatoire | Exemple |
| --- | --- | --- |
| `VITE_API_URL` | Oui | `https://api.example.com` |

Le modèle et la clé IA sont configurés uniquement sur le backend
(`OPENCODE_MODEL`, `OPENCODE_API_KEY`). Ne créez aucune variable
`VITE_OPENCODE_*` : elle serait intégrée au bundle public.

Si `VITE_API_URL` est absent, le frontend utilise `http://localhost:3001` et les
appels échouent depuis un site déployé.

Relancez un déploiement après toute modification d'une variable `VITE_*` : la valeur
est intégrée au build.

## 2. Frontend sur Netlify

### Configuration

- **Base directory** : `frontend`.
- **Build command** : `npm run build`.
- **Publish directory** : `dist`.
- **Functions** : aucune.

Le fichier `frontend/public/_redirects` est copié dans `dist` au build :

```text
/* /index.html 200
```

Il fournit le fallback SPA pour React Router.

### Variables

Même variable que Vercel : `VITE_API_URL` pointant vers le backend. Relancez le
déploiement après modification.

## 3. Backend sur Railway ou Render

### Paramètres communs

| Paramètre | Valeur |
| --- | --- |
| Root Directory | `backend` |
| Install Command | `npm install` ou `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Node.js | 20 ou plus récent |

Le backend écoute sur `process.env.PORT`, fourni par la plateforme. Ne fixez pas
`PORT` à `3001` en production si la plateforme l'injecte déjà.

### Variables minimales

```env
NODE_ENV=production
DEMO_MODE=false
DB_CLIENT=sqlite
SQLITE_PATH=/data/sardochemetre.db
CORS_ORIGIN=https://votre-frontend.example
TRUST_PROXY=1
ANALYZE_RATE_LIMIT=10
ANALYZE_RATE_WINDOW_MS=60000
# ANALYZE_API_KEY=...       # protège les routes POST d'analyse
# ANALYZE_RATE_LIMIT_SHARED=true  # compteur partagé en multi-instance
# SCHEDULER_LOCK_TTL_MS=900000    # bail du scheduler

TWITTER_SOURCE=profile
TWITTER_SYNC_LIMIT=5
CRON_SCHEDULE=*/5 * * * *
CRON_RUN_ON_START=false

AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_MODEL=deepseek-v4.1-flash
OPENCODE_PLAN=payg
# OPENCODE_BASE_URL=...
```

La source `profile` ne nécessite aucun token X. Elle lit la page publique
`x.com/Sardoche`.

### Variante API X officielle

Si vous disposez d'un Bearer Token et souhaitez une source plus robuste :

```env
TWITTER_SOURCE=x
TWITTER_BEARER_TOKEN=…
SARDOCHE_USERNAME=Sardoche
# ou SARDOCHE_USER_ID=123456789
```

L'API X v2 est officielle mais soumise aux quotas de votre offre. C'est la voie
recommandée pour un déploiement durable, car le parsing HTML de `profile` peut casser
à tout moment.

### Variante Anthropic

Le provider Anthropic reste disponible pour compatibilité :

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

OpenCode reste le provider standard et le seul documenté pour les plans payg/Go.

## 4. OpenCode sur le backend

Le backend relaie les appels vers OpenCode. Il choisit l'URL selon `OPENCODE_PLAN` :

| Offre | URL |
| --- | --- |
| `payg` | `https://opencode.ai/inference/openai/v1/chat/completions` |
| `go` | `https://opencode.ai/inference/go/openai/v1/chat/completions` |

`OPENCODE_BASE_URL` permet de surcharger l'URL de base. L'authentification utilise
`Authorization: Bearer oc_sk_...`. Pour l'offre Go, le backend ajoute
`x-opencode-session`.

Le **pay-as-you-go** est recommandé pour un service public. L'offre Go est prévue
pour les agents de codage ; elle fonctionne mais doit être vérifiée si vous l'utilisez
pour ce trafic.

Points à vérifier :

- la clé est créée sur <https://opencode.ai/console> ;
- elle est stockée uniquement dans les variables du backend ;
- le modèle `deepseek-v4.1-flash` est disponible pour votre offre ;
- les modèles « free » OpenCode renvoient `403` depuis un client externe ;
- `GET /api/ai/status` indique l'état de la configuration ;
- `POST /api/ai/analyze` répond `503` si la clé manque.

Les appels sont facturés selon l'offre OpenCode. Les routes d'analyse sont protégées
par un rate limiting (10 requêtes par IP et par minute par défaut,
`ANALYZE_RATE_LIMIT` et `ANALYZE_RATE_WINDOW_MS`). Derrière le proxy de la plateforme,
activez `TRUST_PROXY=1` pour que la limite s'applique par IP réelle. Le compteur est
en mémoire par défaut ; `ANALYZE_RATE_LIMIT_SHARED=true` le partage entre instances
via `analyze_rate_limits`. `ANALYZE_API_KEY` permet d'exiger une clé partagée
(`Authorization: Bearer` ou `x-analyze-key`) sur les routes POST d'analyse et de
masquer la réanalyse côté frontend. Voir [`AI_MODE.md`](AI_MODE.md) pour les tarifs
indicatifs.

## 5. SQLite avec disque persistant

SQLite exige un système de fichiers persistant. Sur Railway ou Render, créez un
volume/disque et montez-le, par exemple sur `/data`.

```env
DB_CLIENT=sqlite
SQLITE_PATH=/data/sardochemetre.db
```

Points d'attention :

- Le processus doit pouvoir écrire dans le dossier monté.
- Les fichiers `sardochemetre.db-wal` et `sardochemetre.db-shm` sont créés à côté de
  la base : ils doivent rester sur le même volume.
- **Une seule instance** backend doit utiliser ce fichier. Pas de scale horizontal
  avec SQLite.
- Un redéploiement sans disque persistant recrée une base vide : le profil et les
  tweets disparaissent, et le scheduler doit tout recollecter.
- Certaines plateformes facturent les disques persistants ; vérifiez l'offre.

La base contient les tweets, le profil unique et les analyses. Sauvegardez le fichier
SQLite ou le volume avant une migration importante.

## 6. PostgreSQL

1. Provisionnez une base PostgreSQL (service managé ou add-on de la plateforme).
2. Définissez :

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:password@host:5432/database
```

3. Appliquez les migrations **une fois** (release command, job ponctuel ou shell) :

```bash
npm run migrate
```

Les migrations créent le schéma initial, la colonne `source`, les compteurs
`replies`/`views`, les JSON `media`/`quoted_tweet`, la table `profile`, le bail
`scheduler_leases` et le compteur de débit `analyze_rate_limits`.

4. Démarrez le backend avec `npm start`.

PostgreSQL évite le disque persistant et permet plusieurs instances. Le scheduler
est protégé par le bail `scheduler_leases` : **une seule instance** exécute le cron,
même si plusieurs backends démarrent. Exécutez `npm run migrate` pour créer les
tables `scheduler_leases` et `analyze_rate_limits` ; sinon le scheduler refuse de
démarrer et le limiteur partagé renvoie une erreur. Ce chemin est implémenté, mais
n'a pas été exécuté ici contre un serveur PostgreSQL réel.

## 7. Relier le frontend au backend

Sur Vercel ou Netlify, définissez au moment du build :

```env
VITE_API_URL=https://votre-backend.example
```

Puis redéployez le frontend. Si l'URL change, il faut reconstruire : la variable est
intégrée dans le bundle.

Côté backend, autorisez l'origine du frontend dans `CORS_ORIGIN`. Sans cela, le
navigateur bloquera les requêtes.

```env
CORS_ORIGIN=https://mon-site.vercel.app
```

Plusieurs origines :

```env
CORS_ORIGIN=https://mon-site.vercel.app,https://www.mon-site.fr
```

Utilisez l'origine exacte (schéma + domaine), sans slash final. Redéployez ou
redémarrez après modification.

## 8. Scheduler

Le scheduler démarre uniquement si :

- `DEMO_MODE` n'est pas `true` ;
- la source de tweets est valide ;
- `TWITTER_BEARER_TOKEN` est présent si `TWITTER_SOURCE=x` (inutile avec `profile`
  et `syndication`) ;
- le provider IA est configuré ;
- `CRON_SCHEDULE` est valide.

Avec la configuration recommandée :

```env
TWITTER_SOURCE=profile
TWITTER_SYNC_LIMIT=5
CRON_SCHEDULE=*/5 * * * *
```

Chaque cycle récupère jusqu'à 5 tweets, enregistre les nouveaux et analyse ceux qui
ne le sont pas encore. Les anciens tweets restent en base. Un bail
`scheduler_leases` est acquis au démarrage et renouvelé par heartbeat ; une seule
instance exécute le cron, et le bail est libéré à l'arrêt.

Sur une plateforme qui endort les instances, le cron peut ne pas tourner à l'heure
prévue, et la page x.com peut être bloquée. Utilisez une instance toujours active ou
un scheduler externe. Si la collecte `profile` échoue de façon répétée, basculez sur
`TWITTER_SOURCE=x` avec un Bearer Token.

## 9. Checklist de mise en production

### Sécurité

- [ ] `DEMO_MODE=false` et source de tweets réelle configurée.
- [ ] `OPENCODE_API_KEY` uniquement côté backend, jamais dans `VITE_*`.
- [ ] `CORS_ORIGIN` restreint au domaine du frontend.
- [ ] Aucun `.env` ni secret versionné.
- [ ] `POST /api/ai/analyze` et `POST /api/tweets/analyze` protégés par rate
      limiting et, si le backend est public, par `ANALYZE_API_KEY`.
- [ ] `TRUST_PROXY` adapté au proxy de la plateforme et limite de débit vérifiée
      (`ANALYZE_RATE_LIMIT`, `ANALYZE_RATE_WINDOW_MS`).
- [ ] En multi-instance : `ANALYZE_RATE_LIMIT_SHARED=true` et migration
      `004_scheduler_lease.sql` appliquée.
- [ ] `NODE_ENV=production`.
- [ ] Base non exposée publiquement.

### Données

- [ ] SQLite sur disque persistant, ou PostgreSQL provisionné.
- [ ] Migrations exécutées (`npm run migrate`) si PostgreSQL.
- [ ] Sauvegardes ou snapshots prévus.
- [ ] Une seule instance pour SQLite (le bail scheduler couvre le cron).

### Frontend

- [ ] Build `npm run build` valide.
- [ ] Rewrites SPA actifs (`vercel.json` ou `_redirects`).
- [ ] `VITE_API_URL` pointe vers le backend.
- [ ] Aucune clé IA dans le bundle frontend.
- [ ] Une page `/tweet/<id>` réelle est accessible directement (pas de 404 serveur).
- [ ] Une page inconnue affiche la 404 applicative.

### Vérifications fonctionnelles

- [ ] `GET /health` répond `status: ok`.
- [ ] `GET /api/profile` renvoie un `username` non vide.
- [ ] `GET /api/tweets?period=all` renvoie des tweets avec `author`, `media` et
      compteurs.
- [ ] `GET /api/tweets/:id` renvoie le détail du premier tweet de la liste.
- [ ] `GET /api/tweets/stats?period=week` renvoie des statistiques.
- [ ] `GET /api/tweets/bullshitmetre?period=week` renvoie un score et un niveau.
- [ ] `GET /api/ai/status` indique que le provider est configuré.
- [ ] `POST /api/ai/analyze` renvoie une analyse.
- [ ] Sans clé, `POST /api/ai/analyze` renvoie bien `503`.
- [ ] Le site est utilisable sur mobile sans débordement horizontal.
- [ ] Les embeds affichent avatar, badge, médias, citation et compteurs.

## 10. Dépannage de déploiement

| Symptôme | Piste |
| --- | --- |
| 404 sur `/tweet/<id>` en rechargeant | Rewrite SPA absent ou mal configuré. Vérifiez `vercel.json` / `_redirects`. |
| `Network Error` côté frontend | `VITE_API_URL` absent, backend arrêté ou CORS bloqué. |
| Erreur CORS | `CORS_ORIGIN` ne correspond pas exactement à l'origine. |
| `503` sur `/api/ai/analyze` | `OPENCODE_API_KEY` absente, `AI_PROVIDER` incorrect ou backend non redémarré. |
| `401`/`403` OpenCode | Clé invalide, offre inadaptée, modèle « free » ou session Go absente. |
| `402` OpenCode | Compte sans crédits : approvisionner le payg ou passer sur Go. |
| Base vide après redéploiement | SQLite sans disque persistant. |
| `SQLITE_BUSY` | Plusieurs instances ou plusieurs processus sur le même fichier. |
| Aucun tweet collecté | `DEMO_MODE=true`, source invalide, page x.com bloquée ou scheduler non démarré. |
| `profile_user_originals_timeline introuvable` | X a changé sa page ou renvoyé une page vide : réessayez, utilisez `syndication`, ou passez à `TWITTER_SOURCE=x`. |
| Scheduler silencieux | `DEMO_MODE=true`, provider IA non configuré, `CRON_SCHEDULE` invalide ou token X manquant. |
| Build Vercel/Netlify en échec | Vérifiez la racine `frontend`, la version de Node et `npm ci`. |
