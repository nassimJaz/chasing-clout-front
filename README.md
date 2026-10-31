# Chasing Clout (front)

Front Angular 17 du jeu de cartes à collectionner Chasing Clout. L'API Spring Boot est dans le repo voisin
[`chasing-clout-api`](../chasing-clout-api).

## Sommaire
- [Présentation](#présentation)
- [Prérequis](#prérequis)
- [Lancer avec Docker (démo complète)](#lancer-avec-docker-démo-complète)
- [Lancer en développement](#lancer-en-développement)
- [Pages et fonctionnalités](#pages-et-fonctionnalités)
- [Organisation du code](#organisation-du-code)
- [À savoir](#à-savoir)
- [Comment nous avons utilisé l'IA (Claude Code)](#comment-nous-avons-utilisé-lia-claude-code)

## Présentation
Chasing Clout est un jeu de cartes à collectionner autour de 300 mèmes : on achète des boosters (à l'unité, en tri-pack ou
en display), on les ouvre, on complète sa collection et on échange ses cartes sur un marché entre joueurs. Chaque carte a une
rareté (Commun, Peu commun, Rare, Très rare, Ultra rare, Secrète) et une finition (Normale, Holo, Enflammée).

L'interface :
- **Thème noir mat** avec un seul accent **violet électrique** (`--acc: #8b3dff`), l'or étant réservé à l'argent et aux cartes
  Secrètes. La structure et la densité s'inspirent de [kyara.games](https://kyara.games).
- **Scènes 3D en Three.js + GSAP** : boosters et boîtes réalistes (booster en alu, tri-pack sous blister, display en carton
  avec cellophane et couvercle à charnière), ouverture d'un booster carte par carte, finitions Holo et Enflammée (flammes, sans
  braises), fond doré qui annonce une carte Secrète avant qu'elle ne se retourne.
- **Collection triée par rareté**, les plus rares d'abord.

## Prérequis
**Pour la démo** (rien d'autre à installer) :
- [Docker](https://docs.docker.com/get-docker/) avec Docker Compose v2 (Docker Desktop, ou Docker Engine + plugin Compose)

**Pour le développement** :
- [Node.js](https://nodejs.org/en/download) 18.13+ ou 20.9+ (versions supportées par Angular 17 ; l'image Docker utilise
  Node 20) et npm, fourni avec Node
- Angular CLI 17 (facultatif, `npx ng` suffit) : `npm install -g @angular/cli@17`
- Git

**Dans les deux cas**, le repo de l'API doit être cloné **à côté** de celui du front :
```
un-dossier/
├── chasing-clout-api/
└── chasing-clout-front/
```

## Lancer avec Docker (démo complète)
La démo complète (base PostgreSQL + API + front) se lance **depuis le repo de l'API** :
```bash
cd ../chasing-clout-api
docker compose -f docker-compose.demo.yml up -d --build
```
Ajouter `--wait` pour que la commande rende la main seulement quand tout est prêt. Puis ouvrir http://localhost:4200.

Comptes de démonstration, créés au premier démarrage :

| Pseudo | Mot de passe |
|---|---|
| `prof` | `prof1234` |
| `rival` | `rival1234` |

- **Changer de port** si 4200 est pris : `DEMO_PORT=8000 docker compose -f docker-compose.demo.yml up -d --build`
- **Arrêter** (les données sont conservées) : `docker compose -f docker-compose.demo.yml down`
- **Repartir de zéro** (supprime le volume de la base) : `docker compose -f docker-compose.demo.yml down -v`, puis relancer

### Le Dockerfile du front
Le `Dockerfile` de ce repo est utilisé par `docker-compose.demo.yml` (`build: ../chasing-clout-front`) :
1. une étape `node:20-slim` fait `npm ci` puis `ng build` (build de production) ;
2. une étape `nginx:alpine` sert le contenu de `dist/front-skeleton` avec `nginx.conf`, qui :
   - relaie `/api/` vers l'API (`http://api:8080/`) : même origine, donc pas de CORS, et l'API n'est pas publiée ;
   - relaie `/memes/` (images des cartes) vers l'API, pour que les scènes 3D puissent en faire des textures WebGL ;
   - renvoie `index.html` pour toutes les routes Angular (`/boutique`, `/collection`...).

D'où `apiUrl: "/api"` dans `src/environments/environment.prod.ts` : le build de prod suppose ce relais.

## Lancer en développement
1. **Démarrer l'API** sur http://localhost:8080 : voir le README de `chasing-clout-api` (base avec `docker compose up -d`,
   puis l'API avec `mvn spring-boot:run` ou depuis IntelliJ ; ou base et API ensemble avec `docker compose up -d --build`).
2. Installer les dépendances :
   ```bash
   npm install
   ```
3. Lancer le serveur de dev :
   ```bash
   ng serve        # ou npm start
   ```
   puis ouvrir http://localhost:4200.

Détails :
- En dev, le front appelle l'API directement sur `http://localhost:8080` (`apiUrl` dans `src/environments/environment.ts`).
- `proxy.conf.json` relaie `/memes` vers l'API : les images des cartes sont ainsi servies par la même origine que le front,
  ce qui évite les erreurs CORS quand Three.js les charge comme textures WebGL.
- Il faut un compte pour jouer : en créer un sur `/inscription`, ou utiliser un compte de démonstration si l'API tourne avec
  les données de démo. La connexion renvoie un jeton JWT (voir [Authentification](#authentification)).
- **Après un `git pull`, relancer `npm install`** : Bootstrap et Angular Material ont été retirés du projet, un
  `node_modules` ancien ne correspond plus au `package-lock.json`.

## Pages et fonctionnalités
| URL | Rôle |
|---|---|
| `/connexion`, `/inscription` | Connexion ou création de compte (même composant `login/`), puis direction la boutique |
| `/boutique` | Vitrine 3D du pack configuré (type, format, display mixte 50/50), cotes en barres par rareté, prix par booster et économie par format ; après l'achat, « Ouvrir maintenant ». En bas, les cartes les plus rares à gagner |
| `/inventaire` | Boosters non ouverts : un groupe par tri-pack ou display acheté, les autres groupés par type |
| `/ouverture/:id` | Ouvre un booster en 3D : le paquet se déchire, les cartes se retournent une à une (une Secrète est annoncée par un fond doré), puis un récapitulatif |
| `/ouverture/box/:purchaseId` | Ouvre un tri-pack ou un display : cellophane, couvercle, éventail des boosters ; on les ouvre un par un ou « Tout ouvrir » |
| `/collection` | Les 300 cartes, les plus rares d'abord, grisées si non possédées ; un clic ouvre la carte en 3D. Une carte possédée peut être mise en vente sur le marché ou vendue au système, qui la rachète à 30 % de son prix (il n'en vend pas) |
| `/marche` | Les annonces des joueurs, avec l'écart au prix système ; « Acheter », ou « Retirer » sur ses propres annonces |

Formats : Booster (1), Tri-pack (3), Display Mini (9), Display Medium (30) et Display Méga (60) ; seuls Medium et Méga
peuvent être mixtes. La navbar affiche le solde, le pseudo, « Se déconnecter » et le bouton « Booster gratuit » (un toutes
les 30 minutes, compte à rebours sinon ; c'est l'API qui décide et renvoie une 429 si c'est trop tôt).

### Authentification
- `/inscription` : pseudo de 3 à 20 caractères, mot de passe de 8 caractères minimum, 5000 memes au départ.
- L'API renvoie un jeton JWT (valable 24 h), gardé dans le `localStorage` (clé `cc-token`).
- `services/auth.interceptor.ts` l'envoie dans `Authorization: Bearer …` à chaque appel (sauf `/auth/...`) ; sur une 401,
  le joueur est déconnecté et renvoyé sur `/connexion`.
- Les pages du jeu sont protégées par le guard `loggedIn` ; `/connexion` et `/inscription` renvoient un joueur déjà connecté
  sur la boutique (`loggedOut`).
- « Se déconnecter » oublie seulement le jeton : il reste valable côté API jusqu'à son expiration.

## Organisation du code
`src/app` :
- `services/game.service.ts` : tous les appels à l'API, et `profile$` (solde et pseudo de la navbar)
- `services/auth.service.ts` : connexion, inscription, déconnexion, jeton (`token$`), guards `loggedIn` / `loggedOut` ;
  `services/auth.interceptor.ts` : le header `Authorization`
- `models/game.model.ts` : types des réponses de l'API (miroir des DTO), raretés dans l'ordre, libellés français, couleurs
  et formats
- `navbar/` : la barre du haut
- `meme-card/` : une carte en CSS (retournement, cadre selon la rareté, reflet holo ; flammes via les filtres SVG `#cc-fire`
  et `#cc-fire-still` définis une fois dans `app.component.html`), utilisée par les grilles
- `booster-opening/` : le déroulé 3D d'un booster, utilisé par `/ouverture/:id` et par la box
- `card-inspect/` : la modale 3D d'une carte (collection, récapitulatifs, marché)
- `login/`, `shop/`, `inventory/`, `opening/`, `box-opening/`, `collection/`, `market/` : les pages ; les données sont
  chargées par des resolvers déclarés dans `app-routing.module.ts`

`src/app/three` (Three.js + GSAP) :
- `stage.ts` : socle commun (renderer, caméra, boucle, inclinaison à la souris)
- `studio.ts` : éclairage produit (environnement, ombres douces)
- Fichiers « art » (la géométrie et les matériaux) :
  - `card-art.ts` : cartes, reflet holo, flammes en shader et dos incandescent de la finition Enflammée
  - `booster-art.ts` : booster en alu (coussin, sertissages, froissé, foil)
  - `pack-art.ts` : tri-pack sous blister, display en carton avec cellophane et couvercle à charnière
- Scènes : `shop-scene.ts` (vitrine), `booster-scene.ts` (ouverture d'un booster), `box-scene.ts` (ouverture d'une box),
  `card-viewer.ts` (carte en 3D de la modale)
- `thumbs.ts` : vignettes des packs de l'inventaire, rendues une fois hors écran

Le thème (tokens de couleur, typographies, classes de base) est dans `src/styles.scss`.

## À savoir
- **Three.js et GSAP sont toujours chargés en `import()`** dynamique dans les composants : ils restent hors du bundle initial.
  Ne pas les importer statiquement dans un composant ou un service chargé au démarrage.
- **Budget de style par composant** (`angular.json`) : avertissement à 2 kB, **erreur à 4 kB** en build de prod. Garder les
  styles partagés dans `src/styles.scss` et utiliser ses variables (`--acc`, `--gold`, `--panel`...) dans les composants.
- **`prefers-reduced-motion`** est respecté : la vitrine ne se balance plus, une box s'affiche déjà ouverte, les flammes
  restent fixes (`#cc-fire-still`). Toute nouvelle animation doit prévoir ce cas.

## Comment nous avons utilisé l'IA (Claude Code)
Une partie du code de ce front a été écrite avec [Claude Code](https://claude.com/claude-code). Cette section décrit comment,
et ce qui est resté de notre ressort.

### C'est l'équipe qui fixe les objectifs
Nous travaillons dans le *plan mode* de Claude Code. Pour chaque fonctionnalité, nous écrivons et validons un plan **avant
tout code** : ce que l'on veut obtenir, les contraintes, les critères de réussite. Claude ne décide pas de ce qu'il faut faire :
il propose un plan d'implémentation que nous validons, corrigeons ou rejetons, puis il l'exécute, et nous relisons le
résultat (captures d'écran, build, tests manuels).

### Organisation
- Une session Claude par repo (front et API) : chacune charge nativement les skills de son repo.
- Une session de coordination rédige les plans, les transmet aux sessions front et API et relit leur travail.
- Chaque étape donne un petit commit, relu avant de passer à la suivante.

### Skills
Les skills sont dans `.claude/skills/`, versionnées avec le repo : toute session ouverte dans ce repo les a à disposition.

| Skill | À quoi elle sert | Pourquoi et quand nous l'avons utilisée |
|---|---|---|
| `frontend-design` | Guide une direction visuelle assumée (sujet, typographie, hiérarchie, contraste) et une autocritique du rendu, pour éviter une interface générique. | Installée parce que les premiers écrans ressemblaient à un template. Utilisée pour le thème général, la boutique et le thème noir mat inspiré de kyara.games (hiérarchie, contrastes vérifiés, un seul accent). |
| `gsap-core` | L'API de base de GSAP : tweens, easings, stagger, `gsap.matchMedia()` pour le responsive et `prefers-reduced-motion`. | Base de toutes les animations, et des variantes sans mouvement. |
| `gsap-timeline` | Les timelines : séquencement, paramètre de position, imbrication. | Ouverture d'un booster carte par carte, ouverture d'une box (cellophane, couvercle, éventail des boosters), intro de la boutique. |
| `gsap-plugins` | Enregistrement et usage des plugins GSAP. | Installée avec le pack GSAP officiel et consultée pour choisir les outils des animations ; au final aucun plugin n'est enregistré, le cœur de GSAP suffit (bundle plus léger). |
| `gsap-utils` | Les utilitaires `gsap.utils` (clamp, mapRange, interpolate, random...). | `gsap.utils.random` dans les scènes 3D : légères variations d'angle des boosters dans une box, dispersion des cartes et des particules. |
| `gsap-frameworks` | GSAP dans un framework hors React : cycle de vie, portée des sélecteurs, nettoyage à la destruction. | Installée pour Angular : créer les animations après le rendu du composant et les tuer dans `ngOnDestroy`, sans fuite quand on change de page. |
| `gsap-performance` | Animer des transforms plutôt que la mise en page, éviter le layout thrashing, regrouper les mises à jour. | Pour tenir 60 fps sur les ouvertures et la vitrine, en même temps que le rendu WebGL. |
| `webapp-testing` | Piloter l'application avec Playwright (scripts Python) : captures d'écran, logs du navigateur. | Avant chaque commit, captures de chaque page en desktop et à 500 px de large, sur un build statique et une API simulée : aucun achat ni aucune vente contre la vraie base. |

### Ce qui reste humain
- Les choix produit : raretés, cotes, prix, thème, couleurs.
- La validation visuelle de chaque écran.
- Les tests avec la vraie API et la vraie base.
- Les merges.
