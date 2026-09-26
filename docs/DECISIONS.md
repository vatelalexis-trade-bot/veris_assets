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

Validées par le porteur de projet (« ok pour tout »).

**D-051 — Acceptée. Règles du moteur d'éligibilité.**
1. Toutes les règles demandées sont évaluées et renvoyées (réussies et échouées), sans s'arrêter à la première ; seules les règles que le jeu de règles de l'émission demande sont évaluées (liste vide = pas de restriction).
2. Un KYC approuvé dont la date de fin est passée est traité comme expiré (`KYC_EXPIRED`), même avant le passage de la tâche quotidienne ; un KYC valable jusqu'à aujourd'hui inclus est accepté.
3. « Investisseur professionnel » = client professionnel ou contrepartie éligible : la règle `NOT_PROFESSIONAL` ne peut pas échouer avec les classifications du MVP ; elle est gardée pour de futures classifications.
4. Une décision « non éligible » ou « suspendu » d'un responsable conformité bloque toutes les émissions (`INVESTOR_NOT_ELIGIBLE`, `INVESTOR_SUSPENDED`).
5. Le plafond d'investisseurs ne s'applique pas à un investisseur déjà présent sur l'émission.
6. La version enregistrée avec chaque décision combine celle du moteur et celle du jeu de règles (`engine-1/rules-3`).

**D-052 — Acceptée. Enregistrement des décisions d'éligibilité.**
1. Le moteur enregistre sa décision quand une invitation, une souscription ou un transfert en dépend (phases 10 à 13), dans la transaction de l'opération ; la simulation (`preview`) n'enregistre rien.
2. Le responsable conformité décide du statut (éligible, non éligible, suspendu) avec une justification obligatoire ; cette décision est enregistrée avec la situation générale de l'investisseur à ce moment (profil, KYC). On ne revient jamais à « non évalué », et redemander le statut actuel est refusé (409).
3. Chaque décision conserve aussi le jeu de règles appliqué (colonne `rule_set`, ajoutée au modèle de `docs/DATA_MODEL.md` §3.3) pour pouvoir l'expliquer plus tard.

**D-053 — Acceptée. Scénario 2 avant les émissions.** Les émissions n'existant qu'à la phase 10, la partie éligibilité du scénario 2 est vérifiée avec le jeu de règles de l'émission solaire de démonstration fourni directement (pays exclu : États-Unis). La fiche investisseur propose un simulateur de règles au responsable conformité. La « whitelist » d'une émission sera la liste de ses invitations (phase 10).

---

## 2026-09-25 — Phase 10 (émissions)

Validées par le porteur de projet (« ok pour D-054 à D-058, on lance la phase 11 »).

**D-054 — Acceptée. Cycle de vie livré en phase 10.** La machine à états complète de la spec (7.1) est en place, mais seules les actions jouables aujourd'hui ont une route : soumettre, approuver (quatre yeux), renvoyer en brouillon (commentaire obligatoire), ouvrir et clôturer les souscriptions, annuler (commentaire obligatoire). L'allocation (phase 12), l'activation et l'échéance (phase 14) arriveront avec leurs phases. L'ouverture est refusée avant la date de début (`SUBSCRIPTION_WINDOW_NOT_STARTED`) et après la date de fin. La tâche `subscription-auto-close` clôture chaque jour (et au démarrage) les souscriptions dont la date de fin est passée, dans le fuseau de l'organisation. Seul un brouillon est modifiable.

**D-055 — Acceptée. Invitations (whitelist).**
1. Un investisseur est invité après contrôle d'éligibilité ; s'il n'est pas éligible, l'invitation est refusée (`422 ELIGIBILITY_FAILED` avec les règles échouées et leurs valeurs), et la décision est tout de même enregistrée, dans une transaction à part, pour qu'elle survive au refus.
2. Le plafond d'investisseurs n'est pas contrôlé à l'invitation (il limite les souscripteurs ; il le sera à la souscription, phase 11).
3. On invite d'une émission approuvée jusqu'à la clôture des souscriptions. Une invitation retirée reste dans l'historique ; une nouvelle invitation refait le contrôle d'éligibilité.
4. Un investisseur ne voit que les émissions où il est invité, jamais un brouillon ni une émission en cours d'approbation.

**D-056 — Acceptée. Assistant de création.**
1. Le brouillon naît avec un nom et un code court (unique dans l'organisation, en majuscules) ; l'assistant enregistre ensuite automatiquement, environ une seconde après la dernière saisie, et se souvient de l'étape atteinte.
2. L'émission a trois parties versionnées séparément (informations générales, conditions, règles d'éligibilité), chacune avec son `If-Match`, pour que l'enregistrement automatique d'une étape ne bloque pas les autres.
3. Le taux est saisi en pourcentage (5 ou 5,25) et conservé en fraction (0,05), converti en décimal exact. La fréquence de distribution est à l'étape 2 ; la convention de décompte des jours, l'arrondi, le jour ouvré et la date d'enregistrement (D-012) à l'étape 4.
4. Deux contrôles s'ajoutent à ceux de la spec (6.3) : champ nécessaire manquant (`REQUIRED_FIELD_MISSING`) et montant plus précis que la devise (`AMOUNT_TOO_PRECISE`). Les contrôles s'affichent à côté des champs et dans la revue, avec un lien vers l'étape à corriger.

**D-057 — Acceptée. Routes des émissions.** Ajoutées : `GET/POST /issuances/{id}/documents` (documents de l'émission, étape 5). `GET /issuances/{id}/terms` et `/eligibility-rules` ne sont pas créées : ces parties sont déjà renvoyées par `GET /issuances/{id}`, avec leur version. *Modifie `docs/API.md` §2.6.*

**D-058 — Acceptée. Tests de bout en bout.** Playwright 1.63.0, dossier `tests/e2e/`, commande `pnpm test:e2e`, nouveau job de CI « End-to-end scenarios ». L'application est compilée et démarrée comme en production (`scripts/e2e-server.sh`) ; en local, une démo déjà lancée est réutilisée. Le test se connecte par les vrais écrans, avec le code à deux facteurs fourni par la route des comptes de démo (D-016). Il utilise un code d'émission nouveau à chaque passage : il ne réinitialise pas la base de démo.

---

## 2026-09-26 — Phase 11 (souscriptions)

Validées par le porteur de projet (« OK pour les points D-060 à D-063 »).

**D-059 — Acceptée. Paiement fictif livré en phase 12.** Choix du porteur de projet pendant la phase 11. Selon l'ordre de traitement de la spec (9.2) et D-009, le paiement fictif porte sur le montant **alloué** : il ne peut donc venir qu'après l'allocation (phase 12). P11-4 (préparation et confirmation quatre yeux du paiement, `PaymentProvider` factice) et les routes `payment/prepare` et `payment/confirm` passent en phase 12. En phase 11, une souscription s'arrête à « Approuvée », « Rejetée » ou « Annulée ». La machine à états complète est déjà en place.

**D-060 — Acceptée. Contrôles de la souscription (spec 9.3 et 9.4).**
1. Les contrôles ont lieu à l'envoi du brouillon (et non à sa saisie), dans cet ordre, le premier échec étant renvoyé :
   - émission ouverte ;
   - dates de souscription ;
   - unités entières (`QUANTITY_NOT_INTEGER`) ;
   - montant = unités × valeur nominale (`AMOUNT_UNITS_MISMATCH`) ;
   - minimum de souscription ;
   - plafond par investisseur ;
   - unités disponibles ;
   - montant maximum de l'émission ;
   - puis l'éligibilité.
2. Plafond par investisseur : on additionne les souscriptions actives de l'investisseur sur l'émission (de « Soumise » à « Allouée ») et la nouvelle demande. Une souscription annulée ou rejetée ne compte plus.
3. « Plafond global » et « disponibilité des unités » sont contrôlés **par demande** : une demande seule ne peut pas dépasser le montant maximum de l'émission ni son nombre total d'unités. Le **total** des demandes peut, lui, dépasser l'offre : c'est la sursouscription de la spec (9.4), réglée à l'allocation manuelle (phase 12).
4. L'éligibilité est vérifiée et enregistrée à l'envoi, puis vérifiée de nouveau à l'approbation, car la situation de l'investisseur peut avoir changé entre-temps (par exemple un KYC expiré).
5. Un envoi refusé pour éligibilité renvoie `422 ELIGIBILITY_FAILED` avec les règles échouées. La décision est enregistrée à part, pour survivre au refus (comme pour D-055), et le brouillon reste un brouillon : rien n'est transmis à l'émetteur. Un nouvel essai modifie le même brouillon.
6. L'acceptation des documents et la déclaration d'éligibilité sont obligatoires à l'envoi. Leur absence donne `400 VALIDATION_FAILED` avec `DOCUMENTS_NOT_ACCEPTED` ou `ELIGIBILITY_NOT_DECLARED`. L'heure de chaque acceptation est conservée.
7. La devise de la souscription est celle de l'émission.

**D-061 — Acceptée. Traitement et annulation.**
1. La prise en charge (« En revue ») est faite par un opérateur ou un administrateur de l'émetteur (`subscription:review`). L'approbation et le rejet sont faits par un administrateur (`subscription:approve`) ; le rejet exige un motif, visible par l'investisseur.
2. L'approbation d'une souscription n'est pas soumise aux quatre yeux : la spec ne le demande pas, et c'est l'investisseur qui a initié la demande. Les quatre yeux s'appliqueront à l'allocation et au paiement (phase 12).
3. L'investisseur peut annuler seul, sans motif, tant que sa souscription n'est pas approuvée (brouillon, soumise, en revue). L'émetteur peut annuler jusqu'à « Paiement en attente » inclus, avec un motif obligatoire, visible par l'investisseur et notifié.
4. L'annulation d'une émission annule automatiquement ses souscriptions en cours, par le système, avec le motif « émission annulée » ; chaque annulation est tracée dans l'audit. Les investisseurs sont prévenus par la notification d'annulation de l'émission.
5. Notifications :
   - à l'envoi, les opérateurs et administrateurs de l'émetteur ;
   - à l'approbation, au rejet ou à l'annulation par l'émetteur, l'investisseur.

**D-062 — Acceptée. Compte de démo « Investor D » pour le scénario 2.** *Modifie D-017 (4 comptes investisseurs au lieu de 3).* `investor.d@example.com` est rattaché à Iris Asset Holdings GmbH (démo), dont le KYC a expiré il y a 11 jours et qui est invitée à l'émission NWSD26. Le scénario 2 (`tests/e2e/scenario-2-not-eligible.spec.ts`) se connecte avec ce compte, tente de souscrire et voit la raison du refus en clair.

**D-063 — Acceptée. Découpage de la phase 11.** P11-5 (clôture automatique) a déjà été livré en phase 10 (D-054). P11-7 (bulletin de souscription PDF, priorité S) est reporté à la phase 15 (exports), avec les autres documents générés.

---

## 2026-09-26 — Phase 12a (allocation, registre, ledger)

Validées par le porteur de projet (« OK pour tout, on pourra ajuster plus tard »).

**D-064 — Acceptée. Découpage de la phase 12.** Choix du porteur de projet au lancement de la phase.
1. La phase 12 est livrée en deux fois :
   - **12a** : ledger (P12-1), allocation manuelle (P12-2), écritures de la validation (P12-3), écran registre (partie de P12-5) et scénario 3 (P12-8) ;
   - **12b** : paiement fictif (P12-9, ex-P11-4), `TokenRegistryProvider` (P12-4), job de rapprochement (P12-5), tests de concurrence et couverture de 90 % (P12-6), corrections par contre-écriture (P12-7).
2. La confirmation d'allocation en PDF (spec 10.1) est reportée en phase 15, avec les autres documents générés (D-063).

**D-065 — Acceptée. Préparation d'une allocation (spec 10.1, 9.4).**
1. Une allocation (« lot ») ne se prépare qu'une fois les souscriptions clôturées **et** toutes décidées. S'il reste des souscriptions soumises ou en revue, la préparation est refusée avec le nouveau code `422 SUBSCRIPTIONS_TO_DECIDE`.
2. Le lot contient une ligne par souscription approuvée, pré-remplie avec les unités demandées : l'émetteur « renseigne ou confirme » (spec 10.1).
3. Il y a au plus un lot en cours ou validé par émission. Un lot rejeté reste dans l'historique, et un nouveau lot peut alors être préparé.
4. Tant qu'un lot est en préparation ou proposé, une souscription approuvée ne peut pas être annulée (`409`, détail `ALLOCATION_ROUND_IN_PROGRESS`) : les lignes du lot resteraient sinon périmées.
5. Contrôles, faits à la proposition et refaits à la validation :
   - unités entières ;
   - jamais plus que demandé (`ALLOCATION_EXCEEDS_REQUEST`) ;
   - total au plus égal aux unités de l'émission (`ALLOCATION_EXCEEDS_SUPPLY`) ;
   - si le montant alloué est sous le montant minimum de l'émission, une justification est obligatoire (`MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED`, D-013). La justification est saisie avec le lot, validée par l'administrateur et conservée dans l'audit.
6. Quatre yeux : le lot est validé par un administrateur de l'émetteur autre que celui qui l'a proposé. C'est vérifié par le serveur et aussi par une contrainte en base.
7. Un brouillon peut être abandonné par celui qui le prépare (commentaire obligatoire) : il passe « Rejeté ». La route `POST /allocations/{id}/reject` demande donc `allocation:prepare`, et la machine à états exige `allocation:validate` pour rejeter un lot proposé. *Modifie `docs/API.md` §2.8.*
8. `registry.allocation` est unique par (lot, souscription), et non plus par souscription seule, pour garder les lots rejetés. *Modifie `docs/DATA_MODEL.md` §3.5.*

**D-066 — Acceptée. Écritures du registre à la validation (précise D-009).**
1. Dans une seule transaction :
   - `ISSUANCE` du nombre total d'unités vers la trésorerie de l'émetteur, à la première allocation de l'émission ;
   - puis, pour chaque ligne non nulle, `ALLOCATION` (trésorerie → investisseur) et `BLOCK` ;
   - les souscriptions passent « Paiement en attente », avec le montant dû ; une ligne à 0 unité annule la souscription avec le motif `NOT_ALLOCATED` ;
   - l'émission passe « Allouée ».
2. Le montant d'acquisition d'une position est unités allouées × valeur nominale.
3. Avant la fin de la transaction, les invariants 1, 2, 3 et 5 de la spec (10.4) sont recalculés à partir du ledger. Tout écart annule l'opération (`REGISTRY_INVARIANT_VIOLATION`).
4. Chaînage : `entry_hash = SHA-256(previous_hash | représentation JSON canonique)`. La représentation liste les champs dans un ordre fixe, avec les quantités normalisées et les clés de métadonnées triées. Le hash de départ vaut 64 zéros.
5. La date effective d'un mouvement est la date du jour dans le fuseau de l'organisation (D-015).
6. Si l'émetteur annule une souscription en « Paiement en attente », les mouvements `UNBLOCK` puis `CANCELLATION` rendent les unités à la trésorerie (D-009). Ce cas est livré dès la 12a pour que le registre ne diverge jamais.
7. Le passage de l'émission à « Allouée » demande `allocation:validate`, comme dans `docs/DATA_MODEL.md` §4.1 (le code demandait `issuance:operate`).
8. Les quantités du registre sont en `NUMERIC(20,4)` : décimales en base, entières dans le MVP (spec 10.5).

**D-067 — Acceptée. Consultation du registre.**
1. L'émetteur voit les positions et les mouvements, dans l'onglet « Registre » de chaque émission allouée et dans le menu « Registre ».
2. Un investisseur ne voit que ses positions et les mouvements de ses comptes, sans jamais le nom d'un autre investisseur (comme D-010). Il ne voit pas les lots d'allocation : liste vide et 404.
3. Notifications :
   - lot proposé : les autres administrateurs de l'émetteur ;
   - lot rejeté : celui qui l'a proposé ;
   - unités allouées (avec leur nombre), ou aucune unité allouée : l'investisseur.

**D-068 — Acceptée. Données de démo et scénario 3.**
1. Nouvelle émission « Northwind Infrastructure Notes 2026 » (NWIN26) : 1 000 unités de 1 000 €, souscriptions clôturées, 1 200 unités demandées par des souscriptions approuvées (Alpine 500, Baltic 400, Cedar 300). Elle est prête à être allouée en démonstration.
2. Sur NWSD26 : une souscription d'Alpine attend une revue, et une souscription de Cedar a été rejetée. La spec (28) demande une souscription rejetée dans la démo.
3. Le scénario 3 automatisé prépare sa propre émission par l'API, avec un nouveau code à chaque passage : il peut être rejoué sans réinitialiser la base, comme le scénario 1 (D-058).

---

## 2026-09-26 — Phase 12b (paiement, corrections, rapprochement)

Validées par le porteur de projet (« ok pour tout »).

**D-069 — Acceptée. Paiement fictif (spec 9.2, 4.8, D-009).**
1. Un opérateur ou un administrateur de l'émetteur (`payment:prepare`) prépare la confirmation du paiement du montant dû. Le fournisseur de paiement fictif rend une référence (`FAKE-PAY-…`).
2. Un administrateur autre que celui qui l'a préparée (`payment:confirm`, quatre yeux) confirme ensuite, si le fournisseur indique le paiement reçu. Dans une seule transaction :
   - `UNBLOCK` des unités ;
   - la souscription passe « Paiement en attente » → « Paiement confirmé » → « Allouée » ;
   - les unités deviennent disponibles pour l'investisseur, qui est prévenu.
3. Si le fournisseur n'a pas reçu le paiement, la confirmation est refusée (nouveau code `422 PAYMENT_NOT_RECEIVED`) et rien ne change. Le mode du fournisseur se règle comme les autres : `PROVIDER_PAYMENT_MODE=success|reject|outage`.
4. Une souscription annulée par l'émetteur pendant l'attente du paiement marque le paiement « échoué ».
5. Nouvelle route `GET /subscriptions/{id}/payment` : l'investisseur voit l'état du paiement de ses propres souscriptions.

**D-070 — Acceptée. Corrections par contre-écriture (spec 10.3, 4.8).**
1. Un administrateur de l'émetteur (`registry-correction:request`) propose d'annuler **un** mouvement, avec un motif, et éventuellement les mouvements qui auraient dû être écrits (« remplacements »).
2. Un responsable conformité ou un autre administrateur (`registry-correction:approve`) approuve ou rejette. C'est toujours une autre personne que celle qui a proposé (quatre yeux) ; le rejet demande un commentaire.
3. L'approbation écrit des mouvements `CORRECTION` :
   - une contre-écriture qui renvoie les unités de la destination vers la source, et qui référence le mouvement corrigé ;
   - puis les remplacements.

   Le mouvement d'origine n'est jamais modifié, et les invariants sont vérifiés avant la fin de la transaction. Une correction impossible (par exemple parce qu'elle prendrait des unités non disponibles) est refusée et reste « à approuver ».
4. Ce qui ne se corrige pas :
   - un blocage ou un déblocage, qui s'annule par le mouvement inverse ;
   - un mouvement déjà corrigé ;
   - un mouvement qui a déjà une demande en attente.
5. Les corrections portent sur les quantités. Les montants d'acquisition ne sont pas recalculés.
6. Nouvelle route `GET /ledger/corrections?issuanceId=…&status=…`, réservée à l'émetteur (liste vide pour un investisseur).

**D-071 — Acceptée. Rapprochement du registre (spec 10.4).**
1. La tâche quotidienne `registry-reconciliation` (3 h 15) reconstruit les positions de chaque émission à partir de son ledger, pour toutes les organisations, et vérifie la chaîne d'empreintes (invariants 1, 2, 3 et 5).
2. Une anomalie est inscrite dans l'audit (`REGISTRY_RECONCILIATION_FAILED`) et signalée aux administrateurs et aux responsables conformité (notification obligatoire). Rien n'est réparé automatiquement : une réparation passe par une correction à quatre yeux.
3. Le même contrôle se lance à la demande (`GET /ledger/reconciliation?issuanceId=…`, réservé à l'émetteur). Son résultat s'affiche en tête de l'écran registre.

**D-072 — Acceptée. `TokenRegistryProvider` (spec 26).**
1. L'interface est dans `core/providers`, avec les opérations de la spec : `createAsset`, `mint`, `transfer`, `burn`, `freeze`, `unfreeze`, `getBalance`, `getTransactionStatus`.
2. Chaque appel porte l'organisation et l'émission (déterminées par le serveur), et les comptes sont les comptes logiques du registre.
3. `InternalLedgerProvider` est la seule implémentation : chaque opération est un mouvement écrit par le `LedgerWriter`, dans sa propre transaction.
4. Les parcours métier (allocation, paiement, corrections) écrivent directement par le `LedgerWriter`, dans leur propre transaction : le registre interne reste la source de vérité. L'interface est le point d'extension d'un futur miroir blockchain. Aucune dépendance blockchain n'est ajoutée.

**D-073 — Acceptée. Tests de concurrence et couverture (spec 25, P12-6).**
1. Des tests lancent des écritures simultanées sur une même position et vérifient qu'on ne bloque ou ne transfère jamais plus que disponible, que la séquence et la chaîne d'empreintes restent intactes, et qu'un paiement confirmé en même temps par deux administrateurs ne l'est qu'une fois :
   - 5 blocages de 30 unités sur 100 disponibles ;
   - 12 transferts de 100 unités sur 800 ;
   - la double confirmation d'un même paiement.
2. La couverture du module Registre se mesure avec `pnpm test:coverage`, sur ses tests unitaires et d'intégration ensemble. C'est une étape de la CI, qui utilise le module `@vitest/coverage-v8` 5.0.1 (même version que vitest).
3. Les 90 % de la spec s'appliquent aux lignes, aux instructions et aux fonctions. Les branches ont un plancher de 75 % : ce sont surtout des valeurs par défaut défensives. Mesure au 2026-09-26 : lignes 97 %, instructions 95 %, fonctions 96 %, branches 78 %.
4. Les déclarations de tables (`schema.ts`) sont exclues de la mesure : elles ne contiennent pas de logique.

---

## 2026-09-26 — Phase 13 (transferts)

Validées par le porteur de projet (« ok pour tout »).

**D-074 — Acceptée. Destinataire d'un transfert et confidentialité (précise D-010).**
1. Le destinataire est désigné par son code destinataire. Ce peut être n'importe quel investisseur de l'organisation, même s'il n'est pas invité à l'émission : l'invitation donne le droit de souscrire, et pour un transfert c'est le moteur d'éligibilité qui décide.
2. L'expéditeur ne voit jamais le nom ni l'identifiant du destinataire : seulement le code qu'il a saisi.
3. Un destinataire refusé donne `RECIPIENT_NOT_ELIGIBLE`, sans le détail des règles. Le dépassement du maximum par investisseur donne le même code, pour ne rien révéler des avoirs du destinataire.
4. La décision d'éligibilité est enregistrée (contexte `TRANSFER`), et l'émetteur en voit le détail.
5. Le destinataire est prévenu des unités reçues, sans le nom de l'expéditeur.
6. Un investisseur ne voit que les demandes qu'il a faites.

**D-075 — Acceptée. Contrôles et écritures d'un transfert (spec 11.1, 11.3, D-014).**
1. À l'envoi, dans une seule transaction :
   - émission allouée ou active, avec les transferts autorisés, sinon `TRANSFER_NOT_ALLOWED` ;
   - période de blocage terminée, sinon `LOCKUP_PERIOD_ACTIVE` : un transfert est accepté le jour même de la fin ;
   - unités entières, jamais vers soi-même ;
   - KYC/KYB valide de l'expéditeur, qui voit alors ses propres raisons ;
   - éligibilité du destinataire selon les règles de l'émission, le nombre maximal d'investisseurs étant compté sur les détenteurs actuels ;
   - maximum par investisseur, calculé sur les avoirs du destinataire × la valeur nominale ;
   - puis `BLOCK` des unités (`INSUFFICIENT_AVAILABLE_QUANTITY` si elles ne sont pas disponibles). La demande passe « Soumise » puis aussitôt « Revue conformité ».
2. L'approbation est faite par un responsable conformité ou un administrateur de l'émetteur. L'éligibilité du destinataire est revérifiée, puis `UNBLOCK` + `TRANSFER`, et la demande passe « Approuvée » puis « Exécutée », dans la même transaction.
3. Le montant d'acquisition suit les unités, au prorata : montant × unités transférées / unités détenues, arrondi aux décimales de la devise.
4. Un rejet (motif obligatoire) ou une annulation débloque les unités. L'investisseur annule sans motif ; l'émetteur annule avec un motif, que l'investisseur voit.
5. Un brouillon est modifiable (nouvelle route `PATCH /transfers/{id}`) : après un refus, le même brouillon est réutilisé. Le prix indicatif n'est qu'une information : aucun règlement n'est simulé (spec 11.3).

**D-076 — Acceptée. Portefeuille de l'investisseur.**
1. L'entrée « Portefeuille » du portail investisseur montre dès maintenant les positions (détenues, bloquées, disponibles, montant investi) et les demandes de transfert, avec un bouton « Transférer ». Le détail complet d'une position (spec 14.3) reste en phase 15.
2. Le registre lit une émission sans le filtre des invitations, puisqu'un détenteur peut avoir reçu ses unités par transfert. C'est le registre qui vérifie ce que l'utilisateur peut faire.

**D-077 — Acceptée. Menu « Transferts » de l'émetteur.** *Modifie la spec 13.2.* Une entrée « Transferts » (`transfer:read`) est ajoutée au menu de l'émetteur, après « Registre ». Elle s'ouvre sur les demandes en revue de conformité, pour les responsables conformité et les administrateurs. La file « À traiter » (phase 15) les reprendra.

**D-078 — Acceptée. Données de démo et scénario 4.**
1. Nouvelle émission « Northwind Private Debt Fund I » (NWPD1) : allouée et payée (Alpine 800, Baltic 600, Cedar 400 unités, 200 restant en trésorerie), avec son ledger chaîné et cohérent.
2. Un transfert de 100 unités d'Alpine vers Danube attend la revue de conformité, comme le demande la spec (28).
3. Le scénario 4 automatisé prépare sa propre émission par l'API, il peut donc être rejoué. La préparation par l'API est maintenant partagée avec le scénario 3.

---

## 2026-09-26 — Phase 14a (échéancier, coupons, distributions)

**D-079 — Proposée. Découpage de la phase 14.**
1. La phase 14 est livrée en deux fois, comme la phase 12 (D-064) :
   - **14a** : échéancier à l'activation (P14-1), calcul (P14-2), photo du registre et distribution à quatre yeux (P14-3), instruction de paiement fictive et CSV (P14-4), scénario 6 et couverture (P14-7) ;
   - **14b** : remboursement du principal, passage à « Échue » et remboursement anticipé (P14-5).
2. En 14a, créer une distribution de principal est refusé (`PRINCIPAL_REPAYMENT_NOT_AVAILABLE_YET`).
3. L'avis de coupon en PDF (P14-6) est reporté en phase 15, avec les autres documents générés (D-063, D-064).

**D-080 — Proposée. Activation et échéancier (spec 7.1, 12.1, D-009, D-012).**
1. L'activation (`POST /issuances/{id}/activate`, `issuance:operate`) fait passer l'émission de « Allouée » à « Active ». Elle est refusée tant qu'une souscription attend son paiement (`PENDING_PAYMENTS_REMAINING`). Dans la même transaction, elle génère l'échéancier.
2. Les périodes se comptent à partir de la date d'émission, tous les 1, 3, 6 ou 12 mois. La dernière période, plus courte si besoin, finit à la maturité. Une fréquence `BULLET` donne un seul coupon. Une ligne « Principal » est ajoutée à la maturité.
3. Les dates de période ne sont pas ajustées, donc le montant ne change pas. La date de paiement est décalée au jour ouvré suivant si la convention est `FOLLOWING`. La record date est la date de paiement moins le nombre de jours ouvrés choisi (D-012).
4. Le champ « délai de grâce » (`grace_period_days`) n'est pas utilisé par le calendrier : son usage reste à préciser.

**D-081 — Proposée. Calcul d'une distribution (spec 12.2, 12.3).**
1. La photo du registre (« snapshot ») reprend les mouvements dont la date effective est au plus tard la record date, jusqu'au dernier mouvement enregistré au moment de la photo.
2. Seuls les comptes des investisseurs comptent : la trésorerie de l'émetteur est exclue, et les unités bloquées sont incluses.
3. Le calcul n'est possible qu'à partir de la record date (`RECORD_DATE_NOT_REACHED` avant).
4. Montant par ligne : unités × valeur nominale × taux × fraction de période, en décimal exact, puis arrondi aux centimes avec la méthode de l'émission. L'écart d'arrondi est le total non arrondi moins le total arrondi. Il est affiché, avec toutes ses décimales.
5. La seule anomalie signalée est une ligne arrondie à zéro. D'autres (KYC expiré, par exemple) demanderaient au module de consulter les investisseurs, ce que l'architecture ne lui permet pas encore.
6. Un nouveau calcul, après un renvoi en brouillon, écrit de nouvelles lignes numérotées : les anciennes sont gardées. Les lignes et les photos ne peuvent être modifiées ni supprimées, et la base de données le garantit. La version des règles de calcul est enregistrée avec chaque distribution.
7. Le recalcul de contrôle reconstruit la photo depuis le ledger et recalcule les lignes, sans rien écrire. Il est réservé à l'émetteur.

**D-082 — Proposée. Circuit d'une distribution et du paiement (spec 4.8, 12.4, 12.5).**
1. Une seule distribution par paiement prévu (`DISTRIBUTION_ALREADY_EXISTS`). Une distribution annulée (commentaire obligatoire) libère le paiement prévu.
2. L'approbation est faite par un autre administrateur que celui qui a soumis. Ajout d'un renvoi en brouillon (« En revue » → « Brouillon », commentaire obligatoire) pour recalculer, par exemple après une correction du registre.
3. Paiement fictif :
   - l'instruction est générée, puis préparée (`distribution:prepare`) ;
   - elle est confirmée par un autre administrateur (`payment:confirm`, quatre yeux) ;
   - si le paiement n'est pas reçu, la distribution passe « Échec », ce qui est conservé, et une nouvelle instruction peut être générée.
4. Écart par rapport à `docs/API.md` §2.10 : les routes du paiement sont rattachées à la distribution (`/distributions/{id}/payment-instruction`, `…/prepare`, `…/confirm`, `…/csv`). Le CSV est produit à la demande à partir des lignes, avec la mention démonstration, et n'est pas stocké comme document.

**D-083 — Proposée. Démo et scénario 6.**
1. Nouvelle émission active « Northwind Green Notes » (NWGN) : 5 % semestriel en 30E/360, nominal 1 000 €, Alpine 100 unités, Baltic 250, Cedar 150. Son premier coupon, du 15 au 15, est échu au moment du chargement de la démo : exactement 180/360, donc 2 500,00 € pour Alpine.
2. Le scénario 6 automatisé s'appuie sur cette émission. Les avoirs y sont datés dans le passé : on ne peut pas les recréer par l'API, et le scénario demande donc une démo fraîche (`pnpm db:reset`) pour être rejoué. La CI part toujours d'une base neuve.
3. Le portail investisseur montre ses distributions avec sa seule ligne.
