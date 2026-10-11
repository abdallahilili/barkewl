# Gestion de pharmacie — Frontend (React + TypeScript + Tailwind)

Interface web : caisse rapide (recherche/lecteur code-barres), stock, lots et péremptions, achats, inventaires, sessions de caisse, rapports.

## Installation

```bash
npm install
cp .env.example .env      # VITE_URL_API = adresse de l'API Django (ex. http://localhost:8000/api)
npm run dev               # http://localhost:5173
npm run build             # production : dossier dist/ à servir en HTTPS (nginx, etc.)
```

Le backend doit autoriser l'origine du frontend (`ORIGINES_CORS` dans son `.env`).

## Organisation (`src/`)

`pages/` écrans · `composants/` éléments réutilisables (tableau paginé, modales, page de gestion générique `PageCrud`, sélecteurs) ·
`fonctionnalites/` blocs propres à un module · `services/` Axios + JWT (rafraîchissement automatique) · `hooks/` authentification et listes ·
`miseEnPage/` barre latérale et menu par rôle · `routes/` routes protégées par module · `types/` · `utilitaires/`.

## Utilisation de la caisse

1. Ouvrir une session (menu Caisse) avec le fond de caisse.
2. Nouvelle vente : scanner ou taper le nom → Entrée pour ajouter (F2 : recherche, F9 : encaisser).
3. Encaisser : le serveur choisit les lots (le plus proche de la péremption d'abord) et confirme le total ; paiement simple ou mixte ; reçu imprimable.
4. En fin de journée : clôturer la session (comptage des espèces, écart affiché).

Le jeton d'accès reste en mémoire ; seul le jeton de rafraîchissement est stocké dans le navigateur (`localStorage`).
