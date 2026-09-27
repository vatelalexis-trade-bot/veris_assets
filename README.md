# Veris Assets

Plateforme SaaS B2B de gestion du cycle de vie d'actifs privés numériques — **MVP de démonstration, données fictives uniquement**.

- Spécification : [docs/SPEC.md](docs/SPEC.md)
- Décisions validées : [docs/DECISIONS.md](docs/DECISIONS.md)
- Architecture : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Modèle de données : [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · API : [docs/API.md](docs/API.md) · Backlog : [docs/BACKLOG.md](docs/BACKLOG.md)

## Démarrer (dans GitHub Codespaces)

Dans le terminal de VS Code (menu ☰ → Terminal → New Terminal) :

```bash
pnpm dev
```

Cette commande unique :

1. crée le fichier `.env` au premier lancement, avec des mots de passe de développement générés au hasard ;
2. démarre les services Docker : PostgreSQL (base de données), Redis (cache), Garage (stockage des documents) et Mailpit (boîte email de test) ;
3. lance l'API et l'application web.

Quand le terminal affiche `Veris Assets — development environment`, ouvrez l'adresse indiquée après **Web app** (Ctrl + clic). Codespaces propose aussi d'ouvrir le port 3000 dans une notification.

Pour arrêter l'application : **Ctrl + C** dans le terminal. Les services Docker continuent de tourner ; pour les arrêter aussi : `pnpm services:down`.

## Se connecter à la démo

La page de connexion (`/fr/login`) liste les comptes de démonstration, leur rôle et leur mot de passe commun (valeur `DEMO_ACCOUNTS_PASSWORD` du fichier `.env`). Le bouton **Utiliser** remplit le formulaire.
Les comptes d'administration et de conformité ont la double authentification activée : leur code à 6 chiffres est affiché à côté du compte et change toutes les 30 secondes (mode démonstration uniquement).

## Commandes utiles

| Commande                | Effet                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`              | Démarre tout (services + API + web)                                                                    |
| `pnpm services:up`      | Démarre seulement les services Docker                                                                  |
| `pnpm services:down`    | Arrête les services Docker (les données sont conservées)                                               |
| `pnpm services:logs`    | Affiche les journaux des services                                                                      |
| `pnpm db:reset`         | Efface la base de démo et la reconstruit (migrations + données fictives) — données fictives uniquement |
| `pnpm db:setup`         | Prépare la base si besoin (rôles, migrations, données de démo) ; lancé automatiquement par `pnpm dev`  |
| `pnpm test`             | Lance les tests automatiques                                                                           |
| `pnpm test:integration` | Lance les tests sur une vraie base PostgreSQL (services Docker démarrés)                               |
| `pnpm lint`             | Vérifie la qualité du code, les règles d'architecture, les mentions interdites et la mise en forme     |
| `pnpm typecheck`        | Vérifie les types TypeScript                                                                           |
| `pnpm build`            | Compile l'API et l'application web                                                                     |
| `pnpm format`           | Remet en forme automatiquement tout le code                                                            |

`pnpm db:reset` supprime puis recrée uniquement la base de démonstration : elle refuse de fonctionner en production.

## Où voir les emails de test

Tous les emails envoyés par l'application sont capturés par **Mailpit** : ouvrez l'adresse **Test emails** affichée par `pnpm dev` (port 8025). Aucun email ne part réellement.

## Structure du dépôt

```
apps/web          Application web (Next.js) : landing, portails émetteur et investisseur
apps/api          API (NestJS) : toute la logique métier
packages/shared   Code partagé entre le web et l'API
packages/config   Configuration partagée (lint, TypeScript)
infra/            Configuration des services Docker
scripts/          Scripts de démarrage et de contrôle
docs/             Spécification, décisions, architecture
```

## Sécurité

- Le fichier `.env` contient les secrets de développement : il est ignoré par git et ne doit jamais être commité. Le modèle commité est `.env.example`.
- Les services Docker n'écoutent que sur la machine du Codespace ; les ports transférés par GitHub restent privés par défaut.
- La plateforme ne revendique aucune conformité ni certification réglementaire ; un contrôle automatique (`pnpm check:claims`) bloque ce type de mention.

## Machine Codespace

Une machine **4 cœurs** est recommandée (décision D-008) : sur github.com → Codespaces → « … » à côté du Codespace → _Change machine type_.
