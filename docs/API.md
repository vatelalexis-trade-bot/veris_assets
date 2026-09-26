# Contrats d'API — Virtus Assets

Livrable 5 de `docs/SPEC.md` : structure de l'API REST et de sa documentation OpenAPI.
La spécification OpenAPI exacte est **générée depuis le code** (NestJS) à partir de la phase 2 et publiée sur `/api/v1/docs` en développement. Ce document fixe les conventions et la liste des endpoints ; il est tenu à jour à chaque phase.

---

## 1. Conventions

| Sujet | Règle |
|---|---|
| Base | `/api/v1` ; version dans l'URL ; une rupture de contrat = `/api/v2` |
| Format | JSON, champs en `camelCase`, dates métier `YYYY-MM-DD`, timestamps ISO 8601 UTC (`2026-09-24T08:00:00Z`) |
| Montants | `{ "amount": "2500.00", "currency": "EUR" }` : montant **toujours en chaîne** ; quantités en chaîne (`"100"`) ; taux en chaîne décimale (`"0.05"`) |
| Authentification | Cookie de session (`HttpOnly`, `Secure`, `SameSite=Lax`) ; toutes les routes l'exigent sauf `/auth/*` publiques et `/health*` |
| Tenant | Jamais fourni par le client ; tout `tenantId` reçu est ignoré et tracé |
| Autorisation | Chaque route déclare sa permission (voir `docs/DATA_MODEL.md` §5) ; refus par défaut |
| Actions d'état | `POST /ressource/{id}/<action>` ; le champ `status` n'est jamais modifiable directement |
| Correlation ID | En-tête `X-Correlation-Id` accepté (UUID) ou généré ; renvoyé dans chaque réponse et dans chaque erreur |
| Idempotence | En-tête `Idempotency-Key` (UUID) **obligatoire** sur les routes marquées **IK** ; facultatif ailleurs |
| Verrouillage optimiste | Les `PATCH` exigent `If-Match: "<version>"` ; version périmée → `409 VERSION_CONFLICT` |
| Pagination | `?page=1&pageSize=25` (max 100) ; réponse `{ "data": [...], "meta": { "page", "pageSize", "total" } }` |
| Tri | `?sort=-createdAt,name` (préfixe `-` = décroissant), champs autorisés listés par route |
| Filtres / recherche | Paramètres explicites par route (`?status=ACTIVE&currency=EUR`) ; `?q=` pour la recherche textuelle |
| Rate limiting | Par utilisateur et par IP (Redis) ; plus strict sur `/auth/*` ; en-têtes `RateLimit-*` ; dépassement → `429 RATE_LIMITED` |
| CSRF | Même origine (proxy Next.js) + contrôle de l'en-tête `Origin` sur toute méthode modifiante |
| Documentation | OpenAPI 3 générée ; types TypeScript du front générés depuis ce fichier |

### 1.1 Format d'erreur (section 22.2)

```json
{
  "error": {
    "code": "ELIGIBILITY_FAILED",
    "message": "The investor does not meet the eligibility rules of this issuance.",
    "details": [
      { "code": "COUNTRY_EXCLUDED", "field": null, "meta": { "country": "XX" } }
    ],
    "correlationId": "0192…",
    "timestamp": "2026-09-24T08:00:00Z"
  }
}
```

Le `message` est en anglais, destiné aux logs ; le front affiche le texte traduit correspondant au `code`.

### 1.2 Codes HTTP

| Code | Usage |
|---|---|
| 200 / 201 | Succès (201 à la création) |
| 400 | `VALIDATION_FAILED` (format, champ manquant) |
| 401 | `UNAUTHENTICATED`, `MFA_REQUIRED`, `SESSION_EXPIRED` |
| 403 | `PERMISSION_DENIED` (ressource de son tenant, permission absente), `FOUR_EYES_VIOLATION` |
| 404 | `RESOURCE_NOT_FOUND` — y compris toute ressource d'un autre tenant (scénario 5) |
| 409 | `INVALID_STATE_TRANSITION`, `VERSION_CONFLICT`, `IDEMPOTENCY_IN_PROGRESS` |
| 422 | Règle métier non respectée (codes ci-dessous), `IDEMPOTENCY_KEY_REUSED` |
| 423 | `ACCOUNT_LOCKED` |
| 428 | `IDEMPOTENCY_KEY_REQUIRED`, `PRECONDITION_REQUIRED` (If-Match manquant) |
| 429 | `RATE_LIMITED` |
| 503 | `PROVIDER_UNAVAILABLE` (fournisseur factice en mode panne) |
| 500 | `INTERNAL_ERROR` (sans détail technique) |

### 1.3 Catalogue initial des codes d'erreur

Défini dans `packages/shared/src/errors/error-codes.ts`, avec le statut HTTP de chaque code : c'est la source unique (ce tableau en est un résumé), traduite en en-GB et fr-FR côté front. Il s'enrichit à chaque phase.

| Domaine | Codes |
|---|---|
| Général | `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_STATE_TRANSITION`, `VERSION_CONFLICT`, `FOUR_EYES_VIOLATION`, `COMMENT_REQUIRED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INTERNAL_ERROR` |
| Idempotence | `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS` |
| Authentification | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `MFA_REQUIRED`, `MFA_INVALID_CODE`, `ACCOUNT_LOCKED`, `ACCOUNT_INACTIVE`, `SESSION_EXPIRED`, `PASSWORD_TOO_WEAK`, `INVITATION_INVALID_OR_EXPIRED` |
| Émission | `ISSUANCE_INCONSISTENT_TERMS` (détails : codes de `docs/DATA_MODEL.md` §3.4), `SUBSCRIPTION_WINDOW_NOT_STARTED`, `MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED`, `PENDING_PAYMENTS_REMAINING` |
| Éligibilité | `ELIGIBILITY_FAILED` (détails : codes de règle ci-dessous) |
| Souscription | `SUBSCRIPTION_WINDOW_CLOSED`, `SUBSCRIPTION_BELOW_MINIMUM`, `SUBSCRIPTION_LIMIT_EXCEEDED`, `AMOUNT_UNITS_MISMATCH`, `INSUFFICIENT_UNITS`, `ISSUANCE_CAP_EXCEEDED`, `NOT_INVITED` |
| Allocation / registre | `ALLOCATION_EXCEEDS_SUPPLY`, `ALLOCATION_EXCEEDS_REQUEST`, `INSUFFICIENT_AVAILABLE_QUANTITY`, `REGISTRY_INVARIANT_VIOLATION`, `QUANTITY_NOT_INTEGER` |
| Transfert | `TRANSFER_NOT_ALLOWED`, `SELF_TRANSFER_FORBIDDEN`, `LOCKUP_PERIOD_ACTIVE`, `RECIPIENT_CODE_UNKNOWN`, `RECIPIENT_NOT_ELIGIBLE`, `MAX_INVESTORS_REACHED` |
| Distribution | `DISTRIBUTION_ALREADY_EXISTS`, `SNAPSHOT_MISMATCH` |
| Documents | `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_REJECTED_BY_SCAN` |

**Codes de règle d'éligibilité** (moteur pur, section 8.4) : `PROFILE_INACTIVE`, `KYC_NOT_APPROVED`, `KYC_EXPIRED`, `KYC_EXPIRES_TOO_SOON`, `CLASSIFICATION_INCOMPATIBLE`, `INVESTOR_TYPE_NOT_ALLOWED`, `NOT_PROFESSIONAL`, `COUNTRY_EXCLUDED`, `COUNTRY_NOT_ALLOWED`, `INVESTOR_SUSPENDED`, `INVESTOR_NOT_ELIGIBLE`, `MAX_INVESTORS_REACHED`.

---

## 2. Endpoints

Sauf mention contraire, les chemins sont relatifs à `/api/v1` (par exemple `/issuances` = `/api/v1/issuances`).
**IK** = `Idempotency-Key` obligatoire. **P** = limité aux données propres de l'investisseur connecté.

### 2.1 Santé et documentation

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/health` | Public |
| GET | `/health/ready` | Public |
| GET | `/api/v1/docs` (interface) · `/api/v1/docs/json` (fichier OpenAPI) | Développement uniquement ; accessible via l'adresse du front grâce au proxy |

### 2.2 `/auth`

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/auth/sign-in` | Connexion (email + mot de passe) → `SIGNED_IN` ou `MFA_REQUIRED` |
| POST | `/auth/mfa/verify` | Code TOTP ou code de secours (`method`: `totp` ou `backup`) |
| POST | `/auth/mfa/enroll` · `/auth/mfa/confirm` | Enrôlement TOTP (mot de passe, puis premier code) |
| POST | `/auth/sign-out` | Déconnexion (204) |
| POST | `/auth/password/forgot` · `/auth/password/reset` | Réinitialisation (202 toujours, pour ne rien révéler ; puis 204) |
| GET | `/auth/invitations/{token}` · POST `/auth/invitations/{token}/accept` | Acceptation d'invitation (connexion automatique ensuite) |
| GET | `/auth/me` | Utilisateur, tenant, rôles, portails autorisés, état de la MFA, expiration de la session |
| GET | `/auth/demo-accounts` | Comptes de démo et code TOTP courant — **uniquement si `DEMO_MODE=true`** (D-016), 404 sinon |

Ces routes sont celles de l'API ; Better Auth n'est pas exposé directement (D-031). `/auth/me` renvoie aussi les permissions de l'utilisateur (`{ "user:read": "all", … }`, portée `all` ou `own`).

### 2.3 `/tenants` (plateforme)

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/tenants` · `/tenants/{id}` | `tenant:read` | |
| POST | `/tenants` (+ premier Issuer Administrator invité) | `tenant:manage` | ✓ |
| PATCH | `/tenants/{id}` | `tenant:manage` | |
| POST | `/tenants/{id}/activate` · `/deactivate` (la désactivation coupe les sessions) | `tenant:manage` | ✓ |
| POST | `/tenants/{id}/administrators` (inviter un autre Issuer Administrator, D-037) | `tenant:manage` | ✓ |
| POST | `/tenants/{id}/break-glass` (motif obligatoire ; phase 16, D-034) | `break-glass:request` | ✓ |
| GET | `/platform/metrics` | `platform-metrics:read` | |
| GET / PUT | `/platform/notification-templates` | `notification-template:manage` | |
| GET / PUT | `/platform/reference-data` | `reference-data:manage` | |

### 2.4 `/users` et `/roles`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/users` · `/users/{id}` | `user:read` | |
| GET | `/users/invitations` (invitations en attente) | `user:read` | |
| POST | `/users/invitations` | `user:manage` | ✓ |
| PATCH | `/users/{id}` | `user:manage` | |
| POST | `/users/{id}/deactivate` · `/reactivate` | `user:manage` | ✓ |
| PUT | `/users/{id}/roles` | `role:assign` | ✓ |
| GET | `/roles` (avec leurs permissions) | `user:read` | |
| GET / PATCH | `/settings` (paramètres de l'organisation, `If-Match`) | `tenant-settings:manage` | |
| GET | `/reference/countries` · `/reference/currencies` (listes de référence, D-037) | Session valide | |

Refus métier (détails de `VALIDATION_FAILED`) : `OWN_ACCOUNT`, `LAST_ADMINISTRATOR`, `ROLE_NOT_ASSIGNABLE`. Changer les rôles d'un utilisateur ou le désactiver coupe ses sessions. L'en-tête IK est exigé depuis la phase 7 (`428` s'il manque, détail `INVALID_IDEMPOTENCY_KEY` s'il n'est pas un UUID, D-042).

### 2.5 `/investors`, `/kyc-cases`, `/eligibility-assessments`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/investors` · `/investors/{id}` | `investor:read` | |
| POST | `/investors` | `investor:manage` | ✓ |
| PATCH | `/investors/{id}` | `investor:manage` / `profile:manage` (P) | |
| GET / POST | `/investors/{id}/representatives`, `/investors/{id}/beneficial-owners` · PATCH `…/{personId}` | `investor-personal-data:read` / `investor:manage` | |
| GET | `/investors/{id}/comments` | `investor:read` | |
| POST | `/investors/{id}/eligibility-status` (ELIGIBLE, NOT_ELIGIBLE, SUSPENDED + justification obligatoire, D-052) | `eligibility:decide` | ✓ |
| POST | `/investors/{id}/comments` | `compliance-comment:create` | |
| GET / PATCH | `/me/investor` (coordonnées seulement, `If-Match`, D-048) · POST `/me/investor/recipient-code/regenerate` | `profile:manage` (P) | ✓ (POST) |
| GET | `/kyc-cases` · `/kyc-cases/{id}` | `kyc:read` | |
| POST | `/kyc-cases` | `kyc:prepare` | ✓ |
| POST | `/kyc-cases/{id}/documents` (joindre une pièce KYC de l'investisseur) | `kyc:prepare` | |
| POST | `/kyc-cases/{id}/submit-for-review` (au moins une pièce ; appel au fournisseur factice) | `kyc:prepare` | ✓ |
| POST | `/kyc-cases/{id}/approve` · `/reject` · `/send-back` (commentaire obligatoire pour refuser ou renvoyer ; quatre yeux) | `kyc:decide` | ✓ |
| GET | `/eligibility-assessments` (filtres `investorId`, `context`) · `/{id}` (règles, jeu de règles appliqué) | `eligibility:read` | |
| POST | `/eligibility-assessments/preview` (`investorId` + jeu de règles ; évaluation sans enregistrement) | `eligibility:read` | |

### 2.6 `/issuances`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/issuances` (filtres : statut, catégorie, devise, période, émetteur, `q`) | `issuance:read` (P : invitations) | |
| GET | `/issuances/{id}` (avec conditions et règles d'éligibilité, chacune avec sa version, D-057) | `issuance:read` (P : invitations) | |
| POST | `/issuances` (brouillon) | `issuance:edit` | ✓ |
| PATCH | `/issuances/{id}` · `/terms` · `/eligibility-rules` (brouillon, sauvegarde automatique ; `If-Match` : version de la partie modifiée, D-056) | `issuance:edit` | |
| POST | `/issuances/{id}/validate` (contrôles 6.3 sans soumettre : `{ consistent, failures }`) | `issuance:edit` | |
| GET / POST | `/issuances/{id}/documents` (documents de l'émission, étape 5) | `issuance:read` / `issuance:edit` | |
| POST | `/issuances/{id}/submit` | `issuance:submit` | ✓ |
| POST | `/issuances/{id}/approve` · `/return-to-draft` | `issuance:approve` | ✓ |
| POST | `/issuances/{id}/open-subscription` · `/close-subscription` · `/activate` · `/mature` | `issuance:operate` | ✓ |
| POST | `/issuances/{id}/cancel` | `issuance:cancel` | ✓ |
| GET / POST | `/issuances/{id}/invitations` (contrôle d'éligibilité ; refus `ELIGIBILITY_FAILED`, D-055) · DELETE `/issuances/{id}/invitations/{invitationId}` (révocation logique) | `invitation:manage` | ✓ |
| GET | `/issuances/{id}/transitions` | `issuance:read` | |
| GET | `/issuances/{id}/coupon-schedule` | `distribution:read` | |

### 2.7 `/subscriptions`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/subscriptions` · `/{id}` | `subscription:read` (P) | |
| POST | `/subscriptions` (brouillon) | `subscription:create` (P) | ✓ |
| PATCH | `/subscriptions/{id}` (brouillon) | `subscription:create` (P) | |
| POST | `/subscriptions/{id}/submit` | `subscription:create` (P) | ✓ |
| POST | `/subscriptions/{id}/start-review` | `subscription:review` | ✓ |
| POST | `/subscriptions/{id}/approve` · `/reject` | `subscription:approve` | ✓ |
| POST | `/subscriptions/{id}/cancel` | `subscription:cancel` (P) | ✓ |
| GET | `/subscriptions/{id}/transitions` (historique des statuts) | `subscription:read` (P) | |
| GET | `/subscriptions/{id}/payment` (état du paiement fictif, D-069) | `subscription:read` (P) | |
| POST | `/subscriptions/{id}/payment/prepare` (D-069) | `payment:prepare` | ✓ |
| POST | `/subscriptions/{id}/payment/confirm` (quatre yeux ; refus `PAYMENT_NOT_RECEIVED`, D-069) | `payment:confirm` | ✓ |

Refus à l'envoi et à l'approbation : `422` avec le code du premier contrôle échoué (D-060), ou `ELIGIBILITY_FAILED` avec les règles échouées. Filtres de la liste : `issuanceId`, `investorId`, `status`.

### 2.8 `/allocations`, `/positions`, `/ledger`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/issuances/{id}/allocation-rounds` · `/allocations/{roundId}` | `registry:read` | |
| POST | `/issuances/{id}/allocation-rounds` (brouillon) · PATCH `/allocations/{roundId}` | `allocation:prepare` | ✓ |
| POST | `/allocations/{roundId}/propose` | `allocation:prepare` | ✓ |
| POST | `/allocations/{roundId}/validate` (quatre yeux) | `allocation:validate` | ✓ |
| POST | `/allocations/{roundId}/reject` (commentaire ; brouillon abandonné par le préparateur, lot proposé rejeté par un administrateur, D-065) | `allocation:prepare` (+ `allocation:validate` pour un lot proposé) | ✓ |
| GET | `/allocations/{roundId}/transitions` (historique) | `registry:read` | |
| GET | `/allocations/{roundId}/confirmation` (document, phase 15, D-064) | `registry:read` (P) | |
| GET | `/positions?issuanceId=…&investorId=…` · `/positions/{id}` | `registry:read` (P) | |
| GET | `/ledger?issuanceId=…&type=…` · `/ledger/{id}` | `registry:read` (P : ses mouvements, sans le nom des autres investisseurs, D-067) | |
| GET | `/ledger/corrections?issuanceId=…&status=…` (D-070) | `registry:read` | |
| POST | `/ledger/corrections` (contre-écriture + remplacements, D-070) | `registry-correction:request` | ✓ |
| POST | `/ledger/corrections/{id}/approve` · `/reject` | `registry-correction:approve` | ✓ |
| GET | `/ledger/reconciliation?issuanceId=…` (émetteur seulement, D-071) | `registry:read` | |

### 2.9 `/transfers`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/transfers` · `/{id}` | `transfer:read` (P) | |
| POST | `/transfers` (brouillon, avec `recipientCode`, D-010 ; refus `RECIPIENT_CODE_UNKNOWN`, `SELF_TRANSFER_FORBIDDEN`) | `transfer:request` (P) | ✓ |
| PATCH | `/transfers/{id}` (brouillon, D-075) | `transfer:request` (P) | |
| POST | `/transfers/{id}/submit` (contrôles 11.3, `BLOCK`, puis revue conformité ; refus `RECIPIENT_NOT_ELIGIBLE` sans détail, D-074) | `transfer:request` (P) | ✓ |
| POST | `/transfers/{id}/approve` (`UNBLOCK` + `TRANSFER`, exécuté) · `/reject` (motif) | `transfer:approve` | ✓ |
| POST | `/transfers/{id}/cancel` (motif obligatoire pour l'émetteur) | `transfer:cancel` (P) | ✓ |
| GET | `/transfers/{id}/transitions` | `transfer:read` (P) | |

### 2.10 `/distributions` (D-080 à D-082)

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| POST | `/issuances/{id}/activate` (ALLOCATED → ACTIVE, échéancier ; refus `PENDING_PAYMENTS_REMAINING`) | `issuance:operate` | ✓ |
| GET | `/issuances/{id}/coupon-schedule` | `distribution:read` | |
| GET | `/distributions?issuanceId=…&status=…` · `/{id}` · `/{id}/lines` · `/{id}/transitions` | `distribution:read` (P : ses lignes) | |
| POST | `/distributions` (depuis une échéance ; `DISTRIBUTION_ALREADY_EXISTS`) | `distribution:prepare` | ✓ |
| POST | `/distributions/{id}/calculate` (photo à la record date) · `/submit-for-review` | `distribution:prepare` | ✓ |
| POST | `/distributions/{id}/approve` (quatre yeux) · `/return-to-draft` (commentaire) | `distribution:approve` | ✓ |
| POST | `/distributions/{id}/cancel` (commentaire) | `distribution:cancel` | ✓ |
| POST | `/distributions/{id}/recalculate-check` (recalcul depuis la photo, sans écriture ; émetteur seulement) | `distribution:read` | |
| POST | `/distributions/{id}/payment-instruction` (génération, aussi après un échec) · `/payment-instruction/prepare` | `distribution:prepare` | ✓ |
| POST | `/distributions/{id}/payment-instruction/confirm` (quatre yeux ; non reçu → FAILED) | `payment:confirm` | ✓ |
| GET | `/distributions/{id}/payment-instruction/csv` (mention démonstration) | `distribution:prepare` | |
| POST | `/issuances/{id}/early-redemption` (`{ paymentDate }`, remboursement total anticipé, D-085) | `issuance:operate` | ✓ |

### 2.10 bis Tableaux de bord et indicateurs (phase 15a, D-087 à D-090)

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/dashboard` (tableau de bord et indicateurs de l'émetteur) | `report:read` | |
| GET | `/tasks` (file « À traiter » de l'utilisateur) | `task:read` | |
| GET | `/platform/metrics` (indicateurs de la plateforme) | `platform-metrics:read` | |
| GET | `/me/portfolio` · `/me/portfolio/{positionId}` (tableau de bord et position de l'investisseur) | `registry:read` (P) | |

### 2.11 `/documents`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/documents` · `/{id}` · `/{id}/versions` | `document:read` (P) | |
| POST | `/documents` (multipart, 10 Mo max) · `/documents/{id}/versions` | `document:upload` (P) | ✓ |
| POST | `/documents/{id}/download-url` (lien signé 5 min vers l'API, D-045) | `document:read` / `document:read-confidential` | |
| GET | `/documents/download?token=…` (fichier ; même utilisateur, téléchargement confidentiel tracé) | Session valide | |
| POST | `/documents/{id}/archive` | `document:upload` | ✓ |

### 2.12 `/notifications`

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/notifications` (filtre `unreadOnly`) · `/notifications/unread-count` | `notification:read` |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | `notification:read` |
| GET / PUT | `/notifications/preferences` (désactiver une catégorie obligatoire : détail `MANDATORY_CATEGORY`) | `notification:read` |

### 2.13 `/audit-events` et `/reports`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/audit-events` (filtres : `action`, `resourceType`, `resourceId`, `actorUserId`, `result`, `from`, `to`) · `/{id}` (avec valeurs avant/après masquées) | `audit:read` | |
| GET | `/audit-events/actions` (actions présentes, pour le filtre, D-044) | `audit:read` | |
| GET | `/reports/issuer-dashboard` | `report:read` | |
| GET | `/reports/investor-dashboard` | (P) | |
| GET | `/reports/tasks` (file « À traiter » de l'utilisateur) | `task:read` | |
| POST | `/reports/exports` (type : registre, souscriptions, distributions, audit) → job asynchrone | `report:export` | ✓ |
| GET | `/reports/exports/{id}` (statut + URL de téléchargement) | `report:export` | |

### 2.14 Public (landing)

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/public/contact` (formulaire de contact, rate limiting strict) | Public |

Le calculateur ne fait aucun appel à l'API.
