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
