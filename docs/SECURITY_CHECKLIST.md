# Liste de contrôle de sécurité (spec 24, P16-1)

Revue du 27 septembre 2026. Chaque contrôle de la section 24 est suivi de son état et de l'endroit où il est mis en œuvre et vérifié.

Légende :

- ✅ fait et testé ;
- 🟡 fait, avec une limite indiquée ;
- ⏳ se termine au déploiement (phase 16b).

| Contrôle (spec 24) | État | Mise en œuvre | Vérification |
|---|:-:|---|---|
| Authentification sécurisée | ✅ | Better Auth dans l'API ; mots de passe hachés en Argon2id ; 12 caractères minimum et refus des mots de passe courants | `auth.int-spec.ts`, `iam/domain/domain.spec.ts` |
| MFA | ✅ | TOTP et codes de secours, obligatoires pour l'administrateur plateforme, les administrateurs émetteurs et la conformité | `auth.int-spec.ts` |
| Gestion des sessions, expiration | ✅ | Session de 30 minutes d'inactivité, prolongée toutes les 5 minutes d'activité, durée maximale de 12 heures ; révoquée au changement de mot de passe et de rôles ; relue en base à chaque requête (révocation immédiate) | `auth.int-spec.ts` |
| Rotation des jetons de rafraîchissement | 🟡 | Sans objet : l'application n'utilise pas de jetons de rafraîchissement, mais une session serveur dans un cookie. La prolongation de la session tient lieu de rotation | — |
| Cookies `HttpOnly`, `Secure`, `SameSite=Lax` | ✅ | `better-auth.ts` : `HttpOnly` et `SameSite=Lax` toujours, `Secure` dès que le site est en HTTPS | revue de configuration |
| RBAC, moindre privilège | ✅ | Matrice rôles × permissions unique (`packages/shared`), une règle d'accès obligatoire par route (refus par défaut) ; quatre rôles de base distincts (D-039) | `authorization.int-spec.ts` (chaque route × chaque rôle) |
| Isolation multi-tenant | ✅ | Organisation déterminée par le serveur ; sécurité au niveau des lignes (RLS) forcée dans PostgreSQL ; accès à une autre organisation refusé en 404 | `authorization.int-spec.ts` (scénario 5), `database/security.int-spec.ts` (RLS, rôles) |
| Chiffrement en transit | ⏳ | HTTPS de bout en bout sur Railway (phase 16b) ; `Strict-Transport-Security` déjà envoyé | à vérifier en 16b |
| Chiffrement au repos | 🟡 | Secrets TOTP chiffrés en base ; chiffrement des volumes à confirmer auprès de Railway en 16b | à vérifier en 16b |
| Secrets hors du code | ✅ | `.env` ignoré par git, `.env.example` factice, variables validées au démarrage | revue ; `ensure-env` |
| Validation des entrées | ✅ | Schémas Zod sur chaque corps, paramètre et requête ; types de fichiers détectés sur le contenu | tests d'intégration de chaque module |
| Protection XSS | ✅ | Rendu React (texte échappé) ; politique de sécurité du contenu (CSP) avec un nonce par page ; API en `default-src 'none'` | `content-security-policy.spec.ts` (navigateur), `security-headers.int-spec.ts` |
| Protection CSRF | ✅ | Contrôle de l'origine sur toute requête qui modifie ; cookies `SameSite=Lax` | `security.spec.ts` |
| Protection contre les injections | ✅ | Requêtes paramétrées (Drizzle) ; aucune concaténation de SQL avec des entrées ; cellules CSV neutralisées contre les formules | `csv.spec.ts` |
| Rate limiting | ✅ | Redis partagé : connexion (par IP et par compte), second facteur, réinitialisation de mot de passe, acceptation d'invitation, formulaire de contact | `auth.int-spec.ts`, `contact.int-spec.ts` |
| Blocage après échecs | ✅ | 5 échecs de connexion bloquent le compte 15 minutes | `auth.int-spec.ts` |
| Détection d'accès anormal | ✅ | Connexion depuis une adresse inconnue : alerte au titulaire. Dix refus en dix minutes : entrée d'audit et alerte aux administrateurs (D-100) | `security-monitor.int-spec.ts` |
| Scan antivirus | 🟡 | Analyse des fichiers par le fournisseur fictif (`PROVIDER_FILE_SCANNER_MODE`) ; aucun antivirus réel dans le MVP (spec 27) | `documents.int-spec.ts` |
| URLs temporaires | ✅ | Liens de téléchargement valables 5 minutes, liés à l'utilisateur (D-045) | `documents.int-spec.ts` |
| Journalisation de sécurité | ✅ | Journal d'audit en ajout seul : connexions, refus, décisions, téléchargements confidentiels, alertes ; données sensibles masquées | `masking.spec.ts`, `authorization.int-spec.ts` |
| Sauvegardes et restauration | ⏳ | Sauvegarde logique et restauration testée (P16-4) ; sauvegardes des volumes Railway (16b) | voir P16-4 |
| Analyse de vulnérabilités | ✅ | Dependabot chaque semaine ; `pnpm audit --prod --audit-level high` bloque la CI | CI |
| Analyse des secrets (*secret scanning*) | 🟡 | Non disponible sur un dépôt GitHub privé sans l'option payante « Advanced Security ». Elle devient gratuite si le dépôt passe en public | décision du porteur de projet |
| Masquage des données sensibles | ✅ | Masquage dans l'audit (`masking.ts`) et les journaux techniques ; l'export d'audit n'a ni adresse IP ni valeurs (D-093) | `masking.spec.ts` |
| En-têtes de sécurité | ✅ | Site : CSP avec nonce, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS. API : `nosniff`, `no-store`, CSP `default-src 'none'` | `security-headers.int-spec.ts`, `content-security-policy.spec.ts` |
| Accès exceptionnel de la plateforme | ✅ | Accès d'urgence d'une heure, en lecture seule, avec motif, tracé requête par requête dans l'audit de l'organisation, qui est prévenue (D-103) | `break-glass.int-spec.ts`, `break-glass.spec.ts` (navigateur) |
| Aucune clé privée blockchain | ✅ | Aucun fournisseur blockchain actif ; `InternalLedgerProvider` seul | revue |

## Vulnérabilités connues acceptées

- `esbuild` ≤ 0.24.2 (sévérité modérée, GHSA-67mh-4wv8-2f99). Il est tiré par `better-auth` → `drizzle-kit`. La faille concerne uniquement le serveur de développement d'esbuild, que l'application n'utilise pas. Elle sera suivie par Dependabot.
