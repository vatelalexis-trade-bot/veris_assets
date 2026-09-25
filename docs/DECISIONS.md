# Registre des décisions — Virtus Assets

Décisions écrites du porteur de projet. Conformément à l'en-tête de `docs/SPEC.md`, une décision écrite du porteur de projet prime sur le passage correspondant de la spécification. Chaque entrée indique ce qu'elle modifie.

| Statut | Signification |
|---|---|
| **Acceptée** | Validée par le porteur de projet ; s'applique. |
| **Proposée** | Soulevée par Claude, pas encore validée ; la spec s'applique en attendant. |

---

## 2026-09-24 — Revue d'architecture initiale (réponse à la section 32 de la spec)

Validées par le porteur de projet (« OK pour les propositions »).

### Propositions par défaut de la section 33 (points 1 à 11)

**D-001 — Acceptée.** Les onze propositions par défaut de la section 33 sont confirmées : quatre yeux (4.8) ; annulation possible jusqu'à SUBSCRIPTION_CLOSED ; taux fixe uniquement ; ACT/365F et 30/360 avec arrondi demi à l'unité paire ; unités entières ; un investisseur = un tenant ; ordre souscription → approbation → allocation → paiement sur le montant alloué ; MFA obligatoire pour les rôles d'administration et de conformité ; alerte KYC 30 jours avant expiration ; fichiers PDF/PNG/JPEG/CSV/XLSX de 10 Mo maximum ; chaînage par hash du ledger. Le point 12 (hébergement de la démo) reste ouvert jusqu'après la phase 15.

### Stack technique

**D-002 — Acceptée.** Stack retenue (détail et justification dans `docs/ARCHITECTURE.md`) :
Next.js + React + Tailwind CSS + shadcn/ui + next-intl (front) ; NestJS (back) ; PostgreSQL + Drizzle ORM (données) ; decimal.js (décimaux) ; Better Auth + Argon2id (authentification) ; pg-boss + table outbox (traitements asynchrones) ; Redis (rate limiting et cache uniquement) ; stockage compatible S3 (documents) ; Mailpit (emails de test) ; pino + OpenTelemetry + Sentry (observabilité) ; Vitest + Playwright (tests) ; dependency-cruiser (frontières entre modules) ; monorepo pnpm ; GitHub Actions.
Les versions exactes sont figées en phase 1.

**D-003 — Acceptée.** Sessions côté serveur (cookie `HttpOnly`, identifiant de session renouvelé à la connexion et à tout changement de droits) au lieu de la rotation de refresh tokens. *Modifie la section 24 (« rotation des refresh tokens ») : même objectif de sécurité, mécanisme plus simple.*

**D-004 — Acceptée.** Next.js relaie `/api/*` vers l'API NestJS : le navigateur ne parle qu'à une seule adresse (indispensable dans Codespaces, où chaque port a sa propre adresse). Next.js ne contient aucune logique métier et n'accède jamais à la base.

**D-005 — Acceptée (phase 1, 2026-09-24).** Vérification faite : l'image Docker `minio/minio` n'existe plus sur Docker Hub (« repository does not exist »). Le stockage compatible S3 de développement est **Garage** (image `dxflrs/garage`, version figée en phase 1), choisi par le porteur de projet face à RustFS (version 1.0 trop récente). Garage n'a pas de console web ; les fichiers se consultent depuis l'application. En production, le stockage reste un service S3 géré européen (inchangé). *Modifie la rubrique « Environnement » de CLAUDE.md (MinIO → Garage) et la spec (section 16 : « MinIO dans Codespaces »).*

### Plan

**D-006 — Acceptée.** Ordre des phases : le squelette front-end (phase 7 de la spec) passe en phase 4, pour que l'authentification (désormais phase 5) se teste avec une vraie page de connexion. Les phases 4 à 7 deviennent : 4 squelette front-end ; 5 authentification ; 6 tenants, utilisateurs, rôles, permissions, isolation ; 7 journal d'audit et outbox. Phases 1–3 et 8–16 inchangées. Le logo est déplacé dans `apps/web/public/brand/` à la nouvelle phase 4. *Modifie la section 31.1.*

**D-007 — Acceptée.** Une « phase 0 bis » produit les livrables 2 et 4 à 8 de la spec sous forme de documents, avant tout code de production : `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/BACKLOG.md`.

**D-008 — Acceptée.** Machine Codespace recommandée : 4 cœurs. Le porteur de projet change le type de machine ; la phase 1 déclare ce besoin dans `devcontainer.json`.

### Clarifications fonctionnelles

**D-009 — Acceptée. Positions et paiement** (résout l'incohérence entre les sections 7.1, 9.2 et 10.1). À la validation de l'allocation, une seule transaction écrit les mouvements ISSUANCE (si l'émission n'est pas encore créée dans le registre), ALLOCATION et BLOCK : les positions existent (scénario 3) mais les unités allouées sont bloquées ; les souscriptions passent APPROVED → PAYMENT_PENDING (montant dû = unités allouées × valeur nominale). Une souscription allouée à 0 unité passe CANCELLED avec le motif `NOT_ALLOCATED`. La confirmation du paiement fictif (quatre yeux) écrit UNBLOCK et fait passer la souscription PAYMENT_CONFIRMED → ALLOCATED dans la même transaction. Paiement jamais reçu : l'émetteur annule la souscription (autorisé jusqu'à PAYMENT_PENDING), ce qui écrit UNBLOCK puis CANCELLATION (les unités reviennent sur le compte de trésorerie de l'émetteur). L'émission ne peut passer ALLOCATED → ACTIVE que lorsqu'aucune souscription n'est plus en PAYMENT_PENDING.

**D-010 — Acceptée. Destinataire d'un transfert** (résout le conflit entre les sections 11.1 et 14.3). Un investisseur ne voit jamais la liste des autres investisseurs. Chaque investisseur dispose d'un code destinataire (affiché dans son profil, régénérable). L'expéditeur saisit ce code ; le serveur le résout dans le tenant et applique le moteur d'éligibilité au destinataire. Code inconnu et destinataire non éligible donnent des codes d'erreur distincts, sans jamais révéler l'identité du destinataire.

**D-011 — Acceptée.** La convention 30/360 est **30E/360** (base « Eurobond »). *Précise la section 12.2.*

**D-012 — Acceptée.** Record date par défaut = date de paiement moins 1 jour ouvré (lundi–vendredi), réglable par émission à l'étape 4 de l'assistant.

**D-013 — Acceptée.** Montant minimum non atteint à la clôture des souscriptions : alerte bloquante ; l'Issuer Administrator annule l'émission ou poursuit l'allocation avec une justification obligatoire (tracée dans l'audit).

**D-014 — Acceptée.** Nouveau champ facultatif à l'étape 3 : « Fin de période de blocage des transferts » (lock-up). Un transfert demandé avant cette date échoue avec `LOCKUP_PERIOD_ACTIVE`. *Ajoute un champ à la section 6.2.*

**D-015 — Acceptée.** Les dates métier (« date du jour » pour les fenêtres de souscription, la clôture automatique, l'expiration KYC) sont évaluées dans le fuseau horaire du tenant, `Europe/Paris` par défaut. Les timestamps techniques restent en UTC.

**D-016 — Acceptée.** MFA en démo : vrai TOTP vérifié par le serveur. Uniquement quand `DEMO_MODE=true`, la page de connexion de démo affiche le code TOTP courant de chaque compte de démonstration. Les secrets TOTP du jeu de démo ne servent jamais hors mode démo.

**D-017 — Acceptée.** Utilisateurs de démo (modifie « 5 utilisateurs » de la section 28) : tenant 1 = 2 Issuer Administrators, 1 Issuer Operator, 1 Compliance Officer, 1 Auditor et 3 comptes investisseurs ; 1 Platform Administrator ; tenant 2 = 2 utilisateurs et quelques données.

**D-018 — Acceptée.** Contrôle en CI qui échoue en cas de revendication réglementaire interdite (« MiCA compliant », « conforme MiCA », « certified », « certifié », etc.) dans les fichiers de traduction et la landing page.

**D-019 — Acceptée.** Le porteur de projet ajoute le prototype HTML de la landing page dans `docs/prototype/` avant la phase 15.

**D-020 — Acceptée.** Le dépôt s'appelle `virtus_assets` (la spec dit `virtus-assets`) ; sans conséquence.

---

## 2026-09-24 — Phase 0 bis (documents d'architecture)

Validées par le porteur de projet (« OK je valide »).

**D-021 — Acceptée. Couleurs de texte accessibles.** Contrastes mesurés (WCAG) : l'indigo primaire `#4F52D6` passe en fond de bouton avec texte blanc (5,98:1) mais échoue comme couleur de texte ou de lien sur les fonds sombres (3,17:1 sur `#0A1020`, AA exige 4,5:1). Le rouge d'erreur `#EF4444` échoue avec du texte blanc dessus (3,76:1) et en texte sur Secondary Surface (4,29:1). Proposition : garder toutes les couleurs de marque inchangées et ajouter deux jetons réservés au texte, `primary-text` `#8B8EF0` (6,52:1 sur le fond) et `error-text` `#F87171` (6,85:1) ; les boutons destructifs utilisent un texte sombre sur fond rouge. *Ajoute des jetons à la section 23.1.*

**D-022 — Acceptée. Noyau technique partagé.** En plus des six modules métier, le back-end comporte une couche technique `core` : contexte tenant, transactions, idempotence, écriture de l'audit, outbox, transitions de workflow, documents, notifications, référentiels, interfaces des fournisseurs. Elle ne contient aucune règle métier. *Précise les sections 5 et 30.2.*

---

## 2026-09-25 — Phase 2 (squelette back-end)

Validée par le porteur de projet (« ok pour tous les points »).

**D-023 — Acceptée. Report de l'instrumentation OpenTelemetry (P2-8, priorité « S ») à la phase 16.** L'API NestJS 12 est au format « ES module » : l'instrumentation automatique des traces exige un mécanisme de chargement spécifique, à vérifier et à maintenir. Avant les phases 3 (base de données) et 7 (jobs), il n'y aurait presque rien à tracer. En attendant, le correlation ID relie déjà toutes les lignes de log d'une même requête. *Décale un élément « S » de la phase 2 vers la phase 16, comme le prévoit `docs/BACKLOG.md`.*

---

## 2026-09-25 — Phase 3 (base de données)

Validées par le porteur de projet (« ok pour D-024, D-025 et D-026 »).

**D-024 — Acceptée. Génération des identifiants.** Les UUID v7 (spec 21.2) sont générés par PostgreSQL 18 (fonction native `uuidv7()`, valeur par défaut des clés primaires) plutôt que par l'application, ce qui évite une bibliothèque de plus ; l'application pourra toujours fournir son propre identifiant quand elle en a besoin avant l'insertion. Les données de démonstration utilisent des identifiants **déterministes** (UUID version 8, dérivés du nom de l'objet) pour que chaque `pnpm db:reset` redonne exactement les mêmes identifiants (spec 28). *Précise `docs/DATA_MODEL.md` §1.*

**D-025 — Acceptée. Types d'organisation.** La spec (6.1) prévoit un « type d'organisation » sans en donner la liste. Valeurs retenues : `ISSUER` (émetteur), `ASSET_MANAGER` (société de gestion), `FUND` (fonds). *Complète `docs/DATA_MODEL.md` §3.2.*

**D-026 — Acceptée. Pas de clé étrangère des tables techniques vers les tenants.** Les tables du noyau technique (`core.*`, `audit.*`) portent `tenant_id` sans clé étrangère vers `iam.tenant` : le noyau ne doit dépendre d'aucun module métier (règle de frontière), et l'isolation reste garantie par la RLS. Les tables des modules métier, elles, auront leurs clés étrangères vers `iam.tenant`.

---

## 2026-09-25 — Phase 4 (squelette front-end)

Validées par le porteur de projet (« je valide D-027, D-028 et D-029 »).

**D-027 — Acceptée. Tableau de données et client API.**
1. Le composant `DataTable` est un tableau « piloté » : le tri et la pagination sont faits par l'API (spec 22.1 et 25), le tableau affiche la page reçue et transmet les choix de l'utilisateur. La bibliothèque TanStack Table, prévue dans `docs/ARCHITECTURE.md`, n'est donc pas nécessaire pour l'instant.
2. Le client API généré depuis OpenAPI et TanStack Query (P4-7, priorité « S ») sont reportés à la phase 5, avec les premières routes réellement appelées par le front (connexion).
*Modifie la stack (`docs/ARCHITECTURE.md` §2) et décale P4-7.*

**D-028 — Acceptée. Deux jetons de couleur complémentaires.** La spec (23.1) ne définit pas de couleur de bordure. Ajouts : `border` `#2A3547` pour les séparateurs décoratifs, et `input-border` `#6B7280` pour le contour des champs de saisie, qui doit contraster au moins à 3:1 avec les fonds (règle WCAG 1.4.11, vérifiée par un test). *Ajoute des jetons à la section 23.1.*

**D-029 — Acceptée. Présentation du logo.** Le fichier fourni (1408 × 768, larges marges de la couleur du fond) est affiché sans déformation ni recoloration, dans un cadre qui n'en montre que la partie centrale (monogramme et nom), pour rester lisible dans la barre latérale. Le fichier lui-même n'est pas modifié. À revoir avec la version SVG.

---

## 2026-09-25 — Phase 5 (authentification)

Validées par le porteur de projet (« ok pour tout »).

**D-030 — Acceptée. Troisième rôle PostgreSQL `va_auth`.** Pour se connecter, il faut retrouver un utilisateur par son email avant de connaître son organisation, ce que la RLS interdit à `va_app`. Plutôt qu'un drapeau positionné par le code (idée initiale de `docs/DATA_MODEL.md`), un rôle dédié au composant d'authentification : il lit tous les utilisateurs, rôles attribués et invitations (politique RLS réservée), est le seul à accéder aux sessions, mots de passe et secrets TOTP, et n'a aucun droit sur les tables métier ni d'audit (vérifié par un test). *Modifie `docs/ARCHITECTURE.md` §4.5 (« deux rôles » → trois).*

**D-031 — Acceptée. Routes d'authentification propres à l'API.** Better Auth n'est pas exposé tel quel : les routes `/api/v1/auth/*` sont écrites dans l'API et appellent Better Auth côté serveur. Ainsi toutes les réponses suivent le format d'erreur de la spec (22.2) et l'API maîtrise blocage, limitation de débit et audit. *Précise `docs/ARCHITECTURE.md` §4.12.*

**D-032 — Acceptée. Rôles dès la phase 5, permissions en phase 6.** Les tables des rôles et des rôles attribués sont créées dès maintenant, car la MFA obligatoire et le choix du portail dépendent du rôle. En attendant les permissions (phase 6), la création d'invitations est réservée par rôle : Issuer Administrator (rôles de son organisation, hors investisseurs) et Platform Administrator (premier administrateur d'une organisation, ou autre administrateur plateforme). L'en-tête `Idempotency-Key` (prévu sur cette route) arrive avec l'idempotence en phase 7.

**D-033 — Acceptée. Liste de mots de passe courants.** La vérification de la spec (24) utilise la liste « passwords-common » du projet zxcvbn-ts (49 233 mots de passe, licence MIT), sans tenir compte des majuscules, et refuse aussi un mot de passe courant suivi seulement de chiffres ou de symboles (« Password2026! »).

---

## 2026-09-25 — Phase 6 (tenants, utilisateurs, rôles, permissions, isolation)

Validées par le porteur de projet (« ok on continue »).

**D-034 — Acceptée. Accès break-glass reporté à la phase 16.** P6-6 (priorité « S ») a besoin du journal d'audit complet et de l'outbox (phase 7) pour tracer l'accès dans l'audit du tenant concerné. Il est reporté à la phase 16 (durcissement). L'entrée de menu « Break-glass » de la console plateforme reste un écran « bientôt disponible ». *Décale P6-6.*

**D-035 — Acceptée. Tenant imposé par le client : refus 404 plutôt que simple ignorance.** `docs/ARCHITECTURE.md` §4.4 dit « ignoré et tracé ». Un `tenantId` **d'un autre tenant** dans la query ou le corps d'une requête est refusé avec **404** `RESOURCE_NOT_FOUND` (comme un accès croisé, rien n'est révélé) et tracé dans l'audit (action `TENANT_OVERRIDE_ATTEMPT`). Le `tenantId` de l'utilisateur lui-même est toléré et retiré du corps. Une route qui aurait besoin d'un tenant venant de la requête devra être marquée explicitement (`@AcceptsTenantParameter`) ; aucune ne l'est aujourd'hui (les routes `/tenants/{id}` désignent l'organisation par le chemin, pas par un paramètre `tenantId`). Refuser est plus sûr que continuer en silence : le scénario 5 vérifie qu'aucune donnée de l'autre tenant ne sort. *Modifie `docs/ARCHITECTURE.md` §4.4.*

**D-036 — Acceptée. « Portée plateforme » pour la table des organisations.** Le Platform Administrator n'a pas de tenant courant ; pour gérer les organisations sans rôle PostgreSQL de plus, `va_app` reçoit une politique RLS sur `iam.tenant` active **uniquement** quand la transaction positionne `app.platform_scope = 'on'` (fonction `withPlatformTransaction`, utilisée par les seules routes `/tenants`, protégées par `tenant:read` / `tenant:manage`). Les tables métier n'ont pas cette politique : le Platform Administrator n'y voit toujours rien. Par ailleurs `va_auth` lit l'identifiant et le statut des organisations, pour refuser la connexion (et couper les sessions) des utilisateurs d'une organisation désactivée. *Complète `docs/ARCHITECTURE.md` §4.5.*

**D-037 — Acceptée. Routes ajoutées ou précisées.**
1. `POST /tenants/{id}/administrators` : inviter un autre administrateur d'une organisation existante (Platform Administrator).
2. `GET /users/invitations` : invitations en attente de l'organisation (`user:read`).
3. `GET /reference/countries` et `/reference/currencies` : listes de référence pour les formulaires (toute session valide, aucune donnée de tenant).
4. `GET /settings` demande `tenant-settings:manage`, comme `PATCH`.
5. Refus métier de la gestion des utilisateurs, en détail de `VALIDATION_FAILED` : `OWN_ACCOUNT` (on ne désactive pas son propre compte et on ne change pas ses propres rôles), `LAST_ADMINISTRATOR` (l'organisation garde au moins un administrateur actif), `ROLE_NOT_ASSIGNABLE` (un administrateur émetteur ne donne ni le rôle investisseur ni le rôle plateforme).
6. L'en-tête `Idempotency-Key` des routes marquées IK est exigé à partir de la phase 7 (idempotence), comme prévu par D-032.
*Complète `docs/API.md` §2.3 et §2.4.*

**D-038 — Acceptée. Menus filtrés par permission.** Chaque entrée de menu est associée à une permission (`apps/web/src/features/navigation/portals.ts`) ; une entrée n'apparaît que si `/auth/me` renvoie cette permission, et la page ouverte directement par son adresse affiche « accès refusé ». Choix notables : « Paramètres » (émetteur) demande `user:read` (l'auditeur et le responsable conformité y voient les utilisateurs en lecture seule ; les formulaires n'apparaissent qu'avec `tenant-settings:manage`, `user:manage` ou `role:assign`) ; « Tableau de bord » demande `report:read`. L'API reste seule juge : le front ne fait que masquer.

---

## 2026-09-25 — Phase 7 (journal d'audit, outbox, idempotence, machine à états)

Validées par le porteur de projet (« ok let's go »).

**D-039 — Acceptée. Quatrième rôle PostgreSQL `va_jobs` pour la file de tâches.** pg-boss crée des tables à l'exécution dans son schéma `pgboss` (partitions quotidiennes de ses statistiques). Plutôt que de donner ce droit à l'API, un rôle dédié `va_jobs` possède ce seul schéma et n'a aucun droit sur les données métier. `va_app` peut seulement lire la liste des files et y ajouter des tâches (pour les ajouter dans ses transactions métier). Le schéma et les files sont installés par `pnpm db:setup`, jamais par l'API en marche. *Modifie `docs/ARCHITECTURE.md` §4.5 (trois rôles → quatre).*

**D-040 — Acceptée. Livraison des événements de l'outbox.** Chaque événement est écrit dans `core.outbox_event` **et** sa tâche de livraison dans pg-boss, dans la transaction de l'opération : la livraison démarre aussitôt (quelques secondes). Un filet de sécurité, chaque minute, relance les événements encore en attente depuis plus de 30 secondes (10 tentatives au plus, puis l'événement reste visible en base avec sa dernière erreur). Ce filet et la purge quotidienne des clés d'idempotence travaillent sur toutes les organisations : ils utilisent la « portée plateforme » de D-036, étendue par deux politiques limitées (lecture des événements en attente, suppression des clés expirées). Les emails de notification sont des tâches séparées, relancées indépendamment ; la file ne contient que des identifiants (l'adresse email est lue au moment de l'envoi).

**D-041 — Acceptée. Emails à lien secret envoyés directement.** Les emails d'invitation et de réinitialisation de mot de passe contiennent un lien secret à usage unique ; l'outbox ne stocke que des identifiants (spec 8.5). Ils restent donc envoyés directement, juste après l'opération, comme en phase 5. Si l'envoi échoue, l'administrateur peut renvoyer une invitation. La notification « mot de passe modifié » est reportée : la réinitialisation est faite par le composant d'authentification (`va_auth`), qui n'écrit pas dans l'outbox.

**D-042 — Acceptée. Fonctionnement de l'idempotence.** Toute requête d'une route « IK » s'exécute dans **une seule transaction** : la clé, l'opération, son audit et ses événements sont validés ensemble, ou pas du tout. Conséquences : seule une réponse réussie est mémorisée (une requête refusée peut être renvoyée avec la même clé) ; une seconde requête avec la même clé attend la première jusqu'à 3 secondes, puis reçoit la même réponse (en-tête `Idempotent-Replayed: true`), un `422 IDEMPOTENCY_KEY_REUSED` si son contenu diffère, ou un `409 IDEMPOTENCY_IN_PROGRESS`. Clé absente : `428`. Côté site web, la clé d'une action reste la même tant que le serveur n'a pas répondu (nouvel essai après une coupure réseau = même clé). *Précise `docs/ARCHITECTURE.md` §4.8.*

**D-043 — Acceptée. Catégories et textes des notifications.** Catégories : sécurité et workflow (toujours actives), organisation, émissions, souscriptions et transferts, distributions, documents, conformité. Par défaut, les autres catégories sont actives dans l'application et par email. Les textes (anglais et français) sont dans un catalogue unique de `@virtus/shared`, utilisé par la cloche du site et par les emails. La table `core.notification_template` et l'écran « Modèles » de la console plateforme sont reportés (priorité faible, phase 15).

**D-044 — Acceptée. Règles du journal d'audit.**
1. Les valeurs avant/après ne contiennent que les champs modifiés. Les champs sensibles (liste commune avec les logs : email, téléphone, identifiants fiscaux, date de naissance, adresse, IBAN, secrets…) et le nom des personnes sont remplacés par `[MASKED]` : on voit qu'ils ont changé, pas leur valeur.
2. Le rôle de l'auteur, l'adresse IP, le navigateur, l'origine (application web ou tâche de fond) et la référence de corrélation sont remplis automatiquement.
3. Une action du Platform Administrator sur une organisation (création, activation, modification) est enregistrée dans le journal **de cette organisation**.
4. Route ajoutée : `GET /audit-events/actions` (liste des actions présentes, pour le filtre de l'écran).
5. Les changements de statut passent par la machine à états générique : demander le statut actuel (par exemple désactiver un utilisateur déjà inactif) répond `409 INVALID_STATE_TRANSITION`.
*Complète `docs/API.md` §2.13.*

---

## 2026-09-25 — Phase 8 (investisseurs, KYC/KYB simulé, documents)

Validées par le porteur de projet (« OK pour les règles et lancer la phase 9 »).

**D-045 — Acceptée. Téléchargement des documents par l'API.** La spec (16) prévoit une « URL de téléchargement temporaire ». Plutôt qu'une URL signée du stockage S3 (Garage n'est pas joignable par le navigateur dans Codespaces, et le stockage n'a pas à être exposé), l'API donne un lien signé vers elle-même, valable 5 minutes, utilisable seulement par l'utilisateur qui l'a demandé et avec sa session ; les droits sont vérifiés à la création du lien et de nouveau au téléchargement. Le téléchargement d'un document confidentiel est tracé dans l'audit. *Précise `docs/ARCHITECTURE.md` §4.11.*

**D-046 — Acceptée. Contrôles des fichiers.**
1. Le type réel est détecté d'après le contenu avec la bibliothèque `file-type` (version 22.1.1) ; un CSV, qui n'a pas de signature, est accepté s'il s'agit de texte UTF-8 sans caractère de contrôle avec un séparateur sur la première ligne.
2. L'antivirus factice refuse le fichier de test standard EICAR (inoffensif, reconnu par tous les antivirus), ce qui permet de démontrer le refus ; le refus est tracé dans l'audit et le fichier n'est pas conservé.
3. Le fichier est stocké avant l'écriture des métadonnées : si celle-ci échoue, un fichier inutilisé reste dans le stockage, mais aucun document ne pointe jamais vers un fichier absent. `pnpm db:reset` ne vide pas le stockage de démonstration.
4. Pour l'anti-doublon d'un envoi de fichier, l'empreinte de la requête inclut le contenu du fichier.
5. Dans les tests d'intégration, le stockage est remplacé par une version en mémoire (la CI n'a pas de service S3) ; le stockage réel est vérifié lors de l'essai de la démo.

**D-047 — Acceptée. Règles du dossier KYC/KYB.**
1. Un dossier naît « en préparation » (IN_PROGRESS) ; un investisseur a au plus un dossier ouvert. Son statut KYC est la copie de celui de son dernier dossier (NOT_STARTED s'il n'en a aucun).
2. Au moins une pièce justificative (document de type « pièce KYC » de ce même investisseur) est exigée pour soumettre ; la personne qui soumet est le préparateur.
3. À la soumission, le fournisseur factice donne une recommandation (rien de signalé / examen approfondi, risque suggéré) ; en panne, le dossier reste en préparation (503). La décision reste toujours humaine.
4. Le responsable conformité, qui ne doit pas être le préparateur (quatre yeux, vérifié aussi par une contrainte en base), approuve, refuse (commentaire obligatoire) ou **renvoie le dossier pour compléments** (commentaire obligatoire) — ce dernier retour n'est pas dans la spec (8.2) mais évite de refuser un dossier simplement incomplet.
5. Une validation vaut 12 mois, jusqu'à la veille de la date anniversaire ; le niveau de risque suggéré devient celui de l'investisseur.
6. La tâche quotidienne `kyc-expiry` prévient une fois l'investisseur et les responsables conformité 30 jours avant l'échéance, puis passe le dossier en EXPIRED le lendemain de son dernier jour de validité (fuseau de l'organisation, D-015).

**D-048 — Acceptée. Profil dans le portail investisseur.** L'investisseur consulte et modifie son profil par `GET/PATCH /me/investor` (au lieu de `PATCH /investors/{id}` avec la portée « propre » prévue par `docs/API.md`) : il ne peut changer que ses coordonnées (nom commercial, email, téléphone, adresse), jamais sa raison sociale ni sa classification. Code destinataire (D-010) : format `VA-XXXX-XXXX`, alphabet sans lettres ambiguës (pas de I, L, O, U), régénérable, l'ancien cessant aussitôt de fonctionner. Les comptes de démo investor.a, b et c sont reliés à Alpine, Baltic et Cedar. L'invitation d'un investisseur sur le portail arrive avec les émissions (phase 10).

**D-049 — Acceptée. Masquage de l'audit élargi.** Un champ est masqué dès que son nom *contient* une clé sensible (`contactEmail`, `mobilePhone`…), et non plus seulement s'il porte exactement ce nom. Les noms, fonctions et nationalités des représentants et bénéficiaires effectifs sont aussi masqués.

**D-050 — Acceptée. Routes ajoutées ou précisées.** `POST /kyc-cases/{id}/documents` (joindre une pièce), `POST /kyc-cases/{id}/send-back` (renvoi pour compléments), `GET /documents/download?token=…` (fichier d'un lien signé), `PATCH` des représentants et bénéficiaires, `GET /investors/{id}/comments`. La route `POST /investors/{id}/eligibility-status` et `/eligibility-assessments` arrivent en phase 9 avec le moteur d'éligibilité. *Complète `docs/API.md` §2.5 et §2.11.*

---

## 2026-09-25 — Phase 9 (moteur d'éligibilité)

Proposées, en attente de validation par le porteur de projet.

**D-051 — Proposée. Règles du moteur d'éligibilité.**
1. Toutes les règles demandées sont évaluées et renvoyées (réussies et échouées), sans s'arrêter à la première ; seules les règles que le jeu de règles de l'émission demande sont évaluées (liste vide = pas de restriction).
2. Un KYC approuvé dont la date de fin est passée est traité comme expiré (`KYC_EXPIRED`), même avant le passage de la tâche quotidienne ; un KYC valable jusqu'à aujourd'hui inclus est accepté.
3. « Investisseur professionnel » = client professionnel ou contrepartie éligible : la règle `NOT_PROFESSIONAL` ne peut pas échouer avec les classifications du MVP ; elle est gardée pour de futures classifications.
4. Une décision « non éligible » ou « suspendu » d'un responsable conformité bloque toutes les émissions (`INVESTOR_NOT_ELIGIBLE`, `INVESTOR_SUSPENDED`).
5. Le plafond d'investisseurs ne s'applique pas à un investisseur déjà présent sur l'émission.
6. La version enregistrée avec chaque décision combine celle du moteur et celle du jeu de règles (`engine-1/rules-3`).

**D-052 — Proposée. Enregistrement des décisions d'éligibilité.**
1. Le moteur enregistre sa décision quand une invitation, une souscription ou un transfert en dépend (phases 10 à 13), dans la transaction de l'opération ; la simulation (`preview`) n'enregistre rien.
2. Le responsable conformité décide du statut (éligible, non éligible, suspendu) avec une justification obligatoire ; cette décision est enregistrée avec la situation générale de l'investisseur à ce moment (profil, KYC). On ne revient jamais à « non évalué », et redemander le statut actuel est refusé (409).
3. Chaque décision conserve aussi le jeu de règles appliqué (colonne `rule_set`, ajoutée au modèle de `docs/DATA_MODEL.md` §3.3) pour pouvoir l'expliquer plus tard.

**D-053 — Proposée. Scénario 2 avant les émissions.** Les émissions n'existant qu'à la phase 10, la partie éligibilité du scénario 2 est vérifiée avec le jeu de règles de l'émission solaire de démonstration fourni directement (pays exclu : États-Unis). La fiche investisseur propose un simulateur de règles au responsable conformité. La « whitelist » d'une émission sera la liste de ses invitations (phase 10).
