# Audit du code (1er octobre 2026)

Audit fait sur `main` au commit `bd1d763`. Question posée : le code fait-il ce que le site annonce, et que reste-t-il avant un premier client ? Ceci n'est pas un avis juridique.

## En bref

Le code tient ses promesses. Les points annoncés sur le site sont mis en œuvre et testés, et l'intégration continue (CI, les contrôles lancés par GitHub à chaque modification) existe déjà et passe au vert. Les écarts trouvés concernent la mise en production, pas la démo.

## Ce qui a été vérifié

| Annonce du site | Verdict | Où c'est fait | Où c'est testé |
|---|:-:|---|---|
| Registre en ajout seul | ✅ | Déclencheurs PostgreSQL qui refusent `UPDATE`, `DELETE` et `TRUNCATE`, même au propriétaire de la table (`drizzle/0001_security_foundation.sql`, `0017_registry_ledger_security.sql`) ; le rôle de l'API n'a que `SELECT, INSERT` | `core/database/security.int-spec.ts` |
| Chaîne SHA-256 | ✅ | Une chaîne par émission, `SHA-256(hash précédent ‖ représentation canonique)` (`registry/domain/ledger.ts`, `application/ledger-writer.ts`) ; écritures sérialisées par un verrou sur la tête du registre | `ledger.spec.ts`, `registry-operations.int-spec.ts` (transferts simultanés) |
| Contrôle nocturne | ✅ | Tâche à 3 h 15 UTC (`registry-reconciliation.ts:52`) : positions recalculées depuis les mouvements, chaîne et numérotation vérifiées ; l'émetteur est prévenu en cas d'écart | `registry-operations.int-spec.ts` |
| Isolation par organisation (RLS) | ✅ | RLS activée et forcée sur chaque table qui a une colonne d'organisation ; organisation fixée côté serveur ; tables d'authentification réservées à un rôle séparé | `security.int-spec.ts` (vérifie toutes les tables), `authorization.int-spec.ts` |
| Décimaux exacts | ✅ | `decimal.js` partout ; colonnes `numeric` ; une règle ESLint interdit `Number()`, `Math.*` et `parseFloat` dans le code métier | `decimal.spec.ts`, `money.spec.ts`, cas de contrôle 2 500,00 € |
| 2FA | ✅ | TOTP et codes de secours, obligatoires pour l'administrateur plateforme, les administrateurs émetteurs et la conformité (D-001) ; l'API refuse toute route tant que la 2FA n'est pas activée | `auth.int-spec.ts` |
| Paiements et KYC fictifs | ✅ | `FakePaymentProvider`, `FakeKycProvider` ; l'ordre de paiement CSV porte la mention « DEMONSTRATION » | `providers.spec.ts`, `distributions.int-spec.ts` |
| Sauvegarde et restauration | ✅ | Sauvegarde nocturne avec manifeste ; restauration comparée table par table | étape CI « Backup and restoration » |

L'intégration continue (`.github/workflows/ci.yml`) lance déjà : lint, formatage, contrôle des revendications réglementaires interdites, audit des dépendances, typage, ~380 tests unitaires, les tests sur une vraie base PostgreSQL, une couverture d'au moins 90 % du registre et des coupons, la remise à zéro de la démo, la restauration d'une sauvegarde et les scénarios navigateur (Playwright).

## Écarts trouvés

| # | Gravité | Constat | Recommandation |
|---|:-:|---|---|
| A-1 | Moyenne | Le **montant d'acquisition** d'une position (`position.acquisition_amount`) est mis à jour à côté du registre, mais il n'est ni écrit dans les mouvements, ni couvert par le hash, ni recalculé par le contrôle nocturne (qui ne vérifie que les quantités). Le registre n'est donc pas la source de vérité pour ce montant. | Écrire le montant dans chaque mouvement concerné (champ couvert par le hash) et l'ajouter au contrôle nocturne. |
| A-2 | Moyenne (avant production) | La chaîne de hash vit dans la même base que les données. Quelqu'un qui a les droits d'administration de la base (ou du compte Railway) peut tout réécrire et recalculer les hash : le contrôle ne verrait rien. Un test le montre (`ledger.property.spec.ts`, dernier cas). | Publier chaque jour le dernier hash de chaque émission hors de la base : dans l'e-mail ou le relevé envoyé à l'émetteur, et idéalement avec un horodatage qualifié (RFC 3161). |
| A-3 | Haute (avant production) | Un seul environnement Railway, nommé `production`, sert la démo publique. Les sauvegardes sont chez le même fournisseur que la base. | Séparer démo, recette et production (bases, secrets, domaines distincts) ; copier les sauvegardes chez un second fournisseur européen. |
| A-4 | Moyenne | Aucune alerte d'exploitation : une sauvegarde ratée lève une erreur dans les journaux (`database-backup.ts:39`) mais personne n'est prévenu ; pas d'outil de suivi des erreurs. | Suivi des erreurs (ex. Sentry hébergé en UE) et alertes sur : sauvegarde ratée, écart du contrôle nocturne, API en erreur. |
| A-5 | Basse (à décider) | En 30E/360, une émission datée d'un dernier jour de mois paie des coupons inégaux (ex. émise le 31 août, semestrielle : 178/360 puis 182/360, soit 24,72 € puis 25,28 € au lieu de 25,00 € pour 1 000 € à 5 %). C'est le résultat exact de la formule, et le code le teste volontairement, mais beaucoup de contrats prévoient un coupon fixe par période. | Décision du porteur de projet : garder la formule stricte, ou ajouter une option « coupon fixe par période régulière ». |
| A-6 | Basse | La 2FA n'est pas obligatoire pour l'opérateur émetteur, qui prépare les paiements et les allocations (D-001). | Pour la production, l'imposer à tous les rôles côté émetteur. |
| A-7 | Basse | Le dépôt est public (D-104) ; l'analyse des secrets de GitHub n'est pas encore activée (`SECURITY_CHECKLIST.md`). | L'activer dans *Settings → Code security*. |

## Ce qu'apporte cette PR

Deux fichiers de tests « par propriétés » : au lieu de quelques exemples écrits à la main, ils génèrent des centaines de cas (avec une graine fixe, donc rejouables) et vérifient des règles qui doivent toujours tenir.

- `registry/domain/ledger.property.spec.ts` : 200 historiques d'émission tirés au hasard (allocations, transferts, blocages, remboursements) respectent toujours les invariants ; toute modification d'un mouvement (quantité, date, auteur, référence, lien de correction), toute suppression et toute inversion de deux mouvements est détectée ; la limite A-2 est documentée.
- `servicing/domain/servicing.property.spec.ts` : pour 1 440 combinaisons de conditions (dates de fin de mois, 29 février, toutes les fréquences, conventions de jour ouvré, décalages de date d'enregistrement) l'échéancier couvre toute la vie de l'émission sans trou ni chevauchement, paie un jour ouvré, et ne perd ni ne compte deux fois aucun jour d'intérêt ; sur 300 distributions tirées au hasard, les lignes arrondies font exactement le total affiché, chacune à moins d'un demi-centime du montant exact.

## Feuille de route repriorisée

L'étape 1 de la feuille de route du 29 septembre (tests du cœur, CI, sauvegarde testée) est en grande partie faite. Ordre proposé pour la suite :

1. **Environnements séparés et sauvegardes hors fournisseur** (A-3).
2. **Alertes d'exploitation** (A-4).
3. **Montant d'acquisition dans le registre** (A-1) et **ancrage quotidien du hash** (A-2).
4. **Import d'un registre existant** depuis Excel/CSV (absent du code, indispensable pour un premier client).
5. **Remplacer le fictif** (KYC, signature, rapprochement des paiements), selon les prestataires choisis.
6. Puis test d'intrusion externe, RGPD et DORA, comme prévu.
