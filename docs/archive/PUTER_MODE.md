# 🆓 Mode Gratuit avec Puter.js

## Pourquoi Puter ?

SardocheMètre propose maintenant **deux modes d'utilisation** :

### 🔑 Mode API Backend (nécessite des clés API)
- Utilise Claude Sonnet 4 pour l'analyse
- Base de données PostgreSQL
- Cron job automatique toutes les heures
- **Nécessite** : `ANTHROPIC_API_KEY`, `TWITTER_BEARER_TOKEN`, serveur Node.js

### 🆓 Mode Gratuit Puter (100% gratuit, zéro configuration)
- Utilise **Qwen 3.6 Plus Preview** (IA gratuite via Puter.js)
- Analyse à la demande dans le navigateur
- **Aucune clé API requise**
- **Aucun backend requis**
- Tweets mockés pour la démo

---

## Comment ça marche ?

### Modèle utilisé : Qwen 3.6 Plus Preview

**Prix** : **$0/million de tokens** (entrée ET sortie) ✨

**Caractéristiques** :
- 1 million de tokens de contexte
- Raisonnement avancé
- Architecture hybride optimisée
- Parfait pour l'analyse de tweets !

**Source** : [Puter AI Models](https://developer.puter.com/ai/models/)

---

## Utilisation

### Basculer entre les modes

Un **toggle** en haut à droite de chaque page permet de changer de mode :

```
🔑 API ◯─────◯ 🆓 Gratuit
```

Le choix est sauvegardé dans `localStorage` et persiste entre les sessions.

---

## Limitations du mode gratuit

1. **Pas de base de données** : Les tweets analysés ne sont pas sauvegardés
2. **Pas d'automatisation** : Pas de cron job, analyse à la demande uniquement
3. **Données mockées** : Utilise les tweets de `backend/mock/tweets.json`
4. **Modèle différent** : Qwen au lieu de Claude (résultats légèrement différents)

---

## Avantages du mode gratuit

✅ **Zéro coût** : Aucune API key, aucun serveur à payer  
✅ **Installation immédiate** : Juste `npm install` et c'est parti  
✅ **Démo facile** : Parfait pour tester ou montrer le projet  
✅ **Frontend uniquement** : Aucune infrastructure backend nécessaire  
✅ **Analyse temps réel** : L'IA analyse directement dans le navigateur  

---

## Code technique

### Installation

```bash
cd frontend
npm install @heyputer/puter.js
```

### Service d'analyse

`frontend/src/services/puterService.js` :

```javascript
import puter from '@heyputer/puter.js';

const response = await puter.ai.chat(prompt, {
  model: 'qwen/qwen-3.6-plus-preview', // 100% GRATUIT !
  temperature: 0.7,
  max_tokens: 1024
});
```

### Context API

`frontend/src/context/AppContext.jsx` gère le mode global :

```javascript
const { apiMode, setApiMode } = useApp();
// apiMode: 'backend' | 'puter'
```

### Service unifié

`frontend/src/services/tweetService.js` route automatiquement :

```javascript
if (apiMode === 'puter') {
  // Utilise Puter + mock data
} else {
  // Utilise backend API
}
```

---

## Modèle "User-Pays"

Puter utilise le modèle **User-Pays** : chaque utilisateur paye sa propre consommation via son compte Puter gratuit. Pour toi en tant que développeur, c'est **100% gratuit**.

Plus d'infos : [User-Pays Model](https://docs.puter.com/user-pays-model/)

---

## Recommandation

**Pour une démo ou un portfolio** → Mode Gratuit 🆓  
**Pour une vraie prod avec archivage** → Mode API Backend 🔑

Tu peux même déployer le frontend seul sur Vercel/Netlify en mode Puter, sans backend !

---

*Créé pour SardocheMètre 🧢*
