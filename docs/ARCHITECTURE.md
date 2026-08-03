# PTF — Architecture Technique

**PTF (Pay-Task Framework)** n'est pas seulement une plateforme de mise en relation : c'est un **écosystème cryptographique** qui récompense l'excellence et punit les manquements. Chaque action — claim, soumission, validation, retard, bug, code malveillant — a une conséquence mesurable, traçable et immuable on-chain. La confiance ne repose pas sur des intentions déclarées, mais sur des mécanismes cryptographiques (hashes Merkle, EIP-712, smart contracts), des incitations économiques (skin-in-the-game, garantie minimum, punitions configurables) et une gouvernance décentralisée (DAO, arbitrage).

PTF permet aux développeurs de contribuer à des projets open source non-rémunérés (public free) ou de monétiser leurs compétences en réclamant des tâches rémunérées sur des projets publics rémunérés ou des projets privés d'entreprises (paid), dans un cadre où chaque participant a quelque chose à perdre et quelque chose à gagner.

---

## Principe fondamental : PTF ne stocke pas le code

PTF est une plateforme de **coordination et de vérification**, non de stockage de code. La base de données PostgreSQL ne contient jamais de code source, de fichiers soumis, ni le contenu de ARCHITECTURE.md ou PLAN_ACTION.md.

### Ce que PTF stocke (PostgreSQL)

**Métadonnées et références uniquement :**
- **Projets** : `projectId`, nom, type, `rewardMode`, langue, `escrowBalance`, statuts, wallets, type de dépôt (`repo_type`), URL du dépôt (`repo_url`), références vers ARCHITECTURE.md et PLAN_ACTION.md dans le dépôt du créateur
- **Tâches** : hash, contraintes, critères, punitions, statuts, rewards — mais PAS le code
- **Soumissions** : `commitHash`, `branchRef`, statut de validation, résultats de tests (pass/fail + logs) — mais PAS le code soumis
- **Utilisateurs** : réputation, transactions de crédits, disputes

**Ce qui n'est jamais stocké :**
- Code source des projets
- Contenu des fichiers soumis
- Contenu de ARCHITECTURE.md / PLAN_ACTION.md (seulement leur chemin/URL dans le dépôt du créateur)

### Trois cas selon le type de dépôt

```
Cas 1 — Projet public GitHub
  Code hébergé sur github.com/owner/repo
  PTF stocke : { repo_type: "github", repo_url: "github.com/owner/repo" }
  Soumissions : PR GitHub standard + référence dans PTF

Cas 2 — Projet privé / créateur avec serveur propre
  Code hébergé sur le serveur du créateur
  PTF stocke : { repo_type: "self-hosted", repo_url: "https://git.enterprise.com/repo" }
  PTF Agent installé chez le créateur gère la réception des soumissions

Cas 3 — Créateur sans serveur (fallback)
  PTF crée un repo privé temporaire sur son infrastructure
  PTF stocke : { repo_type: "ptf-temp", repo_url: "ptf-temp://projectId" }
  Soumissions pushées sur ce repo temporaire
  Synchronisation automatique quand le créateur se reconnecte
```

### Mécanisme de synchronisation (Cas 3)

```typescript
interface ProjectCodeRepo {
  projectId: string;
  repoType: "github" | "self-hosted" | "ptf-temp";
  repoUrl: string;               // URL du dépôt réel
  tempRepoUrl?: string;          // URL repo temporaire PTF (cas 3 uniquement)
  syncStatus: "synced" | "pending" | "syncing";
  lastSyncAt?: Date;
  pendingSubmissions: number;    // soumissions en attente de sync
}
```

**Flow soumission — créateur offline (Cas 3) :**

```
Dev soumet → ptf submit <taskId> --branch feat/impl
  ↓
PTF vérifie validité (tests auto + contraintes)
  ↓
Résultats stockés dans PTF DB (pass/fail, logs) — jamais le code
  ↓
Code poussé sur repo temporaire PTF (git repo, hors DB)
  ↓
Submission marquée : status = "pending_sync"
  ↓
[Créateur se reconnecte]
  ↓
Détection connexion → trigger sync automatique
  ↓
Repo temporaire PTF → repo créateur (push/merge)
  ↓
Notifications peer review / validation déclenchées
  ↓
Repo temporaire nettoyé si sync ok
```

**Flow soumission — créateur online (Cas 1 ou 2) :**

```
Dev soumet → ptf submit <taskId> --branch feat/impl
  ↓
PTF vérifie (tests auto + contraintes)
  ↓
Résultats stockés dans PTF DB
  ↓
Code poussé directement vers le repo du créateur (GitHub PR ou PTF Agent)
  ↓
Notification directe au créateur pour peer review / validation
```

### Diagramme des flux de code selon le type de dépôt

```
                    PTF BACKEND
              (métadonnées seulement)
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
      Cas 1          Cas 2           Cas 3
   GitHub repo    Serveur créateur  Repo PTF temp
  (github.com)    (auto-hébergé)   (ptf-temp://)
         │              │              │
         ▼              ▼              ▼
   PR GitHub std   PTF Agent       Push repo temp
   + ref PTF       chez créateur   → sync au reconnect
                   (sandbox)       → repo créateur
                                   → cleanup temp

  Dans tous les cas :
  ✓ La DB PTF stocke UNIQUEMENT les résultats (pass/fail, logs, commitHash, branchRef)
  ✗ Le code ne transite JAMAIS par la base de données PTF
```

---

## Vue d'ensemble

```
CLIENTS (Entreprises + Développeurs)
         |
         v
PTF FRONTEND (Next.js + TailwindCSS)
  - Dashboard développeur multi-projets (countdowns, urgence)
  - Interface de configuration des tâches (critères, punitions, durée)
         |
         v
PTF BACKEND (Node.js + TypeScript + GraphQL)
  - Auth Service          (GitHub OAuth + Wallet)
  - Project Service       (création, moteur d'évaluation du coût)
  - Task Service          (Merkle, dépendances, anti-collision Redis, broadcast réseau)
  - PunishmentService     (détection violations, calcul pénalités, exécution déductions)
  - EscrowService         (releaseTaskReward on-chain, unlock soft-lock, ContributorRecord)
  - ValidationService     (exécution verificationSteps, résultats DB, transitions statut)
  - TimerService          (cron jobs expiration tâches, alertes deadline)
  - Review Service        (tests auto + peer review)
  - Reputation Engine     (scores + historique)
  - CLI Handler           (sync GitHub <-> PTF)
  - Dispute Service       (arbitrage DAO)
  - Notification Service       (webhooks/events + alertes deadline 24h/48h/72h)
  - TaskGeneratorService       (parse ARCHITECTURE.md + PLAN_ACTION.md, génère arbre tâches via ILLMProvider configuré par l'utilisateur, vérifie cohérence dépendances, calcule estimations reward)
  - DocumentGeneratorService   (génération interactive des docs via ptf describe/fix-docs, interview guidée, corrections ciblées depuis validate-docs, scaffold depuis repo existant)
  - WalletVerificationService  (format EIP-55, activation on-chain, solde PTF, ban, ownership EIP-712)
  - ReportService              (signalements développeurs, escalade vers équipe PTF, décision ban exclusive PTF)
  - CurrencyConverter          (conversion devises fiat/crypto → USDC → PTF credits via oracle Chainlink)
  - ProjectManagerView         (visibilité créateur sur les tâches réclamées de ses projets)
         |
         +---------------------------+
         |                           |
         v                           v
  PostgreSQL + Redis        BLOCKCHAIN ABSTRACTION LAYER (BAL)
  [métadonnées seulement]    ChainRegistry → ChainAdapter (chaîne configurée)
  Pas de code source !         - ProjectRegistry    (claimTask, Merkle, rewardMode)
  Redis A (Sentinel) :         - EscrowVault        (soft-lock 10 PTF, punitions — projets paid uniquement)
    locks Redlock, sessions,   - CreditToken        (EIP-712 permit, crédits signés)
    rate limiting              - ReputationRegistry (toujours actif, free et paid)
  Redis B (Cluster) :
    BullMQ queues, cache             Chaîne par défaut : configurable (Polygon, Ethereum, BSC…)

DÉPÔTS DE CODE (externes à la DB PTF)
  Cas 1 — GitHub public      : github.com/owner/repo  (PR standard)
  Cas 2 — Self-hosted privé  : git.enterprise.com/repo (via PTF Agent)
  Cas 3 — Repo PTF temp      : ptf-temp://projectId   (sync auto au reconnect)

PTF AGENT (projets self-hosted + ptf-temp)
  Serveur léger certifié hébergé par l'entreprise
  Reçoit soumission dev (chiffrée) -> sandbox gVisor -> exécute tests
  -> retourne UNIQUEMENT la preuve signée (résultats) à PTF Backend
  -> pousse le CODE vers repo créateur ou repo temp PTF (jamais vers la DB)

RÉSEAU PTF (broadcast décentralisé)
  Nœuds publics + agents entreprises
  Diffusion des tâches ouvertes (publiques en clair, privées avec métadonnées uniquement)
```

---

## Schéma de tâche complet

Le schéma suivant représente l'interface `Task` complète, intégrant les champs existants et les nouveaux champs introduits par les fonctionnalités décrites dans ce document.

### Modes de projet

```typescript
type ProjectRewardMode = "free" | "paid";

interface Project {
  type:       "public" | "private";
  rewardMode: ProjectRewardMode;  // "free" = non-rémunéré, "paid" = rémunéré
  // Règle : un projet privé est TOUJOURS "paid"
  //         un projet public peut être "free" ou "paid"
}
```

**Matrice des règles selon le mode :**

| Règle | Public free | Public paid | Private (toujours paid) |
|---|---|---|---|
| Escrow USDC | Non | Oui | Oui |
| Reward USDC par tâche | Non (0) | Oui | Oui |
| Garantie 10 PTF requis | Non | Oui | Oui |
| Pénalité crédits | Non | Oui | Oui |
| Pénalité réputation | Oui | Oui | Oui |
| Critères de réclamation | Configurables | Configurables | Configurables |
| Commission PTF (grille dégressive 8–12%) | Non | Oui | Oui |

**Grille dégressive de commission PTF :**

| Tranche reward pool        | Taux de commission |
|----------------------------|--------------------|
| < 5 000 USDC               | 12 %               |
| 5 000 – 50 000 USDC        | 10 %               |
| > 50 000 USDC              | 8 %                |

### Interface Task

```typescript
interface Task {
  // Identité
  taskId: string;           // keccak256(projectId + parentId + metadata + nonce)
  projectId: string;
  parentId: string | null;
  networkId: string;

  // Description (obligatoires, vérifiés par ptf validate-docs)
  title: string;
  context: string;          // Situation actuelle : ce qui existe déjà, état du code, environnement
  objective: string;        // Ce qui doit être accompli : résultat attendu précis et mesurable
  deliverable: string;      // Livrable concret : fichier(s) créé(s)/modifié(s), fonctions exposées
  outOfScope: string[];     // Ce qui est explicitement HORS SCOPE (évite le gold-plating)

  // Classification
  type: TaskType;
  priority: Priority;
  status: TaskStatus;       // "created" | "open" | "claimed" | "submitted" | "under_review"
                            // | "validated" | "rejected" | "disputed" | "expired"

  // Contraintes
  constraints: {
    maxFiles: number;
    maxLinesPerFile: number;
    maxTotalLines: number;
    requiredTests: boolean;
    minTestCoverage: number;
    languages: string[];
    languageVersion?: string;
    forbiddenPatterns: string[];
  };

  // Vérification automatique
  verificationSteps: VerificationStep[];

  // Réclamation
  claimCriteria: ClaimCriteria;
  duration: string;         // ex. "30d", "14d" — configurable par le créateur (défaut: "30d")
  claimedAt?: Date;         // timestamp du claim → déclenche le timer
  deadline?: Date;          // calculé: claimedAt + duration
  devAddress?: string;      // wallet du développeur ayant claim la tâche

  // Récompense (absent si projet free)
  reward?: {
    amount: number;
    token: "USDC";
  };

  // Scoring et réputation
  // complexity, effort, impact : configurés par le créateur (1-5)
  // reputationPoints : calculé AUTOMATIQUEMENT par le ReputationEngine PTF (non configurable)
  scoring: {
    complexity: 1|2|3|4|5;  // configuré par le créateur
    effort:     1|2|3|4|5;  // configuré par le créateur
    impact:     1|2|3|4|5;  // configuré par le créateur
    // reputationPoints → calculé automatiquement par PTF, non configurable
  };

  // Punitions configurables (définies par le créateur du projet)
  // Projets free (public non-rémunéré) : uniquement réputation (pas de crédits)
  // Projets paid (public rémunéré ou privé) : crédits + réputation
  // Note : le bannissement N'EST PAS configurable par le créateur — droit exclusif PTF
  punishments: Punishments;
  // Pour les projets free : credits absent (undefined) sur chaque violation
  // Pour les projets paid : credits présent et > 0 sur chaque violation configurée

  // Dépendances
  dependencies: string[];   // taskIds dont le statut doit être "validated" avant claim
  blockedBy: string[];
  unlocks: string[];

  // Exemples et spec (optionnels)
  examples?: { input: string; expectedOutput: string; description: string }[];
  technicalSpec?: string;   // Lien vers spec technique ou extrait inline

  // Métadonnées
  acceptanceCriteria: string[];
  deadline_soft?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Note :** Le champ `rewardWeight: number` (ancien multiplicateur) est supprimé du schéma canonique. Le calcul de la récompense se fait via l'objet `scoring` (complexity × impact × effort) et le `reward.amount` résultant.

**Note sur les crédits PTF :** Les crédits PTF sont des nombres flottants (`float64`) avec une précision de 6 décimales (aligné sur USDC `decimals: 6`). Le montant minimum de retrait est `1.0 PTF`. Dans `CreditToken.sol`, utiliser `uint256` avec 6 décimales (comme USDC, pas 18 comme ETH). Le frontend affiche toujours les crédits en float.

```typescript
// Crédits PTF : float64, précision 6 décimales (comme USDC)
type PTFCredit = number; // ex: 10.50, 0.001, 150.123456

interface CreditBalance {
  address:     string;
  balance:     number;  // float64, ex: 10.50 PTF
  softLocked:  number;  // float64, montant soft-locked
  available:   number;  // balance - softLocked
}

const MIN_WITHDRAWAL = 1.0;   // Montant minimum de retrait
const CREDIT_DECIMALS = 6;    // Précision : 6 décimales (aligné sur USDC)
```

**Note sur le scoring et la réputation :** Le créateur configure uniquement `complexity`, `effort` et `impact` (valeurs 1-5). Les `reputationPoints` sont calculés **automatiquement** par le `ReputationEngine` PTF — ils ne sont pas configurables par le créateur.

**Principe de vérifiabilité :** Une tâche est complète si et seulement si l'ensemble de ses `verificationSteps` passent. Aucune validation subjective n'est possible : chaque étape est une commande exécutable retournant un résultat binaire (pass / fail) ou numérique comparé à un seuil.

**Exemple de tâche enrichie avec les nouveaux champs :**

```yaml
context: >
  Le service Auth existe déjà (src/auth/). Le module de validation de token
  n'est pas encore implémenté. L'interface JWTValidator est définie dans
  src/auth/interfaces.ts mais n'a aucune implémentation concrète.

objective: >
  Implémenter la classe JWTValidator qui vérifie la signature, l'expiration
  et les claims requis d'un token JWT RS256. Couverture de tests >= 90%.

deliverable: >
  Fichier créé : src/auth/jwt-validator.ts
  Fonctions exposées : JWTValidator.verify(token: string): DecodedToken
  Tests créés : src/auth/__tests__/jwt-validator.test.ts

outOfScope:
  - Implémentation du refresh token (tâche séparée : auth-refresh)
  - Migration de la base de données
  - Modification de l'interface JWTValidator existante

verificationSteps:
  - type: type_check
    command: "npx tsc --noEmit"
    expectedOutput: ""                    # aucune erreur TypeScript
  - type: unit_test
    command: "npx jest src/auth/__tests__/jwt-validator.test.ts --coverage"
    threshold: 90                          # coverage >= 90%
  - type: lint
    command: "npx eslint src/auth/jwt-validator.ts"
    expectedOutput: ""
  - type: integration_test
    command: "npx jest src/auth/__tests__/jwt-validator.integration.test.ts"
```

### Validation des verificationSteps — Allowlist commandes (C-05)

Les `verificationSteps` sont générées automatiquement par le LLM de l'utilisateur (via `ILLMProvider`) et peuvent également être fournies directement par les créateurs de projets. Avant toute exécution dans le sandbox, **chaque commande doit être validée contre une allowlist stricte**.

```typescript
// Allowlist stricte des commandes autorisées dans verificationSteps
const COMMAND_ALLOWLIST: Record<string, string[]> = {
    node:    ['npm test', 'npm run test', 'npx jest', 'npx vitest', 'npx mocha'],
    python:  ['pytest', 'python -m pytest', 'python -m unittest'],
    rust:    ['cargo test', 'cargo clippy', 'cargo build'],
    go:      ['go test ./...', 'go build', 'go vet'],
    java:    ['mvn test', 'gradle test'],
    lint:    ['npm run lint', 'npx eslint', 'npx prettier --check', 'npx tsc --noEmit'],
    docker:  ['docker build'],
};

function validateVerificationStep(step: VerificationStep): boolean {
    const isAllowed = Object.values(COMMAND_ALLOWLIST)
        .flat()
        .some(allowed => step.command.startsWith(allowed));

    if (!isAllowed) {
        log.warn(`Blocked command in verificationStep: ${step.command}`);
        return false;
    }
    return true;
}

// Règles sandbox gVisor
const SANDBOX_RULES = {
    networkAccess: false,        // AUCUN accès réseau sortant
    maxExecutionTime: 300,       // 5 minutes max
    maxMemory: '512M',
    readOnlyFilesystem: true,    // sauf /tmp
    allowedSyscalls: 'gvisor-default',
};
```

Toute commande absente de l'allowlist est rejetée avant l'exécution. Le PTF Agent ne démarre jamais un `verificationStep` dont la commande n'a pas passé cette validation.

---

## Flow de réclamation d'une tâche

Le flow de réclamation se déroule en quatre étapes : liste, consultation, demande de claim avec confirmation, et attribution. Les conditions sont acceptées cryptographiquement au moment du claim (étape 3) — il n'y a pas d'étape d'acceptation séparée.

Le flow diffère selon le mode du projet (`free` ou `paid`).

### Flow — Projet free (public non-rémunéré)

```
1. ptf tasks list                    ← lister les tâches disponibles (avec filtres)

2. ptf task show <taskId>            ← voir le détail d'une tâche
   → Affiche les détails de la tâche (pas de vérification de solde PTF pour free)

3. ptf task claim <taskId>           ← demander la tâche
   → Étape 1 : Vérification wallet (format, activé, token gas, non banni, ownership)
   → Étape 2 : Vérification claimCriteria (configurés par le responsable du projet)
   → Étape 3 : Si tout ok → affiche conditions complètes + demande confirmation
     → Affichage interactif :
       "Conditions de la tâche [taskId] — Projet public (non-rémunéré) :
        - Durée : 30 jours (deadline : 2026-08-28)
        - Reward : aucun (contribution open source)
        - Pénalités réputation : retard -10 pts, bug critique -30 pts
        - Langue requise : TypeScript
        - Tests requis : couverture > 80%
        Acceptez-vous ces conditions ? [o/N]"
   → PAS de vérification solde PTF (free = pas de garantie)
   → PAS de soft-lock PTF

4. Dev confirme → attribution de la tâche
   → Signature EIP-712 des conditions (automatique à la confirmation)
   → Enregistrement on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
   → Statut : open → claimed
```

### Flow — Projet paid (public rémunéré ou privé)

```
1. ptf tasks list                    ← lister les tâches disponibles (avec filtres)

2. ptf task show <taskId>            ← voir le détail d'une tâche
   → Pré-vérification IMMÉDIATE : solde PTF ≥ 10 crédits (uniquement pour paid)
   → Si insuffisant → erreur "Solde insuffisant. Minimum 10 PTF requis. Déposez des crédits: ptf wallet deposit"
   → Si ok → affiche les détails de la tâche

3. ptf task claim <taskId>           ← demander la tâche
   → Étape 1 : Vérifier solde PTF ≥ 10          ← PREMIER (barrière rapide, uniquement pour paid)
     → Si non : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
   → Étape 2 : Vérifier wallet (format, activé, token gas, non banni, ownership)
   → Étape 3 : Vérifier claimCriteria (configurés par le responsable du projet)
   → Étape 4 : Si tout ok → système envoie les conditions complètes + demande confirmation
     → Affichage interactif :
       "Conditions de la tâche [taskId] — Projet rémunéré :
        - Durée : 30 jours (deadline : 2026-08-28)
        - Reward : 150 USDC (libéré à validation)
        - Garantie requise : 10 PTF (soft-locked pendant la tâche)
        - Pénalités : retard -20 crédits/-10 rép, bug critique -50 crédits/-30 rép
        - Langue requise : TypeScript 5.0+
        - Tests requis : couverture > 80%
        Acceptez-vous ces conditions ? [o/N]"

4. Dev confirme → attribution de la tâche
   → Signature EIP-712 des conditions (automatique à la confirmation)
   → Enregistrement on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
   → EscrowVault.softLock(dev, 10 PTF)
   → Statut : open → claimed
```

### Ce que couvre la signature lors du claim

La signature EIP-712 automatique porte sur l'intégralité des conditions affichées :

- Contraintes de soumission (`maxFiles`, `minTestCoverage`, `languages`, etc.)
- Système de punitions configuré (`lateDelivery`, `maliciousCode`, `criticalBug`, `nonCriticalBug`)
- Durée et deadline calculée
- Critères de vérification automatique (`verificationSteps`)
- Conditions de paiement (reward USDC)

### Structure `TaskClaim`

```typescript
interface TaskClaim {
  taskId:         string;
  devAddress:     string;
  claimedAt:      Date;
  deadline:       Date;            // claimedAt + duration
  conditionsHash: string;          // Hash des conditions acceptées
  signature:      string;          // EIP-712 automatique à la confirmation
}
```

`conditionsHash` est un hash déterministe calculé côté backend à partir des données exactes de la tâche au moment du claim. Si les conditions de la tâche changent après le claim, le `conditionsHash` stocké on-chain ne correspond plus — toute contestation postérieure est objectivement tranchable.

### Enregistrement on-chain

```solidity
// ProjectRegistry
function claimTask(
    bytes32 taskId,
    address devAddress,
    bytes32 conditionsHash
) external onlyBackend;
// Stocke le claim avec hash des conditions, émet TaskClaimed(taskId, devAddress, conditionsHash, deadline)
```

### Commandes CLI

```bash
ptf tasks list                    # liste les tâches disponibles (avec filtres)
ptf task show <taskId>            # pré-vérifie solde, affiche toutes les conditions
ptf task claim <taskId>           # vérifie critères, affiche conditions, demande confirmation, signe et claim
```

---

## Vérification du wallet

Avant toute opération impliquant le wallet (claim, withdraw, accept), le `WalletVerificationService` exécute six vérifications dans l'ordre. Toute vérification bloquante empêche l'opération.

### Vérifications

```typescript
interface WalletVerification {
  isValidAddress:  boolean;   // 1. Format EIP-55 checksum valide (regex EVM standard)
  isActivated:     boolean;   // 2. Au moins 1 transaction on-chain (wallet actif)
  hasGasFees:      boolean;   // 3. Solde token natif > seuil gas (recommandé pour les gas fees, seuil selon chaîne configurée)
  isNotBanned:     boolean;   // 4. Wallet non banni (AuthService)
  ownershipProven: boolean;   // 5. Dev a signé un nonce avec sa clé privée (prouve ownership)
}
```

Note : `meetsMinBalance` (solde PTF >= 10) n'est pas inclus dans le `WalletVerificationService` — pour les projets paid, cette vérification est effectuée en amont (première barrière avant tout le reste lors d'un claim). Pour les projets free, aucune vérification de solde PTF n'est effectuée.

### Erreurs bloquantes

Les vérifications suivantes sont bloquantes — elles empêchent toute opération :

| Condition | Erreur retournée | Applicable |
|-----------|------------------|------------|
| Solde PTF < 10 | `INSUFFICIENT_PTF_BALANCE` — vérifié en premier, avant le wallet | Projets paid uniquement |
| Wallet non activé | `WALLET_NOT_ACTIVATED` | Tous projets |
| Wallet banni | `WALLET_BANNED` | Tous projets |
| Ownership non prouvé | `OWNERSHIP_NOT_PROVEN` | Tous projets |

Le solde en token natif insuffisant (`hasGasFees = false`) est un avertissement, pas une erreur bloquante : l'opération peut continuer mais risque d'échouer on-chain.

### Flux de vérification

```
ptf wallet verify [--address 0x...]
         |
         v
[Pré-vérification solde PTF — uniquement pour projets paid, avant WalletVerificationService]
  CreditToken.balanceOf(address) >= 10 ?
  → Si non (et contexte paid) : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
         |
         v (si applicable)
WalletVerificationService.verify(address)
         |
         +─→ 1. Regex EIP-55 checksum
         +─→ 2. RPC (chaîne configurée) : txCount > 0 ?
         +─→ 3. RPC (chaîne configurée) : solde token natif > seuil gas ?
         +─→ 4. AuthService.isBanned(address) ?
         +─→ 5. Nonce signé → vérif signature ECDSA
         |
         v
Rapport détaillé :
  [OK]   Solde PTF      : 245 crédits (minimum 10 requis pour projets paid)
  [OK]   Format adresse : valide (EIP-55)
  [OK]   Wallet activé  : 47 transactions on-chain
  [WARN] Solde gas      : 0.008 (recommandé : > 0.01, token natif de la chaîne configurée)
  [OK]   Statut         : non banni
  [OK]   Ownership      : prouvé (signature validée)
```

### Commandes CLI

```bash
ptf wallet verify [--address 0x...]   # vérifie toutes les conditions, affiche rapport
ptf wallet status                     # état détaillé du wallet connecté
```

---

## Anonymisation des projets privés

Les projets de type `private` sont **systématiquement anonymisés** dans toutes les API publiques et dans le réseau PTF. L'anonymisation protège l'identité du client, l'entreprise commanditaire et les détails techniques sensibles.

### Vue publique d'un projet (`PublicProjectView`)

```typescript
interface PublicProjectView {
  // Toujours visibles (projets publics et privés)
  projectId:        string;
  networkId:        string;
  type:             "public" | "private";
  rewardMode:       "free" | "paid";       // mode de rémunération
  taskCount:        number;
  openTaskCount:    number;
  totalRewardPool:  string;          // en USDC (0 ou "N/A" pour les projets free)
  averageTaskReward: string;         // "0" ou "N/A" pour les projets free
  stack:            string[];        // langages/frameworks (non anonymisés)
  createdAt:        Date;

  // Champs anonymisés pour projets privés
  name:             string;          // public: nom réel  | privé: "Private Project #4f2a"
  owner:            string;          // public: 0xABCD…  | privé: "0x****...****"
  description:      string;          // public: réelle    | privé: résumé générique
  repository?:      string;          // public: URL GitHub | privé: null
  enterprise?:      string;          // public: nom entreprise | privé: null
}
```

### Vue publique d'une tâche (`PublicTaskView`)

```typescript
interface PublicTaskView {
  // Toujours visibles
  taskId:            string;
  projectId:         string;
  type:              string;
  rewardMode:        "free" | "paid"; // mode de rémunération de la tâche
  priority:          string;
  title:             string;          // titre réel conservé (nécessaire pour le claim)
  reward:            { amount: string; token: "USDC" } | null; // null si rewardMode == "free"
  duration:          string;
  claimCriteria:     ClaimCriteria;
  punishments:       Punishments;
  verificationSteps: VerificationStep[];  // commandes masquées si elles révèlent l'infra
  status:            TaskStatus;
  dependencies:      string[];

  // Anonymisés pour projets privés
  projectName:       string;         // "Private Project #4f2a"
  context:           string;         // contexte technique uniquement, sans nom client
}
```

Pour les projets privés, les commandes dans `verificationSteps` sont masquées si elles révèlent des chemins d'infrastructure internes (`command: "[HIDDEN]"`). Les seuils et types restent visibles pour permettre au développeur d'évaluer la tâche.

### Règle d'anonymisation

```
type projet = "public"  →  toutes les données en clair
type projet = "private" →  anonymisation systématique dans toutes les API publiques,
                            le réseau PTF et les logs exportés
```

Le `projectId` et le `networkId` restent toujours visibles : ils sont nécessaires pour que les développeurs puissent soumettre un claim et que le réseau PTF puisse dédupliquer les broadcasts.

---

## Listing des projets et tâches

### Requêtes GraphQL

```graphql
# Lister tous les projets (projets privés automatiquement anonymisés)
query ListProjects($filter: ProjectFilter) {
  projects(filter: $filter) {
    projectId
    type
    rewardMode       # "free" ou "paid"
    name             # anonymisé si privé : "Private Project #4f2a"
    owner            # anonymisé si privé : "0x****...****"
    openTaskCount
    totalRewardPool  # "N/A" si rewardMode == "free"
    stack
    status
  }
}

# Lister les tâches disponibles
query ListTasks($filter: TaskFilter) {
  tasks(filter: $filter) {
    taskId
    projectId
    projectName      # anonymisé si projet privé
    title
    rewardMode       # "free" ou "paid"
    reward           # null si rewardMode == "free"
    priority
    duration
    claimCriteria
    status
  }
}
```

### Filtres disponibles

```typescript
interface TaskFilter {
  status?:       TaskStatus;
  projectType?:  "public" | "private" | "all";
  rewardMode?:   "free" | "paid" | "all";  // filtrer par mode de récompense
  minReward?:    number;
  maxReward?:    number;
  skills?:       string[];
  priority?:     Priority;
  projectId?:    string;
}
```

### Commandes CLI

```bash
ptf projects list                               # tous les projets (privés anonymisés)
ptf projects list --type public                 # projets publics uniquement
ptf projects list --mine                        # projets du créateur connecté (avec IDs)
ptf tasks list                                  # toutes les tâches open
ptf tasks list --project <projectId>            # tâches d'un projet
ptf tasks list --min-reward 50 --skill typescript
ptf tasks mine                                  # tâches réclamées par le dev connecté
ptf tasks mine --status in_progress
```

---

## Listing et vérification des contributeurs

Le listing des contributeurs est réservé aux **projets publics**. Pour les projets privés, toute tentative renvoie l'erreur `PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN`.

### Requêtes GraphQL (projets publics uniquement)

```graphql
# Contributeurs d'un projet public
query ProjectContributors($projectId: String!) {
  projectContributors(projectId: $projectId) {
    devAddress
    githubHandle
    tasksCompleted
    totalEarned      # USDC
    reputationScore
    joinedAt
    lastActivity
  }
}

# Vérifier un contributeur spécifique
query VerifyContributor($projectId: String!, $devAddress: String!) {
  verifyContributor(projectId: $projectId, devAddress: $devAddress) {
    isActive
    completedTaskIds
    reputation
    verified         # signature on-chain
  }
}
```

### Commandes CLI

```bash
ptf contributors list <projectId>                   # liste les contributeurs d'un projet public
ptf contributors verify <projectId> <address>       # vérifie un contributeur spécifique

# Projet privé → erreur :
ptf contributors list <privateProjectId>
# Erreur : PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN
```

---

## Modes de création de projet

Avant d'entrer dans le flux technique de génération, PTF propose trois modes pour rédiger les fichiers `ARCHITECTURE.md` et `PLAN_ACTION.md`. Les trois modes convergent vers `ptf validate-docs` comme filet de sécurité commun.

```
Mode 1 — Manuel (utilisateur expert)
  Rédige ARCHITECTURE.md + PLAN_ACTION.md directement
  depuis les templates PTF, puis ptf validate-docs

Mode 2 — Interactif (vibecoder sans IA)
  ptf describe → questions guidées → fichiers générés
  ptf fix-docs → corrections ciblées si validate-docs échoue

Mode 3 — IA-assisté (vibecoder + IA)
  L'IA génère les fichiers depuis les templates PTF comme contexte
  ptf validate-docs comme filet de sécurité final

Mode 4 — Import GitHub Issues (< 15 minutes)
  ptf import-issues --repo owner/repo --label "help wanted"
  → PTF récupère les issues labellisées
  → Génère des tâches PTF depuis les titres/descriptions des issues
  → ptf validate-docs --auto (validation allégée, warnings non-bloquants pour le 1er projet)
  → ptf tasks preview → ptf tasks publish

Note : `ptf validate-docs --auto` passe en mode non-bloquant (warnings seulement)
pour le premier projet d'un créateur. Les erreurs critiques de format restent bloquantes.
```

### Flux complet à 4 modes (vue d'ensemble)

```
┌─────────────────────────────────────────────────────────────┐
│ MODE 1 — Expert                                             │
│ Rédige ARCHITECTURE.md + PLAN_ACTION.md manuellement        │
│ depuis les templates PTF                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│ MODE 2 — Interactif                                         │
│ ptf describe → questions guidées → fichiers générés         │
│ ptf fix-docs → corrections si validate-docs échoue         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│ MODE 3 — IA-assisté (recommandé pour vibecoders)           │
│ /ptf-architect "description" dans ton éditeur IA           │
│ → IA génère les fichiers conformes PTF                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│ MODE 4 — Import GitHub Issues (< 15 minutes)               │
│ ptf import-issues --repo owner/repo --label "help wanted"  │
│ → Tâches PTF générées depuis les issues labellisées        │
│ → ptf validate-docs --auto (warnings non-bloquants)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
              ptf validate-docs (commun aux 4 modes)
              [--auto en mode 4 : warnings seulement pour le 1er projet]
                           ↓
              ptf init --name ... --chain ...
                           ↓
              ptf generate --project <id>
                           ↓
              ptf tasks preview → ptf tasks publish
```

---

## Flux de pré-création : création du projet et génération de tâches

Avant de publier des tâches sur le réseau PTF, deux phases sont obligatoires : la création du projet (qui génère le `projectId`) puis la génération des tâches (qui requiert ce `projectId`).

### Flux global

**Flow canonique pré-création** (`ptf validate-docs` → `ptf init` → `ptf generate`) :

```
[Rédaction / Génération des MD]
  ptf scaffold / ptf describe / /ptf-architect
          ↓
ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
  → Vérifie les 7 sections obligatoires ARCHITECTURE.md + sections PLAN_ACTION.md
  → Retourne erreurs (FAIL bloquant / WARN non bloquant)
  → On valide les fichiers MD AVANT de créer le projet (pas besoin de project_id pour valider)
          ↓ (si valide)
ptf init --name "mon-projet" --type ... --chain ...
  → ProjectID généré automatiquement
          ↓
ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
          ↓
ptf tasks preview --project <projectId>
          ↓
ptf tasks publish --project <projectId>
```

**Détail des étapes :**

```
[Phase 1 — Validation et création du projet]

  1. Rédiger ARCHITECTURE.md   ← format standard PTF (7 sections obligatoires)
  2. Rédiger PLAN_ACTION.md    ← format standard PTF (sections obligatoires)
  3. ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
     → Vérifie que les 2 MD respectent le format standard PTF
     → Retourne les erreurs de format éventuelles (FAIL bloquant / WARN non bloquant)
          │
          ↓ (si valide)
  4. ptf init --name "mon-projet" --type public --reward free [--language typescript] [--chain polygon]
     ptf init --name "mon-projet" --type public --reward paid [--language typescript] [--chain ethereum]
     ptf init --name "mon-projet" --type private [--language typescript] [--chain bsc]  # toujours paid
     → ProjectID généré : keccak256(ownerAddress + projectName + timestamp)
     → ProjectID affiché + sauvegardé dans .ptf/config.json (inclut chainId)
     → Projet créé sur la plateforme PTF (statut: draft)

[Phase 2 — Génération des tâches]

          │
          ↓
  5. ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
     → Utilise les 2 MD pour générer l'arbre de tâches via le LLM configuré par l'utilisateur
     → Affiche estimation : nb tâches, reward pool suggéré, commission PTF (grille 8–12%)
     → Demande confirmation avant de continuer
          │
          ↓ (si confirmé)
  6. ptf tasks preview --project <projectId>
     → Revue humaine des tâches générées (avant paiement)
     → Permet de modifier/supprimer des tâches
          │
          ↓ (si approuvé)
  7. ptf tasks publish --project <projectId>
     → Si paid : Calcule le coût total (reward pool + commission PTF selon grille dégressive 8–12%)
                 Demande paiement upfront (USDC → EscrowVault)
     → Si free : Aucun paiement requis
     → Publie les tâches dans le réseau PTF
```

### Commande `ptf generate`

```bash
ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
```

**Prérequis :** `ptf init` doit avoir été exécuté — le `projectId` doit exister dans `.ptf/config.json` ou être fourni explicitement.

**Entrées requises :**
- `--project <projectId>` — identifiant du projet déjà créé via `ptf init`
- `ARCHITECTURE.md` — décrit la structure technique du projet (format PTF strict)
- `PLAN_ACTION.md` — décrit les phases, livrables et dépendances (format PTF strict)

Avant de générer, cette commande affiche automatiquement une estimation ROI :

```
╔══════════════════════════════════════════════════════════╗
║  PTF — Estimation du projet                              ║
╠══════════════════════════════════════════════════════════╣
║  Tâches estimées       : ~47 tâches                      ║
║  Effort total estimé   : ~320 heures-dev                 ║
║  Reward pool suggéré   : 8 500 USDC                      ║
║  Commission PTF (10%)  : 850 USDC   ← tranche 5k–50k    ║
║  Total à déposer       : 9 350 USDC                      ║
╠══════════════════════════════════════════════════════════╣
║  Grille commission PTF :                                 ║
║    < 5 000 USDC      → 12 %                              ║
║    5 000–50 000 USDC → 10 %  ← applicable ici           ║
║    > 50 000 USDC     →  8 %                              ║
╠══════════════════════════════════════════════════════════╣
║  Décomposition par phase :                               ║
║  Smart Contracts  : 8 tâches  ~1 800 USDC                ║
║  Backend          : 18 tâches ~3 200 USDC                ║
║  CLI              : 9 tâches  ~1 500 USDC                ║
║  Frontend         : 12 tâches ~2 000 USDC                ║
╠══════════════════════════════════════════════════════════╣
║  Ratio effort/récompense : OK Attractif (18 USDC/h)      ║
╚══════════════════════════════════════════════════════════╝

→ Continuer la génération ? [o/N]
```

Le rapport permet à l'entreprise de vérifier que les récompenses sont attractives **avant** tout dépôt d'escrow. Si le ratio effort/récompense est insuffisant, l'entreprise ajuste son reward pool avant de confirmer.

**Ce que le `TaskGeneratorService` exécute :**

```
1. Parse ARCHITECTURE.md
   → Extrait : modules, interfaces, dépendances techniques, stack, contraintes

2. Parse PLAN_ACTION.md
   → Extrait : phases, objectifs, jalons, livrables vérifiables, hors-scope

3. Génère un arbre de tâches avec IDs crypto chaînés (Merkle), lié au projectId

4. Pour chaque tâche générée :
   → Remplit : context, objective, deliverable, outOfScope
   → Génère : verificationSteps (commandes exécutables)
   → Calcule : dependencies, blockedBy (graphe DAG)
   → Hérite : codeLanguage de la config projet (sauf override au niveau tâche)
   → Suggère : reward selon complexité/effort estimés

5. Vérifie la cohérence du graphe (pas de cycles, dépendances résolvables)

6. Génère tasks.json lié au projectId, vérifiable et prêt pour ptf tasks preview
```

### Exigences sur les fichiers d'entrée

Pour que `ptf validate-docs`, `ptf estimate` et `ptf generate` fonctionnent correctement, les deux fichiers MD **doivent** respecter un format PTF strict.

#### Sections obligatoires ARCHITECTURE.md validées par `ptf validate-docs`

La liste canonique des 7 sections obligatoires :

1. `## Objectif du projet` — description 1-3 phrases + critère mesurable + public cible
2. `## Hors-scope` — minimum 3 items explicites
3. `## Modules / Composants` — tableau Nom | Rôle | Inputs | Outputs | Dépend de
4. `## Interfaces` — blocs TypeScript pour chaque interface exposée
5. `## Contraintes techniques` — Performance + Sécurité + Compatibilité + Couverture tests
6. `## Dépendances d'implémentation` — ordre entre modules
7. `## Glossaire` — termes spécifiques au projet

| Section | Contenu attendu |
|---------|-----------------|
| `## Objectif du projet` | Description 1-3 phrases + critère mesurable + public cible |
| `## Hors-scope` | Minimum 3 items explicites (évite le gold-plating) |
| `## Modules / Composants` | Tableau Nom \| Rôle \| Inputs \| Outputs \| Dépend de |
| `## Interfaces` | Blocs TypeScript pour chaque interface exposée |
| `## Contraintes techniques` | Performance + Sécurité + Compatibilité + Couverture tests (valeurs mesurables) |
| `## Dépendances d'implémentation` | Ordre entre modules (graphe d'implémentation) |
| `## Glossaire` | Termes spécifiques au projet |

#### PLAN_ACTION.md — sections obligatoires

| Section | Contenu attendu |
|---------|-----------------|
| `## Objectif du projet` | Description en 1-3 phrases + critère de succès mesurable |
| `## Phases` | Chaque phase avec objectif, jalons et livrables vérifiables |
| `## Hors-scope` | Ce qui n'est pas dans ce projet (liste exhaustive) |
| `## Critères de succès globaux` | Comment déterminer objectivement que le projet est terminé |

**Règles de qualité des descriptions :**
- Chaque section doit être compréhensible par quelqu'un qui n'a jamais vu le projet
- Éviter les termes vagues ("améliorer", "optimiser") — préférer les mesurables ("latence < 200 ms", "couverture > 80 %")
- Chaque composant/module doit exposer : rôle, inputs, outputs, contraintes

---

## Project ID — génération et consultation

### Génération automatique

Le `projectId` est calculé automatiquement par le backend au moment du `ptf init`. Le créateur n'a jamais à le saisir manuellement.

```typescript
const projectId = keccak256(
  abi.encodePacked(ownerAddress, projectName, timestamp)
);
```

Unique par triplet (owner + nom + timestamp). Affiché à l'écran à la création et sauvegardé dans `.ptf/config.json` dans le répertoire du projet.

### Stockage local

```json
// .ptf/config.json (dans le repo, commité avec le projet)
{
  "projectId": "0x4f2a...",
  "projectName": "mon-projet",
  "ownerAddress": "0x...",
  "type": "public",
  "rewardMode": "paid",
  "chainId": "polygon",
  "stablecoin": "USDC",
  "createdAt": "2026-07-28T..."
}
```

### Consultation

```bash
ptf projects list --mine              # liste tous les projets du créateur avec leurs IDs
ptf project info                      # dans le répertoire du projet → affiche project_id depuis .ptf/config.json
ptf project info --id <projectId>     # info d'un projet par ID depuis n'importe où
```

---

## Langue du code — configuration

La langue de développement est configurable à deux niveaux : au niveau projet (défaut pour toutes les tâches) et au niveau tâche (override du projet).

### Configuration au niveau projet

```typescript
interface ProjectConfig {
  // ...
  codeLanguage: {
    primary:    string;       // ex: "TypeScript"
    allowed:    string[];     // ex: ["TypeScript", "JavaScript"]
    forbidden:  string[];     // ex: ["Python", "Go"]
    version?:   string;       // ex: "5.0+"
  };
}
```

Configurable à la création du projet :

```bash
ptf init --name "mon-projet" --type public --reward paid --language typescript
# ou --reward free pour un projet open source non-rémunéré
```

### Override au niveau tâche

Le champ `constraints.languages` dans l'interface `Task` permet de surcharger la config projet pour une tâche spécifique (voir schéma `Task` ci-dessus).

### Affichage dans les conditions de claim

Lors de `ptf task claim <taskId>`, les conditions affichées incluent :

```
- Langue requise : TypeScript 5.0+
- Langages interdits : Python, Go, PHP
```

---

## Skill PTF pour IA (Mode 3 — intégration native)

PTF expose un skill officiel utilisable dans les éditeurs IA (Claude Code, Cursor, Copilot, etc.) via la commande `/ptf-architect`. Ce skill injecte les templates et les règles PTF directement dans le contexte de l'IA pour garantir que les fichiers générés passent `ptf validate-docs`.

### Utilisation

```
/ptf-architect "description du projet"
```

Exemple :

```
/ptf-architect "app de location d'outils entre voisins, React Native + Node.js + PostgreSQL"
      ↓
IA génère ARCHITECTURE.md + PLAN_ACTION.md conformes PTF
      ↓
ptf validate-docs   ← filet de sécurité (souvent ✅ direct)
      ↓
ptf init --name "mon-projet" --type public --reward paid   ← génère le projectId
      ↓
ptf generate --project <id>   ← tâches générées
      ↓
ptf tasks preview   ← revue rapide
      ↓
ptf tasks publish   ← projet live
```

### Interface du skill

```typescript
interface PTFArchitectSkill {
  // Contexte injecté dans l'IA
  templates: {
    architecture: string;    // contenu de ARCHITECTURE.template.md
    planAction: string;      // contenu de PLAN_ACTION.template.md
  };

  rules: {
    // Règles que ptf validate-docs vérifie
    requiredSections: string[];
    qualityRules: {
      noVagueTerms: string[];        // ["améliorer", "optimiser", "refactoriser"]
      requiresMeasurable: boolean;   // chaque critère doit être mesurable
      requiresInterfaces: boolean;   // chaque module doit avoir ses interfaces
      requiresVerificationSteps: boolean; // chaque tâche doit être auto-vérifiable
    };
  };

  examples: {
    bad: string;    // exemple de mauvaise description
    good: string;   // exemple de bonne description
  }[];
}
```

### Prompt système du skill (injecté dans le contexte IA)

```
Tu génères un ARCHITECTURE.md et un PLAN_ACTION.md conformes au format PTF.

RÈGLES ABSOLUES :
- Chaque module a : Nom, Rôle, Inputs, Outputs, Dépend de
- Chaque interface est typée (TypeScript ou équivalent)
- Chaque contrainte est mesurable ("< 200ms", "> 80% coverage")
- Aucun terme vague : jamais "améliorer", "optimiser" sans métrique
- Chaque tâche a un verificationStep avec une commande exacte
- Le hors-scope est explicite (au moins 3 items)

FORMAT : suis exactement la structure des templates fournis.
```

### Templates comme prompts système

Les templates PTF sont conçus pour être utilisés directement comme contexte par une IA :
- Instructions inline formulées en langage naturel compréhensible par une IA
- Exemples concrets inclus dans chaque section
- Les règles de `ptf validate-docs` sont documentées dans les templates eux-mêmes
- Format Markdown compatible avec tous les éditeurs IA

---

## Interfaces formelles des services (Contrats de modularité)

Chaque service backend implémente une interface TypeScript stricte.
Les dépendances entre services passent TOUJOURS par l'interface, jamais par l'implémentation.
Ce pattern garantit que chaque service est remplaçable indépendamment.

Règle : `import type { IServiceName }` — jamais `import { ServiceNameImpl }`

### IChainAdapter

Voir section Blockchain Abstraction Layer — interface ChainAdapter

### IOracleProvider

```typescript
// Abstraction de l'oracle de prix — remplaçable (Chainlink, Pyth, Uniswap TWAP...)
interface IOracleProvider {
    getPrice(base: Currency, quote: Currency): Promise<{
        price: number;
        confidence: number;      // intervalle de confiance (0-1)
        updatedAt: Date;
        source: string;          // "chainlink", "pyth", "uniswap-twap"
    }>;

    isStale(base: Currency, quote: Currency, maxAgeSeconds: number): Promise<boolean>;

    // Taux garanti pendant une durée (pour les conversions)
    lockRate(base: Currency, quote: Currency, durationMs: number): Promise<{
        lockedRate: number;
        expiresAt: Date;
        lockId: string;
    }>;
}

// Implémentations disponibles
class ChainlinkOracleAdapter implements IOracleProvider { ... }
class PythOracleAdapter implements IOracleProvider { ... }
class MockOracleAdapter implements IOracleProvider { ... }  // tests
```

### IReputationEngine

```typescript
// Abstraction du moteur de réputation — formule remplaçable sans toucher aux services
interface IReputationEngine {
    // Calculer les points d'une tâche (appelé à la création)
    calculateTaskReward(task: TaskScoring): number;

    // Appliquer les points après validation
    applyReward(devAddress: string, taskId: string, points: number): Promise<void>;

    // Appliquer une pénalité
    applyPenalty(devAddress: string, points: number, reason: string): Promise<void>;

    // Obtenir le score agrégé cross-chaîne
    getGlobalScore(devAddress: string): Promise<{
        total: number;
        level: ReputationLevel;
        byChain: Record<string, number>;
    }>;

    // Vérifier l'éligibilité peer reviewer
    isEligibleReviewer(devAddress: string): Promise<boolean>;
}

// Implémentation par défaut
class PTFReputationEngine implements IReputationEngine {
    // Formule : (complexity + effort + impact) × 10 + bonus_durée
}
// Extensible : class WeightedReputationEngine implements IReputationEngine { ... }
```

### IStorageProvider

Utilisé par `MetadataService` pour l'archivage permanent des métadonnées clôturées.
Voir section **Stockage distribué des métadonnées** pour le cycle de vie complet.

```typescript
// Abstraction du stockage décentralisé — Arweave remplaçable par IPFS, Filecoin...
interface IStorageProvider {
    store(content: string, metadata: Record<string, string>): Promise<ContentRef>;
    retrieve(ref: ContentRef): Promise<string>;
    verify(ref: ContentRef, expectedHash: string): Promise<boolean>;
    isAvailable(ref: ContentRef): Promise<boolean>;
}

interface ContentRef {
    protocol: "arweave" | "ipfs" | "filecoin";
    id: string;          // txId (Arweave) ou CID (IPFS)
    url: string;         // gateway URL pour lecture
    hash: string;        // keccak256 du contenu — vérifié par MetadataRegistry.setArchiveId()
}

class ArweaveStorageAdapter implements IStorageProvider { ... }
class IPFSStorageAdapter implements IStorageProvider { ... }
class LocalStorageAdapter implements IStorageProvider { ... }  // dev/test
```

### ITaskGeneratorService

```typescript
// Abstraction du générateur de tâches — LLM remplaçable
interface ITaskGeneratorService {
    generateTasks(
        projectId: string,
        architecture: string,    // contenu ARCHITECTURE.md sanitisé
        planAction: string,      // contenu PLAN_ACTION.md sanitisé
        options?: { model?: string; maxTasks?: number }
    ): Promise<GeneratedTask[]>;

    estimateProject(architecture: string, planAction: string): Promise<ProjectEstimation>;

    validateDocs(architecture: string, planAction: string): Promise<ValidationReport>;

    fixDocs(
        architecture: string,
        planAction: string,
        errors: ValidationError[]
    ): Promise<{ architecture: string; planAction: string }>;
}

// Implémentations
class LLMTaskGeneratorService implements ITaskGeneratorService {
    constructor(private llm: ILLMProvider) {}
}

class RuleBasedTaskGeneratorService implements ITaskGeneratorService { ... } // fallback sans LLM
```

### ILLMProvider

```typescript
// Abstraction du fournisseur LLM — OpenAI, Anthropic, Mistral, self-hosted...
interface ILLMProvider {
    complete(
        systemPrompt: string,
        userMessage: string,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<string>;

    isAvailable(): Promise<boolean>;
    getModelId(): string;
    estimateCost(inputTokens: number, outputTokens: number): number; // en USD
}

class OpenAIProvider implements ILLMProvider { ... }
class AnthropicProvider implements ILLMProvider { ... }
class MistralProvider implements ILLMProvider { ... }
class OllamaProvider implements ILLMProvider { ... }    // self-hosted
```

### INotificationService

```typescript
interface INotificationService {
    notify(address: string, type: NotificationType, payload: object): Promise<void>;
    notifyBatch(addresses: string[], type: NotificationType, payload: object): Promise<void>;
    subscribe(address: string, channel: NotificationChannel): Promise<void>;
}

type NotificationChannel = "email" | "webhook" | "push" | "in-app";
// Implémentations : EmailNotificationService, WebhookNotificationService...
```

### ISyncService

```typescript
interface ISyncService {
    syncProject(projectId: string): Promise<SyncResult>;
    getPendingSubmissions(projectId: string): Promise<Submission[]>;
    onCreatorOnline(ownerAddress: string): Promise<void>;
    getStatus(projectId: string): Promise<SyncStatus>;
}
```

### ICurrencyConverter

```typescript
interface ICurrencyConverter {
    convert(amount: number, from: Currency, to: Currency): Promise<ConversionResult>;
    getSupportedCurrencies(): Currency[];
    // Délègue à IOracleProvider pour les taux
}
```

### Graphe de dépendances entre services

```
┌─────────────────────────────────────────────────────────────────┐
│                    Graphe de dépendances                        │
│                                                                 │
│  TaskService ──────────► IChainAdapter                         │
│       │                  IReputationEngine                      │
│       └──────────────►   IStorageProvider                       │
│                                                                 │
│  ValidationService ────► ITaskGeneratorService                  │
│       │                  IChainAdapter                          │
│       └──────────────►   INotificationService                   │
│                                                                 │
│  EscrowService ────────► IChainAdapter                          │
│                                                                 │
│  CurrencyConverter ────► IOracleProvider                        │
│                                                                 │
│  DocumentGenerator ────► ILLMProvider                           │
│       └──────────────►   IStorageProvider                       │
│                                                                 │
│  SyncService ──────────► IChainAdapter                          │
│       └──────────────►   INotificationService                   │
│                                                                 │
│  ReportService ────────► IChainAdapter                          │
│       └──────────────►   INotificationService                   │
│                                                                 │
│  TimerService ─────────► IPunishmentService                     │
│                          INotificationService                   │
└─────────────────────────────────────────────────────────────────┘
```

### Injection de dépendances

```typescript
// Composition root — tout est branché ici, jamais dans les services
// backend/src/container.ts

// Note : config.userLlm est résolu depuis la config locale de l'utilisateur
// (~/.ptf/config.json ou variable d'environnement PTF_LLM_PROVIDER / PTF_LLM_API_KEY)
// PTF ne détient jamais la clé API LLM — elle est fournie par l'utilisateur.
const container = {
    // Adapters (implémentations concrètes)
    chainAdapter:    new PolygonAdapter(config.rpc.polygon, config.contracts.polygon),
    oracle:          new ChainlinkOracleAdapter(config.chainlink),
    storage:         new ArweaveStorageAdapter(config.arweave),
    // LLM instancié depuis la configuration locale de l'utilisateur :
    llm:             LLMProviderFactory.fromUserConfig(config.userLlm),
    // Ex: new OpenAIProvider(userKey) | new AnthropicProvider(userKey) | new OllamaProvider(localUrl)
    notifications:   new WebhookNotificationService(config.webhooks),

    // Services (injectés avec leurs interfaces)
    reputationEngine:    new PTFReputationEngine(chainAdapter),
    taskGenerator:       new LLMTaskGeneratorService(llm),
    currencyConverter:   new CurrencyConverter(oracle),
    documentGenerator:   new DocumentGeneratorService(llm, storage),
    syncService:         new SyncService(chainAdapter, notifications),

    // Swap facile : remplacer Arweave par IPFS sans toucher aux services
    // storage: new IPFSStorageAdapter(config.ipfs),

    // Swap LLM sans toucher à TaskGenerator (toujours la clé de l'utilisateur)
    // llm: new AnthropicProvider(config.userLlm.key),
    // llm: new OllamaProvider("http://localhost:11434"),  // self-hosted gratuit
};
```

---

## Composants Backend

### Auth Service

Gère l'identité des utilisateurs sur la plateforme. Le système d'authentification repose sur **trois couches indépendantes** — toutes les trois sont requises pour créer ou réclamer des tâches.

#### Couche 1 — Compte PTF (email + mot de passe + clé secp256k1)

**Principe non-custodial : le keypair est généré localement, jamais par le serveur.**

Le serveur PTF ne génère, ne voit et ne stocke jamais de clé privée. Toute compromission de l'infrastructure PTF est sans effet sur les fonds des utilisateurs.

**Génération du keypair (CLI — `ptf wallet create`) :**

- Le CLI génère localement une seed phrase BIP-39 (12 mots, 128 bits d'entropie) via `ethers.Wallet.createRandom()`
- Le keypair secp256k1 est dérivé selon BIP-44 chemin `m/44'/60'/0'/0/0` (coin type Ethereum — standard EVM universel)
- L'adresse PTF est dérivée : `ptfAddress = EIP-55(keccak256(uncompressed_pubkey)[12:])` — format `0x...` standard EVM
- La clé privée est chiffrée localement (AES-256-GCM + PBKDF2 600 000 itérations) et stockée dans `~/.ptf/keystore/<address>.json` (format compatible Web3 Secret Storage V3)
- La seed phrase est affichée **une seule fois** à l'écran — c'est la seule façon de récupérer le wallet si le keystore est perdu
- Le serveur PTF ne reçoit que l'adresse publique (`ptfAddress`) — jamais la clé privée ni la seed

**Interopérabilité :** le wallet PTF étant un keypair BIP-44 standard, il est importable dans MetaMask, Ledger, Trezor ou tout wallet EVM depuis la seed phrase. L'utilisateur peut vérifier son solde sur Etherscan/Polygonscan indépendamment de PTF.

**Authentification (challenge-response) :**

- À chaque connexion, le serveur émet un nonce signé
- Le CLI déchiffre le keystore local avec le mot de passe, signe le nonce localement (`personal_sign` EIP-191), efface immédiatement la clé privée de la mémoire
- Le serveur vérifie la signature via `ethers.verifyMessage()` → retourne un JWT de session
- La clé privée n'a jamais transité sur le réseau

**Mot de passe serveur (compte PTF) :** haché avec `scrypt` (N=32768) + `timingSafeEqual` pour la vérification — distinct du mot de passe de chiffrement du keystore local.

#### Couche 2 — Vérification des nouveaux appareils (OTP email)

- Chaque connexion depuis un **appareil non reconnu** envoie un OTP à 6 chiffres à l'adresse email (expire en 10 min)
- L'OTP est haché scrypt en base, jamais stocké en clair
- Après vérification, l'appareil est enregistré comme `TrustedDevice` (valable 1 an) avec un `deviceToken` persistant côté client
- Les connexions suivantes depuis cet appareil (avec `deviceToken`) passent directement sans OTP

#### Couche 3 — Liaison GitHub + Wallet (requises pour les actions)

- **GitHub OAuth** — échange de code OAuth avec timeout 10s, vérification d'unicité du compte GitHub
- **Wallet** — challenge-response EIP-712 en deux temps : `requestWalletChallenge()` émet un nonce stocké en base, `confirmLinkWallet()` vérifie la signature
- Le JWT embarque `{ userId, ptfAddress, githubLinked, walletLinked, deviceId }` — le client sait immédiatement quelle étape est manquante

#### Sessions et appareils

- Chaque `DeviceSession` est identifiée par `deviceId` (embarqué dans le JWT) et révocable individuellement
- `myDevices` liste tous les appareils actifs avec `lastSeenAt` et `isCurrent`
- `revokeDevice(id)` / `revokeAllOtherDevices` disponibles via GraphQL
- Un bannissement révoque **toutes** les sessions immédiatement

#### Flux d'onboarding (nouvelles inscriptions uniquement)

```
[Pré-requis — à faire en local avant inscription]
ptf wallet create
  → seed phrase BIP-39 générée localement (12 mots)
  → keypair secp256k1 dérivé m/44'/60'/0'/0/0
  → keystore chiffré sauvegardé dans ~/.ptf/keystore/<address>.json
  → ptfAddress affiché (ex: 0xAbCd...)

register(email, password, deviceName)
  → JWT (githubLinked=false, walletLinked=false)
    ↓
linkGithub(code)
  → JWT mis à jour (githubLinked=true)
    ↓
ptf auth login
  → CLI déchiffre keystore local avec mot de passe
  → requestWalletChallenge(ptfAddress) → nonce
  → signature locale du nonce (clé privée effacée immédiatement après)
  → verifyChallenge(ptfAddress, nonce, signature) → JWT de session
  → JWT mis à jour (walletLinked=true)
    ↓
claimTask / createProject débloqués ✓
```

### Project Service

Responsable du cycle de vie des projets de la création à l'archivage.

- Calcul de l'identifiant cryptographique du projet : `projectId = keccak256(ownerAddress + projectName + timestamp)` — généré automatiquement par `ptf init`, jamais saisi manuellement
- Stockage du `rewardMode` (`free` ou `paid`) ; le type `private` force `rewardMode = paid`
- Stockage du `repo_type` (`github`, `self-hosted`, `ptf-temp`) et de `repo_url` — références vers le dépôt de code (le code lui-même n'est jamais stocké en DB)
- Stockage de `architecture_ref` et `plan_action_ref` — chemins/URLs vers les fichiers dans le dépôt du créateur (pas le contenu)
- Gestion de la synchronisation (`sync_status`, `last_sync_at`, `temp_repo_url`) pour les projets `ptf-temp`
- **Vérification open-source** : à la création et à la publication d'un projet GitHub, l'API GitHub est interrogée pour vérifier que le dépôt est public et possède une licence OSI/FSF approuvée. Le projet est **toujours créé** même en cas d'échec — la réponse indique `licenseStatus` + `licenseInstruction`. La vérification est re-faite à la publication.
- **Création automatique de licence** : `createProjectLicense(projectId, spdxId, authorName, userToken)` crée ou met à jour `LICENSE.md` dans le dépôt GitHub via l'API Contents.
- Appel au **moteur d'évaluation du coût** pour calculer la récompense totale (uniquement pour les projets paid)
- Enregistrement du projet sur `ProjectRegistry` (via ChainAdapter) avec le `rewardMode`
- Pour les projets paid : déclenchement du dépôt des fonds sur `EscrowVault`
- Pour les projets free : aucune interaction avec `EscrowVault`
- Gestion du statut : `draft` → `open` → `in_progress` → `completed` → `archived`

**Champs licence (Prisma) :**

| Champ | Type | Description |
|-------|------|-------------|
| `isOpenSource` | `Boolean` | `true` uniquement après vérification GitHub réussie (public + licence OSI/FSF) |
| `license` | `String?` | Identifiant SPDX, ex. `"MIT"`, `"GPL-3.0-only"` |
| `licenseVerifiedAt` | `DateTime?` | Horodatage de la dernière vérification réussie |

**Moteur d'évaluation du coût :**

```
Score_tache = f(
  complexite,          // LOC estimées, patterns techniques requis
  duree_estimee,       // heures/jours déclarés par le client
  effort,              // nombre de sous-tâches, surface impactée
  criticite_securite,  // composant critique ou touchant la sécurité
  nb_dependances       // nombre de tâches dont elle dépend
)

Cout_total_projet = somme_ponderee(Score_tache_i) + commission_PTF

Recompense_tache = (Score_tache / Score_total) × Cout_total_projet
```

La commission PTF est prélevée à la création du projet. Le client paie la totalité upfront ; les fonds sont bloqués dans `EscrowVault` jusqu'à validation de chaque tâche.

### Task Service

Cœur du système : gère la structure hiérarchique des tâches, leurs dépendances, leur cycle de vie, l'anti-collision par lock distribué, le timer de deadline et le broadcast vers le réseau PTF.

**Structure Merkle-like :**

```
projectId  = Hash(owner + metadata + timestamp)
taskId     = Hash(projectId + parentId + taskMetadata + nonce)
networkId  = Hash(taskId + broadcastTimestamp + nodeId)
```

Chaque nœud de l'arbre contient le hash de son parent. Toute modification d'une tâche invalide sa chaîne de hashes descendants, garantissant l'intégrité de la structure. Il est impossible de modifier rétroactivement une tâche sans casser la chaîne.

Le `networkId` est distinct du `taskId` : il identifie la diffusion de la tâche dans le réseau PTF et permet aux nœuds de dédupliquer les broadcasts.

**Arbre de dépendances :**

- Une tâche peut avoir N dépendances (références à d'autres `taskId`)
- Une tâche reste en statut `blocked` tant qu'une dépendance n'est pas en statut `validated`
- Le Task Service recalcule le graphe à chaque changement de statut et notifie les tâches débloquées
- Détection de cycles (DAG strict — aucun cycle autorisé)

**Cycle de vie complet d'une tâche :**

```
created -> open -> [ptf task claim]
                     Projet free  : wallet + critères + confirmation
                     Projet paid  : solde PTF + wallet + critères + confirmation
                        |
                        v (confirmation + signature EIP-712 automatique)
                        |  paid uniquement : + EscrowVault.softLock(10 PTF)
                   claimed -> submitted -> under_review -> validated
                                                        -> rejected -> open (rechargée)
                              -> disputed -> arbitration -> validated
                                                        -> rejected
open    -> [TimerService: expiration si non claimée dans délai config]
claimed -> [TimerService: deadline dépassée] -> expired + PunishmentService (lateDelivery)
             free  : uniquement pénalité réputation
             paid  : pénalité crédits + réputation + softUnlock
```

**Règle d'immutabilité — tâches réclamées :**

Une tâche ne peut être **modifiée ou supprimée** que lorsqu'elle est en statut `open`. Toute tâche dans un statut postérieur (`claimed`, `submitted`, `under_review`, `disputed`, `validated`, `expired`) est **immuable**.

```typescript
async function modifyTask(taskId: string, updates: Partial<Task>): Promise<void> {
    const task = await db.tasks.findById(taskId);
    if (task.status !== 'open') {
        throw new PTFError('TASK_IMMUTABLE',
            `La tâche ${taskId} ne peut pas être modifiée : statut ${task.status}. ` +
            `Une tâche réclamée, en review, disputée ou complétée est immuable.`
        );
    }
    await db.tasks.update(taskId, updates);
    await chainAdapter.updateTaskSetHash(task.projectId, computeTaskSetHash(taskIds)); // mise à jour on-chain
}

async function deleteTask(taskId: string): Promise<void> {
    const task = await db.tasks.findById(taskId);
    if (task.status !== 'open') {
        throw new PTFError('TASK_IMMUTABLE', 'Impossible de supprimer une tâche réclamée.');
    }
    // ...
}
```

Le claim est atomique : la vérification des critères, la confirmation interactive, la signature EIP-712 et l'enregistrement on-chain se font en une seule opération.

**Anti-collision — Atomic Claim (Claim Queue + Redlock) :**

Pour éviter que deux développeurs réclament simultanément la même tâche, le Task Service combine une **claim queue Redis Sorted Set** (protection contre le thundering herd sur les tâches populaires) et un **lock Redlock** sur l'instance Sentinel. Les vérifications rapides (solde, wallet) se font avant d'acquérir le lock afin de ne pas le consommer inutilement.

```typescript
// Claim Queue via Redis Sorted Set — remplace SETNX brut
// Évite le thundering herd sur les tâches populaires

class ClaimQueue {
    private readonly QUEUE_KEY = (taskId: string) => `claim:queue:${taskId}`;
    private readonly LOCK_TTL = 60_000; // 60s

    async enqueue(taskId: string, devAddress: string): Promise<ClaimPosition> {
        const score = Date.now(); // timestamp comme score (FIFO)
        await redisCluster.zadd(this.QUEUE_KEY(taskId), score, devAddress);
        const position = await redisCluster.zrank(this.QUEUE_KEY(taskId), devAddress);
        return { position, estimatedWait: position * 2000 }; // ~2s par position
    }

    async processNext(taskId: string): Promise<string | null> {
        // Récupérer le premier de la queue
        const [devAddress] = await redisCluster.zrange(this.QUEUE_KEY(taskId), 0, 0);
        if (!devAddress) return null;

        // Acquérir le lock Redlock AVANT de traiter
        const lock = await redlock.acquire([`lock:claim:${taskId}`], this.LOCK_TTL);
        try {
            // Vérifier que la tâche est encore open (double-check sous lock)
            const task = await db.tasks.findById(taskId);
            if (task.status !== 'open') {
                await redisCluster.zrem(this.QUEUE_KEY(taskId), devAddress);
                return null;
            }
            return devAddress;
        } finally {
            await lock.release();
        }
    }

    async dequeue(taskId: string, devAddress: string): Promise<void> {
        await redisCluster.zrem(this.QUEUE_KEY(taskId), devAddress);
    }
}
```

```
[Projet paid — exemple]

Dev A                    Task Service                  Redis                  Blockchain
  |                           |                           |                       |
  |-- claim(taskId) --------> |                           |                       |
  |                           |-- 1. Vérif solde PTF >= 10 (paid uniquement)      |
  |                           |-- 2. Vérif wallet (format, activé, non banni...) |
  |                           |-- 3. Vérif claimCriteria (réputation, skills...)  |
  |                           |-- SETNX lock:taskId ----> |                       |
  |                           |                           |<-- OK (TTL: 60s) -----|
  |                           |-- vérif statut = "open"   |                       |
  |                           |-- vérif dépendances       |                       |
  |                           |-- vérif soft-lock dispo   |                       |
  |                           |-- UPDATE statut="claimed" |                       |
  |                           |   SET claimedAt, devAddr  |                       |
  |                           |-- softLock(dev, 10 PTF)   |                       |
  |                           |-- DEL lock:taskId ------> |                       |
  |                           |-- claimTask(taskId,dev,conditionsHash) ---------> |
  |<-- succès + deadline ----- |                           |                       |

[Projet free — exemple]

Dev A                    Task Service                  Redis                  Blockchain
  |                           |                           |                       |
  |-- claim(taskId) --------> |                           |                       |
  |                           |-- 1. Vérif wallet (format, activé, non banni...) |
  |                           |-- 2. Vérif claimCriteria (réputation, skills...)  |
  |                           |-- SETNX lock:taskId ----> |                       |
  |                           |                           |<-- OK (TTL: 60s) -----|
  |                           |-- vérif statut = "open"   |                       |
  |                           |-- vérif dépendances       |                       |
  |                           |-- UPDATE statut="claimed" |                       |
  |                           |   SET claimedAt, devAddr  |                       |
  |                           |-- DEL lock:taskId ------> |                       |
  |                           |-- claimTask(taskId,dev,conditionsHash) ---------> |
  |<-- succès + deadline ----- |                           |                       |

Dev B (concurrent, tous modes)
  |-- claim(taskId) --------> |                           |                       |
  |                           |-- [vérif solde si paid]                           |
  |                           |-- Vérif wallet                                    |
  |                           |-- Vérif claimCriteria                             |
  |                           |-- SETNX lock:taskId ----> |                       |
  |                           |                           |<-- FAIL (lock existe) |
  |<-- "Task already being    |                           |                       |
  |     claimed, retry" ------ |                           |                       |
```

Si le lock ne peut être acquis, la requête est rejetée avec le message `"Task already being claimed, retry"`. Le TTL de **60 secondes** (et non 5 secondes) garantit qu'un crash du service pendant le lock ne bloque pas la tâche indéfiniment, tout en couvrant la latence P99 en cas de congestion L2.

#### Race condition Redis TTL et cohérence des états — C-03

Le TTL Redis corrigé et le pattern d'état intermédiaire `claim_pending` sont détaillés ci-dessous.

```typescript
// TTL Redis CORRIGÉ : 60 secondes minimum (couverture P99 congestion L2)
const CLAIM_LOCK_TTL = 60_000; // 60s en ms

// État intermédiaire claim_pending
// La source de vérité est le contrat, pas PostgreSQL
async claimTask(taskId: string, devAddress: string): Promise<ClaimResult> {
    const lock = await redis.set(`lock:task:${taskId}`, devAddress, 'NX', 'PX', CLAIM_LOCK_TTL);
    if (!lock) throw new Error('TASK_BEING_CLAIMED');

    // Écrire claim_pending en DB (pas claimed)
    await db.tasks.update({ status: 'claim_pending', pendingDev: devAddress });

    // Envoyer tx blockchain
    const tx = await chainAdapter.claimTask(taskId, devAddress, conditionsHash);

    // NE PAS mettre 'claimed' ici — attendre l'événement on-chain
    // Le ChainEventListener met à jour vers 'claimed' à la confirmation
}
```

**ChainEventListener — source de vérité unique :**

Le `ChainEventListener` est le seul composant autorisé à faire passer une tâche au statut `claimed` dans PostgreSQL. Il consomme les événements on-chain et maintient la cohérence entre la blockchain et la base de données.

```typescript
// ChainEventListener écoute les événements on-chain et met à jour PostgreSQL
class ChainEventListener {
    // Consomme les events on-chain comme source de vérité UNIQUE
    async onTaskClaimed(event: TaskClaimedEvent): Promise<void> {
        await db.tasks.update({
            taskId: event.taskId,
            status: 'claimed',           // mis à jour UNIQUEMENT après confirmation on-chain
            devAddress: event.devAddress,
            claimedAt: event.blockTimestamp,
            deadline: event.blockTimestamp + task.duration,
        });
        await redis.del(`lock:task:${event.taskId}`); // libérer le lock
    }

    // Si pas de confirmation après 120s → remettre en open
    async onClaimTimeout(taskId: string): Promise<void> {
        await db.tasks.update({ status: 'open', pendingDev: null });
        await redis.del(`lock:task:${taskId}`);
    }

    // Gérer les reorgs : minimum de confirmations configurable par chaîne
    readonly minConfirmations: Record<string, number> = {
        polygon: 32,
        ethereum: 6,
        bsc: 15,
        arbitrum: 1,  // finalité rapide
    };
}
```

**Critères de réclamation — ordre de vérification :**

```
ptf task claim <taskId>

--- Projet free (public non-rémunéré) ---

  [Avant lock Redis — vérifications rapides]
  1. WalletVerificationService.verify() :
     → format EIP-55, wallet activé, non banni, ownership prouvé
  2. claimCriteria (configurés par le responsable du projet) :
     → dev.reputationScore >= minReputation
     → dev.completedTasks >= minCompletedTasks
     → requiredSkills ⊆ dev.skills
     → dev.activeTasks.count < maxActiveTasks

  [Sous lock Redis — vérifications atomiques]
  3. statut tâche = "open"
  4. toutes les dépendances en statut "validated"
  → si tout ok : affiche conditions + confirmation [o/N]
  → si confirmé : signature EIP-712 automatique + UPDATE + on-chain + release lock
  → sinon : release lock + erreur détaillée

--- Projet paid (public rémunéré ou privé) ---

  [Avant lock Redis — vérifications rapides]
  1. dev.creditBalance >= 10 PTF              ← PREMIER (barrière la plus rapide, paid uniquement)
     → Si non : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
  2. WalletVerificationService.verify() :
     → format EIP-55, wallet activé, non banni, ownership prouvé
  3. claimCriteria (configurés par le responsable du projet) :
     → dev.reputationScore >= minReputation
     → dev.completedTasks >= minCompletedTasks
     → requiredSkills ⊆ dev.skills
     → dev.activeTasks.count < maxActiveTasks

  [Sous lock Redis — vérifications atomiques]
  4. statut tâche = "open"
  5. toutes les dépendances en statut "validated"
  6. dev.softLockedCredits + 10 <= dev.creditBalance  (garantie soft-lock)
  → si tout ok : affiche conditions + confirmation [o/N]
  → si confirmé : signature EIP-712 automatique + UPDATE + on-chain + soft-lock + release lock
  → sinon : release lock + erreur détaillée
```

**Timer et deadline :**

```
[claim validé]
     |
     v
claimedAt = now()
deadline  = claimedAt + duration   (ex. +30 jours)
     |
     v
TimerService enregistre un job cron pour deadline - 72h, - 48h, - 24h, et deadline exacte
     |
     +--- T-72h : Notification Service -> alerte dev (webhook + email)
     +--- T-48h : Notification Service -> alerte dev (urgence modérée)
     +--- T-24h : Notification Service -> alerte dev (urgence critique)
     +--- T=0   : si statut != "submitted" :
                    statut -> "expired"
                    PunishmentService.apply(taskId, "lateDelivery")
                    EscrowVault : crédits déduits + score réputation baissé
```

**Broadcast réseau PTF :**

À la création d'une tâche (ou lors d'un `ptf push`), le Task Service diffuse la tâche dans le réseau PTF :

- Tâches publiques : toutes les métadonnées et le contenu sont visibles par tous les nœuds
- Tâches privées : seules les métadonnées et les critères de réclamation sont diffusés ; le contenu réel (description technique, spec, tests) est chiffré et accessible uniquement au développeur après claim validé

### PunishmentService (nouveau)

Service dédié à la détection des violations, au calcul des pénalités et à l'exécution des déductions.

**Responsabilités :**

- Reçoit les événements de violation depuis le Task Service, le Review Service et le Dispute Service
- Lit le `rewardMode` du projet pour déterminer si les crédits s'appliquent
- Calcule les pénalités selon la configuration `punishments` de la tâche concernée
- Pour les projets paid : soumet les déductions à `EscrowVault` (crédits) et `ReputationRegistry` (score)
- Pour les projets free : soumet uniquement les déductions à `ReputationRegistry` (score)
- Distribution des pénalités de crédits : **80 % → trésorerie PTF** / **20 % → fonds du projet**
- Bannissement : **droit exclusif de la plateforme PTF**, jamais déclenché par un créateur
- Enregistre chaque punition on-chain (auditabilité)

**Flux d'une punition :**

```
Événement de violation (ex: lateDelivery, maliciousCode, criticalBug)
     |
     v
PunishmentService.detect(taskId, violationType)
     |
     v
Lecture rewardMode du projet (free ou paid)
     |
     v
Lecture configuration : task.punishments[violationType]
  -> reputation = delta de réputation (toujours présent, free et paid)
  -> credits    = nombre de crédits à déduire (uniquement si paid)
     |
     v (si projet paid)
Vérification soft-lock : garantie 10 PTF toujours disponible après déduction
  -> Si dev.creditBalance - credits < 0 : déduction partielle (jusqu'à 0)
     |
     v
Exécution atomique :
  Si paid : EscrowVault.applyPunishment(devAddress, credits, projectId)
    → Distribution : 80 % → platformTreasury  (financement des opérations PTF)
                     20 % → projectFund[projectId]  (redistribuable aux reviewers/créateur)
  ReputationRegistry.updateScore(devAddress, -reputation)    // baisse réputation (always)
     |
     v
Décision de bannissement (si applicable) :
  → Analysée automatiquement (score seuil, historique signalements)
  → Escalade vers équipe PTF si score > seuil
  → Décidée EXCLUSIVEMENT par la plateforme PTF (jamais par un créateur)
  → Si ban : AuthService.applyBan(devAddress, banLevel)
     |
     v
Notification dev + enregistrement on-chain
```

**Exemples de configuration par défaut (créateur peut surcharger) :**

Projets free (uniquement réputation) :

| Violation | Crédits | Réputation | Ban |
|-----------|---------|------------|-----|
| Rendu en retard | — | -10 | — |
| Code malveillant | — | -500 | décision PTF |
| Bug critique | — | -30 | — |
| Bug non-critique | — | -2 | — |

Projets paid (crédits + réputation) :

| Violation | Crédits | Réputation | Ban |
|-----------|---------|------------|-----|
| Rendu en retard | -20 | -10 | — |
| Code malveillant | -100 | -500 | décision PTF |
| Bug critique | -50 | -30 | — |
| Bug non-critique | -5 | -2 | — |

**Distribution des crédits déduits (projets paid) :**
- 80 % → trésorerie PTF (financement des opérations de la plateforme)
- 20 % → fonds du projet concerné (redistribuable aux reviewers ou au créateur)

**Rappel :** Le bannissement (`warning`, `conditional`, `permanent`) est une décision **exclusive de la plateforme PTF**. Il n'est pas configurable par le créateur dans les `punishments` d'une tâche.

**Idempotence obligatoire — vérification on-chain avant application :**

```typescript
// Idempotence obligatoire : vérification on-chain avant application
class PunishmentService {
    async applyPunishment(
        taskId: string,
        devAddress: string,
        punishmentType: PunishmentType
    ): Promise<void> {
        // 1. Vérifier si ce punishment a déjà été appliqué (idempotence)
        const alreadyApplied = await db.punishments.exists({
            taskId,
            devAddress,
            type: punishmentType,
        });
        if (alreadyApplied) {
            log.warn(`Punishment ${punishmentType} already applied for task ${taskId} — skipping`);
            return;
        }

        // 2. Vérifier l'état on-chain avant tout débit
        const onChainBalance = await chainAdapter.getCreditBalance(devAddress);
        const punishment = await db.tasks.getPunishment(taskId, punishmentType);
        if (onChainBalance < punishment.credits) {
            // Appliquer ce qui est disponible + pénalité réputation seulement
            log.warn(`Insufficient balance for full punishment — applying partial`);
        }

        // 3. Appliquer avec transaction atomique
        const txHash = await chainAdapter.applyPunishment(devAddress, punishment.credits, taskId);

        // 4. Enregistrer APRÈS confirmation on-chain (pas avant)
        await db.punishments.create({ taskId, devAddress, type: punishmentType, txHash });
    }
}
```

### TimerService

Gère les cron jobs liés aux deadlines des tâches.

- Persistance des timers dans Redis (TTL aligné sur la deadline)
- Tolérance aux pannes : redémarrage du service recharge les timers actifs depuis PostgreSQL
- Granularité : alertes à T-72h, T-48h, T-24h et expiration exacte
- Scalabilité : les jobs sont distribués sur les workers via une file Redis Cluster (`BullMQ`)
- Intégration avec le `Notification Service` pour les alertes multi-canaux

**Rechargement des timers au démarrage (protection contre crash) :**

```typescript
// Rechargement des timers au démarrage (protection contre crash)
class TimerService {
    async onStartup(): Promise<void> {
        // Recharger tous les timers actifs depuis PostgreSQL au démarrage
        const activeTasks = await db.tasks.findByStatus(['claimed', 'in_review']);
        for (const task of activeTasks) {
            const delay = Math.max(0, task.deadline.getTime() - Date.now());
            if (delay > 0) {
                await this.scheduleExpiration(task.taskId, delay);
            } else {
                // Déjà expiré pendant le downtime — traiter immédiatement
                await this.handleExpiration(task.taskId);
            }
        }
        log.info(`TimerService: rechargé ${activeTasks.length} timers actifs`);
    }
}
```

### Review Service

Orchestre la validation des soumissions en deux étapes successives.

**Étape 1 — Vérification automatique :**

- Exécution des tests (fournis par le client dans la spécification de la tâche)
- Vérification des linters configurés
- Contrôle des contraintes : `maxFiles`, `maxLinesPerFile`, `minTestCoverage`
- Résultat binaire : `pass` ou `fail` (avec rapport détaillé)

**Étape 2 — Peer review :**

**Règles canoniques de peer review :**
```
Peer review standard        : 3 reviewers tirés au sort parmi les développeurs Expert (réputation ≥ 2 000)
Peer review litige niveau 2 : 3 reviewers Expert (réputation ≥ 2 000) tirés au sort différents des premiers
```

**Tableau canonique des niveaux de réputation :**
```
Unranked  :    0 –   99
Junior    :  100 –  499
Senior    :  500 – 1999
Expert    : 2000+       ← éligible peer reviewer
```

- Tirage au sort de **3 reviewers** parmi les développeurs **Expert** (réputation ≥ 2 000)
- Les reviewers disposent d'un délai configurable (ex. 48h) pour rendre leur verdict
- Vote majoritaire : 2/3 `approve` → soumission validée ; 2/3 `reject` → soumission rejetée
- En cas de refus, un motif structuré est obligatoire (formulaire contraint côté frontend)

**Étape 3 — Validation client (projets privés) :**

- Le client dispose d'un délai de validation configurable après la peer review (**défaut : 72 heures**)
- Si le client ne répond pas dans ce délai : **auto-approbation** (tâche marquée `completed`, crédits libérés)
- Délai configurable par projet dans la fourchette [24h – 168h] :
  ```bash
  ptf project set-review-timeout <projectId> --hours 48
  ```
- Un motif structuré est obligatoire en cas de refus
- Si le client refuse sans motif valable, le Dispute Service peut être déclenché par le développeur

**Lien avec PunishmentService :**

Si la peer review ou la validation client détecte un bug critique, non-critique ou du code malveillant, le Review Service émet un événement vers le PunishmentService qui applique les pénalités configurées dans `task.punishments`.

### Reputation Engine

Calcule et maintient les scores de réputation de chaque participant.

> **Règle fondamentale :** les points de réputation **positifs** ne sont attribués que sur des tâches appartenant à un projet dont `isOpenSource === true` — c'est-à-dire un dépôt GitHub **public** avec une **licence OSI-approuvée ou FSF-libre** vérifiée via l'API GitHub. Les **punitions de réputation** (décrements) s'appliquent à **tous les projets** sans exception.

**Licences éligibles (extrait) :**

| Catégorie | Exemples |
|-----------|---------|
| OSI | MIT, Apache-2.0, GPL-2.0/3.0, LGPL-2.1/3.0, AGPL-3.0, MPL-2.0, BSD-2/3-Clause, ISC, EPL-2.0, EUPL-1.2, CC0-1.0, Unlicense… |
| FSF-libre (non-OSI) | WTFPL, CC-BY-SA-4.0, MS-PL, FTL… |
| Source-available | BUSL-1.1, SSPL-1.0, Elastic-2.0 → **non éligible** |
| Propriétaire | All Rights Reserved → **non éligible** |

Catalogue complet disponible via `getLicenses()` (query GraphQL publique) ou `ptf licenses list`.

**Calcul automatique des reputationPoints par tâche :**

Le `ReputationEngine` calcule les points attribués à la validation d'une tâche **automatiquement** à partir des métadonnées saisies par le créateur (`complexity`, `effort`, `impact`). Le créateur ne peut pas configurer `reputationPoints` directement.

```typescript
// Calcul automatique par le ReputationEngine de PTF
function calculateReputationReward(task: Task, project: Project): number {
    // Zéro si le projet n'est pas open-source vérifié
    if (!project.isOpenSource) return 0;

    const complexityScore = task.scoring.complexity;  // 1-5
    const effortScore     = task.scoring.effort;      // 1-5
    const impactScore     = task.scoring.impact;      // 1-5

    // Facteur durée (basé sur task.duration, en semaines)
    const durationFactor = parseDuration(task.duration) / (7 * 24 * 3600);

    // Formule PTF
    const basePoints    = (complexityScore + effortScore + impactScore) * 10;
    const durationBonus = Math.min(durationFactor * 5, 25); // max 25 pts bonus durée

    return Math.round(basePoints + durationBonus);
    // Ex: complexité 4 + effort 3 + impact 4 = 110 + 10 = ~120 pts
}
```

**Vérification à la création des tâches :**

`TaskService.create()` lit `project.isOpenSource` en base. Si `false`, `reputationPoints` est stocké à `0` dans la tâche — aucune rétro-attribution n'est possible même si la licence est ajoutée ultérieurement. Pour activer la réputation, il faut : ajouter une licence éligible → `createProjectLicense()` ou manuellement → republier le projet (`publishProject` re-vérifie) → les **nouvelles** tâches créées ensuite recevront des points.

**Incréments positifs :**

```
delta_positif = calculateReputationReward(task)   // calculé automatiquement par PTF
```

**Décréments (gérés via PunishmentService) :**

- Code malveillant détecté : décrement sévère configuré dans `punishments.maliciousCode` + suspension
- Bug critique (peer review) : décrement selon `punishments.criticalBug`
- Bug non-critique : décrement selon `punishments.nonCriticalBug`
- Délai dépassé : décrement selon `punishments.lateDelivery`

Les scores sont stockés on-chain dans `ReputationRegistry` (immuables, auditables). Une copie locale dans PostgreSQL sert à l'affichage temps réel, aux requêtes de filtrage et à la vérification des `claimCriteria`.

**Garantie minimum (skin-in-the-game) :**

Pour les **projets paid uniquement**, tout développeur doit maintenir un solde de **10 crédits PTF minimum** (la garantie). Ces crédits sont "soft-lockés" pendant la durée de ses tâches actives :

- Il est impossible de retirer des fonds en dessous du seuil de 10 PTF × (nombre de tâches paid actives)
- En cas de punition, les crédits sont déduits en priorité sur ce solde garanti
- Ce mécanisme assure que chaque développeur a une skin-in-the-game concrète sur chaque tâche paid réclamée

Pour les **projets free**, aucune garantie PTF n'est requise — le seul risque est la pénalité de réputation.

### CLI Handler

Reçoit et traite les requêtes émises par la CLI PTF installée chez le développeur ou dans le CI/CD.

Endpoints GraphQL exposés au CLI :
- `mutation ptfInit` — crée un nouveau projet PTF, génère le projectId, sauvegarde .ptf/config.json
- `mutation ptfLink` — lie un repo GitHub existant à un projet PTF
- `mutation ptfPush` — synchronise les tâches définies localement vers la plateforme + broadcast réseau PTF
- `mutation ptfClaim` — claim une tâche (pour paid : vérif solde + soft-lock garantie | pour free : sans vérif solde | wallet + critères + confirmation + signature EIP-712 + anti-collision Redis)
- `mutation ptfSubmit` — soumet le code d'une tâche (déclenche Review Service)

### Dispute Service

Gère les conflits entre développeurs et clients.

**Flux d'arbitrage :**

```
1. Développeur ouvre un litige (après refus client non justifié)
2. Vérification automatique : les tests passent-ils ?
3. Si oui -> peer review forcée (3 reviewers Expert — réputation ≥ 2 000 — tirés au sort, différents des premiers reviewers)
4. Si peer review approuve -> arbitrage DAO
   - Vote pondéré par réputation des arbitrators
   - Durée : 72h
   - Quorum : 5 arbitrators minimum
5. Résultat :
   - Si développeur gagne : paiement libéré + réputation client baisse
   - Si client gagne : tâche remise en open + PunishmentService appliqué au dev
```

**Pénalité mauvaise foi client :** Si le litige prouve que le client a refusé sans motif valable, son score de réputation baisse et une partie de son stake est saisie.

### Notification Service

Publie des événements à tous les abonnés concernés.

- **Webhooks** — pour les intégrations GitHub (merge, PR, commit)
- **WebSocket** — pour le frontend (mises à jour temps réel du statut des tâches, countdown dashboard)
- **Email** — pour les alertes critiques (litige ouvert, deadline approchante, punition appliquée)
- **Events internes** — bus d'événements entre services (Redis Streams)
- **Alertes deadline automatiques** — déclenchées par TimerService à T-72h, T-48h, T-24h et expiration

### WalletVerificationService

Service dédié à la vérification complète d'un wallet avant toute opération sensible (claim, withdraw).

**Responsabilités :**

- Vérification du format EIP-55 checksum (regex EVM standard)
- Vérification de l'activation on-chain via RPC de la chaîne configurée (`eth_getTransactionCount`)
- Vérification du solde en token natif pour gas fees (avertissement non bloquant — seuil selon la chaîne configurée)
- Vérification du statut ban via `AuthService`
- Vérification de l'ownership par signature d'un nonce ECDSA

Note : pour les projets paid, la vérification du solde PTF minimum (≥ 10) est effectuée **avant** l'appel au `WalletVerificationService` lors d'un claim — c'est la barrière la plus rapide. Pour les projets free, aucune vérification de solde PTF n'est effectuée.

**Résultat :**

```typescript
interface WalletVerification {
  isValidAddress:  boolean;
  isActivated:     boolean;
  hasGasFees:      boolean;   // avertissement non bloquant si false
  isNotBanned:     boolean;
  ownershipProven: boolean;

  // Résultat agrégé
  canProceed: boolean;        // true seulement si toutes les vérifications bloquantes passent
  warnings:   string[];       // ex. "Solde gas faible : token natif insuffisant (chaîne configurée)"
  errors:     string[];       // ex. "WALLET_BANNED", "OWNERSHIP_NOT_PROVEN"
}
// Note : INSUFFICIENT_PTF_BALANCE est vérifié en amont pour les projets paid uniquement.
//        Pour les projets free, aucune vérification de solde PTF n'est effectuée avant cet appel.
```

### ReportService

Service gérant le cycle de vie des signalements de développeurs. Tout utilisateur peut soumettre un signalement ; la décision de bannissement reste **exclusivement** prise par la plateforme PTF.

**Interface :**

```typescript
interface ReportSystem {
  reportDeveloper(
    reporterAddress: string,
    targetAddress:   string,
    reason:          ReportReason,
    evidence:        string,    // description + preuves
    taskId?:         string     // tâche concernée si applicable
  ): Promise<ReportId>;

  getReport(reportId: string): Promise<Report>;
}

enum ReportReason {
  MALICIOUS_CODE = "malicious_code",
  PLAGIARISM     = "plagiarism",
  FRAUD          = "fraud",
  HARASSMENT     = "harassment",
  SPAM           = "spam",
  OTHER          = "other",
}
```

**Flow de traitement :**

```
Signalement reçu
      ↓
Analyse automatique (détection patterns, historique violations)
      ↓
Si score > seuil → escalade vers équipe PTF
      ↓
Décision PTF (warning / conditional ban / permanent ban)
      ↓
Notification au dev signalé
      ↓
Si ban → déductions créances, gel compte, annulation tâches actives
```

**Types de ban (décision PTF uniquement) :**

```typescript
enum BanLevel { WARNING = "warning", CONDITIONAL = "conditional", PERMANENT = "permanent" }

interface PlatformBanDecision {
  devAddress: string;
  level:      BanLevel;
  reason:     string;
  evidence:   string[];       // rapports de signalement, preuves on-chain
  decidedBy:  "ptf_platform"; // jamais par un créateur
  decidedAt:  Date;
  expiresAt?: Date;           // null si permanent
}
```

### ProjectManagerView

Permet au responsable d'un projet de voir quels développeurs ont réclamé ses tâches.

```typescript
interface ProjectManagerView {
  getClaimedTasks(projectId: string): Promise<{
    taskId:    string;
    title:     string;
    status:    TaskStatus;
    claimedBy: {
      address:        string;
      githubHandle?:  string;  // si projet public
      reputation:     number;
      completedTasks: number;
      claimedAt:      Date;
      deadline:       Date;
      daysRemaining:  number;
    };
  }[]>;
}
```

Exposée via la mutation GraphQL `projectClaimedTasks(projectId: ID!)` et les commandes CLI `ptf project claimed-tasks`.

### TaskGeneratorService

Service responsable de la génération automatique de l'arbre de tâches à partir des fichiers de documentation PTF.

**Responsabilités :**

- Parse `ARCHITECTURE.md` et `PLAN_ACTION.md` via le LLM configuré par l'utilisateur (`ILLMProvider`)
- Extrait les modules, interfaces, dépendances techniques et contraintes depuis `ARCHITECTURE.md`
- Extrait les phases, objectifs, jalons et livrables vérifiables depuis `PLAN_ACTION.md`
- Génère un arbre de tâches complet avec IDs crypto chaînés (structure Merkle)
- Remplit automatiquement `context`, `objective`, `deliverable`, `outOfScope` et `verificationSteps` pour chaque tâche
- Calcule les `dependencies` et `blockedBy` en construisant le graphe DAG
- Vérifie l'absence de cycles dans le graphe (DAG strict)
- Suggère une récompense (`reward`) par tâche selon complexité et effort estimés
- Produit l'arbre de tâches prêt pour `ptf tasks preview` puis `ptf tasks publish`

**Flux interne :**

```
ptf estimate / ptf generate
         |
         v
TaskGeneratorService.parse(ARCHITECTURE.md, PLAN_ACTION.md)
         |
         +─→ Extraction modules/interfaces/contraintes
         +─→ Extraction phases/jalons/hors-scope
         |
         v
LLM utilisateur (via ILLMProvider — clé configurée localement par l'utilisateur)
         |
         v
Arbre de tâches brut (JSON)
         |
         v
Validation cohérence :
  ✓ Pas de cycles dans le graphe de dépendances
  ✓ Toutes les dépendances référencées existent dans l'arbre
  ✓ verificationSteps contiennent des commandes exécutables valides (allowlist C-05)
  ✓ Chaque tâche a context, objective, deliverable, outOfScope renseignés
         |
         v
Calcul rewards : Score_tache × budget_total / Score_total
         |
         v
arbre de tâches lié au projectId (vérifiable, publishable via ptf tasks publish)
```

#### Sécurité — Sanitisation anti-prompt-injection (C-04)

Les fichiers `ARCHITECTURE.md` et `PLAN_ACTION.md` sont fournis par des utilisateurs externes. Avant toute injection dans un LLM, leur contenu **doit** être sanitisé pour neutraliser les tentatives de prompt injection.

```typescript
class DocumentSanitizer {
    sanitize(content: string): string {
        // 1. Supprimer les balises de prompt injection connues
        const patterns = [
            /<!--[\s\S]*?-->/g,              // commentaires HTML
            /<\/?system[\s\S]*?>/gi,         // balises <system>
            /ignore\s+(all\s+)?previous/gi,  // instructions directes
            /forget\s+(all\s+)?previous/gi,
            /\[INST\][\s\S]*?\[\/INST\]/g,   // format Llama
        ];
        let sanitized = content;
        for (const p of patterns) sanitized = sanitized.replace(p, '[REMOVED]');
        return sanitized;
    }
}

// Dans TaskGeneratorService, TOUJOURS sanitiser avant injection LLM
async generateTasks(projectId: string, archContent: string, planContent: string) {
    const sanitizedArch = this.sanitizer.sanitize(archContent);
    const sanitizedPlan = this.sanitizer.sanitize(planContent);

    // Séparer contenu utilisateur du prompt système via rôles API
    const messages = [
        { role: 'system', content: TASK_GENERATOR_SYSTEM_PROMPT },   // prompt PTF
        { role: 'user', content: `ARCHITECTURE:\n${sanitizedArch}\n\nPLAN:\n${sanitizedPlan}` }
    ];
}
```

**Interfaces exposées (GraphQL) :**

```graphql
type Mutation {
  validateDocs(architectureMd: String!, planMd: String!): ValidationReport!
  estimateProject(architectureMd: String!, planMd: String!): EstimationReport!
  generateTasks(projectId: ID!, architectureMd: String!, planMd: String!): GenerationResult!
  # → projectId requis : lié au projet créé par ptf init
  previewTasks(projectId: ID!): TaskPreview!
}

type EstimationReport {
  estimatedTaskCount:  Int!
  totalEffortHours:    Int!
  suggestedRewardPool: Float!       # en USDC
  ptfCommission:       Float!       # grille dégressive : 12% (<5k), 10% (5k–50k), 8% (>50k)
  ptfCommissionRate:   Float!       # taux appliqué (0.08 | 0.10 | 0.12)
  totalToDeposit:      Float!
  breakdown:           PhaseBreakdown[]!
  effortRatio:         Float!       # USDC/heure
  isAttractive:        Boolean!     # ratio >= seuil minimum configuré
}

type GenerationResult {
  taskCount:    Int!
  tasksJson:    String!             # JSON signable
  warnings:     String[]!           # incohérences détectées mais non bloquantes
}
```

## LLM — Configuration côté utilisateur

### Principe fondamental : PTF ne gère pas de compte LLM centralisé

Le LLM utilisé par `ptf generate`, `ptf describe` et `ptf scaffold` est **celui de l'utilisateur**. Le développeur ou créateur configure sa propre clé API (ou son instance locale). PTF expose l'interface `ILLMProvider` mais n'instancie pas de compte LLM : chaque utilisateur apporte sa clé.

**Cette architecture signifie que le coût LLM n'est jamais un coût pour PTF.**

### Configuration côté utilisateur

```bash
# Configurer son fournisseur LLM local (stocké dans ~/.ptf/config.json — jamais envoyé aux serveurs PTF)
ptf config set-llm openai --key sk-...
ptf config set-llm anthropic --key sk-ant-...
ptf config set-llm mistral --key ...
ptf config set-llm ollama --url http://localhost:11434   # self-hosted gratuit

# Vérifier la configuration active
ptf config show-llm

# Variable d'environnement alternative
PTF_LLM_PROVIDER=openai PTF_LLM_API_KEY=sk-... ptf generate --project <id> ...
```

La clé API est stockée localement sur la machine de l'utilisateur. Elle n'est jamais transmise aux serveurs PTF — les appels LLM sont effectués directement depuis le client CLI de l'utilisateur vers le fournisseur choisi.

### Fournisseurs supportés via ILLMProvider

```
openai      → OpenAI (GPT-4o, GPT-4o-mini…)
anthropic   → Anthropic (Claude)
mistral     → Mistral AI
ollama      → Modèle self-hosted local (gratuit, aucune clé requise)
```

Toute implémentation de `ILLMProvider` est acceptée — le CLI utilise l'interface, pas l'implémentation.

### Limites de contexte
- ARCHITECTURE.md max : 50 000 tokens (~200 pages)
- PLAN_ACTION.md max : 30 000 tokens
- Si dépassement → découpage automatique par section, génération en batches
- Résultat fusionné et dédupliqué avant présentation

### Fallback si LLM indisponible
1. File d'attente BullMQ avec retry exponentiel (max 3 tentatives, délai 5/15/60 minutes)
2. Notification au créateur : "Génération en cours de traitement, vous serez notifié"
3. `RuleBasedTaskGeneratorService` disponible comme fallback sans LLM (génération déterministe)

### Gouvernance des données (RGPD / confidentialité)
- Le contenu des ARCHITECTURE.md et PLAN_ACTION.md est traité par le LLM choisi par l'utilisateur
- Pour les projets privés : l'utilisateur est responsable de choisir un fournisseur LLM conforme à ses exigences de confidentialité (ex : Ollama self-hosted pour zéro fuite de données)
- PTF ne loggue jamais les inputs/outputs LLM — ces données ne transitent pas par les serveurs PTF

### Coût LLM
- **Aucun coût LLM pour PTF** — chaque utilisateur consomme son propre quota
- Coût estimatif pour l'utilisateur : ~$0.10–0.50 par génération de projet (selon modèle choisi)
- Avec Ollama self-hosted : **$0** (modèle local)

---

### DocumentGeneratorService

Service backend qui gère la génération interactive des fichiers de documentation PTF (`ARCHITECTURE.md` + `PLAN_ACTION.md`). Utilisé par les commandes `ptf describe`, `ptf fix-docs` et `ptf scaffold`.

**Responsabilités :**

- Conduit des sessions d'interview en langage naturel (`ptf describe`)
- Reprend les erreurs de `ptf validate-docs` et pose des questions ciblées (`ptf fix-docs`)
- Génère des templates pré-remplis depuis un repo GitHub existant (`ptf scaffold --github`)
- Valide les documents produits (même logique que `ptf validate-docs`)

**Interfaces exposées :**

```typescript
interface DocumentGeneratorService {
  // Mode interactif (ptf describe)
  startInterview(projectName: string): InterviewSession;
  nextQuestion(sessionId: string, answer: string): InterviewStep;
  generateDocs(sessionId: string): { architecture: string; planAction: string };

  // Mode fix (ptf fix-docs)
  fixDocs(
    architectureContent: string,
    planActionContent: string,
    validationErrors: ValidationError[]
  ): FixSession;

  // Validation
  validateDocs(
    architectureContent: string,
    planActionContent: string
  ): ValidationReport;

  // Scaffold depuis repo existant
  scaffoldFromRepo(repoUrl: string): Promise<{ architecture: string; planAction: string }>;
}
```

**Flux interne — mode interactif (`ptf describe`) :**

```
ptf describe
     |
     v
DocumentGeneratorService.startInterview(projectName)
     |
     v
Boucle de questions (langage naturel) :
  → "Décris le projet en 2-3 phrases."
  → "Quels sont les modules principaux ?"
  → "Quelles contraintes de performance ?"
  → ...
     |
     v
DocumentGeneratorService.generateDocs(sessionId)
     |
     v
ARCHITECTURE.md + PLAN_ACTION.md écrits sur disque
     |
     v
Suggestion : "Lance ptf validate-docs pour vérifier."
```

**Flux interne — mode fix (`ptf fix-docs`) :**

```
ptf fix-docs
     |
     v
Lecture ARCHITECTURE.md + PLAN_ACTION.md existants
     |
     v
DocumentGeneratorService.validateDocs() → rapport erreurs
     |
     v
Pour chaque ⚠️ / ❌ : question ciblée à l'utilisateur
  → "Module ReservationService — que retourne réserverOutil() ?"
  → "Définis une contrainte de performance mesurable."
  → ...
     |
     v
Mise à jour des fichiers avec les réponses
     |
     v
Validation interne → confirmation correction
```

---

## Blockchain Abstraction Layer (BAL)

PTF ne dépend plus d'une blockchain spécifique. Tout appel blockchain passe par la couche d'abstraction BAL, ce qui rend le système modulaire, dynamique et extensible à toute chaîne.

### Interface ChainAdapter

```typescript
// Interface que tout adapter de chaîne doit implémenter
interface ChainAdapter {
  readonly chainId: string;           // ex: "polygon", "ethereum", "bsc", "avalanche", "solana"
  readonly chainName: string;
  readonly nativeToken: string;       // ex: "MATIC", "ETH", "BNB"
  readonly isEVM: boolean;

  // Projets
  registerProject(projectId: string, owner: string, taskSetHash: string, rewardMode: string): Promise<TxHash>;
  updateTaskSetHash(projectId: string, taskSetHash: string): Promise<TxHash>;

  // Escrow (projets paid uniquement)
  depositEscrow(projectId: string, amount: bigint, token: StablecoinRef): Promise<TxHash>;
  releaseEscrow(projectId: string, taskId: string, devAddress: string, amount: bigint): Promise<TxHash>;
  refundEscrow(projectId: string, ownerAddress: string): Promise<TxHash>;
  softLock(devAddress: string, amount: bigint): Promise<TxHash>;
  softUnlock(devAddress: string, amount: bigint): Promise<TxHash>;

  // Crédits PTF
  mintCredits(devAddress: string, amount: bigint, taskId: string): Promise<TxHash>;
  burnCredits(devAddress: string, amount: bigint): Promise<TxHash>;
  applyPunishment(devAddress: string, credits: bigint, reputationDelta: number, reason: string): Promise<TxHash>;
  getCreditBalance(devAddress: string): Promise<bigint>;

  // Réputation
  incrementReputation(devAddress: string, points: number, taskId: string): Promise<TxHash>;
  decrementReputation(devAddress: string, points: number, reason: string): Promise<TxHash>;
  getReputation(devAddress: string): Promise<number>;

  // Cryptographie
  verifySignature(message: string, signature: string, address: string): Promise<boolean>;
  signMessage(message: string): Promise<string>;  // avec clé PTF
}
```

### Adapters implémentés

```typescript
// Adapters EVM (partagent une base commune EVMAdapter)
class PolygonAdapter extends EVMAdapter { chainId = "polygon"; ... }
class EthereumAdapter extends EVMAdapter { chainId = "ethereum"; ... }
class BSCAdapter extends EVMAdapter { chainId = "bsc"; ... }
class AvalancheAdapter extends EVMAdapter { chainId = "avalanche"; ... }
class ArbitrumAdapter extends EVMAdapter { chainId = "arbitrum"; ... }
class BaseAdapter extends EVMAdapter { chainId = "base"; ... }

// Adapters non-EVM (implémentent directement ChainAdapter)
class SolanaAdapter implements ChainAdapter { chainId = "solana"; isEVM = false; ... }
```

**EVMAdapter (base commune) :**

```typescript
abstract class EVMAdapter implements ChainAdapter {
  constructor(
    protected rpcUrl: string,           // injecté depuis config
    protected contractAddresses: ChainContracts,  // adresses déployées sur cette chaîne
    protected signerKey: string
  ) {}
  // Implémentation commune via ethers.js
}
```

### ChainRegistry — sélection dynamique

```typescript
class ChainRegistry {
  private adapters: Map<string, ChainAdapter> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rpcEndpoints: Map<string, string[]> = new Map(); // min 2 par chaîne

  register(adapter: ChainAdapter): void;
  getDefault(): ChainAdapter;          // chaîne par défaut configurée
  listSupported(): string[];
  isSupported(chainId: string): boolean;

  // Vérification de santé par chaîne
  async isHealthy(chainId: string): Promise<boolean> {
      const adapter = this.adapters.get(chainId);
      if (!adapter) return false;
      try {
          await adapter.getBlockNumber(); // appel léger
          return true;
      } catch {
          return false;
      }
  }

  // Récupérer un adapter avec circuit-breaker et failover RPC
  async get(chainId: string): Promise<ChainAdapter> {
      const breaker = this.circuitBreakers.get(chainId);
      if (breaker?.isOpen()) {
          throw new PTFError('CHAIN_UNAVAILABLE',
              `Chaîne ${chainId} temporairement indisponible. Réessayez dans ${breaker.resetTimeout}s.`
          );
      }
      return this.adapters.get(chainId)!;
  }

  // Failover automatique vers le RPC secondaire
  async withFailover<T>(chainId: string, fn: (adapter: ChainAdapter) => Promise<T>): Promise<T> {
      const endpoints = this.rpcEndpoints.get(chainId) ?? [];
      for (const endpoint of endpoints) {
          try {
              const adapter = this.createAdapter(chainId, endpoint);
              return await fn(adapter);
          } catch (err) {
              log.warn(`RPC ${endpoint} failed for ${chainId}, trying next...`);
          }
      }
      throw new PTFError('ALL_RPC_FAILED', `Tous les endpoints RPC pour ${chainId} sont indisponibles`);
  }
}

// Configuration : minimum 2 RPC endpoints par chaîne
// Défaut : RPC publics gratuits. Remplacer par Alchemy/Infura si >1M req/mois.
const rpcConfig = {
    polygon: [
        process.env.POLYGON_RPC_PRIMARY    ?? "https://polygon-rpc.com",
        process.env.POLYGON_RPC_FALLBACK   ?? "https://rpc.ankr.com/polygon",
    ],
    ethereum: [
        process.env.ETHEREUM_RPC_PRIMARY   ?? "https://cloudflare-eth.com",
        process.env.ETHEREUM_RPC_FALLBACK  ?? "https://rpc.ankr.com/eth",
    ],
    // ...
};

// Endpoint de santé des chaînes
// GET /health/chains → { polygon: "healthy", ethereum: "healthy", bsc: "degraded" }
```

**Configuration :**

```typescript
// config/chains.ts
export const chainConfig = {
  default: process.env.DEFAULT_CHAIN ?? "polygon",   // configurable sans recompiler
  supported: ["polygon", "ethereum", "bsc", "avalanche", "arbitrum", "base"],
  rpc: {
    polygon: [process.env.POLYGON_RPC_PRIMARY, process.env.POLYGON_RPC_FALLBACK],   // min 2 endpoints
    ethereum: [process.env.ETHEREUM_RPC_PRIMARY, process.env.ETHEREUM_RPC_FALLBACK],
    bsc: [process.env.BSC_RPC_PRIMARY, process.env.BSC_RPC_FALLBACK],
    // ...
  },
  contracts: {
    polygon: {
      projectRegistry: process.env.POLYGON_PROJECT_REGISTRY,
      escrowVault: process.env.POLYGON_ESCROW_VAULT,
      creditToken: process.env.POLYGON_CREDIT_TOKEN,
      reputationRegistry: process.env.POLYGON_REPUTATION_REGISTRY,
    },
    // même structure pour chaque chaîne
  }
}
```

### Architecture hybride complète

```
┌─────────────────────────────────────────────────────────┐
│                    PTF Services                         │
│  ProjectSvc  TaskSvc  EscrowSvc  ReputationSvc  ...    │
└─────────────────────────┬───────────────────────────────┘
                          │ appels via interface ChainAdapter
┌─────────────────────────▼───────────────────────────────┐
│         Blockchain Abstraction Layer (BAL)              │
│  ChainRegistry → PolygonAdapter | EthereumAdapter | ... │
└──────┬────────────────────────────────────┬─────────────┘
       │                                    │
┌──────▼──────┐                   ┌─────────▼──────────┐
│   Chaîne    │   Ethereum  BSC   │  The Graph         │
│  configurée │   Avalanche ...   │  (indexeur multi-  │
│  (défaut)   │   Contracts       │   chaîne)          │
│  Contracts  │                   └────────────────────┘
└─────────────┘
       │
┌──────▼──────────────────────────────────────────────────┐
│  PostgreSQL (métadonnées mutables, sessions, locks)     │
│  Redis A Sentinel (locks Redlock, sessions, rate limit)  │
│  Redis B Cluster  (BullMQ queues, cache listings)       │
│  IPFS/Arweave (fichiers MD, specs — immuables)          │
└─────────────────────────────────────────────────────────┘
```

### Gestion multi-chaîne par projet

Chaque projet choisit sa chaîne à la création :

```typescript
interface Project {
  // ...champs existants...
  chainId: string;    // chaîne choisie par le créateur ("polygon", "ethereum", etc.)
  // stablecoin utilisé pour l'escrow sur cette chaîne
  stablecoin: "USDC" | "USDT" | "DAI";
}
```

```bash
ptf init --name "mon-projet" --type public --reward paid --chain polygon --token USDC
ptf init --name "mon-projet" --type private --chain ethereum --token USDC
ptf init --name "mon-projet" --type public --reward paid --chain bsc --token USDT
```

### Réputation cross-chaîne (unifiée)

La réputation d'un dev est unifiée même s'il travaille sur des projets de chaînes différentes.

**Reputation Aggregator :**

```typescript
interface ReputationAggregator {
  // Score global = somme pondérée des scores par chaîne
  getGlobalReputation(devAddress: string): Promise<{
    global: number;
    byChain: Record<string, number>;
  }>;

  // Identité cross-chaîne : un dev lie ses wallets de différentes chaînes
  linkWallet(primaryAddress: string, chainId: string, address: string, proof: string): Promise<void>;
  getLinkedWallets(primaryAddress: string): Promise<Record<string, string>>;
}
```

- Score stocké on-chain sur chaque chaîne où le dev a travaillé
- `ReputationAggregator` (service backend) agrège via The Graph
- Dev peut lier ses wallets multi-chaînes via signature croisée

### Crédits PTF cross-chaîne

```
PTF Credits déployés sur chaque chaîne supportée.
Transfert cross-chaîne via bridge officiel LayerZero.
1 PTF credit = 1 USDC sur n'importe quelle chaîne supportée.
```

**Bridge avec receipts, timeout et remboursement automatique :**

```typescript
interface BridgeReceipt {
    bridgeId: string;
    fromChain: string;
    toChain: string;
    devAddress: string;
    amount: number;           // float PTF credits
    status: "pending" | "completed" | "failed" | "refunded";
    sourceTxHash: string;
    destinationTxHash?: string;
    initiatedAt: Date;
    completedAt?: Date;
    expiresAt: Date;          // timeout : initiatedAt + 30 minutes
}

class CrossChainBridge {
    private readonly BRIDGE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    async bridge(fromChain: string, toChain: string, devAddress: string, amount: number): Promise<BridgeReceipt> {
        // 1. Vérifier que bridge sortant respecte le soft-lock
        const balance = await chainAdapter.getCreditBalance(devAddress);
        const softLocked = await chainAdapter.getSoftLocked(devAddress);
        if (balance - softLocked < amount) {
            throw new PTFError('INSUFFICIENT_BRIDGEABLE_BALANCE',
                'Le montant dépasse le solde disponible (hors soft-lock actif).');
        }

        // 2. Brûler les crédits sur la chaîne source
        const burnTx = await chainAdapters.get(fromChain).burnCredits(devAddress, amount);

        // 3. Créer le receipt avec timeout
        const receipt = await db.bridgeReceipts.create({
            status: 'pending',
            expiresAt: new Date(Date.now() + this.BRIDGE_TIMEOUT),
            sourceTxHash: burnTx,
        });

        // 4. Envoyer le message LayerZero
        await layerZero.send(fromChain, toChain, { devAddress, amount, receiptId: receipt.bridgeId });

        return receipt;
    }

    // Appelé par le listener LayerZero à la réception
    async onBridgeCompleted(receiptId: string, destTxHash: string): Promise<void> {
        await db.bridgeReceipts.update(receiptId, { status: 'completed', destinationTxHash: destTxHash });
    }

    // Cron job toutes les 5 minutes : rembourser les bridges expirés
    async processExpiredBridges(): Promise<void> {
        const expired = await db.bridgeReceipts.findExpired(); // status=pending AND expiresAt < now
        for (const receipt of expired) {
            // Rembourser sur la chaîne source
            await chainAdapters.get(receipt.fromChain).mintCredits(
                receipt.devAddress, receipt.amount, `bridge-refund:${receipt.bridgeId}`
            );
            await db.bridgeReceipts.update(receipt.bridgeId, { status: 'refunded' });
            await notificationService.notify(receipt.devAddress, 'BRIDGE_REFUNDED', receipt);
        }
    }

    estimateBridgeFee(fromChain: string, toChain: string, amount: number): Promise<number>;
}

// Commandes CLI
// ptf wallet bridge --from polygon --to ethereum --amount 50
// ptf wallet bridge status <bridgeId>    // suivre l'état d'un bridge
```

### The Graph — multi-chaîne

The Graph supporte nativement plusieurs chaînes. Un subgraph par chaîne, agrégation dans le backend :

```typescript
class GraphIndexer {
  getSubgraph(chainId: string): SubgraphClient;

  // Requête cross-chaîne automatique
  queryAllChains<T>(query: string, filter: object): Promise<Record<string, T[]>>;
}
```

### Structure des smart contracts

Les smart contracts sont identiques en logique Solidity — ils sont déployés sur chaque chaîne EVM supportée. Pour Solana, des équivalents en Rust (Anchor) sont fournis.

```
contracts/
  evm/                    ← Solidity (EVM-compatible)
    ProjectRegistry.sol
    EscrowVault.sol
    CreditToken.sol
    ReputationRegistry.sol
  solana/                 ← Anchor/Rust (Solana)
    project_registry.rs
    escrow_vault.rs
    credit_token.rs
    reputation_registry.rs
  interfaces/             ← ABIs partagés
```

### Variables d'environnement — structure multi-chaîne

```bash
# Chaîne par défaut
DEFAULT_CHAIN=polygon

# RPC par chaîne — minimum 2 endpoints (primary + fallback) pour le failover ChainRegistry
# Défaut : RPC publics gratuits. Passer à Alchemy/Infura uniquement si >1M req/mois.
POLYGON_RPC_PRIMARY=https://polygon-rpc.com           # public gratuit
POLYGON_RPC_FALLBACK=https://rpc.ankr.com/polygon     # Ankr free tier
ETHEREUM_RPC_PRIMARY=https://cloudflare-eth.com        # public gratuit
ETHEREUM_RPC_FALLBACK=https://rpc.ankr.com/eth         # Ankr free tier
BSC_RPC_PRIMARY=https://bsc-dataseed.binance.org/      # officiel gratuit
BSC_RPC_FALLBACK=https://bsc-dataseed1.ninicoin.io/
# POLYGON_RPC_PRIMARY=https://polygon-mainnet.g.alchemy.com/v2/<key>   # si >1M req/mois
# ETHEREUM_RPC_PRIMARY=https://eth-mainnet.g.alchemy.com/v2/<key>      # si >1M req/mois

# Adresses contrats par chaîne
POLYGON_PROJECT_REGISTRY=0x...
POLYGON_ESCROW_VAULT=0x...
POLYGON_CREDIT_TOKEN=0x...
POLYGON_REPUTATION_REGISTRY=0x...

ETHEREUM_PROJECT_REGISTRY=0x...
# ... même pattern pour chaque chaîne

# Redis — Instance A (Sentinel, locks + sessions)
REDIS_SENTINEL_1=redis-sentinel-1.internal
REDIS_SENTINEL_2=redis-sentinel-2.internal
REDIS_SENTINEL_3=redis-sentinel-3.internal
REDIS_SENTINEL_MASTER_NAME=ptf-sentinel-master

# Redis — Instance B (Cluster, BullMQ + cache)
REDIS_CLUSTER_1=redis-cluster-1.internal
REDIS_CLUSTER_2=redis-cluster-2.internal
REDIS_CLUSTER_3=redis-cluster-3.internal

# The Graph
GRAPH_POLYGON_URL=https://api.thegraph.com/subgraphs/name/ptf/polygon
GRAPH_ETHEREUM_URL=https://api.thegraph.com/subgraphs/name/ptf/ethereum

# Stockage décentralisé
ARWEAVE_WALLET_KEY=...
IPFS_NODE_URL=...
```

### IPFS / Arweave pour les fichiers de documentation

```typescript
interface DecentralizedStorage {
  store(content: string, metadata: object): Promise<ContentRef>;
  retrieve(ref: ContentRef): Promise<string>;
}

interface ContentRef {
  protocol: "ipfs" | "arweave";
  hash: string;          // CID pour IPFS, txId pour Arweave
  url: string;           // gateway URL pour lecture
}
```

- `ARCHITECTURE.md` → stocké sur Arweave à la création du projet (permanent)
- `PLAN_ACTION.md` → stocké sur Arweave à la création du projet
- Hash ancré on-chain dans `ProjectRegistry.registerProject()`
- Lecture via gateway Arweave : `https://arweave.net/<txId>`

### Runbook : ajouter une chaîne à PTF

```
Étape 1 : Créer l'adapter
  → Créer backend/bal/adapters/<chain>Adapter.ts
  → Implémenter ChainAdapter interface
  → Tests unitaires : toutes les méthodes mockées

Étape 2 : Déployer les 4 smart contracts
  → Déployer CreditToken.sol sur la nouvelle chaîne
  → Déployer ReputationRegistry.sol
  → Déployer EscrowVault.sol (référence CreditToken)
  → Déployer ProjectRegistry.sol (référence tous les autres)
  → Vérifier les contrats sur l'explorateur de la chaîne

Étape 3 : Enregistrer dans ChainRegistry
  → Ajouter les adresses dans config/chains.ts
  → Ajouter les variables d'environnement RPC et adresses
  → Enregistrer l'adapter : registry.register(new <Chain>Adapter(...))

Étape 4 : Déployer le subgraph The Graph
  → Créer subgraph/networks/<chain>/subgraph.yaml
  → Déployer : graph deploy ptf/<chain>
  → Ajouter GRAPH_<CHAIN>_URL dans les variables d'environnement

Étape 5 : Configurer le bridge (si cross-chain credits)
  → Configurer LayerZero endpoint pour la nouvelle chaîne
  → Tester bridge Polygon ↔ nouvelle chaîne sur testnet
  → Ajouter dans CrossChainBridge.supportedRoutes

Étape 6 : Validation et documentation
  → Tests d'intégration end-to-end sur testnet
  → Mettre à jour la liste des chaînes supportées dans README.md
  → Mettre à jour ARCHITECTURE.md section BAL
  → Annoncer la nouvelle chaîne dans les notes de version
```

---

## Smart Contracts (déployés via ChainAdapter)

Les smart contracts décrits ci-dessous représentent la logique commune. Ils sont déployés sur chaque chaîne EVM supportée via le BAL. Tout appel passe par `ChainRegistry.get(project.chainId)`.

### 1. ProjectRegistry

**Rôle :** Registre immuable de tous les projets créés sur PTF.

```solidity
enum RewardMode { Free, Paid }

struct Project {
    bytes32    projectId;   // keccak256(ownerAddress + projectName + timestamp) — généré par ptf init
    address    owner;
    RewardMode rewardMode;  // Free = non-rémunéré, Paid = rémunéré
    uint256    totalBudget; // en CreditToken (USDC-pegged) — 0 pour les projets Free
    uint256    commission;  // commission PTF prélevée upfront — 0 pour les projets Free
    bytes32    taskSetHash; // keccak256(sorted taskIds) — remplace merkleRoot
    uint256    createdAt;
    ProjectStatus status;   // Open | InProgress | Completed | Archived
}

function registerProject(bytes32 projectId, bytes32 taskSetHash, uint256 budget) external;
function updateTaskSetHash(bytes32 projectId, bytes32 newHash) external onlyBackend;
function getProject(bytes32 projectId) external view returns (Project memory);

// Enregistrement on-chain d'un claim validé avec hash des conditions signées
function claimTask(
    bytes32 taskId,
    address devAddress,
    bytes32 conditionsHash
) external onlyBackend;
// Stocke le claim avec hash des conditions acceptées par le dev
// Émet TaskClaimed(taskId, devAddress, conditionsHash, deadline)
// L'appel échoue si la tâche est déjà claim on-chain (couche de sécurité supplémentaire)
```

`claimTask` est appelé par le backend après validation atomique (lock Redis + vérifications + confirmation dev). Le `conditionsHash` est calculé à partir des conditions exactes affichées au dev lors de la confirmation : toute contestation postérieure est objectivement tranchable.

### 2. EscrowVault

**Rôle :** Coffre-fort qui bloque les fonds du client upfront, libère les récompenses après validation, gère le soft-lock de la garantie développeur et exécute les déductions de punitions. Activé uniquement pour les projets paid (`rewardMode == Paid`).

**Dépôt initial du créateur (`ptf tasks publish`) :**

Le créateur dépose en une seule transaction :

```typescript
interface ProjectEscrowDeposit {
    rewardPool:     number;   // somme des rewards de toutes les tâches (USDC)
    gasReserve:     number;   // estimation des gas fees pour toutes les tx du projet
    ptfCommission:  number;   // commission PTF (grille dégressive 8–12%)
    total:          number;   // rewardPool + gasReserve + ptfCommission
}

// Estimation gasReserve lors de ptf generate :
// gasReserve ≈ nbTâches × gasParTâche × gasPrix × 1.5 (marge de sécurité)
// Ex: 20 tâches × 150k gas × 30 gwei × 1.5 = ~0.135 MATIC ≈ $0.10
// Les gas fees sont prélevées sur la gasReserve du projet — jamais sur la trésorerie PTF
```

Les gas fees ne sont donc **jamais un coût pour PTF** : elles sont intégralement préfinancées par le créateur lors du dépôt initial.

```solidity
function deposit(bytes32 projectId, uint256 amount) external;
// Bloque `amount` de CreditToken pour le projet (rewardPool + gasReserve + commission)
// Reverts si ProjectRegistry.rewardMode(projectId) != Paid

function releaseToDev(bytes32 taskId, address developer, uint256 amount) external onlyBackend;
// Libère la récompense vers le wallet du développeur après validation

function refund(bytes32 projectId) external onlyBackend;
// Rembourse les fonds restants si le projet est annulé

function getBalance(bytes32 projectId) external view returns (uint256);

// Nouveau : gestion soft-lock garantie 10 crédits
function softLock(address developer, uint256 amount) external onlyBackend;
// Marque `amount` crédits comme indisponibles pour retrait (garantie active)

function softUnlock(address developer, uint256 amount) external onlyBackend;
// Libère le soft-lock après validation ou expiration de la tâche

function getAvailableBalance(address developer) external view returns (uint256);
// Retourne creditBalance - softLockedAmount (montant réellement retirable)

// Nouveau : déduction punitions avec distribution 80/20
function applyPunishment(
    address dev,
    uint256 creditAmount,
    bytes32 projectId
) external nonReentrant onlyPunishmentService {
    // Checks-effects-interactions
    require(creditBalances[dev] >= creditAmount, "Insufficient balance");
    creditBalances[dev] -= creditAmount;

    // Distribution : 80 % → trésorerie PTF / 20 % → fonds du projet
    uint256 toPlatform = (creditAmount * 80) / 100;
    uint256 toProject  = creditAmount - toPlatform;   // évite les erreurs d'arrondi

    platformTreasury            += toPlatform;
    projectFund[projectId]      += toProject;

    emit PunishmentApplied(dev, creditAmount, toPlatform, toProject, projectId);
}
// Appelé uniquement pour les projets paid (PunishmentService vérifie rewardMode avant d'appeler)
```

Le backend PTF est le seul autorisé à appeler `releaseToDev`, `softLock`, `softUnlock` et `refund` (rôle `BACKEND_ROLE` contrôlé par multisig). Seul le `PunishmentService` (via son rôle dédié) peut appeler `applyPunishment`.

#### Protections obligatoires — C-01 (reentrancy)

Toutes les fonctions d'EscrowVault qui émettent des transferts **doivent** appliquer le pattern checks-effects-interactions et le modificateur `nonReentrant` d'OpenZeppelin.

```solidity
// Pattern checks-effects-interactions OBLIGATOIRE sur toutes les fonctions de transfert
function releaseToDev(bytes32 projectId, bytes32 taskId, address dev, uint256 amount) external nonReentrant onlyBackend {
    // 1. CHECKS
    require(escrowBalance[projectId] >= amount, "Insufficient escrow");
    require(softLocked[dev] >= GUARANTEE_AMOUNT, "Soft lock missing");

    // 2. EFFECTS — toujours AVANT les appels externes
    escrowBalance[projectId] -= amount;
    softLocked[dev] -= GUARANTEE_AMOUNT;

    // 3. INTERACTIONS — appel externe EN DERNIER
    SafeERC20.safeTransfer(IERC20(usdcToken), dev, amount);
    CreditToken(creditToken).mint(dev, amount, taskId);
}
```

**Règles :**
- `nonReentrant` (OpenZeppelin) sur TOUTES les fonctions d'EscrowVault qui émettent des transferts
- `SafeERC20.safeTransfer` au lieu de `transfer` direct
- CreditToken doit être un ERC-20 standard SANS hooks de callback (pas ERC-777)
- Audit externe obligatoire (Trail of Bits / OpenZeppelin / Certik) avant tout déploiement mainnet

### 3. CreditToken (ERC-20 + EIP-712)

**Rôle :** Token stable de la plateforme. 1 crédit PTF = 1 USDC. Désormais enrichi de l'extension EIP-712 permit pour garantir l'authenticité de chaque opération de mint.

**Précision décimale :** `CreditToken` utilise **6 décimales** (`decimals() = 6`), aligné sur USDC — et non 18 comme ETH. Les crédits sont stockés en `uint256` avec cette précision. Le frontend affiche toujours les valeurs en `float64` (ex : `10500000` on-chain = `10.50 PTF` à l'affichage).

```solidity
// ERC-20 standard + extensions PTF

function mintFromUSDC(address to, uint256 amount) external onlyVault;
// Mintage 1:1 contre dépôt USDC dans la réserve

function burnToUSDC(address from, uint256 amount) external;
// Conversion inverse : brûle des crédits et libère les USDC équivalents

function transferInternal(address from, address to, uint256 amount) external onlyBackend;
// Transferts internes (reviews, audits, actions de la plateforme)

// Nouveau : EIP-712 permit (crédits signés)
function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external;
// Permet d'autoriser une dépense de crédits sans transaction on-chain préalable
// Chaque autorisation est signée par le smart contract PTF (EIP-712 typed data)

function verifyMint(
    address to,
    uint256 amount,
    uint256 nonce,
    bytes memory signature
) external view returns (bool);
// Vérifie off-chain qu'un mint de crédit est authentique
// Utilisé par : ptf wallet verify <address>
```

**Crédits signés EIP-712 :**

Chaque mint de crédit est signé par le smart contract PTF selon le standard EIP-712. Cela permet :
- De vérifier off-chain l'authenticité d'un crédit (`ptf wallet verify <address>`)
- D'invalider toute tentative de falsification de solde ou d'historique
- De consulter l'historique complet de tous les crédits signés, vérifiable on-chain

**Propriétés :**
- Stable : 1:1 avec USDC, réserve auditée
- Transférable uniquement dans l'écosystème PTF (pas de transfert peer-to-peer libre)
- Monétisable : le développeur peut convertir ses crédits en USDC ou crypto via `burnToUSDC`
- Authentifié : chaque opération de mint est signée EIP-712 et vérifiable on-chain

#### Signatures EIP-712 avec nonces anti-replay — C-02

La structure de domaine EIP-712 doit être correctement configurée pour empêcher les attaques cross-chain et les replays de signature.

```solidity
// Structure de domaine EIP-712 CORRECTE
bytes32 constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);

// DOMAIN_SEPARATOR doit utiliser block.chainid DYNAMIQUE (jamais hardcodé)
function _domainSeparator() internal view returns (bytes32) {
    return keccak256(abi.encode(
        DOMAIN_TYPEHASH,
        keccak256("PTF"),
        keccak256("1"),
        block.chainid,          // dynamique, pas de hardcode
        address(this)
    ));
}

// Nonce par (devAddress, taskId) — usage unique, invalide après claim
mapping(address => mapping(bytes32 => uint256)) public claimNonces;

struct ClaimMessage {
    bytes32 taskId;
    address devAddress;
    bytes32 conditionsHash;
    uint256 nonce;              // nonce incrémental par (dev, task)
    uint256 deadline;           // timestamp d'expiration de la signature
}
```

**Règles :**
- `chainId` + `verifyingContract` OBLIGATOIRES dans le DOMAIN_SEPARATOR
- Nonce incrémental par (devAddress, taskId) dans ProjectRegistry
- Nonce invalide après usage (côté backend ET on-chain)
- Signatures d'ownership wallet : nonce côté backend, usage unique, TTL 5 minutes max
- Deadline sur chaque signature (timestamp d'expiration)

### 3b. CreditToken — pénalités

`applyPunishment()` (via `EscrowVault`) est appelé uniquement pour les projets paid. Le `PunishmentService` vérifie `rewardMode == Paid` avant de soumettre toute déduction de crédits.

### 4. ReputationRegistry

**Rôle :** Registre on-chain des scores de réputation, immuable et auditable. Toujours actif, que le projet soit free ou paid.

```solidity
struct ReputationEntry {
    address user;
    uint256 score;
    uint256 lastUpdated;
    uint256 tasksCompleted;
    uint256 disputesWon;
    uint256 disputesLost;
}

function updateScore(address user, int256 delta, bytes32 reason) external onlyBackend;
// Seul le backend peut mettre à jour les scores (via multisig)
// S'applique sur tous les projets, free et paid

function getScore(address user) external view returns (uint256);

function getHistory(address user) external view returns (ReputationEntry[] memory);
// Historique complet consultable par tous
```

---

## CLI PTF — Flux complet pré-projet et commandes

### Flux complet avant publication d'un projet

```
[Phase 0 — Rédaction des docs (3 modes au choix)]

1. ptf auth                    ← Auth GitHub + wallet
         |
         v
   MODE 1 — Expert :
     Rédiger ARCHITECTURE.md + PLAN_ACTION.md manuellement depuis les templates PTF

   MODE 2 — Interactif :
     ptf scaffold --name "mon-projet"        ← templates vides (optionnel)
     ptf describe                             ← interview guidée → fichiers générés
     (ptf fix-docs si validate-docs échoue)

   MODE 3 — IA-assisté (recommandé pour vibecoders) :
     /ptf-architect "description" dans l'éditeur IA
     → IA génère ARCHITECTURE.md + PLAN_ACTION.md conformes PTF

   MODE 4 — Import GitHub Issues (< 15 minutes) :
     ptf import-issues --repo owner/repo --label "help wanted"
     → Tâches PTF générées depuis les issues labellisées
     → ptf validate-docs --auto (warnings non-bloquants pour le 1er projet)
     → ptf tasks preview → ptf tasks publish

[Phase 1 — Création du projet]

         |
         v
2. ptf validate-docs           ← Commun aux 4 modes — filet de sécurité
   --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
         |
         v (si valide)
3. ptf init --name "mon-projet" --type public --reward free|paid [--language typescript]
   ou ptf init --name "mon-projet" --type private [--language typescript]   # toujours paid
                               ← Génère projectId = keccak256(owner + name + ts)
                               ← Sauvegarde .ptf/config.json (inclut rewardMode)
                               ← Crée le projet PTF (statut: draft)

[Phase 2 — Génération des tâches]

         |
         v
4. ptf generate                ← Génère arbre de tâches (estimation + confirmation)
   --project <projectId>
   --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
         |
         v (si confirmé)
5. ptf tasks preview           ← Revue humaine des tâches générées (avant paiement)
   --project <projectId>
         |
         v (si approuvé)
6. ptf tasks publish           ← Calcule coût total, demande paiement, publie dans réseau PTF
   --project <projectId>
```

---

## Guide d'onboarding développeur — Parcours complet

### Étape 1 — Installation
```bash
npm install -g @ptf/cli
ptf --version   # vérifier l'installation
```

### Étape 2 — Authentification GitHub
```bash
ptf auth login
# → Ouvre le navigateur pour l'OAuth GitHub
# → Lie ton compte GitHub à PTF
# → Crée un profil PTF avec réputation initiale = 0
```

### Étape 3 — Connexion du wallet crypto
```bash
ptf wallet connect
# → Supporte : MetaMask, WalletConnect, Ledger
# → Lie le wallet à ton compte PTF
# → Vérification ownership (signature d'un nonce)
```

### Étape 4 — Recharger son compte (projets paid uniquement)
```bash
# Vérifier d'abord les adresses officielles PTF
ptf network addresses --chain polygon

# Déposer des fonds (minimum 10 PTF pour les tâches paid)
ptf wallet deposit --chain polygon --amount 10 --token USDC
# OU en crypto/fiat
ptf wallet deposit --currency ETH --amount 0.01
ptf wallet convert --from EUR --amount 12

# Vérifier le solde
ptf wallet balance
```

### Étape 5 — Découvrir les tâches
```bash
# Projets publics free (open source, réputation seulement)
ptf tasks list --type public --reward free --skill typescript

# Projets rémunérés (nécessite ≥ 10 PTF en compte)
ptf tasks list --min-reward 50 --skill typescript
ptf tasks list --skill python --max-reward 200

# Voir le détail d'une tâche
ptf task show <taskId>
```

### Étape 6 — Réclamer une tâche
```bash
ptf task claim <taskId>
# → Vérifie automatiquement les critères de réclamation
# → Affiche les conditions complètes (durée, reward, punitions, langue)
# → Confirmation interactive [o/N]
# → Attribution + signature EIP-712 automatique
```

### Étape 7 — Travailler sur la tâche
```bash
# Voir ses tâches actives (tous projets)
ptf tasks mine

# Pour les projets privés : télécharger les interfaces/specs
ptf task spec <taskId>   # télécharge la spec dans ./ptf-spec/

# Pour les projets publics : cloner le repo normalement
```

### Étape 8 — Soumettre
```bash
ptf submit <taskId> --branch feat/impl-<taskId>
# → Déclenche la validation automatique (verificationSteps)
# → Notifie quand peer review disponible
```

### Étape 9 — Suivre la validation
```bash
ptf task status <taskId>   # statut en temps réel
```

### Étape 10 — Recevoir ses crédits
```bash
# Après validation client → crédits automatiquement crédités
ptf wallet balance   # vérifier

# Retirer vers son wallet (minimum 1.0 PTF)
ptf wallet withdraw --amount 50.0 --to 0x...
```

### Niveaux de réputation
| Niveau   | Points | Avantages |
|----------|--------|-----------|
| Unranked | 0–99   | Accès tâches free uniquement |
| Junior   | 100–499 | Accès tâches paid simples |
| Senior   | 500–1999 | Accès toutes les tâches paid |
| Expert   | 2000+  | Éligible peer reviewer, accès tâches critiques |

### Questions fréquentes
- "Je n'ai pas de wallet crypto" → utiliser le wallet custodial PTF (option dans ptf wallet connect)
- "Mon solde est insuffisant" → ptf wallet deposit --currency EUR --amount 12
- "La tâche est claimed par quelqu'un d'autre" → essayer une autre tâche du même projet
- "Je ne comprends pas une tâche" → ptf task discuss <taskId>
- "Je veux abandonner une tâche" → ptf task cancel <taskId> (voir les pénalités associées)

---

### `ptf auth`

Authentifie l'utilisateur via GitHub OAuth et connecte son wallet.

```bash
ptf auth

# Actions :
# - Ouvre le flux GitHub OAuth dans le navigateur
# - Lie le compte GitHub au wallet (signature MetaMask/WalletConnect)
# - Stocke le JWT dans ~/.ptf/credentials (TTL: 24h, refresh automatique)
# - Affiche : adresse wallet connectée, score de réputation, solde PTF
```

### `ptf validate-docs`

Vérifie que `ARCHITECTURE.md` et `PLAN_ACTION.md` respectent le format PTF strict. Doit être exécutée avant `ptf generate`. Commande commune aux 3 modes de création.

```bash
ptf validate-docs \
  --architecture ARCHITECTURE.md \
  --plan PLAN_ACTION.md

# Vérifie pour ARCHITECTURE.md (7 sections canoniques) :
# - Présence des 7 sections obligatoires :
#   1. ## Objectif du projet (description 1-3 phrases + critère mesurable + public cible)
#   2. ## Hors-scope (minimum 3 items explicites)
#   3. ## Modules / Composants (tableau Nom | Rôle | Inputs | Outputs | Dépend de)
#   4. ## Interfaces (blocs TypeScript pour chaque interface exposée)
#   5. ## Contraintes techniques (Performance + Sécurité + Compatibilité + Couverture tests)
#   6. ## Dépendances d'implémentation (ordre entre modules)
#   7. ## Glossaire (termes spécifiques au projet)
# - Contenu non vide et mesurable (détecte les termes vagues)
# - Chaque module a : rôle, inputs, outputs, contraintes (tableau)

# Vérifie pour PLAN_ACTION.md :
# - Présence des sections obligatoires (Objectif, Phases, Hors-scope,
#   Critères de succès globaux)
# - Objectif avec critère de succès mesurable
# - Phases avec jalons et livrables vérifiables
```

**Rapport enrichi (format complet) :**

```
PTF validate-docs — Rapport

✅ Objectif du projet         : OK
✅ Hors-scope                 : OK
⚠️  Module "ReservationService"
    → Interface manquante : que retourne réserverOutil() ?
    → Exemple attendu : ReservationResult { id, startDate, endDate, status }
⚠️  Contraintes techniques
    → Aucune contrainte de performance définie
    → Exemple attendu : "Recherche d'outils < 300ms"
❌  Critères de succès globaux
    → Section vide
    → Complète : comment savoir que le projet est terminé ?

2 avertissements, 1 erreur bloquante.
Lance "ptf fix-docs" pour corriger en mode interactif.
```

- `✅` — section conforme
- `⚠️` — avertissement non bloquant (la génération peut continuer mais la qualité sera réduite)
- `❌` — erreur bloquante (génération impossible tant que non corrigée)

### `ptf describe` (Mode 2 — interactif)

Lance un interview interactif en langage naturel pour générer `ARCHITECTURE.md` et `PLAN_ACTION.md` sans les rédiger manuellement. Utile pour les vibecoders qui préfèrent répondre à des questions plutôt qu'éditer des templates.

```bash
ptf describe
ptf describe --output ./docs   # dossier de sortie

# Actions :
# - Lance une session d'interview guidée (DocumentGeneratorService)
# - Pose des questions en langage naturel sur le projet, les modules, les contraintes
# - Génère ARCHITECTURE.md + PLAN_ACTION.md dans le dossier courant (ou --output)
# - À la fin : suggère de lancer ptf validate-docs pour vérification
```

### `ptf fix-docs` (Mode 2 — corrections guidées)

Reprend exactement les erreurs de `ptf validate-docs` et repose des questions ciblées pour corriger les problèmes détectés. Conçu pour itérer rapidement après un rapport de validation.

```bash
ptf fix-docs
ptf fix-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md

# Actions :
# - Lit le dernier rapport de ptf validate-docs (ou le génère si absent)
# - Pour chaque ⚠️ ou ❌ détecté : pose une question ciblée à l'utilisateur
# - Met à jour les fichiers avec les réponses collectées
# - Relance une validation interne pour confirmer la correction
# - Suggère de relancer ptf validate-docs pour vérification finale
```

### `ptf scaffold`

Génère les templates PTF vides ou pré-remplis depuis un repo existant. Utile comme point de départ pour les Modes 1 et 3.

```bash
ptf scaffold --name "mon-projet"                      # templates vides
ptf scaffold --github owner/repo --name "mon-projet"  # pré-rempli depuis repo existant

# Actions (templates vides) :
# - Génère ARCHITECTURE.md (template avec toutes les sections obligatoires + instructions inline)
# - Génère PLAN_ACTION.md (template avec toutes les sections obligatoires + exemples)
# - Les instructions sont formulées en langage naturel compréhensible par une IA (Mode 3)

# Actions (--github owner/repo) :
# - Analyse le repo GitHub (README, structure, langages, dépendances)
# - Pré-remplit les sections détectables (stack technique, structure des modules, etc.)
# - Laisse des placeholders pour les sections nécessitant une décision humaine
```

### Templates de projet par secteur

PTF propose des templates pré-configurés par secteur pour accélérer la création de projet. Chaque template pré-remplit `ARCHITECTURE.md` et `PLAN_ACTION.md` avec les modules, phases, contraintes et interfaces typiques du domaine.

```bash
# Templates prêts à l'emploi par secteur
ptf scaffold --template api-rest            # API REST Node.js/TypeScript
ptf scaffold --template cli-tool            # Outil CLI Node.js
ptf scaffold --template frontend-component  # Composant React/Next.js
ptf scaffold --template smart-contract      # Smart contract Solidity/EVM
ptf scaffold --template mobile-app          # App React Native
ptf scaffold --template python-lib          # Bibliothèque Python
```

Chaque template pré-remplit :
- `ARCHITECTURE.md` avec les modules typiques du secteur
- `PLAN_ACTION.md` avec les phases et tâches types
- Les contraintes techniques courantes (couverture, linters, langages)
- Les interfaces standard du secteur

### `ptf estimate` (optionnel)

Calcule une estimation ROI standalone avant génération des tâches. Cette estimation est également affichée automatiquement au début de `ptf generate` — cette commande est utile pour une consultation rapide sans déclencher la génération.

```bash
ptf estimate \
  --architecture ARCHITECTURE.md \
  --plan PLAN_ACTION.md

# Délègue au TaskGeneratorService :
# - Parse les 2 fichiers MD
# - Identifie modules, composants, phases, dépendances
# - Estime complexité par zone (smart contracts, backend, CLI, frontend, etc.)
# - Calcule reward pool suggéré par tâche
# - Calcule commission PTF (grille dégressive : 12% <5k, 10% 5k–50k, 8% >50k USDC)
# - Affiche le rapport ROI complet (voir section TaskGeneratorService)
# Note : ne déclenche pas la génération — pour générer, utiliser ptf generate
```

### `ptf generate`

Génère l'arbre de tâches complet via le `TaskGeneratorService`. Requiert que le projet ait été créé avec `ptf init`.

```bash
ptf generate \
  --project <projectId> \
  --architecture ARCHITECTURE.md \
  --plan PLAN_ACTION.md

# Pré-requis : ptf init doit avoir été exécuté (projectId dans .ptf/config.json ou --project)
# Pré-requis : ptf validate-docs doit avoir passé (ou le format est vérifié automatiquement)
# Actions :
# - Affiche l'estimation ROI (nb tâches, reward pool, commission PTF grille 8–12%) + demande confirmation
# - Si confirmé : délègue au TaskGeneratorService (LLM configuré par l'utilisateur)
# - Génère l'arbre de tâches lié au projectId avec tous les champs enrichis :
#     context, objective, deliverable, outOfScope, verificationSteps
# - Hérite codeLanguage de la config projet pour chaque tâche
# - Calcule les taskIds (Merkle), les dépendances et les rewards
# - Vérifie la cohérence du graphe (pas de cycles)
# - Affiche un résumé : N tâches générées, budget total, warnings éventuels
```

### `ptf tasks preview`

Affiche les tâches générées pour revue humaine avant publication et paiement.

```bash
ptf tasks preview --project <projectId>

# Affiche chaque tâche avec :
# - Titre, contexte, objectif, livrable
# - Dépendances (arbre visuel ASCII)
# - verificationSteps (commandes de validation)
# - Reward suggéré, langue requise
# - outOfScope

# Mode interactif : permet de modifier/supprimer des tâches avant paiement
# Produit l'arbre de tâches annoté "approuvé" prêt pour ptf tasks publish
```

### `ptf tasks publish`

Publie les tâches approuvées sur le réseau PTF et dépose l'escrow. C'est à cette étape seulement que le paiement est demandé.

```bash
ptf tasks publish --project <projectId>

# Pré-requis : ptf tasks preview doit avoir approuvé les tâches
# Actions :
# - Si paid : Calcule le coût total (reward pool + commission PTF selon grille 8–12%)
#             Affiche le montant total et demande confirmation de paiement
# - Si free : aucun paiement (confirmation de publication uniquement)
# - Transaction on-chain (via ChainAdapter) : registerProject sur ProjectRegistry (avec rewardMode)
# - Si paid : Transaction on-chain (via ChainAdapter) : deposit sur EscrowVault (reward pool + commission PTF)
# - Calcule les taskIds et le networkId pour chaque tâche
# - Calcule le taskSetHash = keccak256(sorted taskIds) et le met à jour sur ProjectRegistry
# - Broadcast dans le réseau PTF (tâches publiques en clair, privées avec métadonnées seules)
# - Affiche : N tâches publiées | paid: escrow déposé, commission PTF prélevée | free: aucun escrow
```

---

### `ptf init`

Initialise un nouveau projet PTF dans le répertoire courant. C'est la première commande à exécuter — elle génère le `projectId` requis par toutes les commandes suivantes.

```bash
ptf init \
  --name "mon-projet" \
  --type public \          # public (GitHub) ou private (entreprise)
  --reward free \          # free (non-rémunéré) ou paid (rémunéré) — ignoré si --type private (toujours paid)
  --language typescript \  # langue principale (configurable, défaut: TypeScript)
  --chain polygon \        # chaîne cible (défaut: DEFAULT_CHAIN dans .env, ex: polygon/ethereum/bsc/avalanche/arbitrum/base)
  --token USDC \           # stablecoin d'escrow (défaut: USDC) — USDC/USDT/DAI selon la chaîne
  --budget 5000            # budget indicatif en USDC (uniquement pour projets paid, ajustable avant publish)

# Exemples :
#   ptf init --name "mon-projet" --type public --reward free --language typescript
#   ptf init --name "mon-projet" --type public --reward paid --language typescript --chain polygon --token USDC
#   ptf init --name "mon-projet" --type private --language typescript --chain ethereum  # toujours paid

# Actions :
# - Génère projectId = keccak256(ownerAddress + projectName + timestamp)
# - Affiche le projectId à l'écran
# - Crée .ptf/config.json avec projectId, projectName, ownerAddress, rewardMode, chainId, stablecoin, createdAt
# - Crée ptf.yaml (configuration locale du projet)
# - Crée tasks/ (répertoire des définitions de tâches)
# - Enregistre le projet sur la plateforme PTF (statut: draft)
# Note : l'enregistrement on-chain (via ChainAdapter) se fait à ptf tasks publish
# Note : pour les projets free, EscrowVault n'est pas sollicité (pas de dépôt stablecoin)
```

### `ptf link`

Lie un repo GitHub existant à un projet PTF déjà enregistré sur la plateforme.

```bash
ptf link --project-id 0xabc123... --repo github.com/org/repo

# Actions :
# - Vérifie que le caller est owner du projectId
# - Installe le webhook GitHub -> PTF Notification Service
# - Synchronise les issues GitHub ouvertes comme tâches PTF (optionnel)
```

### `ptf push`

Synchronise les définitions de tâches locales (fichiers YAML dans `tasks/`) vers la plateforme et les diffuse dans le réseau PTF.

```bash
ptf push

# Actions :
# - Lit les fichiers dans tasks/*.yaml
# - Calcule les taskIds et le networkId pour chaque tâche
# - Calcule le taskSetHash = keccak256(sorted taskIds) et le met à jour sur ProjectRegistry
# - Crée/met à jour les tâches dans le backend PTF
# - Calcule les récompenses via le moteur d'évaluation du coût
# - Broadcast dans le réseau PTF (tâches publiques en clair, privées avec métadonnées seules)
# - Affiche le récapitulatif : N tâches synchronisées, budget total, commission PTF
```

### `ptf task show`

Affiche toutes les conditions d'une tâche. Effectue une pré-vérification immédiate du solde PTF.

```bash
ptf task show <taskId>

# Pour projets paid uniquement — pré-vérification immédiate : solde PTF >= 10 crédits
# → Si insuffisant : "Solde insuffisant. Minimum 10 PTF requis. Déposez des crédits: ptf wallet deposit"
# → Pour projets free : aucune vérification de solde, affichage direct

# Affiche :
# - Titre, contexte, objectif, livrable
# - Mode : "Projet public (non-rémunéré)" ou "Projet rémunéré"
# - Reward (montant USDC pour paid, "aucun (contribution open source)" pour free)
# - Durée et deadline calculée
# - Langue requise (+ version)
# - claimCriteria (prérequis pour claim, configurés par le responsable)
# - punishments (réputation risquée pour free ; crédits + réputation risqués pour paid)
# - verificationSteps (commandes de validation — masquées si projet privé)
# - outOfScope
# - Statut actuel, dépendances
```

### `ptf task claim`

Réclame une tâche disponible. Vérifie solde, wallet et critères, affiche les conditions, demande confirmation, puis déclenche l'atomic claim (signature EIP-712 + Redis lock + soft-lock garantie).

```bash
ptf task claim <taskId>

# --- Projet free (public non-rémunéré) ---
# Étape 1 : WalletVerificationService.verify() :
#   → format EIP-55, wallet activé, token gas, non banni, ownership prouvé
# Étape 2 : Vérif claimCriteria (configurés par le responsable) :
#   → score réputation, tâches complétées, compétences, limite tâches simultanées
# Étape 3 : Si tout ok → affiche conditions complètes + demande confirmation :
#   "Conditions de la tâche [taskId] — Projet public (non-rémunéré) :
#    - Durée : 30 jours (deadline : 2026-08-28)
#    - Reward : aucun (contribution open source)
#    - Pénalités réputation : retard -10 pts, bug critique -30 pts
#    - Langue requise : TypeScript
#    - Tests requis : couverture > 80%
#    Acceptez-vous ces conditions ? [o/N]"
# Étape 4 (sous Redis lock) : vérif statut "open" + dépendances
# Étape 5 : Si confirmé :
#   → Signature EIP-712 automatique (conditionsHash)
#   → UPDATE statut="claimed", claimedAt, devAddress (PostgreSQL)
#   → PAS de soft-lock (projet free)
#   → Transaction on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
#   → TimerService : enregistre jobs alertes T-72h/48h/24h + expiration
#   → Génère une branche Git suggérée : ptf/task-0xdef456

# --- Projet paid (public rémunéré ou privé) ---
# Étape 1 : Vérif solde PTF >= 10  (PREMIÈRE vérification — barrière rapide)
#   → Si non : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
# Étape 2 : WalletVerificationService.verify() :
#   → format EIP-55, wallet activé, token gas, non banni, ownership prouvé
# Étape 3 : Vérif claimCriteria (configurés par le responsable) :
#   → score réputation, tâches complétées, compétences, limite tâches simultanées
# Étape 4 : Si tout ok → affiche conditions complètes + demande confirmation :
#   "Conditions de la tâche [taskId] — Projet rémunéré :
#    - Durée : 30 jours (deadline : 2026-08-28)
#    - Reward : 150 USDC (libéré à validation)
#    - Garantie requise : 10 PTF (soft-locked pendant la tâche)
#    - Pénalités : retard -20 crédits/-10 rép, bug critique -50 crédits/-30 rép
#    - Langue requise : TypeScript 5.0+
#    - Tests requis : couverture > 80%
#    Acceptez-vous ces conditions ? [o/N]"
# Étape 5 (sous Redis lock) : vérif statut "open" + dépendances + soft-lock disponible
# Étape 6 : Si confirmé :
#   → Signature EIP-712 automatique (conditionsHash)
#   → UPDATE statut="claimed", claimedAt, devAddress (PostgreSQL)
#   → EscrowVault.softLock(dev, 10 PTF)
#   → Transaction on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
#   → TimerService : enregistre jobs alertes T-72h/48h/24h + expiration
#   → Génère une branche Git suggérée : ptf/task-0xdef456
#   → Pour projets privés : fournit le bundle chiffré (interface, types, tests, spec)
#   → Affiche : deadline, durée restante, punitions configurées
```

### `ptf task cancel`

Abandonne une tâche réclamée avant soumission.

```bash
ptf task cancel <taskId>   # abandonner une tâche réclamée
```

**Règles d'abandon selon le mode du projet :**

```
Projet free :
- Abandon libre avant soumission
- Pénalité réputation selon la config du créateur (lateDelivery si après 50% de la durée)
- Tâche repassée en open immédiatement

Projet paid :
- Abandon avant 50% de la durée : soft-lock libéré, pénalité réputation -10 pts
- Abandon après 50% : pénalité lateDelivery appliquée (crédits + réputation), soft-lock libéré
- La tâche repasse en open après un délai de cooldown (24h) pour permettre à d'autres de la réclamer
- Le dev ne peut pas reclaimer la même tâche pendant 30 jours
```

### `ptf submit`

Soumet le code d'une tâche réclamée. Le code ne transite jamais par la base de données PTF — seuls les résultats de validation (pass/fail, logs, commitHash, branchRef) sont stockés.

```bash
ptf submit --task-id 0xdef456... --branch ptf/task-0xdef456

# Actions :
# - Vérifie que le caller est bien le développeur qui a claim cette tâche
# - Vérifie que la deadline n'est pas dépassée
# - Calcule le commitHash et branchRef (référence au code, pas son contenu)
#
# Selon le repo_type du projet :
#
# repo_type = "github" :
#   - Ouvre une PR GitHub standard
#   - Stocke en DB PTF : commitHash, branchRef, repo_url (référence seulement)
#   - Déclenche la vérification automatique (Review Service)
#
# repo_type = "self-hosted" :
#   - Chiffre la soumission avec la clé publique du PTF Agent
#   - Envoie le paquet chiffré au PTF Agent de l'entreprise (jamais à la DB PTF)
#   - PTF Agent exécute les tests, retourne la preuve signée à PTF Backend
#   - Stocke en DB PTF : résultats auto_validation_result, commitHash, branchRef
#
# repo_type = "ptf-temp" (créateur offline) :
#   - PTF Agent pousse le code vers le repo temporaire PTF (git repo, pas DB)
#   - Stocke en DB PTF : résultats, commitHash, branchRef, status="pending_sync"
#   - Sync automatique vers repo créateur au reconnect (ptf sync pull)
#
# - Passe la tâche en statut submitted
# - Déclenche la vérification automatique (Review Service) si tests disponibles
```

### `ptf wallet verify`

Vérifie l'authenticité des crédits d'un wallet (EIP-712) et exécute les six vérifications du `WalletVerificationService`.

```bash
ptf wallet verify [--address 0x...]

# 1. Format EIP-55 checksum
# 2. Activation on-chain (txCount > 0 via RPC de la chaîne configurée)
# 3. Solde token natif > seuil gas (avertissement si insuffisant)
# 4. Solde PTF affiché : "X PTF disponibles (minimum 10 requis pour projets paid)"
#    → Avertissement si < 10 (informatif, pas bloquant dans ce contexte)
# 5. Statut ban (AuthService)
# 6. Signature de nonce (prouve ownership de la clé privée)
# → Vérifie aussi off-chain que chaque crédit est signé par le smart contract PTF
# → Détecte toute tentative de falsification de solde
```

### `ptf wallet status`

Affiche l'état détaillé du wallet connecté.

```bash
ptf wallet status

# Affiche :
# - Adresse wallet (format EIP-55)
# - Solde token natif (pour gas fees, selon la chaîne configurée)
# - Solde PTF disponible / soft-lockés / total
# - Statut ban
# - Score de réputation
# - Ownership prouvé (date dernière vérification)
# - Tâches actives (avec montant soft-locké par tâche)
```

### `ptf wallet deposit`

Recharge le compte en crédits PTF en envoyant des fonds vers les **adresses officielles PTF publiées dans le réseau** (vérifiées via `platformHash` avant tout transfert).

```bash
ptf wallet deposit --chain polygon --amount 50 --token USDC
# → Récupère l'adresse officielle PTF depuis le réseau (vérifiée via platformHash)
# → Affiche l'adresse vérifiée + montant à envoyer
# → Attend la confirmation on-chain
# → Crédite le compte en PTF credits (1:1 avec USDC)

ptf wallet deposit --currency ETH --amount 0.1
# → Convertit ETH → USDC → PTF credits automatiquement (via oracle prix)

ptf wallet balance           # solde disponible + soft-locked
ptf wallet withdraw --amount 25.5 --to 0x...   # minimum 1.0 PTF
```

**Vérification des adresses officielles PTF avant dépôt :**

```typescript
// L'algo vérifie l'adresse de destination AVANT d'autoriser le transfert.
// Pas de preuve de chemin — recalcul direct du hash sur le contenu complet.
async function verifyPlatformAddress(chainId: string, address: string): Promise<boolean> {
    const broadcast = await network.getLatestBroadcast();
    // 1. Vérifier la signature PTF sur le broadcast
    const broadcastHash = keccak256(JSON.stringify(sortKeysDeep(broadcast)));
    const signer = ethers.verifyMessage(broadcastHash, broadcast.signature);
    if (signer !== PTF_OFFICIAL_ADDRESS) return false;
    // 2. Vérifier que platformHash couvre les adresses reçues
    const computed = keccak256(JSON.stringify(sortKeysDeep(broadcast.platformAddresses)));
    if (computed !== broadcast.hashes.platform) return false;
    // 3. Vérifier que l'adresse cible est dans les adresses officielles
    return broadcast.platformAddresses.escrowVault[chainId] === address
        || broadcast.platformAddresses.creditReceiver[chainId] === address;
}
```

Le client ne doit **jamais** envoyer des fonds à une adresse non vérifiée. La CLI PTF effectue cette vérification automatiquement et bloque tout transfert vers une adresse absente du `platformHash` officiel.

### `ptf wallet convert`

Convertit une devise externe (fiat ou crypto) en crédits PTF via oracle prix (Chainlink ou équivalent).

```bash
ptf wallet convert --from EUR --amount 100   # conversion EUR → PTF (via banque/Stripe)
ptf wallet convert --from ETH --amount 0.05  # conversion ETH → USDC → PTF

# Affiche avant confirmation :
#   Taux actuel : 1 ETH = 2 350 USDC (Chainlink, il y a 12s)
#   Frais de conversion : 0.5 %
#   PTF credits reçus : ~117.175 PTF
#   Taux garanti pendant : 60 secondes
#   Confirmer ? [o/N]
```

**Interface de conversion :**

```typescript
interface CurrencyConverter {
  getRate(from: Currency, to: Currency): Promise<number>;

  convert(amount: number, from: Currency, to: "PTF"): Promise<{
    ptfCredits: number;
    rate:       number;
    fee:        number;      // frais de conversion (0.5 % par défaut)
    expiresAt:  Date;        // taux garanti pendant 60 secondes
  }>;
}

type Currency = "USDC" | "USDT" | "DAI" | "ETH" | "BTC" | "MATIC" | "EUR" | "USD" | "GBP";
```

### `ptf wallet bridge`

Transfère des crédits PTF d'une chaîne à une autre via LayerZero. Le solde soft-locké est protégé (ne peut pas être bridgé). Un receipt est créé avec un timeout de 30 minutes ; en cas d'expiration, les crédits sont automatiquement remboursés sur la chaîne source.

```bash
ptf wallet bridge --from polygon --to ethereum --amount 50
# → Vérifie que le solde disponible (hors soft-lock) est suffisant
# → Brûle les crédits sur la chaîne source
# → Crée un BridgeReceipt (status: pending, timeout: 30 min)
# → Envoie le message LayerZero
# → Affiche le bridgeId pour suivi

ptf wallet bridge status <bridgeId>   # suivre l'état d'un bridge
# → Affiche : status, fromChain, toChain, amount, sourceTxHash, destinationTxHash, expiresAt
```

**États possibles d'un bridge :**
- `pending` — message LayerZero en transit
- `completed` — crédits mintés sur la chaîne de destination
- `failed` — erreur LayerZero
- `refunded` — timeout dépassé (30 min) → crédits remboursés automatiquement sur la chaîne source

### `ptf report`

Signale un développeur à la plateforme PTF. Tout utilisateur peut signaler ; la décision de bannissement reste exclusive à PTF.

```bash
ptf report --dev 0x... --reason malicious_code --task <taskId> --evidence "Description détaillée"
ptf report --dev 0x... --reason fraud --evidence "Preuve de fraude avec liens"

# Motifs disponibles : malicious_code | plagiarism | fraud | harassment | spam | other
```

### `ptf project claimed-tasks`

Affiche les tâches réclamées d'un projet dont le wallet connecté est responsable. Permet au créateur de voir qui travaille sur ses tâches.

```bash
ptf project claimed-tasks --project <projectId>
ptf project claimed-tasks --project <projectId> --status in_progress

# Affiche par tâche :
# - titre, statut, développeur (adresse + githubHandle si projet public)
# - réputation et tâches complétées du dev
# - date de claim, deadline, jours restants
```

### `ptf projects list`

Liste tous les projets disponibles sur le réseau PTF. Les projets privés sont automatiquement anonymisés.

```bash
ptf projects list                    # tous les projets
ptf projects list --type public      # projets publics uniquement
ptf projects list --type private     # projets privés (anonymisés)
ptf projects list --skill typescript --min-reward 50
ptf projects list --mine             # uniquement les projets créés par le wallet connecté (avec leurs IDs)
```

### `ptf tasks list`

Liste les tâches disponibles. Les tâches de projets privés sont anonymisées.

```bash
ptf tasks list                                    # toutes les tâches open
ptf tasks list --project <projectId>              # tâches d'un projet
ptf tasks list --reward paid                      # tâches rémunérées uniquement
ptf tasks list --reward free                      # contributions open source uniquement
ptf tasks list --min-reward 50 --skill typescript
ptf tasks list --priority high
```

### `ptf tasks mine`

Affiche toutes les tâches réclamées par le développeur connecté, tous projets confondus.

```bash
ptf tasks mine                                    # toutes les tâches réclamées
ptf tasks mine --status in_progress               # en cours seulement
ptf tasks mine --project <projectId>              # d'un projet spécifique
```

**Exemple d'affichage :**

```
Mes tâches actives :

PROJECT: backend-api (0x4f2a...)
  ├─ [CLAIMED]   0x7b3e... Implémenter le AuthService
  │              Deadline: 2026-08-15 (18 jours restants) ⚠
  │              Reward: 120 USDC | TypeScript
  └─ [IN_REVIEW] 0x9c1d... Setup Prisma schema
                 Soumis il y a 2 jours

PROJECT: private-project-#2f8b (0x...)
  └─ [CLAIMED]   0xa3f1... Intégrer l'API de paiement
                 Deadline: 2026-08-20 (23 jours restants)
                 Reward: 200 USDC | TypeScript
```

**Requête GraphQL associée :**

```graphql
query MyTasks($filter: MyTasksFilter) {
  myTasks(filter: $filter) {
    taskId
    projectId
    projectName       # anonymisé si projet privé : "Private Project #2f8b"
    title
    status
    claimedAt
    deadline
    daysRemaining
    reward
    language
  }
}
```

### `ptf contributors list` / `ptf contributors verify`

Liste et vérifie les contributeurs d'un projet **public**. Les projets privés rejettent ces commandes.

```bash
ptf contributors list <projectId>                   # liste les contributeurs d'un projet public
ptf contributors verify <projectId> <address>       # vérifie un contributeur spécifique

# Pour un projet privé :
# Erreur : PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN
```

### `ptf import-issues` (Mode 4 — Import GitHub Issues)

Importe des issues GitHub labellisées comme tâches PTF. Conçu pour les créateurs qui ont déjà des issues bien définies et souhaitent un démarrage rapide (moins de 15 minutes).

```bash
ptf import-issues --repo owner/repo --label "help wanted"
ptf import-issues --repo owner/repo --label "ptf-task" --label "good first issue"

# Actions :
# - Récupère les issues GitHub ouvertes correspondant au(x) label(s)
# - Génère des tâches PTF depuis les titres et descriptions des issues
# - Lance ptf validate-docs --auto (validation allégée) :
#   - Pour le 1er projet du créateur : warnings non-bloquants
#   - Les erreurs critiques de format restent bloquantes dans tous les cas
# - Produit un aperçu des tâches générées (ptf tasks preview)
# - Le créateur valide puis publie avec ptf tasks publish
```

### `ptf sync` — Synchronisation du dépôt de code

Commandes de gestion de la synchronisation entre le repo temporaire PTF et le repo du créateur (Cas 3 — créateur sans serveur propre). Non applicable aux projets `github` ou `self-hosted`.

```bash
# Vérifier le statut de synchronisation d'un projet
ptf sync status --project <projectId>

# Affiche :
# Projet    : mon-projet (ptf-temp://0x4f2a...)
# Sync      : pending (3 soumissions en attente)
# Dernière sync : 2026-07-15T10:32:00Z
# Soumissions en attente :
#   - 0xabc123... (branch: ptf/task-0xdef456, soumis: 2026-07-20)
#   - 0xdef456... (branch: ptf/task-0x1a2b3c, soumis: 2026-07-22)
#   - 0x789abc... (branch: ptf/task-0x4d5e6f, soumis: 2026-07-25)

# Forcer une synchronisation manuelle (créateur)
ptf sync pull --project <projectId>

# Actions :
# - Vérifie que le caller est owner du projet
# - Pull depuis le repo temporaire PTF
# - Push/merge vers le repo créateur configuré
# - Met à jour sync_status = "synced" pour chaque soumission
# - Déclenche les notifications peer review / validation en attente
# - Nettoie le repo temporaire si sync complète

# Voir les soumissions en attente de sync
ptf sync pending --project <projectId>

# Affiche la liste des soumissions status="pending_sync" avec :
# - commitHash, branchRef, dev_address, submitted_at
```

---

## PTF Agent (projets privés)

Le PTF Agent est un serveur léger certifié par PTF, hébergé par l'entreprise cliente sur son infrastructure. Il permet aux développeurs de travailler sur des projets privés sans jamais accéder au codebase complet de l'entreprise.

**Rôle du PTF Agent — points clés :**
- Reçoit les soumissions chiffrées du développeur (le code en clair ne transite pas par PTF)
- Exécute les tests dans un sandbox éphémère gVisor
- Signe cryptographiquement les résultats (pass/fail)
- Renvoie **uniquement les résultats signés** à l'API PTF — jamais le code source
- Gère le push du code vers le repo temporaire PTF si le créateur est offline (Cas 3)

**Flux d'une soumission privée :**

```
1. Le développeur reçoit (via ptf task claim) :
   - Les interfaces publiques (TypeScript/OpenAPI)
   - Les types de données
   - Les tests d'acceptance
   - La spécification fonctionnelle de la tâche
   - Un sandbox Docker/gVisor éphémère fourni par PTF

2. Le développeur code dans le sandbox, puis exécute :
   ptf submit --task-id 0xdef456... --encrypted

3. ptf CLI :
   - Chiffre la soumission avec la clé publique du PTF Agent
   - Envoie le paquet chiffré au PTF Agent via l'API PTF Backend
   (le code chiffré ne passe JAMAIS par la DB PTF)

4. PTF Agent (chez l'entreprise) :
   - Déchiffre la soumission dans un sandbox gVisor éphémère
   - Intègre le code dans l'environnement de test interne
   - Exécute la suite de tests complète
   - Génère une preuve signée cryptographiquement : Hash(résultats_tests + taskId + timestamp)
   - Si créateur online  → push code vers repo créateur (self-hosted ou GitHub)
   - Si créateur offline → push code vers repo temporaire PTF (ptf-temp)
   - Retourne la preuve signée au PTF Backend (résultats uniquement, pas le code)

5. PTF Backend :
   - Vérifie la signature de la preuve (certificat PTF Agent)
   - Stocke en DB : résultats auto_validation_result, commitHash, branchRef, repoUrl
   - Le code source n'est JAMAIS stocké dans la DB PTF
   - Si tests passent : déclenche la peer review (Review Service)
   - Si tests échouent : retourne le rapport d'erreur au développeur (sans exposer le code interne)
```

**Garanties de confidentialité :**
- L'entreprise ne voit jamais la soumission en clair (chiffrement de bout en bout)
- Le développeur ne voit jamais le codebase interne de l'entreprise
- PTF Backend ne voit que la preuve signée (pas le code de soumission)
- La base de données PTF ne stocke jamais de code source
- Le PTF Agent est certifié par PTF (attestation on-chain dans `ProjectRegistry`)

### Attestation et sécurité de l'agent (C-07)

Le PTF Agent doit être authentifiable de manière cryptographique pour résister aux compromissions et aux attaques par replay.

```typescript
// Preuve signée par le PTF Agent — inclut nonce pour éviter les replays
interface AgentProof {
    taskId: string;
    commitHash: string;        // hash du commit soumis
    resultsHash: string;       // keccak256(testResults JSON)
    agentNonce: string;        // nonce délivré par le backend PTF avant chaque validation
    timestamp: number;
    signature: string;         // signé avec la clé certifiée de l'agent
}

// Flow de challenge-response
// 1. Backend PTF génère un nonce unique par validation
// 2. Backend envoie le nonce à l'agent via mTLS
// 3. Agent inclut le nonce dans sa preuve signée
// 4. Backend vérifie : nonce utilisé une seule fois, TTL 5 minutes
// → Rend les replays impossibles même avec une clé compromise
```

**Recommandations :**
- mTLS avec CA PTF entre backend et agent (le backend rejette tout certificat non signé par la CA PTF)
- Attestation on-chain de l'empreinte du certificat TLS dans `ProjectRegistry`
- Mécanisme de révocation on-chain si agent compromis (le backend refuse toute preuve d'un agent révoqué)
- Explorer TEE (Intel SGX/TDX) pour remote attestation vérifiable côté agent

### PTF Agent Managed

Pour les créateurs qui ne disposent pas d'une infrastructure serveur, PTF propose une offre hébergée : **PTF Agent Managed**. PTF provisionne et opère l'agent à la place du créateur.

```
PTF Agent Managed = PTF héberge l'agent à la place du créateur

Avantages :
- Aucune infrastructure à gérer côté créateur
- Certifié automatiquement par PTF
- Disponible 24/7 avec SLA garanti
- Idéal pour les PME sans équipe DevOps

Configuration :
1. ptf init --type private --agent managed
   → PTF provisionne un agent dédié sur son infrastructure
   → Le créateur donne un token d'accès lecture-seule au repo
   → L'agent est lié au projectId, certifié on-chain

Modèle :
- Inclus dans la commission pour les projets < 50k USDC
- Facturation séparée pour les projets > 50k USDC (SLA renforcé)

Accès repo :
- Token lecture-seule GitHub / GitLab / Gitea
- Jamais d'accès en écriture
- Token révocable à tout moment depuis ptf project settings
```

### Certification et installation du PTF Agent (self-hosted)

#### Prérequis techniques
- Serveur Linux (Ubuntu 22.04+) avec Docker et gVisor installés
- Port 443 accessible depuis les serveurs PTF
- Certificat TLS valide (Let's Encrypt accepté)

#### Installation

```bash
# Étape 1 — Installer l'agent et générer le certificat de certification
ptf agent install --project <projectId>
# → Génère une clé de certification unique
# → Crée le certificat TLS signé par la CA PTF
# → Configure le container Docker

# Étape 2 — Enregistrer l'agent on-chain
ptf agent register --project <projectId> --url https://agent.enterprise.com
# → Enregistre l'empreinte du certificat on-chain dans ProjectRegistry
# → Teste la connectivité
# → Statut : pending → certified

# Étape 3 — Vérifier que l'agent est actif et certifié on-chain
ptf agent status --project <projectId>
# → Vérifie que l'agent est actif et certifié on-chain
```

#### Révocation

```bash
ptf agent revoke --project <projectId>
# → Invalide le certificat on-chain
# → Notifications aux devs actifs sur les tâches du projet
```

#### Cycle de vie
- Certificat valide 1 an, renouvellement automatique :
  ```bash
  ptf agent renew --project <projectId>
  ```
- Rotation de clé :
  ```bash
  ptf agent rotate-key --project <projectId>
  ```

---

## GitHub Actions PTF — Alternative au PTF Agent

Pour les projets publics hébergés sur GitHub, **PTF Action** permet de jouer le rôle du PTF Agent directement dans GitHub Actions, sans infrastructure à installer.

```yaml
# .github/workflows/ptf-validation.yml
# Joue le rôle du PTF Agent directement dans GitHub Actions
# Idéal pour les projets publics GitHub

name: PTF Validation
on:
  push:
    branches: ['ptf/task-*']  # branches de soumission PTF

jobs:
  ptf-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ptf-dev/ptf-action@v1
        with:
          ptf-api-key: ${{ secrets.PTF_API_KEY }}
          task-id: ${{ github.ref_name }}  # extrait depuis le nom de branche
        # → Exécute les verificationSteps définis dans la tâche
        # → Signe les résultats et les envoie à l'API PTF
        # → Déclenche automatiquement le peer review si tests passent
```

**Intégration dans le flow de validation :**

```
Dev push sur branche ptf/task-<taskId>
      ↓
GitHub Actions déclenche ptf-action
      ↓
Tests exécutés dans le runner GitHub (pas de gVisor — accepté pour projets publics)
      ↓
Résultats signés envoyés à l'API PTF
      ↓
(même flow que PTF Agent : peer review → validation client)
```

**Note de sécurité :** GitHub Actions s'exécute sans gVisor — acceptable pour les projets publics (code visible par tous). Pour les projets privés sensibles, le PTF Agent avec sandbox gVisor reste obligatoire.

---

## Système d'intégrité des tâches — Task Set Hash

### Pourquoi pas Merkle

L'arbre de Merkle est conçu pour permettre à un client de **prouver l'appartenance d'un élément sans avoir accès à la liste complète** — c'est sa valeur principale (preuve de chemin O(log n)).

Dans PTF, cette propriété n'est jamais utilisée : le client a toujours accès à la liste complète des tâches via l'API. La preuve de chemin Merkle n'apporte donc rien en pratique, pour un coût significatif :

| Critère | Merkle tree | Task Set Hash |
|---|---|---|
| Algorithme côté backend | O(n log n) construction | O(n) — tri + concat + keccak256 |
| Complexité du code | ~25 lignes (niveaux, paires, sort) | 5 lignes |
| Preuve d'appartenance on-chain | O(log n) calldata | Non requise (liste complète disponible) |
| Verification d'appartenance | verifyTask(proof[]) — jamais appelé | Recalcul direct côté client |
| Surface d'attaque | Algo de construction + vérification | Uniquement keccak256 |
| Résultat on-chain | `bytes32 merkleRoot` | `bytes32 taskSetHash` |

**Le Task Set Hash est fonctionnellement équivalent pour PTF, plus simple, et sans preuve de chemin inutile.**

---

### Construction des identifiants

```
projectId    = keccak256(ownerAddress || projectName || timestamp)
               → généré automatiquement par ptf init, jamais saisi manuellement

taskId       = keccak256(projectId || parentTaskId || task_metadata || nonce)
               où parentTaskId = projectId pour les tâches racines

networkId    = keccak256(taskId || broadcast_timestamp || node_id)

taskSetHash  = keccak256(sorted_taskIds_concatenated)
               → remplace merkleRoot — représente l'ensemble des tâches du projet
```

### Calcul du Task Set Hash

```typescript
// backend/src/services/task.service.ts
function computeTaskSetHash(taskIds: string[]): string {
  if (taskIds.length === 0) return ethers.ZeroHash;

  // Tri déterministe : même résultat quel que soit l'ordre d'insertion
  const sorted = [...taskIds]
    .map((id) => id.startsWith("0x") ? id : ethers.keccak256(ethers.toUtf8Bytes(id)))
    .sort();

  return ethers.keccak256(ethers.concat(sorted));
}
```

**Propriétés :**
- **Déterministe** : le tri garantit que deux nœuds calculant le hash depuis la même liste d'IDs obtiennent le même résultat, quel que soit l'ordre d'insertion.
- **Sensible à tout changement** : ajouter, supprimer ou modifier un taskId change le hash.
- **Non-falsifiable** : le hash est ancré on-chain dans `ProjectRegistry`. Un nœud servant une liste modifiée produit un hash différent — détecté immédiatement.

### Vérification d'intégrité

```
Vérification que la liste de tâches d'un projet n'a pas été falsifiée :

  1. Client récupère la liste des taskIds depuis un nœud PTF
  2. Client recalcule : computeTaskSetHash(taskIds)
  3. Client compare avec ProjectRegistry.taskSetHash[projectId] (on-chain)
  4. ✓ Égal → liste intègre
  5. ✗ Différent → nœud malveillant ou corrompu → switch vers un autre nœud
```

Cette vérification ne nécessite pas de preuve de chemin. Le client envoie la liste complète, le contrat (ou le client lui-même) recalcule et compare — O(n) en temps, O(1) en stockage on-chain.

### Verrouillage à la publication

Le `taskSetHash` est calculé et ancré on-chain lors de `ptf tasks publish`. Une fois qu'une tâche est claimée, le hash est verrouillé (`locked = true`) — aucune modification de la liste n'est possible tant qu'une tâche est en cours.

```
ptf tasks publish
  → computeTaskSetHash(all taskIds)
  → ProjectRegistry.updateTaskSetHash(projectId, hash)
  → Toute tentative de modifier la liste après un claim → revert ProjectLocked_()
```

### Appartenance d'une tâche à un projet

La preuve qu'une tâche appartient à un projet ne nécessite pas de preuve cryptographique séparée dans PTF — elle est garantie par deux mécanismes cumulatifs :

1. **`taskId` contient `projectId`** dans son calcul : `keccak256(projectId || ...)`. Un taskId ne peut pas appartenir à deux projets différents.
2. **`taskSetHash` couvre tous les taskIds** : si un taskId n'est pas dans la liste qui a produit le hash ancré on-chain, le recalcul diverge.

La fonction `verifyTask(projectId, taskId, proof[])` du contrat reste disponible comme outil d'audit ponctuel — elle n'est pas appelée dans le flux courant.

### Gestion des dépendances

```yaml
# Exemple de définition de tâche (tasks/auth-service.yaml)
id: auth-service-jwt
parent: backend-foundation
title: "Implémenter la validation JWT"
description: "..."
dependencies:
  - auth-service-models    # doit être validated avant
  - auth-service-db        # doit être validated avant
scoring:                   # remplace reward_weight — calcul de la récompense via scoring
  complexity: 3            # 1–5 (configuré par le créateur)
  impact: 4                # 1–5 (configuré par le créateur)
  effort: 3                # 1–5 (configuré par le créateur)
  # reputationPoints : calculé AUTOMATIQUEMENT par le ReputationEngine PTF
  #                    Non configurable par le créateur

# Durée et critères (nouveaux champs)
duration: "14d"            # 14 jours (surcharge le défaut de 30j)

claim_criteria:
  # Tous les critères sont optionnels — définis par le responsable du projet.
  # minCreditBalance n'est PAS configurable ici.
  # Pour les projets paid, la garantie 10 PTF est une règle systémique.
  # Pour les projets free, aucune garantie PTF n'est requise.
  minReputation: 200
  minCompletedTasks: 5
  requiredSkills:
    - typescript
    - jwt
    - security
  maxActiveTasks: 3

# Punitions configurées par le créateur
# Projet paid : credits + reputation sur chaque violation
# Projet free : uniquement reputation (credits absent)
# Note : le champ "ban" N'EXISTE PAS ici — le bannissement est une décision exclusive PTF
punishments:
  lateDelivery:
    credits: 20       # absent si projet free
    reputation: 10
  criticalBug:
    credits: 50       # absent si projet free
    reputation: 30
  nonCriticalBug:
    credits: 5        # absent si projet free
    reputation: 2
  maliciousCode:
    credits: 100      # absent si projet free
    reputation: 500
    # ban : PAS configurable ici — décision exclusive PTF via ReportService

constraints:
  maxFiles: 5
  minTestCoverage: 85
  languages:
    - typescript             # override de la config projet si nécessaire
  languageVersion: "5.0+"
```

Le Task Service maintient un graphe orienté acyclique (DAG) de toutes les dépendances. À chaque transition de statut d'une tâche, il recalcule les tâches désormais débloquées et publie un événement sur le Notification Service.

---

## Stockage distribué des métadonnées (Content-Addressed Storage)

### Principe

Les métadonnées des tâches et des projets (titre, contexte, objectif, contraintes, verificationSteps, etc.) ne sont stockées ni exclusivement en PostgreSQL ni entièrement on-chain. Elles sont distribuées sur tous les nœuds PTF via un système adressé par contenu : **l'identité d'une donnée est son hash**, pas son emplacement.

```
hash = keccak256(JSON.stringify(content, sorted_keys))
```

Ce hash est ancré on-chain dans `ProjectRegistry`. N'importe quel nœud ou client peut vérifier qu'une métadonnée n'a pas été falsifiée en recalculant son hash et en le comparant à l'ancre on-chain — sans faire confiance au nœud qui la sert.

Un nœud qui modifie le contenu produit un hash différent de l'ancre on-chain. Tout client détecte immédiatement la falsification et bascule vers un autre nœud.

---

### Architecture en 3 couches

```
┌──────────────────────────────────────────────────────────────────┐
│  COUCHE 1 — ANCRE ON-CHAIN  (source de vérité des hash)          │
│                                                                  │
│  ProjectRegistry (nouveau champ) :                               │
│    taskMetadataHash[taskId]    = keccak256(task_json)            │
│    projectMetadataHash[projId] = keccak256(project_json)         │
│    archiveId[taskId]           = "ar://..."  (après clôture)     │
│                                                                  │
│  → Immuable, vérifiable par n'importe qui                        │
│  → Coût on-chain minimal : 2 bytes32 par tâche                   │
└──────────────────────────┬───────────────────────────────────────┘
                           │ chaque nœud vérifie avant d'accepter
┌──────────────────────────▼───────────────────────────────────────┐
│  COUCHE 2 — RÉSEAU DISTRIBUÉ  (stockage actif)                   │
│                                                                  │
│  Chaque nœud tient un MetadataStore local :                      │
│    Map<hash, content>  (mémoire + disque)                        │
│                                                                  │
│  Gossip protocol (libp2p) :                                      │
│    Nœud reçoit (hash, content)                                   │
│    → vérifie keccak256(content) == hash                          │
│    → vérifie hash == ProjectRegistry.taskMetadataHash[id]        │
│    → accepte et stocke  |  rejette et logue le pair malveillant  │
│    → propage aux autres pairs                                    │
│                                                                  │
│  Redondance : N nœuds × 1 copie                                  │
│  Résistance : survit à N-1 pannes simultanées                    │
│  Falsification : détectée mathématiquement, pas par confiance    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ à la clôture (validated / archived)
┌──────────────────────────▼───────────────────────────────────────┐
│  COUCHE 3 — ARWEAVE  (archive permanente)                        │
│                                                                  │
│  Déclenchement : tâche passe à "validated" ou projet "archived"  │
│    → n'importe quel nœud peut archiver (pas seulement PTF Corp)  │
│    → pousse le contenu sur Arweave                               │
│    → récupère arweaveId = "ar://abc123..."                       │
│    → appelle MetadataRegistry.setArchiveId(id, arweaveId)        │
│    → le contrat vérifie : keccak256(content) == hash ancré        │
│    → si ok : arweaveId accepté, tous les nœuds évictent          │
│              leur copie locale (libération mémoire)              │
│                                                                  │
│  Même si tous les nœuds PTF disparaissent :                      │
│    → historique complet accessible sur ar://...                  │
│    → preuves de validation permanentes                           │
│    → portfolio des développeurs vérifiable à vie                 │
└──────────────────────────────────────────────────────────────────┘
```

---

### Cycle de vie d'une métadonnée

```
[Publication]

  1. Créateur publie ptf tasks publish
  2. Backend sérialise task_json (clés triées — déterministe)
  3. hash = keccak256(task_json)
  4. ProjectRegistry.registerTaskMetadata(taskId, hash)  ← ancre on-chain
  5. MetadataStore.put(hash, content)                    ← stocké localement
  6. Gossip : (hash, content) propagé à tous les nœuds
  7. Chaque nœud vérifie et stocke sa propre copie

[Lecture / Vérification]

  1. Client CLI demande taskId à un nœud quelconque
  2. Nœud retourne content
  3. CLI recalcule keccak256(content)
  4. CLI compare avec ProjectRegistry.taskMetadataHash[taskId]
  5. ✓ Hash correspondant → données intègres, affichage
  6. ✗ Hash différent   → nœud malveillant ou corrompu
                          → CLI bascule automatiquement sur un autre nœud
                          → log de sécurité

[Clôture — tâche validée ou projet archivé]

  1. Statut passe à "validated" (tâche) ou "archived" (projet)
  2. N'importe quel nœud peut déclencher l'archivage :
       archiveService.archive(taskId, content)
  3. Arweave TX soumise avec content en payload
  4. arweaveId récupéré ("ar://txId")
  5. MetadataRegistry.setArchiveId(taskId, arweaveId)
       → contrat vérifie keccak256(content) == hash enregistré
       → si ok : archiveId accepté, événement ArchiveConfirmed émis
  6. Tous les nœuds reçoivent ArchiveConfirmed via gossip
  7. Chaque nœud appelle MetadataStore.evict(hash)
       → mémoire libérée, donnée accessible via ar://
```

---

### Règles de sérialisation (déterminisme obligatoire)

Le hash doit être identique quel que soit le nœud qui le calcule. Toute variation (ordre des clés, espaces, types) produit un hash différent et invalide toute la chaîne de vérification.

```typescript
// Règle absolue : sérialisation déterministe avant tout hash
function serializeForHash(obj: object): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function hashMetadata(content: object): string {
  return ethers.keccak256(ethers.toUtf8Bytes(serializeForHash(content)));
}
```

**Champs inclus dans le hash d'une tâche :**

```typescript
interface TaskMetadataHashable {
  taskId:            string;
  projectId:         string;
  title:             string;
  type:              string;
  priority:          string;
  context:           string;
  objective:         string;
  deliverable:       string;
  outOfScope:        string[];
  constraints:       TaskConstraints;
  verificationSteps: VerificationStep[];
  claimCriteria:     ClaimCriteria;
  punishments:       Punishments;
  scoring:           TaskScoring;
  dependencies:      string[];
  duration:          string;
  rewardAmount?:     number;
  rewardToken?:      string;
  rewardMode:        "free" | "paid";
  createdAt:         string;  // ISO — inclus pour unicité temporelle
}
// NE PAS inclure dans le hash : status, claimedAt, deadline, devAddress
// Ces champs sont mutables — ils ne font pas partie de l'identité immuable de la tâche
```

---

### Nouveau contrat — `MetadataRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MetadataRegistry — ancre les hash de métadonnées et les identifiants d'archive.
 *
 * Principe : le contenu est stocké off-chain (nœuds PTF + Arweave).
 * Ce contrat stocke uniquement les hash (32 bytes par entrée) comme
 * source de vérité cryptographique. N'importe qui peut vérifier
 * l'intégrité d'une métadonnée sans faire confiance au nœud qui la sert.
 */
contract MetadataRegistry {
  // hash des métadonnées immuables par entité
  mapping(bytes32 => bytes32) public taskMetadataHash;
  mapping(bytes32 => bytes32) public projectMetadataHash;

  // identifiant Arweave après archivage (ar://txId)
  mapping(bytes32 => string)  public archiveId;

  // empêche la ré-archivage d'une entrée déjà archivée
  mapping(bytes32 => bool)    public archived;

  event MetadataRegistered(bytes32 indexed id, bytes32 hash);
  event ArchiveConfirmed(bytes32 indexed id, string arweaveId);

  error AlreadyRegistered();
  error AlreadyArchived();
  error HashMismatch();
  error EmptyContent();

  modifier onlyBackend() {
    require(authorizedBackends[msg.sender], "Not authorized");
    _;
  }
  mapping(address => bool) public authorizedBackends;

  constructor(address initialBackend) {
    authorizedBackends[initialBackend] = true;
  }

  // Appelé lors de ptf tasks publish — enregistre le hash de chaque tâche
  function registerTaskMetadata(bytes32 taskId, bytes32 hash) external onlyBackend {
    if (taskMetadataHash[taskId] != bytes32(0)) revert AlreadyRegistered();
    taskMetadataHash[taskId] = hash;
    emit MetadataRegistered(taskId, hash);
  }

  function registerProjectMetadata(bytes32 projectId, bytes32 hash) external onlyBackend {
    if (projectMetadataHash[projectId] != bytes32(0)) revert AlreadyRegistered();
    projectMetadataHash[projectId] = hash;
    emit MetadataRegistered(projectId, hash);
  }

  // Appelé par n'importe quel nœud après archivage sur Arweave.
  // Le contrat vérifie que le contenu archivé correspond au hash enregistré.
  function setArchiveId(
    bytes32   id,
    string  calldata arweaveId,
    bytes   calldata content    // contenu original pour vérification
  ) external {
    if (archived[id])                          revert AlreadyArchived();
    if (bytes(arweaveId).length == 0)          revert EmptyContent();

    bytes32 contentHash = keccak256(content);
    bytes32 registered  = taskMetadataHash[id] != bytes32(0)
      ? taskMetadataHash[id]
      : projectMetadataHash[id];

    if (contentHash != registered)             revert HashMismatch();

    archiveId[id] = arweaveId;
    archived[id]  = true;
    emit ArchiveConfirmed(id, arweaveId);
  }

  // Vérification pure — utilisable par n'importe quel client sans gas
  function verify(bytes32 id, bytes calldata content) external view returns (bool) {
    bytes32 registered = taskMetadataHash[id] != bytes32(0)
      ? taskMetadataHash[id]
      : projectMetadataHash[id];
    return registered != bytes32(0) && keccak256(content) == registered;
  }
}
```

---

### Nouveau service backend — `MetadataService`

```typescript
export class MetadataService {
  // Cache mémoire : hash → content (sérialisé)
  private store = new Map<string, string>();

  constructor(
    private readonly chainAdapter:   IChainAdapter,
    private readonly arweave:        IStorageProvider,
    private readonly gossip:         IGossipService,
  ) {}

  // Appelé à la publication d'une tâche
  async register(id: string, content: object): Promise<string> {
    const serialized = serializeForHash(content);
    const hash       = hashMetadata(content);

    // 1. Ancrer on-chain
    await this.chainAdapter.registerTaskMetadata(id, hash);

    // 2. Stocker localement
    this.store.set(hash, serialized);

    // 3. Propager aux pairs
    await this.gossip.broadcast({ hash, content: serialized });

    return hash;
  }

  // Appelé par le gossip quand un pair envoie une métadonnée
  async onGossipReceive(hash: string, serialized: string): Promise<void> {
    // Vérification locale (pas de RPC)
    const computed = ethers.keccak256(ethers.toUtf8Bytes(serialized));
    if (computed !== hash) {
      console.warn(`[MetadataService] Hash invalide reçu du pair`);
      return;
    }
    this.store.set(hash, serialized);
  }

  // Retourne le contenu après vérification — utilisé par les resolvers GraphQL
  async get(id: string): Promise<object | null> {
    const onChainHash = await this.chainAdapter.getTaskMetadataHash(id);
    if (!onChainHash) return null;

    const serialized = this.store.get(onChainHash);
    if (!serialized) return null;

    // Vérification systématique avant de servir
    const computed = ethers.keccak256(ethers.toUtf8Bytes(serialized));
    if (computed !== onChainHash) {
      console.error(`[MetadataService] Données corrompues pour ${id} — eviction`);
      this.store.delete(onChainHash);
      return null;
    }

    return JSON.parse(serialized);
  }

  // Déclenché quand une tâche passe à "validated" ou un projet à "archived"
  // Peut être appelé par n'importe quel nœud — le contrat valide le hash
  async archive(id: string): Promise<string> {
    const onChainHash = await this.chainAdapter.getTaskMetadataHash(id);
    if (!onChainHash) throw new Error(`Métadonnée inconnue : ${id}`);

    const serialized = this.store.get(onChainHash);
    if (!serialized) throw new Error(`Contenu introuvable localement pour ${id}`);

    // Pousser sur Arweave
    const ref = await this.arweave.store(serialized, { id, hash: onChainHash });

    // Ancrer l'identifiant Arweave on-chain (le contrat vérifie le hash)
    await this.chainAdapter.setArchiveId(id, ref.id, Buffer.from(serialized));

    // Libérer la copie locale
    this.store.delete(onChainHash);

    console.log(`[MetadataService] ${id} archivé sur Arweave : ar://${ref.id}`);
    return ref.id;
  }
}
```

---

### Vérification côté CLI

La CLI vérifie automatiquement l'intégrité de toute métadonnée reçue avant affichage.

```typescript
// utils/api.ts — enrichissement de getTask()
async getTask(id: string): Promise<{ task: PtfTask | null; offline: boolean }> {
  const result = await this.query<{ task: PtfTask }>(/* ... */);
  const task   = result.task;

  if (task && !this.isOffline()) {
    // Vérification hash on-chain
    const onChainHash = await this.getOnChainMetadataHash(id);
    if (onChainHash) {
      const localHash = hashMetadata(extractHashableFields(task));
      if (localHash !== onChainHash) {
        throw new Error(
          `Nœud ${this.apiUrl} retourne des données falsifiées pour la tâche ${id}.\n` +
          `Hash local    : ${localHash.slice(0, 16)}...\n` +
          `Hash on-chain : ${onChainHash.slice(0, 16)}...\n` +
          `Essayez un autre nœud : ptf config set-api <autre-url>`
        );
      }
    }
  }

  return { task, offline: this.isOffline() };
}
```

---

### Règle d'archivage décentralisé

N'importe quel nœud peut initier l'archivage d'une tâche clôturée. Le premier nœud à soumettre un arweaveId valide gagne — le contrat rejette les soumissions suivantes (déjà archivé). Cela évite de dépendre de PTF Corp pour que les archives soient créées.

```
Tâche passe à "validated"
  → événement ArchiveTrigger diffusé dans le réseau gossip
  → N nœuds tentent d'archiver en parallèle
  → Premier nœud à soumettre un arweaveId valide → accepté on-chain
  → Les autres reçoivent AlreadyArchived → abandonnent
  → Tous les nœuds évictent leur copie locale via ArchiveConfirmed
```

---

### Ce qui est stocké où — récapitulatif final

| Donnée | On-chain | Nœuds PTF (actif) | Arweave (archivé) |
|---|---|---|---|
| Hash métadonnées tâche | ✓ permanent | — | — |
| Hash métadonnées projet | ✓ permanent | — | — |
| Arweave ID | ✓ après clôture | — | — |
| Contenu métadonnées (tâche active) | — | ✓ tous les nœuds | — |
| Contenu métadonnées (tâche clôturée) | — | évicté | ✓ permanent |
| États financiers (escrow, soldes) | ✓ permanent | cache read-only | — |
| Résultats validation | — | PostgreSQL | ✓ archivé |
| Preuves PTF Agent | — | PostgreSQL | ✓ archivé |
| Code source | — | jamais | — |
| Clés privées | — | jamais | — |

---

## Réseau PTF (broadcast décentralisé)

Le réseau PTF est un réseau de nœuds décentralisé qui diffuse les tâches disponibles à tous les participants. Il est distinct de la blockchain : la chaîne configurée enregistre les états définitifs via le BAL, le réseau PTF diffuse les opportunités en temps quasi-réel.

### NetworkBroadcast — données officielles PTF publiées dans le réseau

PTF publie en permanence ses données officielles dans le réseau, signées par la clé officielle PTF. Ces données sont vérifiables par n'importe quel nœud via des hash d'ensemble (Task Set Hash).

```typescript
interface PlatformAddresses {
  // Adresses officielles PTF publiées on-chain et dans le réseau PTF.
  // Vérifiables via platformHash — keccak256 du contenu sérialisé.
  escrowVault:     Record<string, string>; // par chaîne : { polygon: "0x...", ethereum: "0x..." }
  creditReceiver:  Record<string, string>; // adresses de réception pour les recharges
  treasury:        Record<string, string>; // trésorerie PTF
}

interface NetworkBroadcast {
  platformAddresses: PlatformAddresses;   // adresses officielles par chaîne
  hashes: {
    projects: string;   // keccak256(sorted active projectIds) — Task Set Hash
    tasks:    string;   // keccak256(sorted published taskIds) — Task Set Hash
    platform: string;   // keccak256(JSON.stringify(platformAddresses, sorted_keys))
  };
  lastUpdatedAt: Date;
  signature:     string; // signé par la clé PTF officielle (personal_sign EIP-191)
}

// Vérification par n'importe quel nœud — pas de preuve de chemin nécessaire
function verifyPlatformData(broadcast: NetworkBroadcast): boolean {
  const computed = keccak256(JSON.stringify(sortKeysDeep(broadcast.platformAddresses)));
  return computed === broadcast.hashes.platform;
  // + vérifier la signature PTF sur keccak256(JSON.stringify(broadcast))
}

// Utilisation lors d'un dépôt :
// 1. Client récupère la dernière broadcast du réseau PTF
// 2. Vérifie broadcast.hashes.platform == keccak256(platformAddresses)
// 3. Vérifie la signature PTF officielle sur le broadcast
// 4. Seulement alors envoie les fonds vers l'adresse vérifiée
```

**Topologie :**

```
PTF Backend (source de vérité)
     |
     v
[ptf push] --> Broadcast réseau PTF
     |
     +------------+------------+------------+
     v            v            v            v
  Nœud PTF    Agent         Agent        Nœud PTF
  public      entreprise A  entreprise B  public
  (AWS)       (on-prem)     (on-prem)     (communauté)
     |            |            |            |
     v            v            v            v
  Dev C        Dev D        Dev E        Dev F
  (public)     (privé A)    (privé B)    (public)
```

**Règles de visibilité :**

| Type de tâche | Nœuds publics | Agents entreprise | Contenu |
|---------------|---------------|-------------------|---------|
| Publique | Tout visible | Tout visible | En clair |
| Privée | Métadonnées + critères | Métadonnées + critères | Chiffré (AES-256) |

Un développeur qui reçoit une tâche privée via le réseau PTF ne voit que :
- Le titre et la description de haut niveau
- Les critères de réclamation (`claimCriteria`)
- La récompense et la durée
- Le `networkId` (pour dédupliquer)

Le contenu technique (spec, types, tests, interfaces) n'est transmis qu'après validation du claim, chiffré avec la clé publique du développeur.

**`networkId` vs `taskId` :**
- `taskId` = identifiant immuable de la tâche dans l'arbre Merkle du projet (permanent)
- `networkId` = identifiant de l'événement de broadcast (peut être rediffusé avec un nouveau `networkId` si la tâche revient en `open` après un rejet, sans changer le `taskId`)

---

## Dashboard développeur multi-projets

Le dashboard développeur offre une vue unifiée de toutes les tâches réclamées par un développeur, tous projets confondus, avec gestion des countdowns et alertes d'urgence.

**Fonctionnalités :**

```
DASHBOARD DEV — vue unifiée
┌─────────────────────────────────────────────────────────────────┐
│  MES TÂCHES ACTIVES                   Triées par urgence        │
├─────────────────┬──────────┬──────────┬────────────────────────┤
│  Projet         │ Tâche    │ Deadline │ Countdown              │
├─────────────────┼──────────┼──────────┼────────────────────────┤
│  [!] ProjectA   │ auth-jwt │ demain   │ 🔴 18h 34m restants    │
│  [!] ProjectB   │ api-v2   │ dans 2j  │ 🟡 47h 12m restants    │
│      ProjectA   │ db-mig   │ dans 5j  │ 🟢 5j 3h restants      │
│      ProjectC   │ ui-comp  │ dans 12j │ 🟢 11j 22h restants    │
└─────────────────┴──────────┴──────────┴────────────────────────┘
  Crédits disponibles : 245 PTF  |  Soft-lockés : 40 PTF (4 tâches)
  Réputation : 1 842 pts
```

**Règles de tri et couleurs :**
- Rouge : deadline < 24h (alerte critique)
- Orange : deadline < 48h (alerte modérée)
- Jaune : deadline < 72h (alerte préventive)
- Vert : deadline >= 72h (nominal)

**Données affichées par tâche :**
- Countdown individuel mis à jour en temps réel (WebSocket)
- Projet source, récompense, statut
- Punitions configurées (résumé : crédits risqués en cas de retard)
- Lien rapide vers la branche Git et la soumission

**API GraphQL associée :**

```graphql
query DeveloperDashboard {
  myActiveTasks(sortBy: DEADLINE_ASC) {
    taskId
    networkId
    title
    projectName
    deadline
    timeRemaining {
      hours
      minutes
      urgencyLevel  # CRITICAL | HIGH | MEDIUM | LOW
    }
    punishments {
      lateDelivery { credits reputation }
    }
    rewardAmount
    status
  }
  myWallet {
    creditBalance
    softLockedAmount
    availableBalance
    reputationScore
  }
}
```

---

## Flux de données

### Pré-création : création du projet et génération des tâches

```
Entreprise / Créateur

[Phase 0 — Rédaction des docs (4 modes)]

  Mode 1 : Rédige ARCHITECTURE.md + PLAN_ACTION.md manuellement (depuis templates PTF)
  Mode 2 : ptf describe → interview guidée → fichiers générés (DocumentGeneratorService)
           ptf fix-docs → corrections ciblées si validate-docs échoue
  Mode 3 : /ptf-architect "description" dans éditeur IA → fichiers générés conformes PTF
  Mode 4 : ptf import-issues --repo owner/repo --label "help wanted"
           → tâches générées depuis issues GitHub, validate-docs --auto (1er projet)

[Phase 1 — Création du projet]

  -> ptf validate-docs (commun aux 4 modes — filet de sécurité)
  -> ptf init --name "mon-projet" --type public --reward free|paid [--language typescript]
     ou ptf init --name "mon-projet" --type private [--language typescript]  # toujours paid
       Backend (Project Service):
         1. Calcule projectId = keccak256(ownerAddress + projectName + timestamp)
         2. Crée le projet (statut: draft, rewardMode stocké)
         3. Retourne projectId
       -> Sauvegarde .ptf/config.json (projectId, projectName, ownerAddress, type, rewardMode, createdAt)
       -> Affiche projectId à l'écran

[Phase 2 — Génération des tâches]

  Note : ptf validate-docs a déjà été exécuté en Phase 1 (avant ptf init).
         ptf generate vérifie automatiquement le format des MD en entrée.

  -> ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md :
       Backend (TaskGeneratorService):
         1. Parse les 2 fichiers MD
         2. Identifie modules, composants, phases, dépendances
         3. Estime complexité via ILLMProvider (clé utilisateur) → affiche EstimationReport
         4. Demande confirmation avant de continuer
         5. Si confirmé : génère l'arbre de tâches brut lié au projectId
         6. Remplit context, objective, deliverable, outOfScope, verificationSteps
         7. Hérite codeLanguage de la config projet pour chaque tâche
         8. Calcule dependencies + blockedBy (graphe DAG)
         9. Valide l'absence de cycles
        10. Calcule rewards par tâche
        11. Stocke l'arbre de tâches (draft) côté backend

  -> ptf tasks preview --project <projectId> :
       -> Affiche arbre de tâches (ASCII) pour revue humaine
       -> Modifications/suppressions interactives (avant paiement)
       -> Marque les tâches comme "approuvées"

  -> ptf tasks publish --project <projectId> :
       Backend (Project Service + Task Service):
         1. Si paid : Calcule coût total (reward pool + commission PTF grille 8–12%) → demande confirmation paiement
            Si free : aucun paiement requis
         2. Transaction on-chain (via ChainAdapter) : registerProject (taskSetHash, rewardMode)
         3. Si paid : Transaction on-chain (via ChainAdapter) : deposit EscrowVault (reward pool + commission PTF)
            Si free : aucune interaction avec EscrowVault
         4. Calcul taskIds + networkIds
         5. Stockage PostgreSQL
         6. Broadcast réseau PTF
       -> Tâches disponibles pour les développeurs
```

### Création d'un projet (côté entreprise — via CLI)

```
Client
  -> ptf init --name "mon-projet" --type public --reward free|paid [--language typescript]
     ou ptf init --name "mon-projet" --type private [--language typescript]  # toujours paid
  -> Backend (Project Service):
       1. Validation des données (si type=private → rewardMode forcé à "paid")
       2. Calcul projectId = keccak256(ownerAddress + projectName + timestamp)
       3. Création projet en base (statut: draft, rewardMode stocké)
       4. Stockage en PostgreSQL (métadonnées complètes)
       5. Retourne projectId + config
  -> Sauvegarde .ptf/config.json (inclut rewardMode)
  -> Affichage : projectId, nom, wallet propriétaire, mode (free/paid)

  Note : l'enregistrement on-chain (ProjectRegistry) et le dépôt EscrowVault (uniquement pour paid)
  se font plus tard, lors de ptf tasks publish, après revue des tâches générées.
```

### Publication de tâches et broadcast réseau

```
Développeur/Client
  -> ptf push (CLI)
  -> Backend (Task Service):
       1. Calcul taskIds + networkIds
       2. Calcul taskSetHash = keccak256(sorted taskIds) + mise à jour sur ProjectRegistry
       3. Stockage en PostgreSQL
  -> Task Service -> Réseau PTF (broadcast):
       - Tâches publiques : toutes métadonnées + contenu en clair
       - Tâches privées   : métadonnées + critères uniquement
  -> Tous les nœuds PTF reçoivent les nouvelles tâches disponibles
```

### Réclamation d'une tâche (flow complet)

```
Développeur
  -> ptf task show <taskId>
       -> Backend : si projet paid → pré-vérifie solde PTF >= 10
          -> Si insuffisant (paid) : "Solde insuffisant. Minimum 10 PTF requis. ptf wallet deposit"
          -> Si projet free : aucune vérification de solde
       -> Backend : retourne conditions complètes (PublicTaskView)
       -> Affichage terminal : mode (free/paid), reward, durée, langue, punishments, verificationSteps, claimCriteria

  -> ptf task claim <taskId>

       [Projet free]
       1. WalletVerificationService.verify(devAddress)
            a. Format EIP-55 checksum
            b. isActivated (txCount > 0)
            c. hasGasFees (token natif > seuil gas) — avertissement seulement
            d. isNotBanned
            e. ownershipProven (signature nonce ECDSA)
            -> Si erreur bloquante : arrêt avec code d'erreur
       2. Vérif claimCriteria (configurés par le responsable du projet)
       3. Si tout ok → affichage conditions complètes + confirmation [o/N]
          -> Si refus : abandon (aucune action)
       4. Si confirmé (sous Redis lock) :
          a. Redis SETNX lock:taskId (TTL 60s)
             -> Si FAIL : "Task already being claimed, retry"
          b. Vérif statut = "open" + dépendances
          c. Calcule conditionsHash = keccak256(taskId ‖ conditions ‖ devAddress ‖ timestamp)
          d. Signature EIP-712 automatique (conditionsHash)
          e. UPDATE statut="claimed", claimedAt, devAddress (PostgreSQL)
          f. PAS de softLock (projet free)
          g. Transaction on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
          h. TimerService : enregistre jobs alertes T-72h/48h/24h + expiration
          i. Task Service : broadcast mise à jour statut dans réseau PTF
          j. Redis DEL lock:taskId

       [Projet paid]
       1. Vérif solde PTF >= 10 (avant lock — barrière rapide, paid uniquement)
          -> Si non : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
       2. WalletVerificationService.verify(devAddress)
            a. Format EIP-55 checksum
            b. isActivated (txCount > 0)
            c. hasGasFees (token natif > seuil gas) — avertissement seulement
            d. isNotBanned
            e. ownershipProven (signature nonce ECDSA)
            -> Si erreur bloquante : arrêt avec code d'erreur
       3. Vérif claimCriteria (configurés par le responsable du projet)
       4. Si tout ok → affichage conditions complètes + confirmation [o/N]
          -> Si refus : abandon (aucune action)
       5. Si confirmé (sous Redis lock) :
          a. Redis SETNX lock:taskId (TTL 60s)
             -> Si FAIL : "Task already being claimed, retry"
          b. Vérif statut = "open" + dépendances + soft-lock disponible
          c. Calcule conditionsHash = keccak256(taskId ‖ conditions ‖ devAddress ‖ timestamp)
          d. Signature EIP-712 automatique (conditionsHash)
          e. UPDATE statut="claimed", claimedAt, devAddress (PostgreSQL)
          f. EscrowVault.softLock(dev, 10 PTF)
          g. Transaction on-chain (via ChainAdapter) : ProjectRegistry.claimTask(taskId, devAddress, conditionsHash)
          h. TimerService : enregistre jobs alertes T-72h/48h/24h + expiration
          i. Task Service : broadcast mise à jour statut dans réseau PTF
          j. Redis DEL lock:taskId

  -> Développeur reçoit : deadline calculée, punitions configurées, bundle chiffré (si projet privé)
  -> [développement dans sandbox ou local]
```

### Soumission et validation

```
Développeur
  -> ptf submit --task-id 0x... --branch ptf/task-0x...
  -> Backend (CLI Handler -> Review Service):

     Selon repo_type du projet :
       "github"      → PR GitHub standard + commitHash/branchRef stockés en DB PTF
       "self-hosted" → Code chiffré → PTF Agent → tests sandbox gVisor
                       → preuve signée → DB PTF (résultats seulement, pas le code)
       "ptf-temp"    → Code → PTF Agent → repo temporaire PTF (pas DB)
                       → résultats stockés en DB, status="pending_sync"
                       → sync vers repo créateur au reconnect (ptf sync pull)

     Dans tous les cas, la DB PTF stocke UNIQUEMENT :
       commitHash, branchRef, repo_url, auto_validation_result (pass/fail + logs)

       1. Vérification auto (tests, linters, contraintes)
       2. Si pass: tirage au sort 3 reviewers (Reputation Engine)
       3. Notification aux reviewers (Notification Service)
       4. Après vote:
          -> Si approved :
             - Si paid : EscrowVault.releaseToDev(taskId, dev, amount)
             - ReputationRegistry.updateScore(dev, +delta)
             - Si paid : EscrowVault.softUnlock(dev, 10 PTF)
             - TimerService : annule les jobs d'expiration
             - Si ptf-temp : sync_status mis à jour → "synced" après sync
          -> Si rejected (bug critique/malveillant) :
             - PunishmentService.apply(taskId, violationType)
               → Si paid : EscrowVault.applyPunishment(dev, credits)
               → ReputationRegistry.updateScore(dev, -reputation)  // toujours
             - Tâche remise en "open"
```

### Flux de réclamation complet (list → show → claim)

```
dev: ptf tasks list [--min-reward 100 --skill typescript]
  -> Backend (Task Service) :
       -> Retourne liste tâches open (PublicTaskView, anonymisées si projets privés)

dev: ptf task show <taskId>
  -> Backend (Task Service) :
       -> Si projet paid → Pré-vérification IMMÉDIATE : CreditToken.balanceOf(dev) >= 10 ?
          → Si non (paid) : "Solde insuffisant. Minimum 10 PTF requis. ptf wallet deposit"
          → Si projet free : aucune vérification de solde
       -> Retourne PublicTaskView complète (anonymisée si projet privé)
       -> Affichage terminal : mode (free/paid), conditions, langue, punishments, verificationSteps, reward, deadline

dev: ptf task claim <taskId>
  -> Backend (Task Service) :

     [Projet free]
       1. WalletVerificationService.verify(devAddress) :
          [OK] isValidAddress   → regex EIP-55
          [OK] isActivated      → eth_getTransactionCount > 0
          [WN] hasGasFees       → token natif > seuil gas (avertissement si insuffisant)
          [OK] isNotBanned      → AuthService.isBanned = false
          [OK] ownershipProven  → signature nonce validée ECDSA
          → Si canProceed = false : arrêt + erreur détaillée
       2. claimCriteria (réputation, compétences, limite tâches simultanées)
          → Si non satisfaits : erreur détaillée par critère
       3. Affiche conditions complètes + confirmation [o/N]
          → Si refus : abandon silencieux
       4. Si confirmé :
          a. Redis SETNX lock:taskId (TTL 60s)
             → Si FAIL : "Task already being claimed, retry"
          b. Vérif statut = "open" + dépendances
          c. conditionsHash = keccak256(taskId ‖ conditions ‖ devAddress ‖ timestamp)
          d. Signature EIP-712 automatique (conditionsHash)
          e. UPDATE statut="claimed", claimedAt, devAddress
          f. PAS de softLock (projet free)
          g. ProjectRegistry.claimTask(taskId, devAddress, conditionsHash) [via ChainAdapter]
             → Émet : TaskClaimed(taskId, devAddress, conditionsHash, deadline)
          h. TimerService : jobs T-72h/48h/24h + expiration
          i. Broadcast réseau PTF
          j. Redis DEL lock:taskId

     [Projet paid]
       1. CreditToken.balanceOf(dev) >= 10 ?
          → Si non : "Solde insuffisant (X PTF). Minimum 10 PTF requis comme garantie."
       2. WalletVerificationService.verify(devAddress) :
          [OK] isValidAddress   → regex EIP-55
          [OK] isActivated      → eth_getTransactionCount > 0
          [WN] hasGasFees       → token natif > seuil gas (avertissement si insuffisant)
          [OK] isNotBanned      → AuthService.isBanned = false
          [OK] ownershipProven  → signature nonce validée ECDSA
          → Si canProceed = false : arrêt + erreur détaillée
       3. claimCriteria (réputation, compétences, limite tâches simultanées)
          → Si non satisfaits : erreur détaillée par critère
       4. Affiche conditions complètes + confirmation [o/N]
          → Si refus : abandon silencieux
       5. Si confirmé :
          a. Redis SETNX lock:taskId (TTL 60s)
             → Si FAIL : "Task already being claimed, retry"
          b. Vérif statut = "open" + dépendances + soft-lock disponible
          c. conditionsHash = keccak256(taskId ‖ conditions ‖ devAddress ‖ timestamp)
          d. Signature EIP-712 automatique (conditionsHash)
          e. UPDATE statut="claimed", claimedAt, devAddress
          f. EscrowVault.softLock(dev, 10 PTF)
          g. ProjectRegistry.claimTask(taskId, devAddress, conditionsHash) [via ChainAdapter]
             → Émet : TaskClaimed(taskId, devAddress, conditionsHash, deadline)
          h. TimerService : jobs T-72h/48h/24h + expiration
          i. Broadcast réseau PTF
          j. Redis DEL lock:taskId

  -> Développeur reçoit : deadline, punitions, bundle chiffré (si projet privé)
```

### Application d'une punition

```
Événement violation (lateDelivery | maliciousCode | criticalBug | nonCriticalBug)
  -> PunishmentService:
       1. Lecture project.rewardMode (free ou paid)
       2. Lecture task.punishments[violationType]
       3. Calcul montants :
          -> reputation (toujours présent, free et paid)
          -> credits (uniquement si paid)
          -> ban (si configuré)
       4. Si paid : EscrowVault.applyPunishment(dev, credits)
       5. ReputationRegistry.updateScore(dev, -reputation)  // toujours exécuté
       6. Si ban : AuthService.applyBan(dev, banType)
       7. Notification Service : alerte dev + enregistrement on-chain
```

### Expiration de tâche (timer deadline)

```
[TimerService : deadline atteinte, tâche encore en "claimed"]
  -> Task Service : UPDATE statut = "expired"
  -> PunishmentService.apply(taskId, "lateDelivery")
       -> Si paid : EscrowVault.applyPunishment(dev, punishments.lateDelivery.credits)
       -> ReputationRegistry.updateScore(dev, -punishments.lateDelivery.reputation)  // toujours
  -> Si paid : EscrowVault.softUnlock(dev, 10 PTF)
  -> Task Service : tâche remise en "open" après expiration
  -> Réseau PTF : broadcast nouvelle disponibilité de la tâche
  -> Notification Service : alerte dev + client
```

---

## Matrice d'accès — authentification requise

Le réseau PTF est accessible sans authentification pour toutes les opérations de lecture publique. Seules les opérations qui écrivent on-chain ou mutent l'état du serveur requièrent un JWT de session valide (obtenu via `ptf auth login`).

**Commandes locales (aucun réseau) :**

| Commande | Description |
|---|---|
| `ptf scaffold` | Génère les templates ARCHITECTURE.md + PLAN_ACTION.md |
| `ptf validate-docs` | Valide le format des docs |
| `ptf config get/set-*` | Configuration locale |
| `ptf wallet create/restore/list/delete` | Gestion des keystores locaux |
| `ptf auth logout / auth status` | Session locale |

**Commandes publiques (réseau, sans auth) :**

| Commande | Description |
|---|---|
| `ptf tasks list` | Liste les tâches disponibles |
| `ptf task show <id>` | Détail d'une tâche |
| `ptf task template <id>` | Template de soumission |
| `ptf projects list` | Liste les projets |
| `ptf project info` | Info du projet courant |
| `ptf contributors list/verify` | Contributeurs d'un projet public |
| `ptf wallet status` | Statut wallet (lecture on-chain publique) |
| `ptf status` | État de la tâche active (local + lecture réseau) |

**Commandes privées (auth requise — `ptf auth login` obligatoire) :**

| Commande | Raison |
|---|---|
| `ptf init` | Enregistre le projet on-chain |
| `ptf generate` | Appelle le backend avec le projectId |
| `ptf tasks preview` | Mute les drafts liés au projet |
| `ptf tasks mine` | Données filtrées par identité |
| `ptf tasks publish` | Dépôt escrow + taskSetHash on-chain |
| `ptf task claim` | Écriture on-chain + soft-lock PTF |
| `ptf task cancel` | Écriture on-chain |
| `ptf submit` | Push + enregistrement on-chain |
| `ptf commit` | Commit lié à une tâche claimée |
| `ptf report` | Mutation serveur protégée |
| `ptf project claimed-tasks` | Vue créateur privée |
| `ptf wallet history` | Données financières privées |
| `ptf wallet reputation-history` | Données de réputation privées |
| `ptf wallet utxos` | UTXOs privés de l'utilisateur |

**Règle d'implémentation (CLI et backend) :** toute commande privée vérifie la présence d'un `sessionToken` valide **avant** toute autre opération. Le CLI affiche `ptf auth login` immédiatement si absent. Le backend rejette la requête avec `UNAUTHORIZED` si le JWT est absent ou expiré.

---

## APIs GraphQL principales

### Queries

```graphql
type Query {
  project(id: ID!): Project
  projects(filter: ProjectFilter, pagination: Pagination): ProjectConnection
  # projets privés retournés avec anonymisation automatique (PublicProjectView)

  task(id: ID!): Task
  tasks(filter: TaskFilter): [Task!]!
  # tâches de projets privés retournées avec anonymisation automatique (PublicTaskView)

  developer(address: String!): Developer
  leaderboard(limit: Int): [Developer!]!

  # Dashboard développeur
  myActiveTasks(sortBy: TaskSortField): [Task!]!
  myWallet: DeveloperWallet!

  # Tâches réclamées par le dev connecté (tous statuts)
  myTasks(filter: MyTasksFilter): [MyTask!]!

  # Réseau PTF
  networkTasks(filter: NetworkTaskFilter): [NetworkTask!]!

  # Vérification wallet
  walletVerification(address: String!): WalletVerification!
  walletStatus: WalletStatus!           # wallet connecté uniquement

  # Contributeurs (projets publics uniquement)
  projectContributors(projectId: String!): [Contributor!]!
  # Erreur PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN si projet privé
  verifyContributor(projectId: String!, devAddress: String!): ContributorVerification!

  # Vue créateur : tâches réclamées d'un projet (réservé au responsable du projet)
  projectClaimedTasks(projectId: ID!, status: TaskStatus): [ClaimedTaskView!]!
}
```

### Mutations

```graphql
type Mutation {
  createProject(input: CreateProjectInput!): Project!
  updateProject(id: ID!, input: UpdateProjectInput!): Project!
  pushTasks(projectId: ID!, tasks: [TaskInput!]!): PushTasksResult!

  # Flux claim : vérification critères + confirmation + signature atomique
  claimTask(taskId: ID!): ClaimResult!
  # Projet paid → Vérifie : solde PTF >= 10, wallet, claimCriteria + soft-lock 10 PTF
  # Projet free → Vérifie : wallet, claimCriteria (pas de vérif solde, pas de soft-lock)
  # → Affiche conditions adaptées (free ou paid), demande confirmation
  # → Si confirmé : signature EIP-712 automatique + enregistrement on-chain

  submitTask(taskId: ID!, submission: SubmissionInput!): Submission!
  reviewSubmission(submissionId: ID!, verdict: ReviewVerdict!, comment: String): Review!
  openDispute(taskId: ID!, reason: String!): Dispute!
  voteOnDispute(disputeId: ID!, vote: DisputeVote!): Dispute!

  # Wallet
  verifyWallet(address: String!): WalletVerification!
  verifyCredits(address: String!): CreditVerificationResult!

  # Pré-création projet (TaskGeneratorService)
  validateDocs(architectureMd: String!, planMd: String!): ValidationReport!
  estimateProject(architectureMd: String!, planMd: String!): EstimationReport!
  generateTasks(projectId: ID!, architectureMd: String!, planMd: String!): GenerationResult!
  # → projectId obligatoire : le projet doit exister (ptf init)
  previewTasks(projectId: ID!): TaskPreview!
  publishTasks(projectId: ID!): PublishResult!

  # Génération de docs (DocumentGeneratorService — ptf describe / ptf fix-docs / ptf scaffold)
  startInterview(projectName: String!): InterviewSession!
  nextQuestion(sessionId: ID!, answer: String!): InterviewStep!
  generateDocs(sessionId: ID!): GeneratedDocsResult!
  fixDocs(architectureMd: String!, planMd: String!, errors: [ValidationErrorInput!]!): FixSession!
  scaffoldFromRepo(repoUrl: String!, projectName: String!): GeneratedDocsResult!

  # Wallet — recharge et conversion
  depositCredits(chainId: String!, amount: Float!, token: String!): DepositResult!
  # → Retourne l'adresse officielle PTF vérifiée (platformHash) + instructions de dépôt
  convertCurrency(from: String!, amount: Float!): ConversionQuote!
  # → Retourne ptfCredits, rate, fee, expiresAt (taux garanti 60s)

  # Signalement développeur
  reportDeveloper(
    targetAddress: String!,
    reason: ReportReason!,
    evidence: String!,
    taskId: ID
  ): ReportId!

  # Vue créateur : tâches réclamées
  # (query, pas mutation — voir ci-dessous dans Queries)
}

# Ajout dans type Query :
# projectClaimedTasks(projectId: ID!, status: TaskStatus): [ClaimedTaskView!]!

type ClaimResult {
  task:           Task!
  deadline:       DateTime!
  conditionsHash: String!        # hash des conditions signées on-chain
  softLocked:     Int!           # crédits PTF soft-lockés (10 pour paid, 0 pour free)
  rewardMode:     String!        # "free" ou "paid"
  punishments:    TaskPunishments!  # résumé des risques (réputation seule si free)
  txHash:         String!        # hash de la transaction on-chain (chaîne configurée)
}

type MyTask {
  taskId:       ID!
  projectId:    ID!
  projectName:  String!          # anonymisé si projet privé : "Private Project #2f8b"
  title:        String!
  status:       TaskStatus!
  claimedAt:    DateTime!
  deadline:     DateTime!
  daysRemaining: Int!
  reward:       String!          # montant USDC
  language:     String!          # langue requise
}

input MyTasksFilter {
  status:    TaskStatus
  projectId: ID
}
```

### Subscriptions

```graphql
type Subscription {
  taskStatusChanged(projectId: ID!): Task!
  submissionReviewed(developerId: ID!): Submission!
  disputeUpdated(disputeId: ID!): Dispute!
  paymentReleased(developerId: ID!): Payment!

  # Nouveau : countdown et alertes deadline
  deadlineAlert(developerId: ID!): DeadlineAlert!
  punishmentApplied(developerId: ID!): PunishmentEvent!
}
```

---

## Cohérence des états PostgreSQL ↔ On-chain (C-06)

PostgreSQL est un **cache de lecture** pour les données financières on-chain. La source de vérité par domaine est clairement définie et ne doit jamais être inversée.

### Source de vérité par type de données

| Donnée                              | Source de vérité        | PostgreSQL / Nœuds      |
|-------------------------------------|-------------------------|-------------------------|
| Solde USDC escrow                   | On-chain                | Cache (read-only)       |
| Solde crédits PTF                   | On-chain                | Cache (read-only)       |
| Score réputation                    | On-chain                | Cache (read-only)       |
| Statut tâche                        | On-chain                | Replica via events      |
| Hash métadonnées tâche/projet       | On-chain (MetadataRegistry) | —                   |
| Arweave ID (tâches archivées)       | On-chain (MetadataRegistry) | —                   |
| Contenu métadonnées (tâches actives)| Nœuds PTF (MetadataStore)   | Map<hash, content>  |
| Contenu métadonnées (tâches closes) | Arweave                 | évicté des nœuds        |
| Résultats validation                | PostgreSQL              | Source de vérité        |
| Preuves PTF Agent                   | PostgreSQL + Arweave    | Source de vérité        |
| Sessions utilisateur                | Redis                   | Source de vérité        |

**Règles :**
- PostgreSQL ne met JAMAIS à jour les données financières directement
- Tout changement financier passe par le `ChainEventListener`
- En cas de divergence : on-chain gagne toujours
- Reorgs : gérer avec `minConfirmations` par chaîne (voir `ChainEventListener` ci-dessus)
- Commande admin : `ptf admin reconcile --project <id>` (force une resynchronisation on-chain → PostgreSQL pour un projet donné)

### Règles d'écriture strictes

```
PostgreSQL  ←  ChainEventListener  ←  Événements on-chain (SEUL flux autorisé pour données financières)
PostgreSQL  →  lecture seule pour affichage, filtres, claimCriteria, sessions

INTERDIT : update direct PostgreSQL sur escrow_balance, credit_balance, reputation_score
           sans passer par un événement on-chain confirmé
```

---

## Schéma de base de données PostgreSQL

La base de données PTF stocke **uniquement des métadonnées et des références**. Aucune donnée de code source n'est persistée.

### Table `projects`

```sql
CREATE TABLE projects (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       TEXT             UNIQUE NOT NULL,  -- keccak256(ownerAddress + name + ts)
  name             TEXT             NOT NULL,
  type             TEXT             NOT NULL CHECK (type IN ('public', 'private')),
  reward_mode      TEXT             NOT NULL CHECK (reward_mode IN ('free', 'paid')),
  language_primary TEXT             NOT NULL DEFAULT 'TypeScript',
  language_allowed TEXT[]           NOT NULL DEFAULT '{}',
  language_version TEXT,
  chain_id         TEXT             NOT NULL DEFAULT 'polygon',  -- chaîne choisie par le créateur (via ChainRegistry)
  stablecoin       TEXT             NOT NULL DEFAULT 'USDC'
                   CHECK (stablecoin IN ('USDC', 'USDT', 'DAI')),
  escrow_balance   NUMERIC(20, 6)   DEFAULT 0,
  owner_address    TEXT             NOT NULL,
  status           TEXT             NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'archived')),

  -- Dépôt de code (référence externe — le code n'est PAS stocké ici)
  repo_type        TEXT             NOT NULL CHECK (repo_type IN ('github', 'self-hosted', 'ptf-temp')),
  repo_url         TEXT             NOT NULL,           -- URL du dépôt réel
  temp_repo_url    TEXT,                                -- URL repo PTF temporaire (cas ptf-temp uniquement)
  sync_status      TEXT             NOT NULL DEFAULT 'synced'
                   CHECK (sync_status IN ('synced', 'pending', 'syncing')),
  last_sync_at     TIMESTAMPTZ,

  -- Références vers les fichiers de documentation dans le dépôt du créateur
  -- (chemin relatif ou URL — jamais le contenu)
  architecture_ref TEXT,                               -- ex: "docs/ARCHITECTURE.md" ou URL
  plan_action_ref  TEXT,                               -- ex: "docs/PLAN_ACTION.md" ou URL

  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Colonnes SUPPRIMÉES (ne pas ajouter) :
-- architecture_md    TEXT  -- contenu du fichier ARCHITECTURE.md → non stocké
-- plan_action_md     TEXT  -- contenu du fichier PLAN_ACTION.md  → non stocké
```

### Table `submissions`

```sql
CREATE TABLE submissions (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                  UUID         NOT NULL REFERENCES tasks(id),
  dev_address              TEXT         NOT NULL,
  branch_name              TEXT         NOT NULL,       -- branche soumise (ex: ptf/task-0xdef456)
  commit_hash              TEXT         NOT NULL,       -- hash du commit
  repo_url                 TEXT         NOT NULL,       -- URL du dépôt source de la soumission
  submitted_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Résultats de validation (jamais le code, seulement les résultats)
  auto_validation_result   JSONB,       -- { passed: bool, logs: string, coverage: number }
  peer_review_result       JSONB,       -- { verdict: "approved"|"rejected", reviewers: [...], comments: [...] }
  client_validation_result JSONB,       -- { verdict: "approved"|"rejected", comment: string }

  status                   TEXT         NOT NULL DEFAULT 'pending_sync'
                           CHECK (status IN (
                             'pending_sync', 'in_review', 'approved', 'rejected', 'disputed'
                           )),
  synced_at                TIMESTAMPTZ  -- quand le code a été synchronisé vers le repo créateur

  -- Colonnes SUPPRIMÉES (ne pas ajouter) :
  -- file_contents   TEXT  -- contenu des fichiers soumis → jamais stocké
  -- code_diff       TEXT  -- diff de code → jamais stocké
);
```

### Table `tasks`

```sql
CREATE TABLE tasks (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         TEXT         UNIQUE NOT NULL,         -- keccak256(projectId + parentId + metadata + nonce)
  project_id      TEXT         NOT NULL REFERENCES projects(project_id),
  parent_id       TEXT         NOT NULL,
  network_id      TEXT         UNIQUE NOT NULL,
  title           TEXT         NOT NULL,
  description     TEXT         NOT NULL,                -- chiffré pour les tâches privées
  reward_weight   NUMERIC(6,3) NOT NULL DEFAULT 1.0,  -- DÉPRÉCIÉ : remplacé par le champ scoring (JSONB)
  scoring         JSONB        NOT NULL DEFAULT '{"complexity":1,"impact":1,"effort":1}',
  -- reputationPoints : calculé dynamiquement par le ReputationEngine PTF (non stocké)
  status          TEXT         NOT NULL DEFAULT 'created',
  duration        TEXT         NOT NULL DEFAULT '30d',
  claimed_at      TIMESTAMPTZ,
  deadline        TIMESTAMPTZ,
  dev_address     TEXT,

  -- Champs enrichis (contexte / objectif / livrable)
  context         TEXT         NOT NULL DEFAULT '',
  objective       TEXT         NOT NULL DEFAULT '',
  deliverable     TEXT         NOT NULL DEFAULT '',
  out_of_scope    TEXT[]       NOT NULL DEFAULT '{}',

  -- Contraintes, critères, punitions, verification steps (stockés en JSONB)
  constraints           JSONB  NOT NULL DEFAULT '{}',
  claim_criteria        JSONB  NOT NULL DEFAULT '{}',
  punishments           JSONB  NOT NULL DEFAULT '{}',
  verification_steps    JSONB  NOT NULL DEFAULT '[]',
  dependencies          TEXT[] NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

---

## Métriques et monitoring

### KPI plateforme

```typescript
// KPI clé de PTF : temps entre inscription créateur et première tâche publiée
interface PlatformKPIs {
    timeToFirstTaskPublished: {
        target: "< 30 minutes";
        // Mesuré depuis : ptf auth (inscription) → ptf tasks publish
        // Segmenté par mode de création (Mode 1/2/3/4)
        p50: number;  // médiane en minutes
        p90: number;  // 90e percentile
        p99: number;
    };

    taskClaimRate: number;          // % des tâches published qui sont claimed en < 7j
    taskCompletionRate: number;     // % des tâches claimed qui sont complétées
    disputeRate: number;            // % des soumissions qui génèrent un litige
    devRetentionRate: number;       // % des devs actifs après 30 jours
}

// Dashboard monitoring (GET /admin/metrics)
// Alertes si TimeToFirstTask > 60 min en moyenne sur 7 jours
```

**KPI Time-to-First-Task-Published** : métrique centrale de l'expérience créateur. L'objectif est qu'un créateur puisse publier sa première tâche en moins de 30 minutes depuis son inscription. Ce KPI est segmenté par mode de création (Mode 1 expert / Mode 2 interactif / Mode 3 IA-assisté / Mode 4 import GitHub Issues) pour identifier les friction points par profil.

### Infrastructure de monitoring

| Composant | Technologie | Usage |
|-----------|-------------|-------|
| Métriques | Prometheus + Grafana | KPIs plateforme, alertes, dashboards |
| Logs | OpenTelemetry + Loki | Traces distribuées, audit punitions |
| Alertes | Alertmanager | Seuils KPI (TimeToFirstTask, taux de disputes) |

---

## Infrastructure

| Composant | Technologie | Usage |
|-----------|-------------|-------|
| Frontend | Next.js 14 + TailwindCSS | Interface web, dashboard multi-projets — Vercel free (dev) / Vercel Pro en prod |
| Backend API | Node.js + TypeScript + GraphQL (Apollo) | Logique métier |
| Base de données | PostgreSQL 16 | Données relationnelles, timers, punitions — auto-hébergé sur VPS Hetzner (gratuit) ; Neon free tier en dev |
| Cache / Locks (Sentinel) | Redis 7 — Sentinel (1 master + 2 replicas + 3 sentinels) | Sessions JWT, locks distribués (anti-collision Redlock), rate limiting |
| Cache / Queues (Cluster) | Redis 7 — Cluster (3 shards × 2 replicas = 6 nœuds) | BullMQ queues (timers, notifications, punishments), cache listings |
| Job Queue | BullMQ (Redis Cluster) | Cron jobs TimerService, alertes deadline, expiration |
| Blockchain | Via BAL (défaut : Polygon PoS) | Smart contracts, paiements, EIP-712 — extensible à toute chaîne EVM ou non-EVM |
| Smart contracts | ProjectRegistry, EscrowVault, CreditToken, ReputationRegistry, **MetadataRegistry** | MetadataRegistry : hash des métadonnées + Arweave IDs ancré on-chain |
| MetadataStore (nœuds) | Map<hash, content> en mémoire + disque | Stockage distribué des métadonnées actives — éviction après archivage |
| Archive permanente | Arweave | Métadonnées des tâches/projets clôturés — accessible sans PTF, pour toujours |
| Sandbox dev | Docker + gVisor | Environnement isolé projets privés |
| Réseau PTF | Nœuds P2P (libp2p) | Broadcast tâches + gossip métadonnées (hash, content) |
| LLM (utilisateur) | Clé API fournie par le développeur/créateur (`ptf config set-llm`) | TaskGeneratorService + DocumentGeneratorService — PTF ne gère pas de compte LLM centralisé |
| RPC Blockchain | RPC publics gratuits (défaut) — Alchemy/Infura si >1M req/mois | polygon-rpc.com, cloudflare-eth.com, bsc-dataseed.binance.org, api.avax.network… |
| Indexeur on-chain | The Graph — hosted service (gratuit petits volumes) | Réputation cross-chaîne, historique tâches, queries multi-chaîne |
| Oracle prix | Chainlink (ou équivalent) | Taux de change temps réel pour conversions de devises (CurrencyConverter) |
| Monitoring | Grafana Cloud free tier + Better Uptime free | Métriques, alertes, surveillance disponibilité — Loki self-hosted pour les logs |
| Logs | OpenTelemetry + Loki (self-hosted) | Traces distribuées, audit punitions |
| CI/CD | GitHub Actions | Tests, déploiements |
| Hosting | VPS Hetzner (CX21 dev → CX41 prod) | Serveurs les moins chers du marché — CX21 €3.79/mois, CX41 €14.99/mois |

### Architecture Redis (deux instances dédiées)

```
Instance Redis A — Sentinel (Haute disponibilité)
  Usage : locks distribués (anti-collision Redlock), sessions JWT, rate limiting
  Config : 1 master + 2 replicas + 3 sentinels
  Redlock : 3 nœuds minimum pour les locks critiques (algorithme Redlock)

Instance Redis B — Cluster (Throughput)
  Usage : queues BullMQ (timers, notifications, punishments), cache listings
  Config : 3 shards × 2 replicas = 6 nœuds

Règle : jamais de lock critique sur l'instance Cluster
        jamais de queue BullMQ sur l'instance Sentinel
```

```typescript
// Configuration double Redis
const redisConfig = {
  sentinel: {
    sentinels: [
      { host: process.env.REDIS_SENTINEL_1, port: 26379 },
      { host: process.env.REDIS_SENTINEL_2, port: 26379 },
      { host: process.env.REDIS_SENTINEL_3, port: 26379 },
    ],
    name: 'ptf-sentinel-master',
    // Utilisé pour : locks claims, sessions, rate limiting
  },
  cluster: {
    nodes: [
      { host: process.env.REDIS_CLUSTER_1, port: 6380 },
      { host: process.env.REDIS_CLUSTER_2, port: 6380 },
      { host: process.env.REDIS_CLUSTER_3, port: 6380 },
    ],
    // Utilisé pour : BullMQ queues, cache
  },
};

// Redlock sur 3 nœuds Sentinel pour les locks critiques
const redlock = new Redlock(
  [redisSentinel1, redisSentinel2, redisSentinel3],
  { retryCount: 3, retryDelay: 200, driftFactor: 0.01 }
);
```

---

## Annexe — Codes d'erreur PTF (SCREAMING_SNAKE_CASE)

### Wallet et crédits
| Code | Message | Commande corrective |
|------|---------|---------------------|
| WALLET_NOT_CONNECTED | Wallet non connecté | ptf wallet connect |
| WALLET_NOT_ACTIVATED | Wallet jamais utilisé on-chain | Effectuer une transaction sur la chaîne |
| INSUFFICIENT_GAS | Solde MATIC/ETH insuffisant pour les frais | ptf wallet deposit --currency MATIC |
| INSUFFICIENT_PTF_BALANCE | Solde PTF < 10 (pour tâches paid) | ptf wallet deposit --amount 10 |
| BELOW_MIN_WITHDRAWAL | Montant < 1.0 PTF | Augmenter le montant de retrait |
| WALLET_BANNED | Compte banni par PTF | Contacter support@ptf.dev |
| INVALID_ADDRESS | Adresse wallet invalide (format EIP-55) | Vérifier l'adresse |
| PLATFORM_ADDRESS_UNVERIFIED | Adresse de dépôt non vérifiée | ptf network addresses |

### Tâches
| Code | Message | Commande corrective |
|------|---------|---------------------|
| TASK_NOT_FOUND | Tâche introuvable | ptf tasks list |
| TASK_ALREADY_CLAIMED | Tâche déjà réclamée | Chercher une autre tâche |
| TASK_BEING_CLAIMED | Claim en cours par un autre dev | Réessayer dans 5 secondes |
| TASK_EXPIRED | Tâche expirée | ptf tasks list |
| TASK_IMMUTABLE | Tâche non modifiable (statut ≠ open) | — |
| ACCEPTANCE_NOT_FOUND | Pas d'acceptation pour cette tâche | ptf task claim <taskId> |
| CLAIM_CRITERIA_NOT_MET | Critères de réclamation non remplis | ptf task show <taskId> pour voir les critères |
| TASK_CANCEL_TOO_LATE | Abandon après 50% de la durée (pénalités) | Voir ptf task cancel --dry-run |

### Projets
| Code | Message | Commande corrective |
|------|---------|---------------------|
| PROJECT_NOT_FOUND | Projet introuvable | ptf projects list |
| PROJECT_NOT_ACTIVE | Projet inactif ou annulé | — |
| INSUFFICIENT_ESCROW | Fonds insuffisants dans l'escrow | ptf project top-up --project <id> |
| PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN | Contributeurs masqués (projet privé) | — |
| PROJECT_ALREADY_EXISTS | Projet avec ce nom existe déjà | Choisir un autre nom |

### Validation et soumission
| Code | Message | Commande corrective |
|------|---------|---------------------|
| VERIFICATION_STEP_FAILED | Un verificationStep a échoué | Vérifier les logs : ptf task status <taskId> |
| BRANCH_NOT_FOUND | Branche introuvable | ptf submit <taskId> --branch <branch> |
| COMMIT_NOT_FOUND | Commit introuvable | Vérifier le hash |
| SUBMISSION_ALREADY_EXISTS | Soumission déjà envoyée | ptf task status <taskId> |
| COVERAGE_BELOW_MINIMUM | Couverture tests insuffisante | Ajouter des tests |

### Documents et génération
| Code | Message | Commande corrective |
|------|---------|---------------------|
| INVALID_ARCHITECTURE_MD | ARCHITECTURE.md invalide | ptf fix-docs |
| INVALID_PLAN_ACTION_MD | PLAN_ACTION.md invalide | ptf fix-docs |
| SECTION_MISSING | Section obligatoire manquante | ptf fix-docs |
| VAGUE_DESCRIPTION_DETECTED | Description trop vague (terme interdit) | Rendre les critères mesurables |
| LLM_UNAVAILABLE | Service de génération indisponible | Réessayer dans quelques minutes |
| GENERATION_QUOTA_EXCEEDED | Quota de génération dépassé (projets free) | Passer à un projet paid |

### Réseau et chaîne
| Code | Message | Commande corrective |
|------|---------|---------------------|
| CHAIN_UNAVAILABLE | Chaîne temporairement indisponible | Réessayer ou choisir une autre chaîne |
| ALL_RPC_FAILED | Tous les endpoints RPC indisponibles | Contacter support@ptf.dev |
| BRIDGE_TIMEOUT | Bridge cross-chain expiré — remboursement en cours | ptf wallet bridge status <bridgeId> |
| TX_FAILED | Transaction blockchain échouée | Vérifier les logs on-chain |
| REORG_DETECTED | Réorganisation détectée — en attente de reconfirmation | Attendre quelques minutes |
