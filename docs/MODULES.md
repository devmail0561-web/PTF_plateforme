# PTF — Architecture des modules

> Relations entre les modules, données stockées, et rapport framework ↔ service.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PTF — Pay-Task Framework                           │
│                                                                             │
│   ┌──────────────────────┐        ┌──────────────────────────────────────┐  │
│   │   FRAMEWORK (OSS)    │        │       SERVICE (privé)                │  │
│   │                      │        │                                      │  │
│   │  ┌──────────────┐    │        │  ┌─────────────┐  ┌──────────────┐  │  │
│   │  │  cli/  (ptf) │◄───┼────────┼─►│  backend/   │  │  frontend/   │  │  │
│   │  └──────────────┘    │        │  │  (GraphQL)  │  │  (Next.js)   │  │  │
│   │                      │        │  └──────┬──────┘  └──────┬───────┘  │  │
│   │  ┌──────────────┐    │        │         │                │          │  │
│   │  │ contracts/   │◄───┼────────┼─────────┘                │          │  │
│   │  │  (Solidity)  │    │        │  ┌──────────────────────────────┐   │  │
│   │  └──────────────┘    │        │  │  PostgreSQL  │  Redis        │   │  │
│   │                      │        │  └──────────────────────────────┘   │  │
│   │  ┌──────────────┐    │        └──────────────────────────────────────┘  │
│   │  │    docs/     │    │                                                   │
│   │  └──────────────┘    │                                                   │
│   └──────────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Relations entre tous les modules

```
                         ╔══════════════════════════════════════════╗
                         ║         FRAMEWORK (open source)          ║
                         ╚══════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│  cli/src/                                                                    │
│                                                                              │
│   index.ts                                                                   │
│      │                                                                       │
│      ├── commands/                                                           │
│      │     auth.ts ──────────────────────────────► utils/keystore.ts        │
│      │     wallet.ts ─────────────────────────────► utils/keystore.ts       │
│      │     tasks.ts ──────────────────────────────► utils/api.ts            │
│      │     task.ts ───────────────────────────────► utils/api.ts            │
│      │     submit.ts ─────────────────────────────► utils/tracker.ts        │
│      │     status.ts ─────────────────────────────► utils/tracker.ts        │
│      │     commit.ts ─────────────────────────────► utils/tracker.ts        │
│      │     projects.ts ───────────────────────────► utils/api.ts            │
│      │     init.ts ───────────────────────────────► utils/config.ts         │
│      │     scaffold.ts ────────────────────────────► templates/             │
│      │     generate.ts ───────────────────────────► utils/api.ts            │
│      │     config.ts ──────────────────────────────► utils/config.ts        │
│      │                                                                       │
│      └── utils/                                                              │
│            api.ts ─────────► [HTTP/GraphQL]──────► BACKEND (optionnel)      │
│                 │                                                            │
│                 └─► mock-data.ts  (si offline)                               │
│            config.ts ──────► ~/.config/ptf/config.json                      │
│                         ──► .ptf/config.json  (projet)                      │
│            keystore.ts ────► ~/.ptf/keystore/<addr>.json                    │
│            crypto.ts ──────► (keccak256, Merkle, EIP-712)                   │
│            tracker.ts ─────► .ptf/active-task.json  (repo local)            │
│                         ──► ~/.config/ptf/active-tasks.json                 │
│            display.ts ─────► (rendu terminal — aucune dépendance externe)   │
│            shell.ts ───────► (git subprocess — aucune dépendance externe)   │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  contracts/evm/                                                              │
│                                                                              │
│   CreditToken.sol ──────────────────────────────────────────────────────    │
│      │  ERC-20 (6 dec) + EIP-712 vouchers                                   │
│      │  mint() / burn() / claimWithSignature()                              │
│      │                                                                       │
│   EscrowVault.sol ──────────────────────────────────────────────────────    │
│      │  Tient les fonds USDC des projets                                    │
│      │  softLock() / softUnlock() (10 PTF garantie dev)                     │
│      │  releaseTaskReward() (paiement au dev validé)                        │
│      │  executePunishment() (pénalités)                                     │
│      │  withdrawWithProof() (retrait UTXO multi-signatures)                 │
│      │  ──► CreditToken (mint / burn)                                       │
│      │                                                                       │
│   ProjectRegistry.sol ─────────────────────────────────────────────────    │
│      │  registerProject() / updateMerkleRoot()                              │
│      │  markTaskClaimed() → verrouille la Merkle root                       │
│      │  verifyTask() (preuve Merkle)                                        │
│      │                                                                       │
│   ReputationRegistry.sol ──────────────────────────────────────────────    │
│         applyDelta() / getScore() / getHistory()                            │
│         Historique immuable on-chain                                         │
└──────────────────────────────────────────────────────────────────────────────┘

                         ╔══════════════════════════════════════════╗
                         ║           SERVICE (privé)                ║
                         ╚══════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│  backend/src/                                                                │
│                                                                              │
│   server.ts                                                                  │
│      │  Express + Apollo Server + rate limiting + depth limit               │
│      │                                                                       │
│      ├── container.ts  (DI root — instancie tout dans l'ordre)              │
│      │      │                                                               │
│      │      ├── PrismaClient ──────────────────────► PostgreSQL             │
│      │      ├── Redis ────────────────────────────► Redis                  │
│      │      │                                                               │
│      │      └── Services (ordre de dépendances) :                          │
│      │             ReputationService                                        │
│      │             EmailService ─────────────────► SMTP                    │
│      │             GithubService ────────────────► api.github.com          │
│      │             AuthService ──────────────────► PrismaClient            │
│      │             WalletService                                            │
│      │             ProjectService                                           │
│      │             CreditLedgerService                                      │
│      │             UTXOService                                              │
│      │             PunishmentService                                        │
│      │             TaskService ──────────────────► Redis (Redlock)         │
│      │             TimerService ─────────────────► Redis (BullMQ)          │
│      │             NotificationService                                      │
│      │             ReportService                                            │
│      │             LLMTaskGeneratorService ──────► LLM API                 │
│      │                                                                       │
│      ├── graphql/                                                            │
│      │     schema.graphql   (SDL — types, queries, mutations, subscription) │
│      │     context.ts       (IServiceContainer + JwtPayload → GraphQLContext)│
│      │     task.resolver.ts ────────────────────► TaskService               │
│      │     project.resolver.ts ───────────────────► ProjectService          │
│      │     wallet.resolver.ts ────────────────────► AuthService             │
│      │                                             WalletService            │
│      │                                             UTXOService              │
│      │                                             CreditLedgerService      │
│      │                                             ReputationService        │
│      │                                                                       │
│      ├── services/                                                           │
│      │     auth.service.ts                                                  │
│      │        ├── PrismaClient (User, AuthChallenge, DeviceSession)        │
│      │        ├── ethers (ecrecover EIP-712)                                │
│      │        └── jsonwebtoken (JWT émission + vérification)               │
│      │                                                                       │
│      │     wallet.service.ts                                                │
│      │        ├── PrismaClient (WalletLink)                                │
│      │        └── IChainAdapter (balance, txCount, softLock)               │
│      │                                                                       │
│      │     project.service.ts                                               │
│      │        ├── PrismaClient (Project)                                   │
│      │        ├── IChainAdapter (anchorMerkleRoot)                         │
│      │        └── GithubService (vérification licence)                     │
│      │                                                                       │
│      │     task.service.ts                                                  │
│      │        ├── PrismaClient (Task, Submission)                          │
│      │        ├── IChainAdapter (claimTask on-chain)                       │
│      │        ├── Redis (Redlock — mutex anti double-claim)                │
│      │        ├── WalletService (solde PTF)                                │
│      │        ├── ReputationService (éligibilité)                          │
│      │        ├── CreditLedgerService (enregistrement)                     │
│      │        └── UTXOService (coin-selection)                             │
│      │                                                                       │
│      │     utxo.service.ts                                                  │
│      │        ├── PrismaClient (CreditUTXO, CreditTransaction)             │
│      │        └── PTF_OPERATOR_PRIVATE_KEY (signe les UTXOs de monnaie)    │
│      │                                                                       │
│      │     creditLedger.service.ts                                          │
│      │        └── PrismaClient (CreditEvent)                               │
│      │                                                                       │
│      │     reputation.service.ts                                            │
│      │        ├── PrismaClient (Reputation, ReputationEvent)               │
│      │        └── IChainAdapter (setReputation on-chain)                   │
│      │                                                                       │
│      │     punishment.service.ts                                            │
│      │        ├── IChainAdapter (deductPenalty on-chain)                   │
│      │        ├── UTXOService (spend UTXOs pénalisés)                      │
│      │        ├── CreditLedgerService (enregistrement)                     │
│      │        └── ReputationService (applyDelta)                           │
│      │                                                                       │
│      │     timer.service.ts                                                 │
│      │        ├── Redis / BullMQ (delayed jobs)                            │
│      │        └── PunishmentService (execute lateDelivery)                 │
│      │                                                                       │
│      │     github.service.ts                                                │
│      │        └── api.github.com (licence, OAuth, LICENSE.md)              │
│      │                                                                       │
│      │     email.service.ts                                                 │
│      │        └── SMTP (OTP nouvel appareil)                               │
│      │                                                                       │
│      │     report.service.ts                                                │
│      │        └── PrismaClient (Report)                                    │
│      │                                                                       │
│      │     taskGenerator.service.ts                                         │
│      │        └── LLM provider (génération JSON tâches)                    │
│      │                                                                       │
│      ├── workers/                                                            │
│      │     deposit.worker.ts                                                │
│      │        ├── RPC WebSocket ──────────────────► EscrowVault events     │
│      │        └── UTXOService (mint UTXO sur CreditClaimed)                │
│      │                                                                       │
│      │     reconciliation.worker.ts                                         │
│      │        ├── RPC HTTP ─────────────────────── scan historique blocs   │
│      │        ├── PrismaClient (SyncCheckpoint)                            │
│      │        └── UTXOService (backfill / revert stale-spent)              │
│      │                                                                       │
│      └── bal/  (Blockchain Abstraction Layer)                               │
│            chain.registry.ts  (Map<chainId, IChainAdapter>)                │
│            chain.adapter.ts   (interface IChainAdapter)                     │
│            adapters/                                                        │
│               mock.adapter.ts   ── dev / tests (in-memory)                 │
│               evm.adapter.base.ts ── ethers.js + 4 contrats                │
│               polygon.adapter.ts ─── EvmAdapterBase + RPC Polygon          │
│               ethereum.adapter.ts ── EvmAdapterBase + RPC Ethereum         │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  frontend/src/                                                               │
│                                                                              │
│   lib/apollo/                                                                │
│      client.ts ────────────────────────► backend GraphQL (HTTP)            │
│      links.ts ─────────────────────────► backend GraphQL (WS subscriptions)│
│                                                                              │
│   lib/auth/authStore.ts (Zustand)                                           │
│      token JWT ─────────────────────────► localStorage + cookie             │
│                                                                              │
│   lib/wagmi/config.ts (RainbowKit)                                          │
│      Polygon / Ethereum ───────────────► WalletConnect                      │
│                                                                              │
│   lib/graphql/                                                               │
│      queries.ts    (GET_TASKS, GET_WALLET_STATUS…)                          │
│      mutations.ts  (CLAIM_TASK, CANCEL_TASK, LINK_GITHUB…)                  │
│      subscriptions.ts  (TASK_STATUS_CHANGED)                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Données stockées dans le backend

### Base de données PostgreSQL (Prisma)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IDENTITÉ & SESSIONS                                                        │
│                                                                             │
│  User                        AuthChallenge                                 │
│  ──────────────────────      ───────────────────                           │
│  id (cuid)                   id                                            │
│  ptfAddress (unique)         userId ──────────► User                       │
│  ptfPublicKey                nonce (unique)                                │
│  githubId (unique)           expiresAt                                     │
│  githubHandle                used                                          │
│  isBanned                                                                  │
│  banReason                   DeviceSession                                 │
│                              ───────────────────                           │
│  WalletLink                  id                                            │
│  ──────────────────────      userId ──────────► User                       │
│  id                          token (unique, JWT)                           │
│  userId ──────────► User     deviceName                                    │
│  chain                       userAgent                                     │
│  address                     lastSeenAt                                    │
│  isPrimary                   expiresAt                                     │
│  unique(chain, address)                                                    │
│                                                                             │
│  WalletLinkChallenge                                                       │
│  ──────────────────────                                                    │
│  nonce (unique), userId, chain, address, used                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PROJETS & TÂCHES                                                           │
│                                                                             │
│  Project                          Task                                     │
│  ─────────────────────────────    ─────────────────────────────────────    │
│  id (keccak256)                   id (keccak256)                           │
│  networkId                        projectId ──────────────────► Project    │
│  name / type / rewardMode         parentId (self-ref)                      │
│  chain / token                    networkId                                │
│  repoType / repoUrl               title / type / priority / status         │
│  syncStatus                       context / objective / deliverable        │
│  escrowBalance                    outOfScope[]                             │
│  merkleRoot (ancré on-chain)      constraints (JSON)                       │
│  status (draft→active→archived)   verificationSteps (JSON)                │
│  language / stack[]               claimCriteria (JSON)                    │
│  description                      punishments (JSON)                       │
│  ownerAddress / ownerId           scoring (JSON)                           │
│  isOpenSource / license           reputationPoints                         │
│  licenseVerifiedAt                dependencies[] / blockedBy[] / unlocks[] │
│                                   duration / claimedAt / deadline          │
│                                   devAddress / conditionsHash              │
│                                   eip712Signature (jamais exposé via API)  │
│                                   rewardAmount / rewardToken               │
│                                   commitHash / branchRef                   │
│                                                                             │
│  Submission                                                                │
│  ─────────────────────────────                                             │
│  taskId ─────────► Task                                                    │
│  devAddress / userId                                                       │
│  commitHash / branchRef                                                    │
│  status (pending→validated→rejected)                                       │
│  testResults (JSON)                                                        │
│  validationJobId                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  CRÉDITS PTF (UTXO + LEDGER)                                                │
│                                                                             │
│  CreditUTXO                       CreditTransaction                       │
│  ─────────────────────────────    ─────────────────────────────────────    │
│  id (keccak256)                   id (keccak256)                           │
│  ownerAddress                     type (withdrawal|punishment|bridge_out)  │
│  amount (PTF)                     devAddress                               │
│  sourceType                       inputTotal / outputTotal / netAmount     │
│    task_reward                    chain / destination                      │
│    deposit                        txHash                                   │
│    bridge_in                      proofHash (keccak256 des UTXOs consommés)│
│    change                                                                  │
│  sourceId (taskId ou txId)        CreditEvent  (double-entry ledger)      │
│  projectId                        ─────────────────────────────────────    │
│  chain                            devAddress                               │
│  eip712Signature                  type (8 types)                           │
│    (prouve l'origine — jamais     direction (credit | debit)               │
│     exposé en API, CIA-C4)        amount / balanceAfter                    │
│  txHash                           utxoId / taskId / projectId              │
│  status (unspent|spent|locked)    chain / txHash / note                    │
│  spentInTxId                                                               │
│  createdInTxId                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  RÉPUTATION & SANCTIONS                                                     │
│                                                                             │
│  Reputation                  ReputationEvent        PunishmentRecord      │
│  ──────────────────────      ─────────────────      ──────────────────    │
│  userId (unique) → User      reputationId → Rep.    devAddress            │
│  totalPoints                 delta (+/-)             taskId               │
│  level                       reason                  type                 │
│  completedTasks              taskId                  creditsPenalty       │
│                              chain / txHash          reputationPenalty    │
│  ContributorRecord                                   txHash               │
│  ──────────────────────                              executedAt           │
│  projectId / devAddress                                                   │
│  githubHandle                Report                                       │
│  tasksCompleted              ─────────────────────                        │
│  totalEarned                 reporterId / reportedUserId                  │
│  unique(project, devAddr)    taskId / reason / evidence                   │
│                              status / resolution                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                                             │
│                                                                             │
│  NetworkBroadcast             SyncCheckpoint                               │
│  ─────────────────────────   ──────────────────────────                   │
│  type / projectId / taskId   chain                                         │
│  payload (JSON)              contractAddress                               │
│  signature                   lastBlock (reprise après restart)             │
│  chain / txHash              unique(chain, contractAddress)                │
│  broadcastAt                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cache Redis

```
  lock:task:<taskId>        ── Redlock mutex (anti double-claim, TTL 30s)
  bull:ptf-timers:*         ── BullMQ — jobs d'expiration des tâches
```

---

## 3. Rapport framework ↔ service

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     CE QUE LE FRAMEWORK FAIT SANS LE SERVICE                ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  ptf scaffold        Génère ARCHITECTURE.md + PLAN_ACTION.md            │
  │  ptf validate-docs   Valide le format de ces fichiers                   │
  │  ptf wallet create   Génère un keypair secp256k1 + BIP-39 local         │
  │  ptf wallet restore  Restaure depuis une seed phrase                    │
  │  ptf auth --offline  Session locale simulée                             │
  │  ptf commit          Wrapper git + tracking local (.ptf/active-task)    │
  │  ptf status          Lit le tracker local                               │
  │  ptf config get/set  Lit/écrit ~/.config/ptf/config.json                │
  │                                                                         │
  │  Stockage : fichiers locaux uniquement (keystore, tracker, config)      │
  │  Réseau   : zéro                                                        │
  └─────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║                     CE QUE LE SERVICE APPORTE EN PLUS                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Annuaire réseau des projets et tâches (base de données)                │
  │  Authentification cross-device (JWT + DeviceSession)                    │
  │  Escrow on-chain (EscrowVault — fonds USDC des projets payants)         │
  │  Génération de tâches par LLM depuis les docs du framework              │
  │  Timer d'expiration des tâches (BullMQ + Redis)                         │
  │  Historique de réputation cross-chaîne                                  │
  │  Historique de crédits (ledger + UTXOs)                                 │
  │  Signalement de développeurs (Report)                                   │
  │  Synchronisation on-chain (DepositWorker, ReconciliationWorker)         │
  │  Interface web (dashboard développeur)                                  │
  └─────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║              FLUX DE DONNÉES : CYCLE DE VIE D'UNE TÂCHE                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

  CLIENT OWNER (CLI)                    BACKEND              ON-CHAIN
  ──────────────────                    ───────              ────────
  ptf init
    └─► createProject ─────────────────► Project (DB)
                                         anchorMerkleRoot ──► ProjectRegistry

  ptf generate
    └─► generateTasks ─────────────────► LLM ──► TaskDraft[]
                                         Task[] (DB)

  ptf tasks publish
    └─► publishProject ────────────────► Project.status = active
                                         updateMerkleRoot ──► ProjectRegistry


  DÉVELOPPEUR (CLI ou Frontend)         BACKEND              ON-CHAIN
  ──────────────────────────────        ───────              ────────
  ptf tasks list
    └─► tasks() ───────────────────────► Task[] (filtrés, anonymisés)

  ptf task claim <id>
    └─► claimTask() ───────────────────► [Redlock]
                                         balance PTF ≥ 10 ?
                                         réputation OK ?
                                         dépendances validées ?
                                         softLock 10 PTF ──────────────────►
                                         claimTask() ──────────────────────► ProjectRegistry
                                         Task.status = claimed (DB)
                                         scheduleExpiry ──► BullMQ

  [N jours de travail sur ptf/<taskId>]
  ptf commit -m "msg"
    └─► tracker local (.ptf/active-task.json)

  ptf submit
    └─► submitTask() ──────────────────► Submission (DB)
                                         Task.status = submitted

                                  [si délai dépassé]
                         BullMQ ──────────► execute(lateDelivery)
                                            deductPenalty ────────────────►
                                            applyDelta (réputation) ───────► ReputationRegistry
                                            Task.status = expired


  RETRAIT (Développeur)                 BACKEND              ON-CHAIN
  ─────────────────────                 ───────              ────────
  ptf wallet withdraw
    └─► withdrawCredits() ─────────────► coin-selection UTXOs (DB)
                                         spend() → proofHash (DB)
                                         ◄── retourne UTXOs + signatures

  [Développeur appelle on-chain]
    └─────────────────────────────────────────────────────────────────────►
                                         EscrowVault.withdrawWithProof()
                                         vérifie signatures EIP-712
                                         transfère USDC
                                         émet UTXOSpent

  DepositWorker ────────────────────────────────────── écoute CreditClaimed
    └─► utxoService.mint() (DB)

  ReconciliationWorker ─────────────────────────────── scan historique blocs
    └─► backfill UTXOs manqués / revert stale-spent (CIA-I9)
```

---

## 4. Ce qui n'est pas dans le backend

Le framework est utilisable sans service. Le backend est optionnel.

| Donnée | Où elle vit | Backend requis ? |
|---|---|---|
| Clé privée du développeur | `~/.ptf/keystore/<addr>.json` (chiffré AES-256-GCM) | Non |
| Seed phrase BIP-39 | Sur papier — jamais stockée | Non |
| Config utilisateur (API URL, wallet addr, JWT) | `~/.config/ptf/config.json` | Non |
| Config projet (projectId, chain, mode) | `.ptf/config.json` dans le repo | Non |
| Tâche active (branche, commits, vérifications) | `.ptf/active-task.json` + index global | Non |
| ARCHITECTURE.md / PLAN_ACTION.md | Fichiers du repo | Non |
| Projets et tâches (annuaire réseau) | PostgreSQL (backend) | **Oui** |
| Sessions multi-device, JWT | PostgreSQL (backend) | **Oui** |
| Crédits PTF, UTXOs, historique ledger | PostgreSQL + on-chain | **Oui** |
| Réputation cross-chaîne | PostgreSQL + on-chain | **Oui** |
| Escrow des projets payants | On-chain (EscrowVault) | **Oui** |
| Expiration automatique des tâches | Redis / BullMQ (backend) | **Oui** |

---

## 5. Sécurité — invariants clés

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  La clé privée ne quitte jamais la machine du développeur               │
  │     signChallenge() signe en mémoire, la clé est zeroisée après         │
  │                                                                         │
  │  eip712Signature absente de toutes les réponses GraphQL (CIA-C4)        │
  │     Le resolver wallet.resolver.ts supprime le champ avant envoi        │
  │                                                                         │
  │  Double-claim impossible                                                │
  │     Redlock (Redis) + re-lecture status sous lock                       │
  │                                                                         │
  │  Merkle root tamper-proof                                               │
  │     ProjectRegistry.markTaskClaimed() verrouille la root               │
  │     dès le premier claim — impossible de modifier les tâches après      │
  │                                                                         │
  │  UTXO anti-double-spend                                                 │
  │     coin-selection dans une transaction Prisma atomique                 │
  │     EscrowVault.spentUTXOs[id] vérifié on-chain aussi                   │
  │                                                                         │
  │  Rate limiting                                                          │
  │     300 req/15min global, 20 req/15min sur les mutations auth           │
  │                                                                         │
  │  Depth limit GraphQL                                                    │
  │     max 6 niveaux d'imbrication — protection O(n) join                 │
  └─────────────────────────────────────────────────────────────────────────┘
```
