# Chasing Clout — Front

Front Angular 17 du jeu de cartes à collectionner Chasing Clout (300 cartes de mèmes).
L'API Spring Boot est dans le repo voisin `chasing-clout-api` : son README présente le projet et explique comment le
lancer en une commande avec Docker (comptes de démonstration compris).

## Installations nécessaires
- Node JS : https://nodejs.org/en/download (Angular 17 supporte officiellement Node 18 et 20 ; testé aussi avec Node 24)
- Angular CLI (facultatif, `npx ng` suffit) : `npm install -g @angular/cli`

## Lancer le projet
1. Lancer l'API d'abord (base Docker + `BackSkeletonApplication`, cf. README de `chasing-clout-api`) : elle doit répondre sur `http://localhost:8080`
2. `npm i`
3. `npm start` et se rendre sur `http://localhost:4200/`

L'URL de l'API se règle dans `src/environments/environment.ts` (`apiUrl`). Les images des cartes sont servies par l'API ;
en dev, `ng serve` les relaie sur `/memes` (`proxy.conf.json`) pour que les scènes 3D puissent en faire des textures.

**Tester toute l'appli sans Node ni Java** (base de démo, API et front) : voir « Tester l'application » dans le README de
`chasing-clout-api`. Le `Dockerfile` de ce repo y construit le front en prod et le sert avec nginx (`nginx.conf`), qui relaie
`/api` et `/memes` vers l'API. D'où `apiUrl: "/api"` dans `environment.prod.ts` : le build de prod suppose ce relais.

## Authentification
Il faut un compte pour jouer : `/inscription` (pseudo de 3 à 20 caractères, mot de passe de 8 caractères minimum, 5000 memes
au départ) ou `/connexion`. L'API renvoie un jeton JWT (valable 24 h), gardé dans le `localStorage` (clé `cc-token`).
- `services/auth.interceptor.ts` l'envoie dans `Authorization: Bearer …` à chaque appel de l'API (sauf `/auth/...`) ; si l'API
  répond 401 (jeton expiré ou invalide), le joueur est déconnecté et renvoyé sur `/connexion`.
- Les pages du jeu sont protégées par le guard `loggedIn` (`services/auth.service.ts`) ; `/connexion` et `/inscription`
  renvoient un joueur déjà connecté sur la boutique (`loggedOut`).
- « Se déconnecter » (navbar) oublie seulement le jeton : il reste valable côté API jusqu'à son expiration.
- Le profil (`GameService.profile$`) suit le jeton : chargé à la connexion, vidé à la déconnexion.

## Pages
| URL | Rôle |
|---|---|
| `/connexion`, `/inscription` | Connexion ou création de compte (même composant `login/`), puis direction la boutique |
| `/boutique` | Vitrine 3D du pack configuré (type, format, display mixte 50/50), cotes en barres par rareté, prix par booster et économie par format ; après l'achat, « Ouvrir maintenant ». En bas, les cartes les plus rares à gagner |
| `/inventaire` | Boosters non ouverts : un groupe par tri-pack ou display acheté, les autres groupés par type |
| `/ouverture/:id` | Ouvre le booster (appel POST) en 3D : le paquet se déchire, les cartes se retournent une à une (une carte Secrète est annoncée par un fond doré avant d'être retournée), puis un récap |
| `/ouverture/box/:purchaseId` | Ouvre un tri-pack ou un display : la box s'ouvre en 3D, on choisit ses boosters un par un ou « Tout ouvrir » |
| `/collection` | Les 300 cartes, grisées si non possédées ; un clic ouvre la carte en 3D. Une carte possédée peut être mise en vente sur le marché ou vendue au système, qui la rachète à 50 % de son prix (il n'en vend pas) |
| `/marche` | Les annonces des joueurs, avec l'écart au prix système ; « Acheter », ou « Retirer » sur ses propres annonces |

La navbar affiche le solde du joueur (rechargé après chaque achat), son pseudo, « Se déconnecter » et le bouton « Booster gratuit » (un toutes les 30 minutes,
compte à rebours sinon ; c'est l'API qui décide et renvoie une 429 si c'est trop tôt).

## Organisation du code (`src/app`)
- `services/game.service.ts` : tous les appels à l'API, et `profile$` (le solde de la navbar)
- `models/game.model.ts` : les types des réponses de l'API (miroir des DTO), les libellés français des raretés, finitions et formats
- `services/auth.service.ts` : connexion, inscription, déconnexion, le jeton (`token$`) et les guards `loggedIn` / `loggedOut` ;
  `services/auth.interceptor.ts` : le header `Authorization`
- `meme-card/` : une carte en CSS (retournement, cadre selon la rareté, reflet holo ; bordure de flammes via le filtre SVG
  `#cc-fire` défini une fois dans `app.component.html` et braises pour la finition Enflammée), utilisée par les grilles
- `three/` : les scènes 3D (Three.js + GSAP), toujours chargées en `import()` pour rester hors du bundle initial :
  `stage.ts` (socle commun), `card-art.ts` (cartes, holo ; flammes en shader, braises et dos incandescent de la finition Enflammée) et `pack-art.ts` (boosters et box), `booster-scene.ts`,
  `box-scene.ts`, `card-viewer.ts`, `shop-scene.ts`
- `booster-opening/` : le déroulé 3D d'un booster, utilisé par `/ouverture/:id` et par la box
- `card-inspect/` : la modale 3D d'une carte (collection, récaps, marché)
- `login/`, `shop/`, `inventory/`, `opening/`, `box-opening/`, `collection/`, `market/` : les pages ; les données sont chargées par des
  resolvers déclarés dans `app-routing.module.ts`

## À savoir
- Dans le SCSS d'un composant, ne pas faire `@use "theme"` : ça embarque tout le CSS Angular Material dans le composant
  (64 kB, le build de prod échoue sur le budget par composant). Utiliser les variables `--cc-purple` / `--cc-red` définies dans `src/styles.scss`.
- `ng build` affiche un avertissement sur la taille totale (environ 940 kB pour un budget de 500 kB, surtout le CSS Bootstrap + Material) : ce n'est pas bloquant.
