# SardocheMètre — frontend

Application React 19 + Vite 8 + Tailwind CSS 4.

## Démarrage

```bash
npm install
npm run dev
```

Le backend doit tourner sur `http://localhost:3001` pour le mode API et pour le
mode Démo IA (proxy OpenCode). Voir le [README principal](../README.md) et
[`docs/SETUP.md`](../docs/SETUP.md).

## Scripts

```bash
npm run dev       # serveur de développement
npm run build     # build de production dans dist/
npm run preview   # prévisualisation du build
npm run lint      # ESLint
npm test          # tests Vitest
```

La clé OpenCode ne doit jamais être placée dans `frontend/.env` : elle reste côté
backend (`OPENCODE_API_KEY`).
