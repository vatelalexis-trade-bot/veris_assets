# Hébergement de la démo — options (P15-7, spec 33.12)

Document de décision pour le porteur de projet. Informations vérifiées le 26 septembre 2026 sur les sites des fournisseurs ; les prix sont hors TVA et peuvent changer.

## Ce que la démo doit faire tourner

- Deux applications Node.js toujours allumées : le site (Next.js) et l'API (NestJS). L'API exécute aussi les tâches de fond (notifications, exports, contrôles quotidiens) : elle ne doit pas « s'endormir ».
- PostgreSQL **18** : les migrations utilisent `uuidv7()`, fonction apparue en version 18 (D-024).
- Quatre rôles de base séparés (application, migrations, tâches, authentification) avec le moindre privilège (D-039) : c'est une défense en profondeur de l'isolation et du registre en ajout seul.
- Redis, un stockage compatible S3, l'envoi des emails, HTTPS, des sauvegardes.

Emails : les comptes de démo sont en `@example.com`, adresses qui ne reçoivent jamais de courrier. La démo garde donc une boîte de capture (Mailpit), protégée par mot de passe, comme dans le Codespace. Aucun service d'envoi d'emails réel n'est nécessaire.

## Option A — Un serveur virtuel (VPS) européen — recommandée

Un serveur qui fait tourner la même configuration Docker que le Codespace, avec HTTPS automatique. Deux fournisseurs équivalents :

**A1 — OVHcloud (France)** : VPS-2 (4 vCPU, 8 Go de mémoire, 75 Go de disque NVMe) à partir de 7,21 € HT par mois, sauvegarde automatique quotidienne incluse ; centres de données européens, choisis à la commande. Le VPS-1 (2 vCPU, 4 Go) est à partir de 3,81 € HT par mois. Les prix affichés sont « à partir de » (ils peuvent dépendre de la durée d'engagement) et OVHcloud a relevé ses prix en 2026 : à vérifier à la commande.

**A2 — Hetzner (Allemagne ou Finlande)** : détail ci-dessous.

- **Compatibilité** : totale (PostgreSQL 18, quatre rôles, Garage, Redis, Mailpit) ; aucun changement de code.
- **Coût (Hetzner)** : serveur CX33 (4 vCPU, 8 Go de mémoire, 80 Go de disque) à 8,49 € par mois, sauvegardes automatiques du serveur à 20 % de son prix (7 sauvegardes conservées), soit environ 10,20 € par mois. Le CX23 (2 vCPU, 4 Go) à 5,49 € par mois suffirait sans doute, avec moins de marge.
- **Administration** : c'est à nous d'appliquer les mises à jour du système et de surveiller le serveur. En phase 16, je fournis les scripts : installation en une commande, mises à jour de sécurité automatiques, sauvegarde quotidienne de la base, déploiement depuis GitHub.
- **Limites** : un seul serveur (pas de haute disponibilité) : acceptable pour une démo. Hetzner est une société allemande ; données en Allemagne ou en Finlande.

## Option B — Plateforme gérée française (Clever Cloud)

Les applications sont déployées depuis GitHub ; base, Redis et stockage S3 (Cellar) sont des services gérés.

- **Compatibilité** : PostgreSQL 18 est disponible (18.4) avec sauvegarde quotidienne gardée 7 jours et chiffrement au repos. Mais la base gérée n'accepte qu'un seul utilisateur : « you won't be able to create other users than the one handled with our control plane ». Les quatre rôles seraient remplacés par un seul, propriétaire des tables : l'isolation par organisation (RLS forcée) resterait active, mais l'application pourrait modifier la structure ou désactiver les protections du registre. **Écart de sécurité à accepter explicitement.**
- **Coût** : non affiché sur le site (simulateur à utiliser). Un comparatif tiers indique 16 € par mois pour la plus petite instance Node.js (1 vCPU, 1 Go) : il en faut deux, plus la base, Redis et le stockage. Ordre de grandeur : plusieurs dizaines d'euros par mois, à confirmer.
- **Administration** : la plus faible (pas de serveur à maintenir).

## Option C — Plateforme française (Scaleway)

- **Compatibilité** : la base gérée propose PostgreSQL 14 à 17, **pas 18**. Il faudrait remplacer `uuidv7()` (changement de code et de D-024). L'administrateur de la base a le droit de créer des rôles (CREATEROLE), sans être superutilisateur : les quatre rôles seraient possibles, à tester.
- **Coût** : non vérifié (tarif horaire selon la taille).
- **Administration** : faible pour la base ; les applications tournent en conteneurs gérés ou sur un serveur.

## Option D — OVHcloud, base PostgreSQL gérée

OVHcloud propose aussi PostgreSQL 18 en base gérée (« Public Cloud Databases »). La documentation dit seulement que les utilisateurs sont créés « with default admin roles and privileges » : la création de nos quatre rôles n'y est pas confirmée, il faudrait la tester. Prix non vérifié. Les applications tourneraient alors sur un VPS ou en conteneurs.

## Hébergement gratuit : pourquoi ce n'est pas recommandé

Aucune offre gratuite vérifiée ne fait tourner la démo complète (deux applications toujours allumées, PostgreSQL 18, Redis, stockage, tâches de fond) :

- **Render** (société américaine, région Francfort) : service web gratuit de 512 Mo mis en veille, et base PostgreSQL gratuite limitée à 1 Go **qui expire après 30 jours**.
- **Koyeb** (région Francfort) : un seul service web gratuit (512 Mo, 0,1 vCPU) et une base limitée à 5 heures d'activité : il en faut deux, et l'API ne doit pas s'endormir.
- **Oracle Cloud « Always Free »** (société américaine, régions européennes) : une machine ARM gratuite (2 OCPU, 12 Go selon les limites 2026) pourrait techniquement tout faire tourner, mais les inscriptions sont souvent refusées, les machines difficiles à obtenir, et ce n'est pas un hébergeur européen.
- **Bases gratuites seules** (Neon, Supabase, Aiven) : quelques centaines de Mo à quelques Go, mise en veille, peu ou pas de sauvegardes ; et elles ne font pas tourner les applications.

Pour quelques euros par mois, un VPS évite ces limites (mise en veille, expiration, perte de données).

## Recommandation

**Option A1, VPS-2 chez OVHcloud** (société française, sauvegarde quotidienne incluse, environ 7 à 12 € HT par mois selon l'offre du moment), ou A2 chez Hetzner (environ 10 € HT par mois avec sauvegardes). C'est la seule option qui garde toute la sécurité prévue sans modifier le code, et elle reproduit exactement ce qui est testé chaque jour dans le Codespace et la CI. Son inconvénient — l'administration du serveur — est pris en charge par des scripts livrés en phase 16.

Dans tous les cas, il faudra un nom de domaine (quelques euros à une quinzaine d'euros par an selon l'extension), acheté par le porteur de projet.

## Décision finale : Railway (D-097)

Le porteur de projet a retenu **Railway** (société américaine, région européenne d'Amsterdam) : PostgreSQL 18 y tourne dans un conteneur avec un superutilisateur, ce qui garde les quatre rôles ; sauvegardes automatiques des volumes ; facturation à l'usage. Les options ci-dessus restent la référence si la démo doit un jour être hébergée par une société européenne.

- [Railway — régions](https://docs.railway.com/reference/regions)
- [Railway — PostgreSQL](https://docs.railway.com/guides/postgresql)
- [Railway — modèle PostgreSQL 18](https://railway.com/deploy/postgresql-18)
- [Railway — sauvegardes des volumes](https://docs.railway.com/volumes/backups)
- [Railway — tarifs](https://railway.com/pricing)

## Sources

- [OVHcloud — offres VPS](https://www.ovhcloud.com/fr/vps/)
- [Next — hausse des prix des VPS OVHcloud en 2026](https://next.ink/225720/ovhcloud-augmente-fortement-le-prix-de-ses-vps-2026-et-ipv4/)
- [OVHcloud — PostgreSQL géré : capacités et limites](https://docs.ovhcloud.com/en/guides/public-cloud/databases/postgresql-capabilities)
- [Render — offre gratuite](https://render.com/docs/free)
- [Koyeb — FAQ tarifs](https://www.koyeb.com/docs/faqs/pricing)
- [Koyeb — comparatif des bases PostgreSQL gratuites](https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2026)
- [Oracle Cloud Free Tier en 2026 (article tiers)](https://cloudpricecheck.com/free-tier/oracle)

- [Hetzner — ajustement des prix au 15 juin 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Hetzner — serveurs « cost-optimized »](https://www.hetzner.com/cloud/cost-optimized/)
- [Hetzner — FAQ facturation (sauvegardes à 20 %)](https://docs.hetzner.com/cloud/billing/faq/)
- [Clever Cloud — PostgreSQL (versions, utilisateur unique, sauvegardes)](https://www.clever.cloud/developers/doc/deploy/databases/postgresql/)
- [Clever Cloud — PostgreSQL 18 par défaut au 15 septembre 2026](https://www.clever.cloud/developers/changelog/2026/09-01-postgresql-18-default/)
- [Clever Cloud — tarifs (simulateur)](https://www.clever.cloud/pricing/)
- [Comparatif tiers Clever Cloud (prix indicatif Node.js XS)](https://europeanpurpose.com/tool/clever-cloud)
- [Scaleway — PostgreSQL et MySQL gérés (versions 14 à 17)](https://www.scaleway.com/en/managed-postgresql-mysql/)
- [Scaleway — gestion des utilisateurs (CREATEROLE, pas de SUPERUSER)](https://www.scaleway.com/en/docs/managed-databases-for-postgresql-and-mysql/how-to/manage-users/)
