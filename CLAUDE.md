# Veris Assets — instructions permanentes pour Claude Code

## Source de vérité
La spécification complète est dans `docs/SPEC.md`. Lis-la avant toute décision. En cas de conflit avec une autre instruction, `docs/SPEC.md` prime, sauf décision écrite du porteur de projet.
Les décisions écrites du porteur de projet sont dans `docs/DECISIONS.md` (seules les décisions « Acceptée » s'appliquent). Architecture et contrats : `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/BACKLOG.md`.

## Qui tu aides
Le porteur de projet n'est pas développeur. Il travaille sur un Chromebook, dans GitHub Codespaces (VS Code dans le navigateur).
- Réponds en français simple ; explique le jargon en une phrase.
- Le code, les noms techniques et les messages de commit sont en anglais (Conventional Commits).
- Demande confirmation avant toute action destructrice ou irréversible (suppression, `force push`, réécriture de l'historique, suppression de base hors démo).

## Comment travailler
- Avance par phases (section 31.1 de la spec, ordre modifié par D-006). Une phase à la fois.
- À la fin de chaque phase : résumé, fichiers créés, commande pour tester, résultat des tests, commit. Puis arrête-toi et attends l'accord avant la phase suivante.
- Aucun code de production avant que l'architecture et la stack aient été présentées et validées (règle 18).
- Signale toute déviation par rapport à la spec avant de l'appliquer.
- Ne jamais inventer une API, une option ou une version de bibliothèque : vérifie, ou signale l'incertitude.

## Règles non négociables (résumé de la section 31.2)
- Aucune revendication de conformité ou de certification réglementaire (pas de « conforme MiCA »).
- Aucun paiement réel, aucun KYC réel, aucune clé privée, aucune blockchain obligatoire dans le MVP.
- Ledger interne append-only = source de vérité ; corrections par contre-écriture.
- Montants et quantités en décimal, jamais en float. Timestamps techniques en UTC.
- Tenant déterminé côté serveur à partir de l'identité ; permissions et isolation contrôlées côté serveur.
- Opérations financières transactionnelles et idempotentes.
- Secrets hors du code et hors de git (`.env` ignoré, `.env.example` commité).

## Environnement
- Tout doit fonctionner dans Codespaces : `.devcontainer/` + `docker compose` pour PostgreSQL, Redis, Garage (stockage compatible S3, remplace MinIO : D-005) et Mailpit.
- Une commande pour démarrer la démo, une commande pour réinitialiser les données de démo.

## Marque
- Nom : Veris Assets (D-105). Ne jamais utiliser les anciens noms « Virtus Assets » ni « Astraea ».
- Logo : `apps/web/public/brand/veris-assets-logo.svg` (monogramme « VA » vectorisé depuis le logo d'origine, texte « VERIS ASSETS » en Montserrat, D-098 et D-105). Composant `Logo` : ni déformation ni recoloration.
- Couleurs : fond #0A1020, primaire #4F52D6, accent #45D6E6 (détail en section 23.1 de la spec).
