# 🎉 SardocheMètre - BACKEND ACTIF !

## ✅ Statut actuel

Le backend fonctionne maintenant en **MODE DEMO** avec :
- ✅ 8 tweets mockés de Sardoche
- ✅ Analyses IA générées automatiquement (via algorithme mock crédible)
- ✅ API REST complète sur http://localhost:3001
- ✅ Base SQLite opérationnelle

---

## 🚀 Comment utiliser

### 1. Démarrer le backend

```bash
./start-backend.sh
```

Le backend démarre sur **http://localhost:3001**

### 2. Activer le mode Backend dans le frontend

Dans le site web :
1. Clique sur le toggle en haut à droite
2. Bascule de "🆓 Gratuit" vers "🔑 API"
3. Recharge la page

### 3. Tester l'API directement

```bash
# Liste des tweets
curl http://localhost:3001/api/tweets

# Score bullshit global
curl "http://localhost:3001/api/tweets/bullshitmetre?period=week"

# Statistiques
curl "http://localhost:3001/api/tweets/stats?period=all"

# Un tweet spécifique
curl http://localhost:3001/api/tweets/1
```

---

## 📊 Ce qui fonctionne

### Tweets mockés analysés ✅

Le backend charge automatiquement 8 tweets satiriques et les analyse avec un algorithme qui génère :
- **Score de bullshit** (0-100)
- **Verdict** (VRAI / DOUTEUX / BULLSHIT / CHAUD BOUILLANT)
- **Raisonnement** factuel
- **Fact-checks** détaillés
- **Commentaire humoristique** style punchline

### Analyses variées ✅

Les scores mockés sont répartis intelligemment :
- 15-20 : Tweets raisonnables
- 28-42 : Discutables
- 58-73 : Bullshit modéré
- 85-94 : Chaud bouillant

---

## 🔑 Mode PRODUCTION (pour plus tard)

Pour activer le backend avec de **vraies analyses Claude** :

### 1. Obtenir une clé API Anthropic

→ https://console.anthropic.com/
→ 5$ de crédits gratuits

### 2. Obtenir une clé API Twitter

→ https://developer.twitter.com/
→ Niveau Free suffit

### 3. Configurer le backend

Édite `backend/.env` :

```env
# Passer en mode production
DEMO_MODE=false

# Ajouter les vraies clés
ANTHROPIC_API_KEY=sk-ant-votre-clé-ici
TWITTER_BEARER_TOKEN=votre-bearer-token
SARDOCHE_USER_ID=123456  # ID numérique de @Sardoche
```

### 4. Redémarrer

```bash
kill <PID_du_backend>
./start-backend.sh
```

---

## 🎯 Prochaines étapes possibles

### Option 1 : Rester en mode DEMO
- ✅ Le site fonctionne parfaitement
- ✅ Démo convaincante avec analyses satiriques
- ✅ Aucun coût

### Option 2 : Activer Claude (5$ gratuits)
- Vraies analyses IA de qualité
- Analyses factuelles et précises
- Nécessite une clé API Anthropic

### Option 3 : Activer Twitter + Claude
- Vrais tweets en temps réel
- Analyse automatisée toutes les heures
- Nécessite 2 clés API

---

## 🛑 Arrêter le backend

```bash
# Trouver le PID
ps aux | grep 'node server.js' | grep -v grep

# Kill le processus
kill <PID>
```

---

**Le site est maintenant FONCTIONNEL avec backend + frontend ! 🧢**
