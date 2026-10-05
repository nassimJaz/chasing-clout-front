# Chasing Clout — Front

Front Angular 17 du jeu de cartes à collectionner Chasing Clout (300 cartes de mèmes).
L'API Spring Boot est dans le repo voisin `chasing-clout-api` : son README décrit le modèle de données, les règles du jeu et les routes.

## Installations nécessaires
- Node JS : https://nodejs.org/en/download (Angular 17 supporte officiellement Node 18 et 20 ; testé aussi avec Node 24)
- Angular CLI (facultatif, `npx ng` suffit) : `npm install -g @angular/cli`

## Lancer le projet
1. Lancer l'API d'abord (base Docker + `BackSkeletonApplication`, cf. README de `chasing-clout-api`) : elle doit répondre sur `http://localhost:8080`
2. `npm i`
3. `npm start` et se rendre sur `http://localhost:4200/`

L'URL de l'API se règle dans `src/environments/environment.ts` (`apiUrl`). Les images des cartes sont servies par l'API.
Il n'y a pas encore d'authentification : on joue toujours avec l'utilisateur `demo` (5000 memes au départ).

## Pages
| URL | Rôle |
|---|---|
| `/boutique` | Les 3 boosters avec leurs cotes ; achat par format (1, 3, 9, 30, 60), mixte 50/50 pour les Display Medium et Méga |
| `/inventaire` | Boosters non ouverts, groupés par type |
| `/ouverture/:id` | Ouvre le booster (appel POST) et révèle les cartes une à une |
| `/collection` | Les 300 cartes, grisées si non possédées ; filtres par rareté et « possédées seulement » |

Le solde du joueur est affiché dans la navbar et rechargé après chaque achat.

## Organisation du code (`src/app`)
- `services/game.service.ts` : tous les appels à l'API, et `profile$` (le solde de la navbar)
- `models/game.model.ts` : les types des réponses de l'API (miroir des DTO), les libellés français des raretés, finitions et formats
- `meme-card/` : une carte (retournement 3D, cadre selon la rareté, reflet holo, flammes), utilisée par l'ouverture et la collection
- `shop/`, `inventory/`, `opening/`, `collection/` : les pages ; les données sont chargées par des resolvers déclarés dans `app-routing.module.ts`

## À savoir
- Dans le SCSS d'un composant, ne pas faire `@use "theme"` : ça embarque tout le CSS Angular Material dans le composant
  (64 kB, le build de prod échoue sur le budget par composant). Utiliser les variables `--cc-purple` / `--cc-red` définies dans `src/styles.scss`.
- `ng build` affiche un avertissement sur la taille totale (environ 880 kB pour un budget de 500 kB, surtout le CSS Bootstrap + Material) : ce n'est pas bloquant.
