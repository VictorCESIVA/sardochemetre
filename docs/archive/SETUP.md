# SardocheMètre - Setup Guide

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.x or higher recommended)
- **npm** (v9.x or higher, comes with Node.js)
- **PostgreSQL** (v14 or higher)
- **Git** (for cloning the repository)

### Installing Prerequisites

#### Ubuntu/Debian:
```bash
# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Verify installations
node --version
npm --version
psql --version
```

#### macOS:
```bash
# Using Homebrew
brew install node
brew install postgresql

# Start PostgreSQL service
brew services start postgresql
```

---

## 🗄️ Database Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE sardochemetre;
CREATE USER sardoche_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE sardochemetre TO sardoche_user;
\q
```

### 2. Configure Database Connection

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit the `.env` file with your database credentials:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://sardoche_user:your_secure_password@localhost:5432/sardochemetre

# OpenAI/Anthropic API (optional for testing with mock data)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Twitter API (optional - only needed for live tweet fetching)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token_here
SARDOCHE_USER_ID=twitter_user_id_here
```

### 3. Run Database Migrations

```bash
cd backend
npm run migrate
```

This will create the necessary tables (`tweets`, `analyses`, `schema_migrations`).

---

## 🚀 Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

This will install:
- `express` - Web framework
- `pg` - PostgreSQL client
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `node-cron` - Task scheduler
- `@anthropic-ai/sdk` - Claude AI integration

### 2. Load Mock Data (for Testing)

Populate the database with sample tweets and analyses:

```bash
npm run init-data
```

This script loads 8 mock tweets from `backend/mock/tweets.json` into the database with pre-analyzed data.

### 3. Test Module Imports

Verify all backend modules load correctly:

```bash
npm run test-imports
```

### 4. Start the Backend Server

```bash
npm start
```

The API server will start on `http://localhost:3001`

---

## 🎨 Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

This will install:
- `react` - UI framework
- `react-router-dom` - Client-side routing
- `axios` - HTTP client
- `vite` - Build tool
- `tailwindcss` - CSS framework

### 2. Configure API Endpoint

The frontend is pre-configured to connect to `http://localhost:3001`. If your backend runs on a different port, update `frontend/src/utils/api.js`:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

Or create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:3001
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will start on `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

Build output will be in the `frontend/dist/` directory.

---

## 📡 API Endpoints

Once the backend is running, the following endpoints are available:

### Health Check
```
GET /health
```
Returns server status and timestamp.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-04-02T12:00:00.000Z"
}
```

### Get Tweets (Paginated)
```
GET /api/tweets?page=1&limit=20
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20, max: 100) - Items per page

**Response:**
```json
{
  "tweets": [
    {
      "id": "1",
      "content": "Tweet content...",
      "posted_at": "2025-03-28T14:22:00Z",
      "analyzed": true,
      "bullshit_score": 94,
      "verdict": "CHAUD BOUILLANT",
      "analyzed_at": "2025-04-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### Get Single Tweet
```
GET /api/tweets/:id
```

**Response:**
```json
{
  "tweet": {
    "id": "1",
    "content": "Tweet content...",
    "posted_at": "2025-03-28T14:22:00Z",
    "bullshit_score": 94,
    "verdict": "CHAUD BOUILLANT",
    "reasoning": "Analysis explanation...",
    "analyzed_at": "2025-04-01T10:00:00Z"
  }
}
```

### Get Statistics
```
GET /api/tweets/stats?period=all
```

**Query Parameters:**
- `period` (string) - One of: `day`, `week`, `month`, `all`

**Response:**
```json
{
  "period": "all",
  "avgScore": 58.25,
  "minScore": 8,
  "maxScore": 94,
  "totalAnalyzed": 8,
  "verdictDistribution": {
    "BULLSHIT": { "count": 2, "percentage": "25.00" },
    "PLAUSIBLE": { "count": 3, "percentage": "37.50" },
    "FACTUEL": { "count": 3, "percentage": "37.50" }
  }
}
```

### Get Global Bullshit Meter Score
```
GET /api/tweets/bullshitmetre?period=all
```

**Response:**
```json
{
  "period": "all",
  "globalScore": 58.25,
  "level": "ÉLEVÉ",
  "sampleSize": 8,
  "stdDeviation": 32.45,
  "timestamp": "2025-04-02T12:00:00.000Z"
}
```

**Score Levels:**
- `0-24`: FAIBLE
- `25-49`: MODÉRÉ
- `50-74`: ÉLEVÉ
- `75-100`: CRITIQUE

---

## 🧪 Testing the Application

### Manual Testing Checklist

#### Backend Tests:
```bash
# 1. Check server health
curl http://localhost:3001/health

# 2. Get tweets list
curl http://localhost:3001/api/tweets?page=1&limit=5

# 3. Get specific tweet
curl http://localhost:3001/api/tweets/1

# 4. Get statistics
curl http://localhost:3001/api/tweets/stats?period=all

# 5. Get bullshit meter
curl http://localhost:3001/api/tweets/bullshitmetre?period=week
```

#### Frontend Tests:
1. Navigate to `http://localhost:5173`
2. Verify the home page loads without errors
3. Check that tweet cards display correctly
4. Test period tab switching (Aujourd'hui, Semaine, Mois, Tout)
5. Test pagination (if more than 20 tweets)
6. Click a tweet card to navigate to detail page
7. Verify detail page shows all sections:
   - Tweet content
   - Bullshit score gauge
   - Verdict badge
   - Analysis explanation
   - Fact checks
   - Humor comment
8. Test browser back button
9. Check responsive design on different screen sizes

---

## 🔧 Troubleshooting

### Database Connection Issues

**Error:** `connection refused` or `authentication failed`

**Solution:**
1. Verify PostgreSQL is running: `sudo service postgresql status`
2. Check your DATABASE_URL in `.env`
3. Test connection manually: `psql -U sardoche_user -d sardochemetre`

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use a different port in backend/.env
PORT=3002
```

### Missing Dependencies

**Error:** `Cannot find module 'express'`

**Solution:**
```bash
cd backend
npm install
```

### Frontend Build Errors

**Error:** Build fails or blank page in browser

**Solution:**
1. Clear node_modules and reinstall:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Check browser console for errors (F12)
3. Verify API_BASE_URL points to running backend

---

## 📁 Project Structure

```
sardochemetre/
├── backend/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql    # Database schema
│   │   └── migrate.js                 # Migration runner
│   ├── mock/
│   │   └── tweets.json                # Sample data
│   ├── routes/
│   │   └── tweets.js                  # API routes
│   ├── services/
│   │   ├── claudeService.js           # AI analysis
│   │   └── twitterService.js          # Twitter API
│   ├── .env.example                   # Environment template
│   ├── init-mock-data.js              # Load sample data
│   ├── package.json                   # Dependencies
│   ├── scheduler.js                   # Automated jobs
│   ├── server.js                      # Express app
│   └── test-import.js                 # Module tests
│
├── frontend/
│   ├── public/                        # Static assets
│   ├── src/
│   │   ├── components/                # React components
│   │   │   ├── BullshitMetre.jsx
│   │   │   ├── TweetCard.jsx
│   │   │   ├── VerdictBadge.jsx
│   │   │   └── Loading.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx               # Dashboard
│   │   │   └── TweetDetail.jsx        # Tweet detail
│   │   ├── utils/
│   │   │   └── api.js                 # API client
│   │   ├── App.jsx                    # Root component
│   │   └── main.jsx                   # Entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js                 # Vite config
│   └── tailwind.config.js             # Tailwind config
│
├── CLAUDE.md                          # Project vision
├── SETUP.md                           # This file
└── README.md
```

---

## 🌐 Deployment

### Backend (Railway/Render)

1. Create a PostgreSQL database on your hosting platform
2. Set environment variables (DATABASE_URL, PORT, etc.)
3. Deploy the `backend/` directory
4. Run migrations after deployment

### Frontend (Vercel/Netlify)

1. Build the frontend: `npm run build`
2. Deploy the `frontend/dist/` directory
3. Set VITE_API_URL to your backend URL
4. Configure build command: `npm run build`
5. Configure output directory: `dist`

---

## 📝 Notes

- **Mock Data:** The system includes 8 pre-analyzed tweets for testing
- **Live Tweets:** To fetch real tweets, add TWITTER_BEARER_TOKEN and SARDOCHE_USER_ID to `.env`
- **AI Analysis:** Requires ANTHROPIC_API_KEY for live analysis (optional with mock data)
- **Scheduler:** Runs hourly to fetch and analyze new tweets (can be disabled in `server.js`)
- **Disclaimer:** This is a satirical project. All analyses are AI-generated.

---

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the CLAUDE.md file for project architecture
3. Inspect browser console (F12) for frontend errors
4. Check backend logs in the terminal

---

**Last Updated:** April 2, 2025

---

## Mode Gratuit Puter 🆓

### Démarrage rapide (sans API keys)

```bash
# 1. Frontend uniquement
cd frontend
npm install
npm run dev

# 2. Ouvrir http://localhost:5173
# 3. Basculer en mode "Gratuit" avec le toggle en haut à droite
```

**C'est tout !** ✨ L'analyse IA fonctionne directement dans le navigateur avec Qwen 3.6 Plus Preview (modèle 100% gratuit).

### Caractéristiques du mode gratuit

- ✅ **Aucune API key requise**
- ✅ **Aucun serveur backend requis**
- ✅ **Aucun coût** (modèle Qwen gratuit via Puter.js)
- ✅ **Analyse temps réel** dans le navigateur
- ⚠️ Utilise des tweets mockés pour la démo
- ⚠️ Pas de sauvegarde en base de données
- ⚠️ Pas de cron job automatique

### Pour en savoir plus

Voir **[PUTER_MODE.md](./PUTER_MODE.md)** pour tous les détails techniques.

---
