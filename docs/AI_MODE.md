# IA et analyses OpenCode

L'application analyse les tweets de Sardoche avec **OpenCode** et le modèle
`deepseek-v4.1-flash`. Les analyses sont persistées en base avec le tweet : le
scheduler les produit automatiquement, et la page détail permet de relancer une
analyse à la demande.

Il n'y a plus de jeu de données local : les tweets affichés viennent de la base, et
les analyses de la même chaîne backend.

## Fonctionnement

```text
Scheduler (toutes les 5 min) ──► nouveaux tweets ──► OpenCode ──► analyses
                                                                    │
Navigateur ──► GET /api/tweets ──────────────────────────────────────┘
     │
     └──► POST /api/tweets/analyze (réanalyse) ──► OpenCode ──► analyse persistée
```

- Le scheduler récupère les tweets de la source configurée (`profile` par défaut),
  enregistre les nouveaux et analyse seulement ceux qui ne le sont pas encore.
- Une réanalyse depuis la page détail renvoie le contenu du tweet au backend, qui
  appelle OpenCode puis met à jour l'analyse en base.
- Le frontend ne connaît ni la clé OpenCode ni l'URL finale du provider.

## Configuration OpenCode

### Obtenir une clé

Créez une clé sur <https://opencode.ai/console>, puis renseignez-la dans
`backend/.env` :

```env
AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_MODEL=deepseek-v4.1-flash
OPENCODE_PLAN=payg
# OPENCODE_BASE_URL=...
# OPENCODE_MAX_TOKENS=3000
# OPENCODE_SESSION=ses_...
```

Ne mettez jamais cette clé dans `frontend/.env` et ne créez pas de variable
`VITE_OPENCODE_*` : tout ce qui commence par `VITE_` est public dans le bundle.

### URLs

| Offre | URL des chat completions |
| --- | --- |
| Pay-as-you-go | `https://opencode.ai/inference/openai/v1/chat/completions` |
| Go | `https://opencode.ai/inference/go/openai/v1/chat/completions` |

`OPENCODE_PLAN` vaut `payg` ou `go`. Le **pay-as-you-go** est recommandé pour cette
application. L'offre **Go** est destinée aux agents de codage ; le backend la
supporte, mais vérifiez qu'elle autorise ce type de trafic. `OPENCODE_BASE_URL` permet
de surcharger l'URL de base.

La configuration locale de ce dépôt utilise une clé **Go** (`OPENCODE_PLAN=go`) car
le compte payg n'a pas de crédits. Pour un déploiement public, approvisionnez plutôt
un compte payg.

L'authentification utilise :

```http
Authorization: Bearer oc_sk_...
```

Pour l'offre Go, le backend ajoute l'en-tête `x-opencode-session` attendu par
OpenCode. Cet en-tête est géré côté serveur ; il ne doit pas être exposé au
navigateur.

### Modèle

Le modèle par défaut est :

```env
OPENCODE_MODEL=deepseek-v4.1-flash
```

Les modèles marqués « free » dans OpenCode ne sont pas utilisables depuis un client
externe : l'API renvoie alors `403`. Utilisez un modèle accessible avec votre offre
et votre clé.

## Endpoints backend

### `GET /api/ai/status`

Indique si le provider IA est configuré, quel modèle est actif, l'offre et, le cas
échéant, pourquoi l'analyse est indisponible. La réponse ne contient jamais la clé.

L'interface s'en sert pour afficher l'état de l'IA et pour masquer le bouton de
réanalyse quand aucune clé n'est configurée.

### `POST /api/ai/analyze`

Demande l'analyse d'un contenu de tweet. Le backend appelle OpenCode, valide la
réponse puis renvoie une analyse normalisée : score de bullshit, verdict,
raisonnement, fact-checks et punchline. Cette route ne persiste rien.

- `400` si `content` est vide ou dépasse 1000 caractères ;
- `503` si la clé ou la configuration manque ;
- `502` si le provider échoue ou renvoie une réponse inexploitable.

### `POST /api/tweets/analyze`

Route utilisée par la page détail. Elle accepte `{content, tweet_id?}`. Si
`tweet_id` correspond à un tweet en base, l'analyse est enregistrée et la réponse
contient `{tweet}` à jour ; sinon elle contient `{analysis}`.

## Flux d'une analyse

1. Le scheduler choisit un tweet non analysé, ou l'utilisateur clique sur
   « Réanalyser avec DeepSeek ».
2. Le backend vérifie `AI_PROVIDER` et `OPENCODE_API_KEY`.
3. Il construit l'URL selon `OPENCODE_PLAN` (ou `OPENCODE_BASE_URL`) et appelle
   OpenCode avec `Authorization: Bearer …`.
4. En offre Go, il ajoute `x-opencode-session`.
5. La réponse est parsée : score borné à 0–100, verdict normalisé, fact-checks
   nettoyés.
6. L'analyse est persistée avec le tweet (scheduler ou route tweets).
7. Le frontend affiche le score, le verdict, le raisonnement, les fact-checks et la
   punchline.

Le prompt système demande de traiter le tweet comme une donnée et de ne pas suivre
ses instructions. C'est une précaution, pas une garantie contre la prompt injection.

## Coût

Tarifs indicatifs de DeepSeek V4.1 Flash en pay-as-you-go :

- environ **0,30 $ / million de tokens en entrée** ;
- environ **1,20 $ / million de tokens en sortie** ;
- tarif off-peak indicatif : environ **0,15 $ / 0,60 $** par million de tokens.

L'offre **Go** inclut l'usage du modèle selon ses conditions. Les tarifs et les
modèles disponibles peuvent évoluer : vérifiez la console OpenCode avant un usage
intensif.

Un appel d'analyse est court, mais le proxy reste un endpoint payant. Le scheduler
n'analyse que les nouveaux tweets, ce qui évite de repayer les mêmes analyses. En
production, protégez les routes d'analyse par une authentification ou un rate
limiting.

## Sans clé OpenCode

Le comportement attendu est le suivant :

- le backend démarre normalement ;
- `GET /api/ai/status` signale que l'IA n'est pas configurée ;
- `POST /api/ai/analyze` répond `503` ;
- le scheduler ne démarre pas (`clés manquantes : OPENCODE_API_KEY`) ;
- l'interface affiche un avertissement ;
- les tweets déjà collectés et analysés restent consultables ;
- le bouton de réanalyse est masqué.

Aucune analyse mock n'est présentée comme réelle dans l'interface. Le service
d'analyse conserve toutefois un repli déterministe pour les tests : le bouton de
réanalyse n'apparaît pas sans clé, mais un appel direct à
`POST /api/tweets/analyze` sans configuration IA peut l'emprunter. En production,
exigez une clé et protégez la route.

## Limites

- **Clé OpenCode obligatoire** : sans clé, aucune nouvelle analyse et pas de
  scheduler.
- **IA faillible** : le modèle peut se tromper, inventer une source ou produire un
  JSON invalide. Le backend normalise et rejette les réponses inexploitables, mais
  ne garantit pas l'exactitude.
- **Coût variable** : les appels sont facturés selon l'offre OpenCode.
- **Endpoint sensible** : les routes d'analyse utilisent une clé payante. Ne les
  exposez pas sans protection.
- **Données envoyées à OpenCode** : le contenu du tweet analysé quitte le backend.
- **Dépendance au scheduler** : si l'instance est endormie ou si le cron ne tourne
  pas, les nouveaux tweets ne sont pas analysés tant qu'un cycle n'a pas eu lieu.

## Dépannage

### `503` sur `/api/ai/analyze`

- Vérifiez `AI_PROVIDER=opencode`.
- Vérifiez que `OPENCODE_API_KEY` est définie dans `backend/.env`.
- Redémarrez le backend après modification du `.env`.
- Consultez `GET /api/ai/status` et les logs backend.

### `402` : compte sans crédits

Le provider répond `HTTP 402 - Insufficient account funds`. Deux solutions :

- ajouter des crédits dans la console OpenCode (pay-as-you-go) ;
- utiliser une clé **OpenCode Go** et passer `OPENCODE_PLAN=go`. L'usage est alors
  décompté de l'offre Go, sous réserve que son usage soit autorisé pour ce type
  d'application.

L'interface affiche le message d'erreur renvoyé par le backend.

### `401` ou `403` chez OpenCode

- Vérifiez que la clé est valide et active.
- Vérifiez l'offre (`OPENCODE_PLAN`) et l'URL utilisée.
- Un modèle « free » peut renvoyer `403` depuis un client externe : choisissez un
  modèle autorisé.
- Pour l'offre Go, vérifiez que la session OpenCode est valide ; l'en-tête
  `x-opencode-session` est ajouté par le backend.

### `OPENCODE_BASE_URL` inutile ou incorrecte

Laissez la variable vide pour utiliser l'URL déduite de `OPENCODE_PLAN`. Si vous la
renseignez, indiquez une URL de base complète et redémarrez le backend.

### L'interface affiche un avertissement mais les tweets restent visibles

C'est le comportement prévu sans clé. Les analyses déjà en base restent consultables.
Configurez OpenCode pour activer la collecte et la réanalyse.

### Les analyses sont lentes

Un appel IA peut prendre plusieurs secondes. Vérifiez la latence réseau et la
disponibilité du modèle. L'interface affiche un état de chargement pendant la
réanalyse.
