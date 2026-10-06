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

L'URL de l'API se règle dans `src/environments/environment.ts` (`apiUrl`). Les images des cartes sont servies par l'API ;
en dev, `ng serve` les relaie sur `/memes` (`proxy.conf.json`) pour que les scènes 3D puissent en faire des textures.

Il n'y a pas encore d'authentification : le joueur se choisit dans la navbar (`demo` ou `rival`, gardé dans le `localStorage`).
Un interceptor (`services/user-id.interceptor.ts`) envoie son id dans le header `X-User-Id` à chaque appel de l'API.
Changer de joueur recharge le solde et la page courante.

## Pages
| URL | Rôle |
|---|---|
| `/boutique` | Vitrine 3D du pack configuré (type, format, display mixte 50/50), cotes en barres par rareté, prix par booster et économie par format ; après l'achat, « Ouvrir maintenant ». En bas, les cartes les plus rares à gagner |
| `/inventaire` | Boosters non ouverts : un groupe par tri-pack ou display acheté, les autres groupés par type |
| `/ouverture/:id` | Ouvre le booster (appel POST) en 3D : le paquet se déchire, les cartes se retournent une à une, puis un récap |
| `/ouverture/box/:purchaseId` | Ouvre un tri-pack ou un display : la box s'ouvre en 3D, on choisit ses boosters un par un ou « Tout ouvrir » |
| `/collection` | Les 300 cartes, grisées si non possédées ; un clic ouvre la carte en 3D. Une carte possédée peut être mise en vente sur le marché ou vendue au système, qui la rachète à 50 % de son prix (il n'en vend pas) |
| `/marche` | Les annonces des joueurs, avec l'écart au prix système ; « Acheter », ou « Retirer » sur ses propres annonces |

La navbar affiche le solde du joueur (rechargé après chaque achat) et le bouton « Booster gratuit » (un toutes les 30 minutes,
compte à rebours sinon ; c'est l'API qui décide et renvoie une 429 si c'est trop tôt).

## Organisation du code (`src/app`)
- `services/game.service.ts` : tous les appels à l'API, et `profile$` (le solde de la navbar)
- `models/game.model.ts` : les types des réponses de l'API (miroir des DTO), les libellés français des raretés, finitions et formats
- `services/player.service.ts` : le joueur courant ; `services/user-id.interceptor.ts` : le header `X-User-Id`
- `meme-card/` : une carte en CSS (retournement, cadre selon la rareté, reflet holo, bordure de flammes via le filtre SVG
  `#cc-fire` défini une fois dans `app.component.html`), utilisée par les grilles
- `three/` : les scènes 3D (Three.js + GSAP), toujours chargées en `import()` pour rester hors du bundle initial :
  `stage.ts` (socle commun), `card-art.ts` (cartes, holo, feu en shader) et `pack-art.ts` (boosters et box), `booster-scene.ts`,
  `box-scene.ts`, `card-viewer.ts`, `shop-scene.ts`
- `booster-opening/` : le déroulé 3D d'un booster, utilisé par `/ouverture/:id` et par la box
- `card-inspect/` : la modale 3D d'une carte (collection, récaps, marché)
- `shop/`, `inventory/`, `opening/`, `box-opening/`, `collection/`, `market/` : les pages ; les données sont chargées par des
  resolvers déclarés dans `app-routing.module.ts`

## À savoir
- Dans le SCSS d'un composant, ne pas faire `@use "theme"` : ça embarque tout le CSS Angular Material dans le composant
  (64 kB, le build de prod échoue sur le budget par composant). Utiliser les variables `--cc-purple` / `--cc-red` définies dans `src/styles.scss`.
- `ng build` affiche un avertissement sur la taille totale (environ 940 kB pour un budget de 500 kB, surtout le CSS Bootstrap + Material) : ce n'est pas bloquant.
