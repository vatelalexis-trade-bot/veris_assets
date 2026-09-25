# Backlog de développement — Virtus Assets

Livrable 8 de `docs/SPEC.md`. Backlog priorisé, organisé selon les 16 phases (ordre modifié par D-006).
Chaque phase se termine par : résumé, fichiers créés, commande de test, tests verts, commit, puis arrêt en attendant l'accord du porteur de projet.
Identifiants : `P<phase>-<n>`. Priorité dans la phase : **M** indispensable (Must), **S** souhaitable (Should) ; un élément **S** peut glisser à la phase 16 s'il menace le calendrier, avec accord du porteur de projet.

---

## Phase 1 — Dépôt et environnement
Vérifiable par : `pnpm dev` démarre ; CI verte.

| ID | Élément | Prio |
|---|---|:-:|
| P1-1 | Monorepo pnpm (`apps/web`, `apps/api`, `packages/shared`, `packages/config`), TypeScript strict, versions figées | M |
| P1-2 | `.devcontainer/` (Node LTS, pnpm, extensions, 4 cœurs, ports) | M |
| P1-3 | `docker-compose.yml` : PostgreSQL, Redis, stockage S3 (Garage, D-005), Mailpit ; profil `observability` | M |
| P1-4 | `.env.example`, `.gitignore` (`.env` exclu), validation des variables d'environnement au démarrage | M |
| P1-5 | ESLint, Prettier, dependency-cruiser (règles vides mais actives), contrôle des mots interdits (D-018) | M |
| P1-6 | GitHub Actions : install, lint, typecheck, tests ; Dependabot ; rappel pour activer le secret scanning | M |
| P1-7 | Scripts `pnpm dev`, `pnpm test`, `pnpm lint` ; squelettes Next.js et NestJS qui démarrent | M |
| P1-8 | README en français : démarrer, arrêter, réinitialiser, où voir les emails | M |

## Phase 2 — Squelette back-end
Vérifiable par : `GET /health` répond.

| ID | Élément | Prio |
|---|---|:-:|
| P2-1 | Six modules vides + `core`, avec leurs `index.ts` publics ; règles dependency-cruiser définitives | M |
| P2-2 | Configuration typée (Zod), logs JSON pino avec masquage des champs sensibles | M |
| P2-3 | Correlation ID (lecture/génération, propagation `AsyncLocalStorage`, en-tête de réponse) | M |
| P2-4 | Format d'erreur 22.2, catalogue d'erreurs dans `packages/shared`, filtre d'exceptions global | M |
| P2-5 | `/health`, `/health/ready` ; OpenAPI sur `/api/v1/docs` en dev | M |
| P2-6 | Proxy `/api` dans Next.js (D-004) | M |
| P2-7 | Règle ESLint anti-flottants sur montants et quantités ; helpers `Decimal` et `Money` dans `packages/shared` | M |
| P2-8 | Instrumentation OpenTelemetry de base — reporté en phase 16 (D-023) | S |

## Phase 3 — Base de données
Vérifiable par : migrations rejouables (`pnpm db:reset` deux fois de suite sans erreur).

| ID | Élément | Prio |
|---|---|:-:|
| P3-1 | Drizzle + schémas par module ; conventions 21.2 ; UUID v7 | M |
| P3-2 | Rôles `va_migrator` / `va_app` ; droits ; RLS `FORCE` sur les tables métier ; positionnement du tenant par transaction | M |
| P3-3 | Triggers append-only (générique, appliqué aux tables [AO]) | M |
| P3-4 | Tables `core` (référentiels, idempotence, outbox, transitions, audit) et `iam` minimales | M |
| P3-5 | Seed minimal déterministe (2 tenants, référentiels pays/devises) ; `pnpm db:reset` | M |
| P3-6 | Tests d'intégration : RLS active sur chaque table à `tenant_id` ; UPDATE/DELETE refusés sur [AO] | M |

## Phase 4 — Squelette front-end (ancienne phase 7)
Vérifiable par : navigation dans les deux langues.

| ID | Élément | Prio |
|---|---|:-:|
| P4-1 | Logo déplacé dans `apps/web/public/brand/` (sans déformation ni recoloration) | M |
| P4-2 | Jetons de thème (23.1 + D-021 si validée), Tailwind, polices Montserrat/Inter, test de contraste | M |
| P4-3 | next-intl, en-GB/fr-FR, sélecteur de langue, test des clés manquantes | M |
| P4-4 | `AppShell`, `Sidebar`, `Header`, `DemoBanner`, menus émetteur / investisseur / plateforme (pages vides) | M |
| P4-5 | Composants de base shadcn/ui adaptés : boutons, formulaires, `StatusBadge`, `DataTable`, `EmptyState`, `Skeleton`, `ErrorState` | M |
| P4-6 | Correspondance statuts → couleur/libellé dans `packages/shared/status` | M |
| P4-7 | Client API généré depuis OpenAPI + TanStack Query | S |

## Phase 5 — Authentification
Vérifiable par : connexion avec un compte de démo, dans le navigateur.

| ID | Élément | Prio |
|---|---|:-:|
| P5-1 | Better Auth dans l'API ; Argon2id ; longueur 12 + liste de mots de passe courants | M |
| P5-2 | Sessions cookie (D-003), expiration, déconnexion, renouvellement de l'identifiant | M |
| P5-3 | MFA TOTP + codes de secours ; obligatoire pour PA, IA, CO ; affichage du code en mode démo (D-016) | M |
| P5-4 | Blocage après échecs ; rate limiting `/auth` ; journalisation des connexions et échecs | M |
| P5-5 | Invitations d'utilisateurs (email Mailpit), réinitialisation du mot de passe | M |
| P5-6 | Pages : connexion (avec liste des comptes de démo), MFA, invitation, réinitialisation ; `GET /auth/me` | M |
| P5-7 | Comptes de démo (D-017) ajoutés au seed | M |

## Phase 6 — Tenants, utilisateurs, rôles, permissions, isolation
Vérifiable par : scénario 5 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P6-1 | Catalogue des permissions et matrice (`docs/DATA_MODEL.md` §5) en source unique ; seed des rôles | M |
| P6-2 | Guard de permission (refus par défaut), décorateur `@RequirePermission`, filtrage « P » pour l'investisseur | M |
| P6-3 | Gestion des tenants (PA) ; gestion des utilisateurs et rôles (IA) ; écrans correspondants | M |
| P6-4 | Tenant issu de la session ; `tenantId` client ignoré et tracé ; 404 en accès croisé | M |
| P6-5 | Tests d'autorisation générés (endpoint × rôle) ; scénario 5 automatisé sur tous les endpoints existants | M |
| P6-6 | Accès break-glass (1 h, motif, lecture seule, audit du tenant) | S |

## Phase 7 — Journal d'audit et outbox
Vérifiable par : actions visibles dans l'audit.

| ID | Élément | Prio |
|---|---|:-:|
| P7-1 | `AuditWriter` dans la transaction métier ; refus d'autorisation tracés dans une transaction séparée ; masquage | M |
| P7-2 | Outbox dans la transaction ; pg-boss ; worker `outbox-relay` ; notifications dans l'app ; emails Mailpit | M |
| P7-3 | Idempotence (`Idempotency-Key`, table, rejeu, réutilisation abusive) | M |
| P7-4 | `AuditViewer` (filtres), cloche de notifications, préférences | M |
| P7-5 | Machine à états générique + `core.workflow_transition` | M |

## Phase 8 — Investisseurs, KYC/KYB simulé, documents
Vérifiable par : parcours KYC complet.

| ID | Élément | Prio |
|---|---|:-:|
| P8-1 | CRUD investisseurs (personnes morales en priorité), représentants et bénéficiaires [DP] | M |
| P8-2 | Dossier KYC : machine à états, `KycProvider` factice (succès/refus/panne), quatre yeux | M |
| P8-3 | Documents : `DocumentStorageProvider` S3, détection du type réel, 10 Mo, `FileScanner` factice, versions, URL signées | M |
| P8-4 | Job `kyc-expiry` (EXPIRED + alerte J-30) | M |
| P8-5 | Code destinataire par investisseur (D-010) ; profil côté portail investisseur | M |
| P8-6 | 20 investisseurs de démo, dont KYC expiré et pays exclu | M |

## Phase 9 — Moteur d'éligibilité et whitelist
Vérifiable par : scénario 2 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P9-1 | Moteur pur : entrées → résultat + liste des règles avec codes ; tests exhaustifs | M |
| P9-2 | Enregistrement des évaluations (append-only) ; statut d'éligibilité investisseur (CO) | M |
| P9-3 | Composant `EligibilityResult` (motifs en clair, traduits) | M |
| P9-4 | Scénario 2 (partie éligibilité ; la tentative de souscription est finalisée en phase 11) | M |

## Phase 10 — Émissions
Vérifiable par : scénario 1 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P10-1 | Assistant en 6 étapes, sauvegarde automatique, validation en ligne ; champ lock-up (D-014) ; record date (D-012) | M |
| P10-2 | Contrôles 6.3 côté serveur | M |
| P10-3 | Machine à états de l'émission, actions explicites, quatre yeux, annulation | M |
| P10-4 | Invitations d'investisseurs (évaluation d'éligibilité à l'invitation) | M |
| P10-5 | Liste des émissions (colonnes, filtres dans l'URL) et détail avec onglets | M |
| P10-6 | Scénario 1 automatisé (Playwright) | M |

## Phase 11 — Souscriptions et paiements fictifs
Vérifiable par : souscription de bout en bout.

| ID | Élément | Prio |
|---|---|:-:|
| P11-1 | Souscription côté investisseur (opportunités, formulaire, acceptation des documents) | M |
| P11-2 | Contrôles 9.3 (dont plafonds cumulés, idempotence) ; machine à états (D-009) | M |
| P11-3 | Traitement côté émetteur : prise en charge, approbation, rejet motivé | M |
| P11-4 | Paiement fictif : préparation / confirmation quatre yeux ; `PaymentProvider` factice | M |
| P11-5 | Clôture automatique à la date de fin (fuseau du tenant, D-015) | M |
| P11-6 | Scénario 2 finalisé (souscription refusée avec code de règle) | M |
| P11-7 | Bulletin de souscription PDF | S |

## Phase 12 — Allocation, registre, ledger, invariants
Vérifiable par : scénario 3 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P12-1 | `LedgerWriter` : verrou par émission, séquence, hash chaîné, positions, contraintes | M |
| P12-2 | Lots d'allocation manuelle, contrôle des totaux, dérogation minimum (D-013), quatre yeux | M |
| P12-3 | Validation → ISSUANCE + ALLOCATION + BLOCK en une transaction ; paiement → UNBLOCK (D-009) | M |
| P12-4 | `TokenRegistryProvider` / `InternalLedgerProvider` | M |
| P12-5 | Job de rapprochement (invariants 1, 2, 3, 5) ; écran registre ; confirmation d'allocation PDF | M |
| P12-6 | Tests de concurrence (mises à jour simultanées d'une même position) ; couverture ≥ 90 % | M |
| P12-7 | Corrections par contre-écriture avec quatre yeux | S |
| P12-8 | Scénario 3 automatisé | M |

## Phase 13 — Transferts
Vérifiable par : scénario 4 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P13-1 | Demande par code destinataire (D-010) ; contrôles 11.3 (dont lock-up, plafonds, auto-transfert) | M |
| P13-2 | BLOCK à la soumission ; UNBLOCK + TRANSFER à l'approbation ; UNBLOCK au rejet ou à l'annulation | M |
| P13-3 | Revue conformité (CO ou IA), notifications aux deux parties | M |
| P13-4 | Scénario 4 automatisé (dont rejeu idempotent) | M |

## Phase 14 — Échéancier, coupons, distributions
Vérifiable par : scénario 6 vert.

| ID | Élément | Prio |
|---|---|:-:|
| P14-1 | Génération de l'échéancier à l'activation (fréquences, *following*, record dates) | M |
| P14-2 | Fractions ACT/365F et 30E/360, arrondis, écart d'arrondi ; test 2 500,00 € | M |
| P14-3 | Snapshot reproductible ; distribution (machine à états, quatre yeux) ; recalcul de contrôle | M |
| P14-4 | Instruction de paiement fictive + CSV (mention démo) | M |
| P14-5 | Remboursement du principal (PRINCIPAL + REDEMPTION) ; passage MATURED ; remboursement anticipé total | M |
| P14-6 | Avis de coupon PDF | S |
| P14-7 | Scénario 6 automatisé ; couverture `servicing` ≥ 90 % | M |

## Phase 15 — Dashboards, portail investisseur, exports, landing
Vérifiable par : démo complète jouable.

| ID | Élément | Prio |
|---|---|:-:|
| P15-1 | Dashboard émetteur (13.1), indicateurs (18), file « À traiter » (13.5) | M |
| P15-2 | Portail investisseur complet (14) : portefeuille, détail de position, transactions, distributions, documents | M |
| P15-3 | Exports CSV asynchrones (registre, souscriptions, distributions, audit) | M |
| P15-4 | Indicateurs plateforme (vues agrégées) | S |
| P15-5 | Landing page depuis le prototype (D-019) + calculateur (hypothèses centralisées, graphiques, avertissement) | M |
| P15-6 | Jeu de démo complet (section 28 + D-017), déterministe | M |
| P15-7 | Choix de l'hébergement de démo (décision 33.12) | M |

## Phase 16 — Durcissement et déploiement de démonstration
Vérifiable par : checklist de la section 24 cochée.

| ID | Élément | Prio |
|---|---|:-:|
| P16-1 | Revue sécurité (checklist section 24), en-têtes de sécurité, analyse des dépendances | M |
| P16-2 | Performances : pagination partout, index, API < 500 ms sur le jeu de démo | M |
| P16-3 | Images Docker ; déploiement sur l'hébergement choisi ; Sentry | M |
| P16-4 | Sauvegardes et restauration testées | M |
| P16-5 | Documentation d'exploitation et guide de démo en français | M |

---

## Hors MVP (après la phase 16)

Allocation au prorata ; taux variable ; fractions d'unités ; calendrier des jours fériés ; identité investisseur multi-tenant ; rôles personnalisés par tenant ; fournisseurs réels (KYC, paiement, email, signature, conservation) ; `EthereumLikeProvider` (ERC-3643) et rapprochement quotidien avec la blockchain ; marché secondaire ; fiscalité ; rapports PDF avancés ; effacement / pseudonymisation outillés des personnes.
