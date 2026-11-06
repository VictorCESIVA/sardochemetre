# ⚡ Démarrage Ultra-Rapide

## 🆓 Mode Gratuit (0 configuration)

```bash
cd frontend
npm install
npm run dev
```

Puis ouvrir http://localhost:5173 et cliquer sur le toggle **"🆓 Gratuit"**

**C'est tout !** L'IA analyse gratuitement via Puter.js (Qwen 3.6 Plus).

---

## 🔑 Mode Production (avec API keys)

### 1. Setup env
```bash
cp .env.example .env
# Éditer .env :
# - ANTHROPIC_API_KEY=sk-ant-...
# - TWITTER_BEARER_TOKEN=...
# - DATABASE_URL=postgresql://...
```

### 2. Base de données
```bash
cd backend
npm install
npm run migrate      # Créer schema
npm run init-data    # Charger mock data
```

### 3. Lancer backend
```bash
npm start            # Port 3001
```

### 4. Lancer frontend (nouveau terminal)
```bash
cd frontend
npm install
npm run dev          # Port 5173
```

### 5. Utiliser
Ouvrir http://localhost:5173, rester en mode **"🔑 API"**

---

## 🆚 Différences

| Fonctionnalité | Mode Gratuit 🆓 | Mode API 🔑 |
|---|---|---|
| **Coût** | $0 | ~$10-15/mois |
| **Setup** | 2 min | 15 min |
| **API Keys** | ❌ Aucune | ✅ Requises |
| **Backend** | ❌ Pas besoin | ✅ Nécessaire |
| **IA** | Qwen 3.6 Plus | Claude Sonnet 4 |
| **Cron Job** | ❌ | ✅ Toutes les heures |
| **Base de données** | ❌ | ✅ PostgreSQL |
| **Données** | Mock tweets | Tweets réels |

---

## 🎯 Recommandation

- **Démo / Portfolio** → Mode Gratuit 🆓
- **Production** → Mode API ��

Tu peux basculer entre les deux avec le toggle !
