# Démonstration en ligne sur Railway (phase 16b)

Guide d'exploitation pour le porteur de projet. Choix de l'hébergeur : D-097 ; architecture en ligne : D-106.

## Ce qui tourne en ligne

Tout tourne dans le projet Railway `6bb97b26-059a-4e3a-b018-98072a93391b`, environnement `production`, région EU West (Amsterdam).

| Service | Rôle | Accès |
|---|---|---|
| `web` | Le site et les portails (image `apps/web/Dockerfile`) | Adresse publique en HTTPS |
| `api` | L'API ; elle prépare la base avant chaque mise en ligne (`pnpm db:setup`) et fait la sauvegarde de chaque nuit, à 2 h 30 UTC | Réseau privé seulement (`api.railway.internal:4000`) |
| `postgres` | PostgreSQL 18.6, avec ses données sur un volume | Réseau privé |
| `redis` | Limites de débit et cache | Réseau privé |
| `veris-documents` | Stockage des documents, compatible S3 (« Bucket » Railway) | Réservé à l'API (identifiants) |
| `mailpit` | Boîte des emails de test : aucun email ne part vraiment | Adresse publique, protégée par un mot de passe (utilisateur `demo`) |

## Adresses

- Site : https://veris-assets.com (domaine acheté chez Cloudflare ; adresse officielle, `WEB_ORIGIN`). L'adresse Railway https://web-production-c379a.up.railway.app reste acceptée (`WEB_ALTERNATE_ORIGINS`).
- Boîte des emails de test : https://mailpit-production-cb96.up.railway.app (utilisateur `demo` ; mot de passe dans la variable `MAILPIT_UI_PASSWORD` du service `mailpit`)

## Mettre à jour la démo

Après un push sur `main`, dans le Codespace :

```
pnpm online:deploy
```

La commande publie le dernier commit sur les services `api`, `web` et `mailpit`, puis attend la fin des déploiements. Avant de démarrer, l'API applique les migrations et complète les données de démo.

Le déploiement automatique à chaque push demande que l'application GitHub de Railway ait accès au dépôt `veris_assets`. Il suffit de l'autoriser une fois (*GitHub → Settings → Applications → Railway → Configure*) ; `pnpm online:deploy` reste utile pour publier sans attendre.

## Réinitialiser les données de démo

```
pnpm online:reset
```

L'API est redéployée une fois avec `pnpm db:reset` comme commande de préparation (permis en ligne parce que `DEMO_MODE=true`), puis la commande habituelle est remise. Les données fictives sont recréées à l'identique.

## Vérifier la démo en ligne

```
pnpm test:online
```

Ce sont des vérifications en lecture seule, dans un vrai navigateur : page d'accueil, calculateur, connexion aux portails émetteur et investisseur.

## Sauvegardes et restauration

- **Chaque nuit** : copie de la base, vérifiée par un manifeste, envoyée dans le stockage (`backups/<date>/`). Les 14 dernières sont conservées.
- **Volume de la base** : on peut aussi activer les sauvegardes automatiques du volume dans Railway (service `postgres`, onglet « Backups »).
- **Restaurer** : `pnpm db:restore` restaure dans une base à part et compare le résultat avec la sauvegarde ; `--replace` remplace la base de démo. Voir D-102.

## Secrets

Les mots de passe et clés sont tirés au hasard par `scripts/railway/setup.sh` à l'installation. Ils ne sont stockés que dans les variables Railway, jamais dans le dépôt. Pour en changer un :

1. le modifier dans Railway (service concerné, onglet « Variables ») ;
2. redéployer.

Le mot de passe des comptes de démo est affiché sur la page de connexion : c'est voulu (mode démo, données fictives, D-106).

## Coûts

Offre « Hobby » : 5 $ par mois, 5 $ d'usage inclus. Au-delà, facturation à l'usage : environ 10 $ par Go de mémoire et 20 $ par vCPU par mois ; stockage des documents à 0,015 $ par Go et par mois. L'onglet « Usage » de Railway donne la consommation réelle ; on peut y fixer un plafond.

## Installation initiale (déjà faite une fois)

1. Créer un jeton d'espace de travail dans Railway : *Account Settings → Tokens*, choisir l'espace de travail.
2. L'ajouter comme secret du Codespace, sous le nom `RAILWAY_API_TOKEN` : sur GitHub, *Settings → Codespaces → Secrets*, accès au dépôt `veris_assets`. Redémarrer ensuite le Codespace.
3. Lancer :

   ```
   node scripts/railway/setup.mjs
   ```

   Le script passe par l'API publique de Railway : l'outil en ligne de commande de Railway n'accepte pas les jetons d'espace de travail pour se lier à un projet. Relancé, il ne crée que ce qui manque.

4. Railway doit avoir accès au dépôt GitHub privé : lors de la première connexion, autoriser l'application GitHub de Railway sur `veris_assets`.
5. Une fois tout en ligne, le jeton peut être révoqué ; il suffit d'en recréer un pour une prochaine intervention.
