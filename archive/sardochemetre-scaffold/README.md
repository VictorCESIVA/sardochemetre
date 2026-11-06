# 🧢 SardocheMètre

Site web satirique qui analyse les tweets de Sardoche via l'IA et leur attribue un **score de bullshit** de 0 à 100.

## 🆓 NOUVEAU : Mode Gratuit Disponible !

**Deux modes d'utilisation au choix :**

### Mode Gratuit 🆓 (Recommandé pour démarrer)
- ✅ **Aucune API key requise**
- ✅ **100% gratuit** (modèle Qwen 3.6 Plus via Puter.js)
- ✅ **Frontend uniquement** - pas de backend nécessaire
- ⚡ **Démarrage en 2 minutes**

```bash
cd frontend && npm install && npm run dev
# Basculer en mode "🆓 Gratuit" via le toggle en haut à droite
```

**Voir [PUTER_MODE.md](../PUTER_MODE.md) pour tous les détails.**

### Mode API Backend 🔑 (Production complète)
- Base de données PostgreSQL
- Cron job automatique (analyse toutes les heures)
- Claude Sonnet 4 pour l'analyse IA
- Nécessite `ANTHROPIC_API_KEY` + `TWITTER_BEARER_TOKEN`

**Voir [SETUP.md](../SETUP.md) pour l'installation complète.**

---

## Overview

SardocheMètre est une application web satirique qui analyse les tweets publics de Sardoche (streamer français) en utilisant l'intelligence artificielle, et affiche un **score de bullshit** de 0 à 100 avec des commentaires sarcastiques.

## Project Structure

```
sardochemetre/
├── backend/          # Node.js/Express API
│   ├── services/     # Business logic (Twitter, AI analysis)
│   ├── routes/       # API endpoints
│   ├── mock/         # Mock data for development
│   └── migrations/   # Database migrations
├── frontend/         # React/Vite application
└── .env.example      # Environment variables template
```

## Features

- **Analyse satirique** : Détecte le bullshit avec humour
- **Fact-checking** : Vérifie les affirmations factuelles
- **Commentaires sarcastiques** : Style commentateur foot
- **Barre animée** : Visualisation du niveau de bullshit
- **Double mode** : API Backend OU Puter gratuit
- **Responsive design** : Mobile-friendly

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL
- Anthropic Claude API
- Twitter API v2

### Frontend
- React
- Vite
- Chart/visualization library

## Setup

1. **Clone and install dependencies**
   ```bash
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Set up database**
   ```bash
   # Create PostgreSQL database
   createdb sardochemetre
   # Run migrations (to be created)
   ```

4. **Run the application**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

## API Endpoints

- `GET /api/mood/current` - Get latest mood analysis
- `GET /api/mood/history` - Get historical mood data
- `GET /api/tweets/latest` - Get latest tweets

## Development

The backend runs on `http://localhost:3001` and frontend on `http://localhost:5173` (Vite default).

## License

MIT
