# Spécification fonctionnelle — Veris Assets

**Plateforme SaaS de gestion du cycle de vie d'actifs privés numériques**

| Champ | Valeur |
|---|---|
| Version | 0.2 (révision de la v0.1 produite avec Copilot) |
| Statut | MVP / Proof of Concept |
| Cible | Application web B2B |
| Langues | Anglais (en-GB) par défaut, français (fr-FR) |
| Mode initial | Sandbox avec données fictives uniquement |
| Utilisateurs cibles | Sociétés de gestion, fonds de dette privée, émetteurs d'actifs privés, investisseurs professionnels |
| Source de vérité | Ce document. En cas de conflit avec une autre instruction, ce document prime, sauf décision écrite du porteur de projet |

> **Légende de la v0.2.** Les passages marqués **[v0.2]** sont des ajouts ou précisions par rapport à la v0.1. Ils respectent toutes les restrictions de la v0.1 (sections 3.2, 24, 31 et 32). Les passages marqués **[À valider]** sont des propositions par défaut : Claude doit les appliquer tant que le porteur de projet ne les a pas modifiées, et les rappeler dans la liste des décisions ouvertes (section 33).

---

## 0. Contexte de travail [v0.2]

Le porteur de projet **n'est pas développeur**. Il travaille depuis un Chromebook, dans **GitHub Codespaces** (VS Code dans le navigateur), avec l'extension **Claude Code**. Le dépôt GitHub s'appelle `veris-assets`.

Conséquences pour la façon de travailler :

- **Tout doit fonctionner dans Codespaces**, sans installation locale. L'environnement est décrit dans un `.devcontainer/` et les services (PostgreSQL, Redis, stockage de fichiers, serveur d'emails de test) tournent via `docker compose`.
- **Une seule commande** doit suffire pour démarrer l'application de démonstration (par exemple `pnpm dev`), et une seule pour réinitialiser les données de démo (par exemple `pnpm db:reset`).
- **Expliquer en français simple** chaque étape : ce qui a été fait, pourquoi, comment vérifier que cela marche. Éviter le jargon, ou l'expliquer en une phrase.
- **Demander confirmation** avant toute action destructrice ou irréversible : suppression de fichiers, réécriture de l'historique git, `force push`, suppression de base de données hors environnement de démo.
- **S'arrêter à la fin de chaque phase** (section 31) avec : un résumé, la liste des fichiers créés, la commande pour tester, et la phase suivante proposée. Ne jamais enchaîner plusieurs phases sans accord.
- **Commits git** : un commit par étape cohérente, avec un message clair en anglais au format Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- **Secrets** : jamais dans le code ni dans git. Fichier `.env` ignoré par git, fichier `.env.example` commité avec des valeurs factices. Les secrets réels éventuels passent par les *Codespaces secrets* de GitHub.

## 1. Contexte

Veris Assets est une plateforme SaaS B2B permettant à un émetteur ou à une société de gestion de créer, gérer et administrer des actifs privés numériques.

L'objectif n'est pas uniquement de créer des tokens sur une blockchain. La plateforme doit gérer l'ensemble du cycle de vie opérationnel d'un actif privé : création d'une émission, définition de ses caractéristiques financières, onboarding des investisseurs, contrôle de leur éligibilité, collecte des souscriptions, allocation des positions, tenue du registre, suivi des mouvements, calcul des coupons ou distributions, génération d'instructions de paiement, reporting émetteur et investisseurs, traçabilité et audit.

Le MVP doit fonctionner **sans argent réel** et **sans connexion obligatoire à une blockchain publique**. La tokenisation est représentée par un **registre interne**, avec une architecture permettant l'ajout ultérieur d'une blockchain ou d'une DLT (section 26).

## 2. Vision produit

### 2.1 Proposition de valeur

Permettre à une société de gestion ou à un émetteur de lancer et d'administrer une émission privée numérique sans construire sa propre infrastructure blockchain, son portail investisseur et son moteur de servicing.

### 2.2 Positionnement

*Une plateforme de gestion du cycle de vie des actifs privés numériques destinée aux institutions financières et sociétés de gestion de taille intermédiaire.*

### 2.3 Principes produit

Simple à utiliser ; orientée utilisateurs non techniques ; configurable ; sécurisée par conception ; entièrement traçable ; multi-tenant ; indépendante d'une blockchain spécifique ; évolutive ; bilingue ; responsive ; conçue pour intégrer ultérieurement des prestataires externes.

### 2.4 Identité visuelle [v0.2]

- **Nom** : Veris Assets (décision D-105 du porteur de projet ; nom précédent : « Virtus Assets »). Le nom de travail antérieur « Astraea RWA » est abandonné et ne doit apparaître nulle part.
- **Logo** : monogramme « VA » en traits pleins avec un dégradé indigo → cyan, suivi du texte « VERIS » (gras) et « ASSETS » (léger). Fichier : `apps/web/public/brand/veris-assets-logo.svg` (vectoriel, fond transparent, D-098 et D-105) ; le fichier d'origine au nom de « Virtus Assets » est archivé dans `docs/brand/virtus-assets-logo-archive.jpg`. Le logo ne doit être ni déformé ni recoloré.
- **Typographie proposée [À valider]** : Montserrat pour les titres (proche du logo), Inter pour le texte courant et les tableaux, avec chiffres tabulaires pour les montants.
- **Palette** : voir section 23.1, alignée sur les couleurs relevées dans le logo.

## 3. Périmètre du MVP

### 3.1 Inclus dans le MVP

Authentification ; gestion des organisations ; gestion des utilisateurs et rôles ; création d'une émission ; cycle de vie d'une émission ; registre des investisseurs ; onboarding fictif KYC/KYB ; gestion des souscriptions ; validation manuelle des souscriptions ; allocation de tokens ou unités numériques ; registre interne des positions ; simulation de transferts entre investisseurs ; calcul des coupons ; génération d'instructions de paiement fictives ; portail émetteur ; portail investisseur ; journal d'audit ; notifications internes ; génération de documents simples ; tableaux de bord et indicateurs ; calculateur public de business case sur la landing page (section 19).

### 3.2 Hors périmètre du MVP

Ne doivent pas être implémentés dans la première version : paiement bancaire réel ; paiement en cryptomonnaie ; conservation de clés privées ; connexion obligatoire à une blockchain publique ; marché secondaire ouvert ; routage d'ordres ; cotation en temps réel ; investissement de particuliers ; gestion fiscale exhaustive ; signature électronique qualifiée ; vérification KYC réelle ; multi-juridiction complexe ; connexion à un dépositaire central ; promesse de conformité réglementaire automatique.

*Des interfaces techniques pourront être prévues pour intégrer ces fonctions ultérieurement (section 27).*

### 3.3 Mention « démonstration » [v0.2]

Tant que la plateforme fonctionne en mode sandbox, chaque écran authentifié affiche un bandeau discret mais permanent « Environnement de démonstration — données fictives ». Les documents générés (PDF, CSV) portent la même mention. Aucune donnée de démonstration ne doit reprendre le nom d'une entreprise ou d'une personne réelle.

## 4. Utilisateurs et rôles

### 4.1 Platform Administrator

Administrateur global de la plateforme. Droits : créer et administrer les organisations ; consulter la liste des tenants ; activer ou désactiver une organisation ; gérer les paramètres globaux ; consulter les journaux techniques et les métriques de la plateforme ; gérer les modèles d'emails et de notifications ; gérer les référentiels globaux.

*Le Platform Administrator ne peut pas consulter par défaut les documents confidentiels ni les données métier d'un tenant. Cet accès exceptionnel doit être explicitement demandé, limité dans le temps, justifié par un motif et tracé dans le journal d'audit du tenant concerné.* [v0.2 : précision de mise en œuvre — accès « break-glass » d'une durée par défaut de 1 heure, **[À valider]**.]

### 4.2 Issuer Administrator

Administrateur d'une organisation émettrice. Droits : gérer les utilisateurs de son organisation ; créer une émission ; modifier une émission en brouillon ; soumettre une émission à validation ; inviter des investisseurs ; valider ou refuser une souscription ; déclencher une allocation ; initier un événement financier ; consulter le registre ; exporter les données autorisées ; consulter le journal d'audit de son organisation.

### 4.3 Issuer Operator

Utilisateur opérationnel de l'émetteur. Droits : préparer une émission ; gérer les investisseurs ; contrôler les documents ; traiter les souscriptions ; préparer les distributions ; consulter les données opérationnelles. Les actions sensibles nécessitent une validation par un Issuer Administrator (section 4.8).

### 4.4 Compliance Officer

Contrôle des investisseurs et des opérations. Droits : consulter les profils investisseurs et les documents déposés ; modifier le statut KYC/KYB ; définir l'éligibilité d'un investisseur ; approuver ou refuser un transfert ; ajouter un commentaire de conformité ; consulter l'historique des décisions.

### 4.5 Investor

Investisseur professionnel invité sur une émission. Droits : accéder à son portail ; compléter son profil ; déposer des documents fictifs ; consulter les émissions auxquelles il est invité ; saisir une demande de souscription ; consulter ses positions, transactions et coupons ; télécharger ses documents ; demander un transfert si la fonctionnalité est activée pour l'émission.

### 4.6 Auditor

Lecture seule. Droits : consulter les émissions, le registre, les opérations et le journal d'audit ; exporter les données autorisées ; aucune opération de modification.

### 4.7 Matrice des permissions [v0.2]

Les permissions sont nommées au format `ressource:action` (par exemple `issuance:create`, `subscription:approve`, `transfer:approve`, `audit:read`). Les rôles sont des ensembles de permissions stockés en base, pas des conditions codées en dur. La matrice rôle × permission doit être produite par Claude au livrable 4 et servir de base aux tests d'autorisation automatiques.

### 4.8 Principe des quatre yeux [v0.2] [À valider]

Pour les actions suivantes, **l'utilisateur qui valide doit être différent de celui qui a initié ou préparé l'opération**. Le contrôle est fait côté serveur et le refus est tracé.

| Action | Initiateur possible | Valideur requis |
|---|---|---|
| Émission : UNDER_REVIEW → APPROVED | Issuer Operator ou Administrator | Issuer Administrator (autre utilisateur) |
| Validation d'une allocation | Issuer Operator ou Administrator | Issuer Administrator (autre utilisateur) |
| Approbation d'une distribution | Issuer Operator ou Administrator | Issuer Administrator (autre utilisateur) |
| Confirmation d'un paiement fictif | Issuer Operator | Issuer Administrator |
| Décision KYC/KYB APPROVED ou REJECTED | Issuer Operator (préparation) | Compliance Officer |
| Approbation d'un transfert | Investor (demande) | Compliance Officer ou Issuer Administrator |
| Écriture de CORRECTION dans le registre | Issuer Administrator | Compliance Officer ou autre Issuer Administrator |

Dans les données de démonstration, les rôles sont répartis de façon à pouvoir jouer chaque scénario de bout en bout.

## 5. Architecture fonctionnelle

Six domaines fonctionnels, qui deviennent six modules du monolithe modulaire (section 30.2) :

1. **Identity and Access Management** — authentification, sessions, réinitialisation du mot de passe, MFA (TOTP réel ou simulé), rôles, permissions, rattachement d'un utilisateur à une organisation, statut actif ou inactif, journalisation des connexions.
2. **Issuance Management** — création d'une émission, configuration des caractéristiques, workflow, préparation de la documentation, ouverture et fermeture des souscriptions, allocation, activation, clôture, annulation.
3. **Investor and Compliance Management** — création d'un investisseur, distinction personne morale / personne physique, collecte d'informations, gestion documentaire, simulation du contrôle KYC/KYB, éligibilité, whitelist, historique des décisions. *Pour le MVP B2B, les investisseurs personnes morales sont prioritaires.*
4. **Subscription and Registry Management** — demande de souscription, validation, réservation, allocation, création des positions, mise à jour du registre, historique des mouvements, simulation des transferts, rapprochement entre positions et mouvements.
5. **Servicing Management** — échéanciers, calcul des coupons, montants à distribuer, validation des distributions, instructions de paiement fictives, suivi des statuts, gestion des exceptions.
6. **Reporting and Audit** — dashboards, exports CSV, rapports PDF (facultatif), journal d'audit, historique des changements, suivi des événements, traçabilité des validations.

[v0.2] Les modules communiquent par des interfaces de service explicites et des événements internes, jamais en lisant directement les tables d'un autre module.

## 6. Parcours fonctionnels principaux

### 6.1 Création d'une organisation

1. Le Platform Administrator crée une organisation et renseigne : raison sociale, nom commercial, pays, devise principale, langue, type d'organisation, statut, logo facultatif.
2. Il crée un premier Issuer Administrator.
3. Une invitation est envoyée à l'utilisateur (email simulé, visible dans la boîte de test locale).
4. Toutes les actions sont enregistrées dans le journal d'audit.

### 6.2 Création d'une émission

Assistant en six étapes, avec sauvegarde automatique du brouillon :

- **Étape 1 — Informations générales** : nom, symbole ou code court, description, catégorie d'actif, pays d'émission, devise, émetteur juridique, SPV éventuel, illustration facultative.
- **Étape 2 — Caractéristiques financières** : montant cible, minimum, maximum, valeur nominale d'une unité, nombre total d'unités, taux d'intérêt, type de taux, fréquence de distribution, date d'émission, date de maturité, dates de début et de fin de souscription, souscription minimale, montant maximal par investisseur.
- **Étape 3 — Règles d'éligibilité** : professionnels uniquement, pays autorisés, pays exclus, type d'investisseur, KYC/KYB valide requis, durée de validité du KYC/KYB, montant maximal par investisseur, transfert autorisé ou interdit, validation manuelle des transferts, plafond du nombre d'investisseurs.
- **Étape 4 — Servicing** : calendrier des coupons, modalités de calcul, période de grâce, remboursement du principal, méthode d'arrondi, jour ouvré ou calendaire, remboursement anticipé simplifié.
- **Étape 5 — Documents** : term sheet, memorandum, conditions d'émission, documentation commerciale, documents investisseurs (fichiers de démonstration).
- **Étape 6 — Revue** : résumé complet ; actions possibles : sauvegarder en brouillon, revenir à une étape, soumettre pour validation, annuler.

#### 6.3 Règles de cohérence de l'émission [v0.2]

Contrôlées côté serveur à la soumission (et affichées en ligne dans l'assistant) :

- montant cible = valeur nominale × nombre total d'unités ;
- minimum ≤ cible ≤ maximum ; souscription minimale ≤ montant maximal par investisseur ;
- début de souscription < fin de souscription ≤ date d'émission < date de maturité ;
- un pays ne peut pas être à la fois autorisé et exclu ;
- taux ≥ 0 ; type de taux limité à **FIXED** pour le MVP (le taux variable est hors périmètre) **[À valider]** ;
- fréquences possibles : mensuelle, trimestrielle, semestrielle, annuelle, à maturité (*bullet*).

## 7. Cycle de vie d'une émission

Statuts : DRAFT, UNDER_REVIEW, APPROVED, SUBSCRIPTION_OPEN, SUBSCRIPTION_CLOSED, ALLOCATED, ACTIVE, MATURED, CANCELLED.

### 7.1 Règles de transition

| De | Vers | Qui | Conditions |
|---|---|---|---|
| DRAFT | UNDER_REVIEW | Issuer Operator ou Administrator | Contrôles de la section 6.3 passés |
| UNDER_REVIEW | APPROVED | Issuer Administrator | Quatre yeux (4.8) |
| UNDER_REVIEW | DRAFT | Issuer Administrator | Commentaire obligatoire |
| APPROVED | SUBSCRIPTION_OPEN | Issuer Administrator | Date du jour ≥ début de souscription |
| SUBSCRIPTION_OPEN | SUBSCRIPTION_CLOSED | Issuer Administrator, ou système à la date de fin | — |
| SUBSCRIPTION_CLOSED | ALLOCATED | Issuer Administrator | Allocation validée (section 10) |
| ALLOCATED | ACTIVE | Issuer Administrator | Paiements fictifs confirmés ; génère l'échéancier (12.1) |
| ACTIVE | MATURED | Système ou Issuer Administrator | Date de maturité atteinte et distributions finales payées |

**Annulation [v0.2] [À valider]** : CANCELLED est possible depuis DRAFT, UNDER_REVIEW, APPROVED, SUBSCRIPTION_OPEN et SUBSCRIPTION_CLOSED, avec commentaire obligatoire. Les souscriptions en cours passent alors en CANCELLED et les investisseurs sont notifiés. Aucune annulation n'est possible à partir de ALLOCATED : il faut passer par des écritures de REDEMPTION ou CANCELLATION dans le registre, hors périmètre MVP.

Chaque transition enregistre : ancien statut, nouveau statut, utilisateur, date et heure UTC, commentaire éventuel, organisation, identifiant de corrélation.

*Les transitions sont contrôlées côté back-end par une machine à états unique et testée, jamais uniquement dans l'interface.*

## 8. Gestion des investisseurs

### 8.1 Profil investisseur

Identifiant unique, type d'investisseur, raison sociale, nom commercial, forme juridique, numéro d'enregistrement, identifiant fiscal, pays d'incorporation, adresse, email de contact, téléphone, représentant légal, bénéficiaires effectifs (fictifs), classification investisseur, statut du profil, statut KYC/KYB, date de dernière revue, date d'expiration, niveau de risque simulé.

### 8.2 Statuts KYC/KYB

NOT_STARTED, IN_PROGRESS, PENDING_REVIEW, APPROVED, REJECTED, EXPIRED.

[v0.2] Un job quotidien passe en EXPIRED les dossiers dont la date d'expiration est dépassée et notifie l'investisseur et le Compliance Officer 30 jours avant l'échéance **[À valider]**. Un investisseur EXPIRED ne peut plus souscrire ni recevoir de transfert ; ses positions existantes restent inchangées.

### 8.3 Statuts d'éligibilité

NOT_ASSESSED, ELIGIBLE, NOT_ELIGIBLE, SUSPENDED.

### 8.4 Whitelist et moteur d'éligibilité

Un investisseur peut être autorisé pour une émission uniquement si : son profil est actif ; son KYC/KYB est approuvé et non expiré ; sa classification est compatible ; son pays n'est pas exclu ; les conditions spécifiques de l'émission sont satisfaites ; il n'est pas suspendu.

La décision enregistre : résultat, règles évaluées, utilisateur ou système décideur, date et heure, justification, version des règles.

[v0.2] Le moteur d'éligibilité est **une fonction pure** (mêmes entrées → même résultat) qui renvoie la liste détaillée des règles passées et échouées, avec un code par règle (par exemple `KYC_EXPIRED`, `COUNTRY_EXCLUDED`). Il est appelé à l'invitation, à la souscription et au transfert. L'interface affiche ces motifs en clair à l'utilisateur autorisé.

### 8.5 Données personnelles [v0.2] [À valider]

Même fictives, les données des représentants et bénéficiaires effectifs sont traitées comme des données personnelles :

- elles sont stockées dans des tables séparées du registre, qui ne contient que des identifiants ;
- le registre append-only ne contient jamais de nom, d'email ou de numéro d'identification ;
- elles sont masquées dans les logs et le journal d'audit ;
- l'architecture doit permettre plus tard l'effacement ou la pseudonymisation d'une personne sans casser l'intégrité du registre.

## 9. Souscriptions

### 9.1 Création

L'investisseur sélectionne une émission ouverte et saisit : montant souhaité, nombre d'unités demandé, compte ou référence de paiement fictive, acceptation des documents, déclaration d'éligibilité, commentaire facultatif.

### 9.2 Statuts et transitions

DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PAYMENT_PENDING, PAYMENT_CONFIRMED, ALLOCATED, CANCELLED.

[v0.2] Chemin nominal : DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PAYMENT_PENDING → PAYMENT_CONFIRMED → ALLOCATED. REJECTED est possible depuis UNDER_REVIEW (motif obligatoire). CANCELLED est possible jusqu'à PAYMENT_PENDING inclus, à l'initiative de l'investisseur (avant APPROVED) ou de l'émetteur.

[v0.2] Ordre de traitement proposé **[À valider]** : la souscription est approuvée, puis l'allocation est décidée à la clôture, puis le paiement fictif porte sur le montant alloué. Si le montant alloué est inférieur au montant demandé, l'instruction de paiement fictive porte sur le montant alloué.

### 9.3 Contrôles

Statut de l'émission ; dates de souscription ; éligibilité ; montants minimum et maximum ; cohérence montant = unités × valeur nominale ; plafond par investisseur (en cumulant ses souscriptions actives sur l'émission) ; plafond global ; disponibilité des unités ; absence de doublon technique (clé d'idempotence).

### 9.4 Surallocation

Si le total demandé dépasse les unités disponibles, le système permet : allocation au prorata, allocation manuelle, réduction partielle, refus de certaines demandes. **Priorité MVP : allocation manuelle.** [v0.2] Si le prorata est implémenté, les unités sont arrondies à l'entier inférieur et les unités restantes sont attribuées selon l'ordre chronologique de soumission ; la règle appliquée est enregistrée avec l'allocation.

## 10. Allocation et registre

### 10.1 Allocation

Après fermeture des souscriptions : l'émetteur consulte les souscriptions approuvées ; il renseigne ou confirme le nombre d'unités retenues ; le système contrôle le total ; un administrateur valide (quatre yeux) ; le système crée les positions et les mouvements de registre **dans une seule transaction** ; un justificatif (confirmation d'allocation) est rendu disponible.

### 10.2 Registre interne

Source de vérité du MVP. Contient : émission, investisseur, compte de registre logique (*LogicalAccount*), quantité détenue / bloquée / disponible, montant d'acquisition, date de dernière mise à jour, version de la position (verrouillage optimiste).

### 10.3 Ledger append-only

Les mouvements ne sont jamais supprimés ni modifiés.

- **Champs** : identifiant, type, émission, compte source, compte destination, quantité, date effective, date d'enregistrement, référence métier, statut, hash ou checksum, utilisateur ou service initiateur, métadonnées, identifiant de corrélation.
- **Types** : ISSUANCE, ALLOCATION, TRANSFER, BLOCK, UNBLOCK, REDEMPTION, CANCELLATION, CORRECTION.
- *Une correction génère une contre-écriture et ne modifie jamais l'écriture originale.*

### 10.4 Invariants du registre [v0.2]

Vérifiés par des tests automatiques et par un job de rapprochement quotidien qui signale toute anomalie :

1. Pour chaque position : détenu = disponible + bloqué, et aucune quantité n'est négative.
2. Pour chaque émission : somme des positions = somme des mouvements du ledger.
3. Pour chaque émission : total alloué ≤ nombre total d'unités.
4. Le caractère append-only est garanti **en base** (droits PostgreSQL ou trigger interdisant UPDATE et DELETE sur la table des mouvements), pas seulement dans le code.
5. Chaque mouvement contient le hash du mouvement précédent de la même émission (chaînage), ce qui permet de détecter une altération. **[À valider]**

### 10.5 Unités [v0.2] [À valider]

Pour le MVP, les unités sont des **entiers** (pas de fraction d'unité). Le type en base reste décimal pour permettre des fractions plus tard sans migration de données.

## 11. Transferts

### 11.1 Processus

L'investisseur initie une demande ; il sélectionne un destinataire éligible ; il renseigne la quantité ; le système vérifie la disponibilité et **bloque** la quantité (mouvement BLOCK) ; le moteur d'éligibilité contrôle le destinataire ; un Compliance Officer ou un Issuer Administrator valide ; le registre est mis à jour (UNBLOCK + TRANSFER dans une seule transaction) ; les deux parties sont notifiées. En cas de rejet ou d'annulation, la quantité est débloquée (UNBLOCK).

### 11.2 Statuts

DRAFT, SUBMITTED, COMPLIANCE_REVIEW, APPROVED, REJECTED, EXECUTED, CANCELLED.

### 11.3 Contrôles

Transfert autorisé pour l'émission ; quantité positive ; quantité disponible suffisante ; destinataire éligible ; KYC/KYB valide des deux parties ; pays autorisé ; période de blocage respectée ; pas de dépassement de plafond (par investisseur et nombre maximal d'investisseurs) ; pas d'auto-transfert ; idempotence.

[v0.2] Pour le MVP, le transfert est une cession **sans contrepartie financière gérée par la plateforme** : un prix indicatif peut être saisi, mais aucun règlement n'est simulé.

## 12. Coupons et distributions

### 12.1 Calendrier

À l'activation de l'émission, le système génère les échéances à partir de : date de début, date de maturité, fréquence, taux, valeur nominale, convention de calcul.

### 12.2 Calcul

Pour chaque investisseur : **Montant brut = Quantité éligible × Valeur nominale × Taux × Fraction de période.**

[v0.2] Précisions **[À valider]** :

- **Conventions de décompte** disponibles : ACT/365 Fixed (par défaut) et 30/360. La convention est choisie à la création de l'émission et ne change plus ensuite.
- **Précision** : calculs intermédiaires en décimal haute précision (au moins 18 décimales), jamais en nombre à virgule flottante.
- **Arrondi** : chaque ligne investisseur est arrondie à l'unité monétaire de la devise (2 décimales pour EUR) selon la méthode choisie à l'étape 4 (par défaut : arrondi au plus proche, demi à l'unité paire). L'écart d'arrondi total est calculé et affiché dans la distribution.
- **Jours non ouvrés** : si l'échéance tombe un week-end, le paiement est décalé au jour ouvré suivant (*following*) sans changer le montant. Le calendrier des jours fériés est hors périmètre MVP.
- **Exemple de contrôle** : 100 unités × 1 000 € × 5 % × 0,5 (semestre en 30/360) = **2 500,00 €**. Ce cas doit figurer dans les tests.
- **Taxes et retenues** : hors périmètre ; seuls les montants bruts sont calculés.

### 12.3 Snapshot

Le détenteur éligible est déterminé à partir d'un *snapshot* du registre à une date définie (*record date*), conservé pour rendre le calcul reproductible. Recalculer une distribution à partir de son snapshot doit donner exactement le même résultat.

### 12.4 Statuts

DRAFT, CALCULATED, UNDER_REVIEW, APPROVED, PAYMENT_INSTRUCTION_GENERATED, PAID, FAILED, CANCELLED.

### 12.5 Résultats

Montant total, nombre de bénéficiaires, détail par investisseur, anomalies, instruction de paiement fictive, fichier CSV exportable, trace de validation.

### 12.6 Remboursement du principal [v0.2]

À maturité, le système génère une distribution de type PRINCIPAL (quantité × valeur nominale) puis des mouvements REDEMPTION qui ramènent les positions à zéro. Le remboursement anticipé est limité à un remboursement total, déclenché manuellement.

## 13. Portail émetteur

### 13.1 Dashboard

Total des actifs administrés, nombre d'émissions, émissions actives, volume de souscriptions, nombre d'investisseurs, investisseurs éligibles, prochaines échéances, opérations en attente, alertes KYC/KYB, dernières activités.

### 13.2 Menu

Dashboard, Issuances, Investors, Subscriptions, Registry, Distributions, Documents, Reports, Audit Log, Settings.

### 13.3 Liste des émissions

Colonnes : nom, code, catégorie, devise, montant cible, montant souscrit, statut, date de clôture, date de maturité, progression, actions. Filtres : statut, type d'actif, devise, période, émetteur, recherche textuelle.

### 13.4 Détail d'une émission

Onglets : Overview, Details, Terms, Subscriptions, Investors, Registry, Transfers, Distributions, Documents, Audit, Settings.

### 13.5 File de tâches [v0.2]

Un écran « À traiter » regroupe, pour l'utilisateur connecté, les actions qui attendent sa validation (souscriptions, KYC, transferts, distributions), triées par urgence.

## 14. Portail investisseur

### 14.1 Dashboard

Valeur nominale totale détenue, nombre de positions, distributions reçues, prochain coupon, demandes en attente, documents récents.

### 14.2 Menu

Portfolio, Investment Opportunities, Subscriptions, Transactions, Distributions, Documents, Profile.

### 14.3 Détail d'une position

Émission, émetteur, quantité, valeur nominale, montant investi, taux, date de maturité, prochain coupon, statut, historique des mouvements, documents disponibles.

[v0.2] Un investisseur ne voit que ses propres données et les émissions auxquelles il est invité. Il ne voit jamais la liste des autres investisseurs d'une émission.

## 15. Notifications

- **Canaux MVP** : notifications dans l'application ; emails simulés (capturés par un serveur de test local type Mailpit) ou réels via un fournisseur configurable.
- **Événements** : invitation d'un utilisateur, invitation d'un investisseur, émission ouverte, souscription déposée, approuvée ou rejetée, paiement fictif confirmé, allocation réalisée, transfert demandé, validé ou rejeté, coupon calculé, distribution validée, document ajouté, expiration prochaine du KYC/KYB.
- **Préférences** : choix des catégories, sauf notifications obligatoires de sécurité ou de workflow.

[v0.2] Les notifications sont envoyées de façon asynchrone via une file de jobs, avec l'*outbox pattern* : l'événement est écrit dans la même transaction que l'opération métier, puis envoyé. Une opération validée ne peut donc jamais « perdre » sa notification.

## 16. Gestion documentaire

- **Types** : documents d'émission, documents investisseurs, justificatifs KYC/KYB, bulletins de souscription, confirmations d'allocation, relevés de position, avis de coupon, rapports.
- **Métadonnées** : type, nom, version, propriétaire, organisation, émission, investisseur, niveau de confidentialité, date d'ajout, auteur, statut, checksum, date d'expiration éventuelle.
- **Contraintes** : contrôle d'accès par tenant et par rôle ; URL de téléchargement temporaire ; taille maximale configurable ; types de fichiers autorisés ; historique des versions ; journalisation des téléchargements sensibles.

[v0.2] Stockage compatible S3 (MinIO dans Codespaces). Types autorisés par défaut **[À valider]** : PDF, PNG, JPEG, CSV, XLSX ; 10 Mo maximum. Le type est vérifié par le contenu du fichier, pas seulement par son extension. Le scan antivirus passe par une interface `FileScanner` avec une implémentation factice pour le MVP.

## 17. Journal d'audit

### 17.1 Actions tracées

Connexion ; échec de connexion ; création ou modification d'un utilisateur ; changement de rôle ; création ou modification d'une émission ; transition de statut ; décision KYC/KYB ; décision d'éligibilité ; validation d'une souscription ; confirmation d'un paiement fictif ; allocation ; transfert ; calcul de coupon ; validation de distribution ; téléchargement sensible ; export ; modification de paramétrage ; [v0.2] accès exceptionnel d'un Platform Administrator ; refus d'autorisation.

### 17.2 Structure

ID, timestamp UTC, tenant, utilisateur, rôle, type d'action, ressource, identifiant de la ressource, ancienne valeur, nouvelle valeur, source, adresse IP, user agent, correlation ID, résultat, motif éventuel.

*Les données sensibles sont masquées dans le journal.* [v0.2] Le journal d'audit est lui aussi append-only en base.

## 18. Indicateurs

- **Émetteur** : montant cible, souscrit, taux de souscription, montant alloué, nombre d'investisseurs, ticket moyen, taux de validation des investisseurs, souscriptions en attente, distributions à venir, montant total distribué, transferts en attente, KYC/KYB arrivant à expiration.
- **Plateforme** : organisations, utilisateurs actifs, émissions, émissions actives, investisseurs, volume nominal administré, nombre d'opérations, erreurs techniques, temps de traitement.

## 19. Business Case Calculator public

Calculateur intégré à la landing page, séparé de l'application authentifiée.

- **Entrées** : volume de l'émission, nombre d'investisseurs, souscriptions annuelles, transferts annuels, distributions annuelles, temps moyen de traitement manuel, coût horaire moyen, coût actuel des outils, coût actuel des prestataires, coût annuel des incidents ou réconciliations.
- **Sorties** : coût opérationnel annuel estimé, économies potentielles, temps administratif économisé, coût estimatif de la plateforme, retour sur investissement indicatif, graphiques.
- **Avertissement** : résultats présentés comme des estimations indicatives et non comme une garantie contractuelle.

[v0.2] Toutes les hypothèses de calcul (taux de gain de temps, coût de la plateforme) sont visibles et modifiables par le visiteur, et centralisées dans un seul fichier de configuration. Le calcul tourne entièrement dans le navigateur ; aucune donnée saisie n'est envoyée au serveur sans action explicite (formulaire de contact).

### 19.1 Landing page [v0.2]

La landing page existante (prototype HTML) sera reprise dans `apps/web`. Elle doit respecter la règle 1 de la section 31.2 : **aucune mention « conforme MiCA », « certifié » ou équivalente**. Formulations admises : « architecture conçue pour intégrer vos contrôles de conformité », « compatible avec une future intégration ERC-3643 ».

## 20. Règles multi-tenant

Chaque organisation est un tenant. Toutes les entités métier portent un `tenant_id`. L'isolation s'applique à l'API, aux services, aux requêtes en base, aux documents, aux caches, aux exports et aux logs fonctionnels.

Un utilisateur ne peut jamais fournir arbitrairement un `tenant_id` pour accéder à d'autres données. Le tenant est déterminé à partir de l'identité authentifiée et validé côté serveur.

[v0.2] Défense en profondeur : en plus du filtrage applicatif, activer le **Row Level Security de PostgreSQL** sur les tables métier, le tenant courant étant positionné par transaction. Les clés de cache et les chemins de stockage des documents sont préfixés par le tenant. Un test automatique (scénario 5) tente systématiquement l'accès croisé sur chaque endpoint.

## 21. Modèle de données conceptuel

Entités : Tenant, User, Role, Permission, UserRole, Investor, InvestorRepresentative, BeneficialOwner, KycCase, KycDocument, EligibilityAssessment, Issuance, IssuanceTerms, EligibilityRule, Subscription, Allocation, LogicalAccount, Position, LedgerEntry, TransferRequest, Distribution, DistributionLine, PaymentInstruction, Document, Notification, AuditEvent, WorkflowTransition, ReferenceData. [v0.2] Ajouts : CouponSchedule, RegistrySnapshot, IdempotencyKey, OutboxEvent, InvestorInvitation.

### 21.1 Relations principales

Tenant 1..N Users ; Tenant 1..N Investors ; Tenant 1..N Issuances ; Issuance 1..N Subscriptions ; Investor 1..N Subscriptions ; Subscription 0..1 Allocation ; Allocation N..1 Position ; Issuance 1..N Positions ; Investor 1..N Positions ; Issuance 1..N LedgerEntries ; Investor 1..N LogicalAccounts ; LogicalAccount 1..N LedgerEntries ; Issuance 1..N Distributions ; Distribution 1..N DistributionLines ; Investor 1..N DistributionLines ; Investor 1..N KycCases ; KycCase 1..N KycDocuments ; Issuance 1..N EligibilityRules ; Investor 1..N EligibilityAssessments. [v0.2] Issuance 1..N CouponSchedules ; Distribution 1..1 RegistrySnapshot ; Issuance 1..N InvestorInvitations.

[v0.2] **Question ouverte** : dans la v0.1, un investisseur appartient à un seul tenant. Si un même investisseur doit pouvoir investir chez plusieurs émetteurs, il faudra distinguer une identité globale d'un profil par tenant. Pour le MVP : un investisseur = un tenant **[À valider]**.

### 21.2 Conventions de données [v0.2]

- Identifiants : UUID v7 (triables dans le temps).
- Montants : type `NUMERIC` en base, avec le code devise ISO 4217 stocké à côté de chaque montant. Jamais de `float` ni de `double`, ni en base, ni dans le code, ni dans les échanges JSON (les montants circulent en chaînes de caractères, par exemple `"2500.00"`).
- Dates techniques : `timestamptz` en UTC. Dates métier (date de maturité, record date) : type `date` sans heure.
- Colonnes communes : `created_at`, `updated_at`, `created_by`, `version` (sauf tables append-only).
- Suppression : pas de suppression physique des données métier ; statut ou date d'archivage.

## 22. API

API REST versionnée. GraphQL possible pour certaines lectures complexes, mais pas sans justification.

Groupes d'endpoints : /api/v1/auth, /tenants, /users, /roles, /investors, /kyc-cases, /eligibility-assessments, /issuances, /subscriptions, /allocations, /positions, /ledger, /transfers, /distributions, /payment-instructions, /documents, /notifications, /audit-events, /reports.

### 22.1 Principes

Versionnement explicite ; authentification obligatoire ; autorisation par rôle et permission ; validation stricte des entrées ; pagination, filtres, tri, recherche ; erreurs normalisées ; correlation ID ; clé d'idempotence pour les opérations sensibles ; timestamps UTC ; documentation OpenAPI ; rate limiting.

[v0.2] Les transitions d'état passent par des endpoints d'action explicites (par exemple `POST /api/v1/issuances/{id}/submit`, `/approve`, `/open-subscription`) plutôt que par une modification libre du champ statut. L'en-tête `Idempotency-Key` est obligatoire sur les actions financières ; une même clé rejouée renvoie la même réponse sans nouvel effet.

### 22.2 Format d'erreur

```json
{
  "error": {
    "code": "SUBSCRIPTION_LIMIT_EXCEEDED",
    "message": "The requested subscription exceeds the permitted limit.",
    "details": [],
    "correlationId": "uuid",
    "timestamp": "2026-09-24T08:00:00Z"
  }
}
```

[v0.2] Les codes d'erreur sont stables et listés dans un catalogue partagé entre front et back ; le front traduit le message à partir du code (en-GB / fr-FR).

## 23. Exigences front-end

### 23.1 Design

Institutionnel, moderne et sobre, en mode sombre par défaut.

| Jeton | v0.1 | v0.2 (aligné sur le logo) | Usage |
|---|---|---|---|
| Background | #090D16 | **#0A1020** | Fond de page (identique au fond du logo) |
| Surface | #111827 | #111827 | Cartes, panneaux |
| Secondary Surface | #182131 | #182131 | Survol, zones secondaires |
| Primary | #6366F1 | **#4F52D6** | Boutons principaux, liens (indigo du logo) |
| Accent [v0.2] | — | **#45D6E6** | Graphiques, focus, éléments actifs (cyan du logo) |
| Dégradé de marque [v0.2] | — | #4F52D6 → #45D6E6 | Réservé au logo et à quelques éléments décoratifs, jamais derrière du texte |
| Success | #10B981 | #10B981 | Statuts validés |
| Warning | #F59E0B | #F59E0B | Statuts en attente |
| Error | #EF4444 | #EF4444 | Erreurs, rejets |
| Text Primary | #F9FAFB | #F9FAFB | Texte principal |
| Text Secondary | #9CA3AF | #9CA3AF | Texte secondaire |

Les couleurs sont définies une seule fois comme jetons de thème (variables CSS et configuration Tailwind) ; aucun code couleur en dur dans les composants. Contraste minimal WCAG AA à vérifier pour chaque paire texte/fond.

### 23.2 Composants

App Shell, Sidebar, Header, KPI Cards, Data Tables, Filters, Search Bar, Status Badges, Stepper, Forms, Date Pickers, Currency Inputs, Drawers, Confirmation Modals, Tabs, Timeline, Activity Card, File Upload, Notifications, Empty States, Skeleton Loaders, Error States, Charts, Audit Viewer.

[v0.2] Chaque statut métier (émission, souscription, KYC, transfert, distribution) a une couleur et un libellé traduit définis dans un seul fichier de correspondance.

### 23.3 Contraintes UX

Accessibilité (navigation clavier, contrastes, labels explicites) ; validation en ligne ; confirmation des opérations sensibles avec rappel de ce qui va se passer ; avertissement avant perte de données ; sauvegarde des brouillons ; messages d'erreur compréhensibles ; états de chargement progressifs ; filtres conservés dans l'URL si pertinent ; distinction claire entre données fictives et réelles (section 3.3) ; responsive desktop, tablette et mobile, avec priorité au desktop pour l'administration.

### 23.4 Internationalisation

Tous les textes sont externalisés. Langues : en-GB, fr-FR. Dates, nombres et devises suivent la locale choisie. [v0.2] Un test automatique échoue si une clé de traduction manque dans l'une des deux langues.

## 24. Sécurité

Contrôles minimaux : authentification sécurisée ; MFA ; gestion des sessions ; expiration des tokens ; rotation des refresh tokens ; RBAC ; moindre privilège ; isolation multi-tenant ; chiffrement en transit et au repos ; secrets hors du code ; validation des entrées ; protection XSS et CSRF ; protection contre les injections ; rate limiting ; blocage après échecs ; détection d'accès anormal ; scan antivirus ; URLs temporaires ; journalisation de sécurité ; sauvegardes et restauration ; analyse de vulnérabilités ; masquage des données sensibles.

*Aucune clé privée blockchain n'est stockée par le MVP.*

[v0.2] Précisions :

- Mots de passe hachés avec Argon2id. Pas de politique de complexité absurde : longueur minimale de 12 caractères et vérification contre une liste de mots de passe courants.
- Préférer une bibliothèque d'authentification éprouvée à une implémentation maison ; le choix est à justifier dans la comparaison technologique.
- MFA obligatoire pour les rôles Platform Administrator, Issuer Administrator et Compliance Officer **[À valider]**.
- Cookies de session `HttpOnly`, `Secure`, `SameSite=Lax` au minimum.
- Analyse automatique des dépendances et des secrets à chaque push (Dependabot et *secret scanning* de GitHub, activables gratuitement).

## 25. Exigences non fonctionnelles

- **Performance** : API standard < 500 ms ; chargement initial optimisé ; pagination obligatoire ; traitements asynchrones pour exports et notifications ; pas de recalcul complet du registre à chaque consultation.
- **Disponibilité** : health checks, readiness checks, gestion des erreurs, circuit breaker pour les services externes, monitoring, alerting, sauvegardes et restauration.
- **Intégrité** : les opérations financières simulées sont transactionnelles ; une allocation, un transfert ou une distribution ne crée jamais d'état partiel. [v0.2] Les mises à jour concurrentes d'une même position sont protégées par verrouillage (optimiste avec numéro de version, ou `SELECT … FOR UPDATE`).
- **Observabilité** : logs structurés (JSON), métriques, traces distribuées (OpenTelemetry), correlation IDs, dashboards techniques, suivi des erreurs front-end et des jobs asynchrones.
- **Tests [v0.2]** : tests unitaires pour les calculs et machines à états ; tests d'intégration sur base PostgreSQL réelle pour le registre ; tests d'autorisation par rôle et par tenant ; tests de bout en bout pour les six scénarios de la section 29. Couverture minimale visée pour les modules Registry et Servicing : 90 % **[À valider]**. Les tests tournent automatiquement sur GitHub Actions à chaque push.

## 26. Architecture évolutive blockchain

Interface d'abstraction `TokenRegistryProvider` : `createAsset()`, `mint()`, `transfer()`, `burn()`, `freeze()`, `unfreeze()`, `getBalance()`, `getTransactionStatus()`.

Implémentations : `InternalLedgerProvider` (seule implémentée dans le MVP), `EthereumLikeProvider`, `PolkadotAssetHubProvider`.

[v0.2] Précisions :

- La cible blockchain envisagée à terme est le standard **ERC-3643** (jetons permissionnés avec identités ONCHAINID) sur un réseau compatible EVM. Il sera une variante de `EthereumLikeProvider`. Le modèle interne (éligibilité, blocage, gel, whitelist) est conçu pour se projeter naturellement sur ERC-3643, sans rien en implémenter dans le MVP.
- Même avec une blockchain branchée plus tard, le registre interne reste la référence de gestion ; la blockchain devient un miroir rapproché quotidiennement.
- Aucun paquet, contrat Solidity ni dépendance blockchain ne doit être ajouté au dépôt pendant le MVP. Si un dossier `packages/contracts` ou une configuration Hardhat existe déjà, Claude le signale et propose de le retirer ou de l'isoler, sans le supprimer sans accord.

## 27. Intégrations futures

Interfaces à prévoir, avec implémentation factice (*mock*) dans le MVP : KycProvider, IdentityProvider, PaymentProvider, CustodyProvider, ElectronicSignatureProvider, DocumentStorageProvider, EmailProvider, BlockchainProvider, MarketDataProvider, AccountingProvider. [v0.2] Plus FileScanner (section 16).

[v0.2] Chaque implémentation factice doit pouvoir simuler un succès, un refus et une panne, afin de tester la gestion d'erreurs. Le choix de l'implémentation se fait par configuration, sans modifier le code métier.

## 28. Données de démonstration

1 émetteur, 5 utilisateurs de rôles différents, 20 investisseurs institutionnels, 1 émission de dette privée, 1 émission de projet solaire, souscriptions, positions, transferts, coupons, notifications, audit.

[v0.2] Précisions :

- Ajouter **un second tenant** avec quelques données, indispensable pour démontrer l'isolation (scénario 5).
- Couvrir tous les statuts utiles à la démo : au moins un investisseur KYC expiré, un non éligible (pays exclu), une souscription rejetée, un transfert en attente de conformité.
- Noms clairement fictifs (par exemple « Northwind Private Debt Fund I », « Helios Solar SPV 2027 »), emails en `@example.com`, identifiants d'enregistrement visiblement factices.
- Jeu de données **déterministe** (mêmes données à chaque réinitialisation) et rechargeable par une seule commande.
- La page de connexion de l'environnement de démo liste les comptes de test et leur rôle.

## 29. Scénarios d'acceptation prioritaires [v0.2 : détaillés]

Chaque scénario devient un test de bout en bout automatisé.

**Scénario 1 — Création d'émission**
- *Étant donné* un Issuer Operator connecté,
- *quand* il crée l'émission « Helios Solar SPV 2027 » via l'assistant et la soumet, puis qu'un Issuer Administrator différent l'approuve,
- *alors* l'émission passe DRAFT → UNDER_REVIEW → APPROVED, chaque transition est dans le journal d'audit, et l'approbation par l'Operator lui-même est refusée (quatre yeux).

**Scénario 2 — Investisseur non éligible**
- *Étant donné* un investisseur dont le pays est exclu de l'émission, ou dont le KYC est expiré,
- *quand* il tente de souscrire,
- *alors* la souscription est refusée avec le code de règle échouée (`COUNTRY_EXCLUDED` ou `KYC_EXPIRED`), le motif est affiché en clair, aucune position n'est créée et la décision est tracée.

**Scénario 3 — Allocation**
- *Étant donné* une émission fermée de 1 000 unités avec 1 200 unités demandées par des souscriptions approuvées,
- *quand* l'émetteur saisit une allocation manuelle totale de 1 000 unités et qu'un administrateur la valide,
- *alors* les positions et les mouvements ALLOCATION sont créés en une seule transaction, la somme des positions vaut 1 000, et une allocation de 1 001 unités est refusée.

**Scénario 4 — Transfert**
- *Étant donné* l'investisseur A détenant 100 unités et l'investisseur B éligible,
- *quand* A demande un transfert de 40 unités vers B et qu'un Compliance Officer l'approuve,
- *alors* A détient 60 unités, B 40, le ledger contient BLOCK, UNBLOCK et TRANSFER, et une demande de 70 unités supplémentaires est refusée pour quantité insuffisante. Rejouer la même requête avec la même clé d'idempotence ne crée aucun mouvement supplémentaire.

**Scénario 5 — Isolation multi-tenant**
- *Étant donné* un utilisateur du tenant A,
- *quand* il appelle n'importe quel endpoint avec l'identifiant d'une ressource du tenant B, ou en forçant un `tenant_id` du tenant B,
- *alors* il reçoit une réponse 404 (sans révéler l'existence de la ressource), aucune donnée de B n'est renvoyée, et la tentative est tracée.

**Scénario 6 — Coupon**
- *Étant donné* une émission ACTIVE à 5 % semestriel en 30/360, de valeur nominale 1 000 €, et un investisseur détenant 100 unités à la record date,
- *quand* la distribution est calculée, revue et approuvée,
- *alors* la ligne de l'investisseur vaut exactement 2 500,00 €, le total égale la somme des lignes (écart d'arrondi affiché), l'instruction de paiement fictive et le CSV sont générés, et un recalcul à partir du snapshot donne le même résultat.

## 30. Livrables attendus de Claude

Avant tout code de production :

1. Analyse fonctionnelle (compréhension, ambiguïtés, risques).
2. Architecture technique.
3. Comparaison des technologies (au moins deux options réalistes par sujet).
4. Modèle de données conceptuel et logique, avec la matrice rôles × permissions.
5. Contrats d'API (structure OpenAPI).
6. Architecture front-end.
7. Architecture back-end (modules, dépendances autorisées entre modules).
8. Backlog de développement priorisé.
9. Plan de génération du code en 16 phases (section 31.1).

### 30.1 Préférences de départ du porteur de projet [v0.2]

Le brief initial envisageait : **Next.js + React + TailwindCSS** pour le front, **NestJS (Node.js / TypeScript)** pour le back, **PostgreSQL** et **Redis**, dans un monorepo **pnpm**. Ces choix sont une préférence, pas une obligation : Claude doit les inclure dans la comparaison et ne les écarter que pour une raison explicite. Critère supplémentaire à peser dans chaque choix : **facilité de maintenance par une petite équipe et par un porteur de projet non développeur assisté d'une IA**, et fonctionnement complet dans GitHub Codespaces.

### 30.2 Style d'architecture

Monolithe modulaire pour le MVP, sauf raison forte et explicite d'utiliser des microservices. [v0.2] Un seul back-end déployable, découpé en six modules correspondant à la section 5, avec des règles de dépendance vérifiées automatiquement.

## 31. Contraintes imposées à Claude

### 31.1 Plan de génération du code (livrable 9) [v0.2 : détaillé]

Le code est produit en **16 phases courtes**, une par réponse ou par session. **Ne jamais générer toute l'application dans une seule réponse.** À la fin de chaque phase : résumé, fichiers créés, commande de test, tests verts, commit, puis arrêt et attente de l'accord du porteur de projet.

| Phase | Contenu | Vérifiable par |
|---|---|---|
| 1 | Dépôt : monorepo, devcontainer, docker compose, lint, format, CI de base, README | `pnpm dev` démarre ; CI verte |
| 2 | Squelette back-end : modules vides, configuration, health checks, logs, correlation ID, format d'erreur | `/health` répond |
| 3 | Base de données : schéma initial, migrations, conventions (21.2), RLS, seed minimal | Migrations rejouables |
| 4 | Authentification, sessions, MFA, invitations | Connexion avec un compte de démo |
| 5 | Tenants, utilisateurs, rôles, permissions, isolation | Scénario 5 vert |
| 6 | Journal d'audit et outbox | Actions visibles dans l'audit |
| 7 | Squelette front-end : App Shell, thème, logo, i18n, bandeau démo | Navigation dans les deux langues |
| 8 | Investisseurs, KYC/KYB simulé, documents | Parcours KYC complet |
| 9 | Moteur d'éligibilité et whitelist | Scénario 2 vert |
| 10 | Émissions : assistant et machine à états | Scénario 1 vert |
| 11 | Souscriptions et paiements fictifs | Souscription de bout en bout |
| 12 | Allocation, registre, ledger append-only, invariants | Scénario 3 vert |
| 13 | Transferts | Scénario 4 vert |
| 14 | Échéancier, coupons, distributions, snapshot, CSV | Scénario 6 vert |
| 15 | Dashboards, portail investisseur, notifications, exports, landing page et calculateur | Démo complète jouable |
| 16 | Durcissement et déploiement de démonstration : revue sécurité, performances, sauvegardes, documentation | Checklist de la section 24 cochée |

### 31.2 Règles strictes

1. Ne jamais revendiquer une conformité, une certification ou un agrément réglementaire (MiCA, AMF, ACPR ou autre).
2. Aucun paiement réel, en monnaie ou en cryptomonnaie.
3. Aucune vérification KYC réelle : prestataires factices derrière des interfaces propres.
4. Aucune conservation de clé privée.
5. Aucune connexion obligatoire à une blockchain publique ; le ledger interne append-only est la source de vérité.
6. Intégration blockchain isolée derrière `TokenRegistryProvider`.
7. Types décimaux pour tous les montants et quantités ; jamais de nombre à virgule flottante.
8. Timestamps techniques en UTC.
9. Ne jamais faire confiance à un `tenant_id` fourni par le client.
10. Permissions et isolation contrôlées côté serveur.
11. Transitions d'état contrôlées côté serveur par des machines à états.
12. Idempotence des opérations sensibles.
13. Opérations financières transactionnelles, sans état partiel possible.
14. Ledger et journal d'audit append-only ; corrections par contre-écriture.
15. Données sensibles masquées dans les logs.
16. Secrets hors du code et hors de git.
17. Monolithe modulaire, sauf justification explicite.
18. Aucun code de production avant la présentation et la validation de l'architecture et des choix technologiques.

[v0.2] Règles de travail complémentaires :

19. Répondre en français au porteur de projet ; le code, les noms techniques et les messages de commit sont en anglais.
20. Ne jamais inventer une API, une option de bibliothèque ou un numéro de version : vérifier dans la documentation ou le signaler comme incertain.
21. Toute déviation par rapport à ce document est signalée explicitement et soumise à validation avant d'être appliquée.

## 32. Prompt initial à transmettre à Claude

> Tu interviens comme architecte logiciel senior, product engineer, architecte sécurité et tech lead full-stack.
>
> Je construis une plateforme SaaS B2B appelée Veris Assets, qui gère le cycle de vie d'actifs privés numériques pour des sociétés de gestion, des fonds de dette privée et des investisseurs professionnels. Le fichier `docs/SPEC.md` est la source de vérité. Je ne suis pas développeur : explique simplement, en français.
>
> Ton objectif n'est pas de générer toute l'application maintenant. Travaille dans cet ordre :
> 1. Analyse la spécification.
> 2. Identifie les ambiguïtés, risques et décisions manquantes (y compris les points marqués [À valider]).
> 3. Sépare clairement le MVP des capacités futures.
> 4. Propose une architecture technique pragmatique (monolithe modulaire sauf raison forte).
> 5. Compare au moins deux options réalistes pour : front-end, back-end, base de données, traitements asynchrones, stockage de documents, authentification, déploiement, monitoring. Inclus mes préférences de la section 30.1.
> 6. Recommande une stack et justifie chaque décision majeure.
> 7. Applique toutes les règles de la section 31.2.
>
> Pour ta première réponse, fournis uniquement :
> A. Résumé exécutif
> B. Compréhension fonctionnelle
> C. Périmètre MVP
> D. Risques et ambiguïtés principaux
> E. Architecture recommandée
> F. Comparaison des technologies
> G. Recommandation technologique finale
> H. Diagramme de composants de haut niveau (Mermaid)
> I. Phases d'implémentation proposées
> J. Questions ou décisions à trancher avant de générer du code
>
> Pour chaque recommandation technologique, précise : option recommandée ; alternatives considérées ; raisons du choix ; avantages ; limites ; implications de sécurité ; implications de scalabilité ; impact attendu sur la vitesse de développement.
>
> Pas de conseils génériques : applique chaque recommandation à la spécification Veris Assets. N'écris aucun fichier de code dans cette première réponse.

## 33. Décisions ouvertes à trancher par le porteur de projet [v0.2]

Propositions par défaut appliquées tant qu'elles ne sont pas modifiées :

1. Principe des quatre yeux sur les actions de la section 4.8 — **oui**.
2. Annulation d'une émission possible jusqu'à SUBSCRIPTION_CLOSED inclus — **oui**.
3. Taux fixe uniquement pour le MVP — **oui**.
4. Conventions ACT/365 Fixed et 30/360 ; arrondi au plus proche, demi à l'unité paire — **oui**.
5. Unités entières uniquement — **oui**.
6. Un investisseur appartient à un seul tenant — **oui**.
7. Ordre souscription → approbation → allocation → paiement fictif sur le montant alloué — **oui**.
8. MFA obligatoire pour les rôles d'administration et de conformité — **oui**.
9. Alerte d'expiration KYC 30 jours avant — **oui**.
10. Fichiers autorisés : PDF, PNG, JPEG, CSV, XLSX ; 10 Mo maximum — **oui**.
11. Chaînage par hash des mouvements du ledger — **oui**.
12. Hébergement de la démo : à choisir après la phase 15 (hébergement européen à privilégier).
