# Motissimo

PWA mobile bilingue français/polonais de culture générale et jeux de mots, jouable entièrement hors ligne après la première visite. Chaque langue propose exactement 10 000 manches issues de plus de 500 sources distinctes, un mode mixte et huit modes dédiés à un seul mini-jeu.

La méthode de vérification éditoriale et les références sont détaillées dans [CONTENT_AUDIT.md](CONTENT_AUDIT.md).

## Développement local

```bash
npm install
npm run dev
```

Tests et build de production :

```bash
npm test
npm run build
```

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub et placer le contenu de ce dossier à sa racine.
2. Pousser la branche `main`.
3. Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions**.
4. Le workflow fourni teste, construit et déploie automatiquement l’application sous le bon sous-chemin.

Le jeu n’utilise aucun serveur, compte ni API externe. Les parties, records, statistiques et préférences sont enregistrés dans `localStorage` sur l’appareil.
