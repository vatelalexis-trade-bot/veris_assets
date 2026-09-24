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

Défini dans `packages/shared/errors` (source unique, traduite en en-GB et fr-FR). Il s'enrichit à chaque phase.

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
| GET | `/api/v1/docs` | Développement uniquement |

### 2.2 `/auth`

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/auth/sign-in` | Connexion (email + mot de passe) |
| POST | `/auth/mfa/verify` | Code TOTP ou code de secours |
| POST | `/auth/mfa/enroll` · `/auth/mfa/confirm` | Enrôlement TOTP |
| POST | `/auth/sign-out` | Déconnexion |
| POST | `/auth/password/forgot` · `/auth/password/reset` | Réinitialisation |
| GET | `/auth/invitations/{token}` · POST `/auth/invitations/{token}/accept` | Acceptation d'invitation |
| GET | `/auth/me` | Utilisateur, tenant, rôles, permissions, langue |
| GET | `/auth/demo-accounts` | Comptes de démo et code TOTP courant — **uniquement si `DEMO_MODE=true`** (D-016) |

Les chemins exacts exposés par Better Auth sont confirmés en phase 5 ; ceux qui diffèrent seront listés ici.

### 2.3 `/tenants` (plateforme)

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/tenants` · `/tenants/{id}` | `tenant:read` | |
| POST | `/tenants` (+ premier Issuer Administrator invité) | `tenant:manage` | ✓ |
| PATCH | `/tenants/{id}` | `tenant:manage` | |
| POST | `/tenants/{id}/activate` · `/deactivate` | `tenant:manage` | ✓ |
| POST | `/tenants/{id}/break-glass` (motif obligatoire) | `break-glass:request` | ✓ |
| GET | `/platform/metrics` | `platform-metrics:read` | |
| GET / PUT | `/platform/notification-templates` | `notification-template:manage` | |
| GET / PUT | `/platform/reference-data` | `reference-data:manage` | |

### 2.4 `/users` et `/roles`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/users` · `/users/{id}` | `user:read` | |
| POST | `/users/invitations` | `user:manage` | ✓ |
| PATCH | `/users/{id}` | `user:manage` | |
| POST | `/users/{id}/deactivate` · `/reactivate` | `user:manage` | ✓ |
| PUT | `/users/{id}/roles` | `role:assign` | ✓ |
| GET | `/roles` (avec leurs permissions) | `user:read` | |
| GET / PATCH | `/settings` (paramètres de l'organisation) | `tenant-settings:manage` | |

### 2.5 `/investors`, `/kyc-cases`, `/eligibility-assessments`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/investors` · `/investors/{id}` | `investor:read` | |
| POST | `/investors` | `investor:manage` | ✓ |
| PATCH | `/investors/{id}` | `investor:manage` / `profile:manage` (P) | |
| GET / POST / PATCH | `/investors/{id}/representatives`, `/investors/{id}/beneficial-owners` | `investor-personal-data:read` / `investor:manage` | |
| POST | `/investors/{id}/eligibility-status` (ELIGIBLE, NOT_ELIGIBLE, SUSPENDED + justification) | `eligibility:decide` | ✓ |
| POST | `/investors/{id}/comments` | `compliance-comment:create` | |
| GET | `/me/investor` · POST `/me/investor/recipient-code/regenerate` | `profile:manage` (P) | ✓ |
| GET | `/kyc-cases` · `/kyc-cases/{id}` | `kyc:read` | |
| POST | `/kyc-cases` | `kyc:prepare` | ✓ |
| POST | `/kyc-cases/{id}/submit-for-review` | `kyc:prepare` | ✓ |
| POST | `/kyc-cases/{id}/approve` · `/reject` | `kyc:decide` | ✓ |
| GET | `/eligibility-assessments` · `/{id}` | `eligibility:read` | |
| POST | `/eligibility-assessments/preview` (évaluation sans enregistrement) | `eligibility:read` | |

### 2.6 `/issuances`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/issuances` (filtres : statut, catégorie, devise, période, émetteur, `q`) | `issuance:read` (P : invitations) | |
| GET | `/issuances/{id}` · `/issuances/{id}/terms` · `/eligibility-rules` | `issuance:read` | |
| POST | `/issuances` (brouillon) | `issuance:edit` | ✓ |
| PATCH | `/issuances/{id}` · `/terms` · `/eligibility-rules` (brouillon, sauvegarde automatique) | `issuance:edit` | |
| POST | `/issuances/{id}/validate` (contrôles 6.3 sans soumettre) | `issuance:edit` | |
| POST | `/issuances/{id}/submit` | `issuance:submit` | ✓ |
| POST | `/issuances/{id}/approve` · `/return-to-draft` | `issuance:approve` | ✓ |
| POST | `/issuances/{id}/open-subscription` · `/close-subscription` · `/activate` · `/mature` | `issuance:operate` | ✓ |
| POST | `/issuances/{id}/cancel` | `issuance:cancel` | ✓ |
| GET / POST | `/issuances/{id}/invitations` · DELETE `/issuances/{id}/invitations/{invitationId}` (révocation logique) | `invitation:manage` | ✓ |
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
| POST | `/subscriptions/{id}/payment/prepare` | `payment:prepare` | ✓ |
| POST | `/subscriptions/{id}/payment/confirm` | `payment:confirm` | ✓ |

### 2.8 `/allocations`, `/positions`, `/ledger`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/issuances/{id}/allocation-rounds` · `/allocations/{roundId}` | `registry:read` | |
| POST | `/issuances/{id}/allocation-rounds` (brouillon) · PATCH `/allocations/{roundId}` | `allocation:prepare` | ✓ |
| POST | `/allocations/{roundId}/propose` | `allocation:prepare` | ✓ |
| POST | `/allocations/{roundId}/validate` · `/reject` | `allocation:validate` | ✓ |
| GET | `/allocations/{roundId}/confirmation` (document) | `registry:read` (P) | |
| GET | `/positions` · `/positions/{id}` | `registry:read` (P) | |
| GET | `/ledger?issuanceId=…` · `/ledger/{id}` | `registry:read` (P : ses mouvements) | |
| POST | `/ledger/corrections` | `registry-correction:request` | ✓ |
| POST | `/ledger/corrections/{id}/approve` · `/reject` | `registry-correction:approve` | ✓ |
| GET | `/ledger/reconciliation?issuanceId=…` | `registry:read` | |

### 2.9 `/transfers`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/transfers` · `/{id}` | `transfer:read` (P) | |
| POST | `/transfers` (brouillon, avec `recipientCode`, D-010) | `transfer:request` (P) | ✓ |
| POST | `/transfers/{id}/submit` | `transfer:request` (P) | ✓ |
| POST | `/transfers/{id}/approve` · `/reject` | `transfer:approve` | ✓ |
| POST | `/transfers/{id}/cancel` | `transfer:cancel` (P) | ✓ |

### 2.10 `/distributions` et `/payment-instructions`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/distributions` · `/{id}` · `/{id}/lines` | `distribution:read` (P : ses lignes) | |
| POST | `/distributions` (depuis une échéance) | `distribution:prepare` | ✓ |
| POST | `/distributions/{id}/calculate` · `/submit-for-review` | `distribution:prepare` | ✓ |
| POST | `/distributions/{id}/approve` | `distribution:approve` | ✓ |
| POST | `/distributions/{id}/cancel` | `distribution:cancel` | ✓ |
| POST | `/distributions/{id}/recalculate-check` (recalcul depuis le snapshot, sans écriture) | `distribution:read` | |
| POST | `/distributions/{id}/payment-instruction` | `distribution:prepare` | ✓ |
| GET | `/payment-instructions/{id}` · `/{id}/csv` | `distribution:read` | |
| POST | `/payment-instructions/{id}/prepare` | `distribution:prepare` | ✓ |
| POST | `/payment-instructions/{id}/confirm` | `payment:confirm` | ✓ |
| POST | `/issuances/{id}/early-redemption` (remboursement total anticipé) | `issuance:operate` | ✓ |

### 2.11 `/documents`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/documents` · `/{id}` · `/{id}/versions` | `document:read` (P) | |
| POST | `/documents` (multipart, 10 Mo max) · `/documents/{id}/versions` | `document:upload` (P) | ✓ |
| POST | `/documents/{id}/download-url` (URL signée 5 min ; téléchargement confidentiel tracé) | `document:read` / `document:read-confidential` | |
| POST | `/documents/{id}/archive` | `document:upload` | ✓ |

### 2.12 `/notifications`

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/notifications` · `/notifications/unread-count` | `notification:read` |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | `notification:read` |
| GET / PUT | `/notifications/preferences` | `notification:read` |

### 2.13 `/audit-events` et `/reports`

| Méthode | Chemin | Permission | IK |
|---|---|---|---|
| GET | `/audit-events` (filtres : action, ressource, utilisateur, période, résultat) · `/{id}` | `audit:read` | |
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
