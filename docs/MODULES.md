# PTF — Architecture des modules

> Relations entre les modules, données du réseau, et séparation framework / service.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PTF FRAMEWORK  (open-source)                           │
│              github.com/devmail0561-web/PTF_plateforme                      │
│                                                                             │
│  ┌─────────────────────┐  ┌───────────────────────┐  ┌──────────────────┐  │
│  │   cli/   (ptf CLI)  │  │   backend/            │  │   contracts/     │  │
│  │   Commander.js      │◄─┤   Apollo GraphQL       │  │   Solidity 0.8+  │  │
│  │   keypair secp256k1 │  │   Prisma / PostgreSQL  │  │   EVM (ERC-20,   │  │
│  │   keystore local    │  │   données réseau seul  │  │   EscrowVault,   │  │
│  └─────────────────────┘  └──────────┬────────────┘  │   ProjectReg,    │  │
│                                      │               │   ReputationReg) │  │
│                                      ▼               └──────────────────┘  │
│                               PostgreSQL (réseau)                          │
│                               Redis (Redlock + BullMQ)                     │
└─────────────────────────────────────────────────────────────────────────────┘

        ▲  lecture on-chain (balance, réputation, ban)
        │  via IChainAdapter → PTF node

┌─────────────────────────────────────────────────────────────────────────────┐
│                   PTF SERVICE PLATEFORME  (privé)                           │
│              github.com/devmail0561-web/ptf_service_plateforme              │
│                                                                             │
│  ┌───────────────────────────┐   ┌────────────────────────────────────┐    │
│  │  frontend/  (Next.js 14)  │◄──┤  backend/  (Apollo + Prisma)       │    │
│  │  Marketplace  ·  Compte   │   │  Comptes utilisateur               │    │
│  │  Wallet  ·  Dépôts        │   │  Sessions · Wallet linking         │    │
│  │  Retraits · Historique    │   │  Dépôts · Retraits · Ledger        │    │
│  └───────────────────────────┘   │  Notifications · SMTP              │    │
│                                  └──────────────┬─────────────────────┘    │
│                                                 │                          │
│                                  PostgreSQL (comptes)                      │
│                                  Redis (BullMQ deposit queue)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Relations entre les modules — Framework

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
│   │  │  subgraph/   │    │                                                   │
│   │  │ (The Graph)  │    │                                                   │
│   │  └──────────────┘    │                                                   │
│   │                      │                                                   │
│   │  ┌──────────────┐    │                                                   │
│   │  │   infra/     │    │                                                   │
│   │  │ (Docker/VPS) │    │                                                   │
│   │  └──────────────┘    │                                                   │
│   │                      │                                                   │
│   │  ┌──────────────┐    │                                                   │
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

                         ╔═════════════════════════════════════════════════════╗
                         ║   Backend framework — modules (état actuel)       ║
                         ╚═════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│  backend/src/                                                                │
│                                                                              │
│   server.ts                                                                  │
│      │  Express + Apollo Server + rate limiting                              │
│      │                                                                       │
│      ├── container.ts  (DI root)                                             │
│      │      ├── PrismaClient ─────────────────────► PostgreSQL               │
│      │      ├── Redis ──────────────────────────── Redis                    │
│      │      └── Services :                                                   │
│      │             AuthService         (nonces en mémoire, JWT stateless)   │
│      │             WalletService       (solde on-chain via IChainAdapter)    │
│      │             ProjectService      (création, publication, licence)      │
│      │             TaskService         (claim/submit/cancel, Redlock)        │
│      │             ReputationService   (lecture/écriture on-chain)           │
│      │             PunishmentService   (pénalités on-chain)                  │
│      │             TimerService        (BullMQ — expiration tâches)          │
│      │             LLMTaskGenerator    (génération tâches depuis docs)       │
│      │             GithubService       (vérification licence OSS)            │
│      │                                                                       │
│      ├── graphql/                                                            │
│      │     schema.graphql                                                    │
│      │     context.ts       (JWT → { ptfAddress } — aucune donnée user)     │
│      │     resolvers/                                                        │
│      │       task.resolver.ts    ──────────────────► TaskService             │
│      │       project.resolver.ts ──────────────────► ProjectService         │
│      │       wallet.resolver.ts  ──────────────────► AuthService             │
│      │                                               WalletService          │
│      │                                               ReputationService      │
│      │                                                                       │
│      ├── services/                                                           │
│      │     auth.service.ts                                                   │
│      │        ├── Map<nonce, { ptfAddress, expiresAt }> (TTL 5 min)         │
│      │        └── jsonwebtoken (JWT { ptfAddress } — pas de userId)         │
│      │                                                                       │
│      │     wallet.service.ts                                                 │
│      │        └── IChainAdapter (balance on-chain)                          │
│      │                                                                       │
│      │     project.service.ts                                                │
│      │        ├── PrismaClient (Project, ContributorRecord)                 │
│      │        ├── IChainAdapter (anchorMerkleRoot)                          │
│      │        └── GithubService (vérification licence OSS)                  │
│      │                                                                       │
│      │     task.service.ts                                                   │
│      │        ├── PrismaClient (Task, Submission)                           │
│      │        ├── IChainAdapter (claimTask on-chain)                        │
│      │        ├── Redis (Redlock — mutex anti double-claim)                 │
│      │        ├── WalletService (solde PTF on-chain)                        │
│      │        └── ReputationService (éligibilité)                           │
│      │                                                                       │
│      │     reputation.service.ts                                             │
│      │        └── IChainAdapter (getReputation / setReputation on-chain)    │
│      │                                                                       │
│      │     punishment.service.ts                                             │
│      │        ├── IChainAdapter (deductPenalty on-chain)                    │
│      │        ├── ReputationService (applyDelta)                            │
│      │        └── PrismaClient (PunishmentRecord)                           │
│      │                                                                       │
│      │     timer.service.ts                                                  │
│      │        ├── Redis / BullMQ (delayed jobs d'expiration)                │
│      │        └── PunishmentService (execute lateDelivery)                  │
│      │                                                                       │
│      │     github.service.ts                                                 │
│      │        └── api.github.com (licence, LICENSE.md)                      │
│      │                                                                       │
│      │     taskGenerator.service.ts                                          │
│      │        └── LLM provider (génération JSON tâches depuis ARCHITECTURE) │
│      │                                                                       │
│      ├── workers/                                                            │
│      │     deposit.worker.ts       ── stub minimal (dépôts gérés par svc)   │
│      │     reconciliation.worker.ts ── gère SyncCheckpoint uniquement       │
│      │                                                                       │
│      └── bal/  (Blockchain Abstraction Layer)                                │
│            chain.registry.ts  (Map<chainId, IChainAdapter>)                 │
│            chain.adapter.ts   (interface IChainAdapter)                     │
│            adapters/                                                         │
│               mock.adapter.ts    ── dev / tests (in-memory)                 │
│               evm.adapter.base.ts ── ethers.js + 4 contrats                 │
│               polygon.adapter.ts ─── EvmAdapterBase + RPC Polygon           │
│               ethereum.adapter.ts ── EvmAdapterBase + RPC Ethereum          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Données stockées — Backend framework (réseau uniquement)

Le backend du framework ne contient **aucune donnée utilisateur** (comptes, sessions, dépôts, retraits). L'identité est l'adresse PTF secp256k1 — pas un `userId`.

### PostgreSQL (Prisma) — 7 modèles réseau

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROJETS & TÂCHES                                                           │
│                                                                             │
│  Project                          Task                                     │
│  ─────────────────────────────    ─────────────────────────────────────    │
│  id (keccak256)                   id (keccak256)                           │
│  networkId? @unique               projectId ──────────────────► Project    │
│  name / type / rewardMode         parentId (self-ref)                      │
│  chain / token                    title / type / priority / status         │
│  repoType / repoUrl               context / objective / deliverable        │
│  syncStatus                       outOfScope[]                             │
│  escrowBalance                    constraints (JSON)                       │
│  merkleRoot (ancré on-chain)      verificationSteps (JSON)                │
│  status (draft→active→archived)   claimCriteria (JSON)                    │
│  language / stack[]               punishments (JSON)                       │
│  description                      scoring (JSON)                           │
│  ownerAddress (ptfAddress)        reputationPoints                         │
│  isOpenSource / license           dependencies[] / blockedBy[]             │
│  licenseVerifiedAt                duration / claimedAt / deadline          │
│                                   devAddress (ptfAddress)                  │
│  Submission                       conditionsHash / eip712Signature         │
│  ─────────────────────────────    rewardAmount / rewardToken               │
│  taskId ─────────► Task           commitHash / branchRef                   │
│  devAddress (ptfAddress)                                                   │
│  commitHash / branchRef                                                    │
│  status (pending→validated→rejected)                                       │
│  testResults (JSON) / validationJobId                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SANCTIONS & CONTRIBUTEURS                                                  │
│                                                                             │
│  PunishmentRecord              ContributorRecord                           │
│  ───────────────────────────   ─────────────────────────────────────────  │
│  devAddress  (ptfAddress)      projectId ─────────────────────► Project   │
│  taskId / type                 devAddress  (ptfAddress)                   │
│  creditsPenalty Float?         githubHandle?                               │
│  reputationPenalty Int         tasksCompleted Int / totalEarned Float     │
│  txHash? / executedAt          joinedAt / lastActivity                    │
│                                unique(projectId, devAddress)              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE RÉSEAU                                                      │
│                                                                             │
│  NetworkBroadcast              SyncCheckpoint                              │
│  ─────────────────────────     ──────────────────────────────────────────  │
│  type / projectId / taskId     chain / contractAddress                    │
│  payload Json                  lastBlock  (reprise après restart)          │
│  signature / chain / txHash    unique(chain, contractAddress)              │
│  broadcastAt                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cache Redis

```
  lock:task:<taskId>     ── Redlock mutex (anti double-claim, TTL 30s)
  bull:ptf-timers:*      ── BullMQ — jobs d'expiration des tâches
```

---

## 3. Rapport framework ↔ service

```
╔══════════════════════════════════════════════════════════════════════════════╗
║              CE QUE LE FRAMEWORK FAIT SANS LE SERVICE                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  ptf scaffold        Génère ARCHITECTURE.md + PLAN_ACTION.md            │
  │  ptf validate-docs   Valide le format de ces fichiers                   │
  │  ptf wallet create   Génère un keypair secp256k1 + BIP-39 local         │
  │  ptf wallet restore  Restaure depuis une seed phrase                    │
  │  ptf auth login      Challenge-response stateless (nonce signé local)   │
  │  ptf auth --offline  Session locale simulée                             │
  │  ptf commit          Wrapper git + tracking local (.ptf/active-task)    │
  │  ptf status          Lit le tracker local                               │
  │  ptf config get/set  Lit/écrit ~/.config/ptf/config.json                │
  │                                                                         │
  │  Stockage : fichiers locaux uniquement (keystore, tracker, config)      │
  │  Réseau   : zéro (mode offline complet)                                 │
  └─────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║              CE QUE LE BACKEND FRAMEWORK APPORTE (avec service PTF)         ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Annuaire réseau des projets et tâches (PostgreSQL)                     │
  │  Authentification cross-device par adresse PTF (JWT stateless)          │
  │  Escrow on-chain (EscrowVault — fonds des projets paid)                 │
  │  Génération de tâches par LLM depuis les docs du projet                 │
  │  Timer d'expiration des tâches (BullMQ + Redis)                         │
  │  Réputation on-chain cross-chaîne (ReputationRegistry)                  │
  │  Synchronisation on-chain (ReconciliationWorker)                        │
  └─────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║              CE QUE ptf_service_plateforme APPORTE EN PLUS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Comptes utilisateur (email + mot de passe + vérification email)        │
  │  Sessions persistées (token JWT long-lived + device tracking)           │
  │  Liaison wallet PTF via challenge-response (EIP-712)                    │
  │  Dépôts on-chain : listener EVM → crédit ledger interne                 │
  │  Retraits : réservation atomique + broadcast on-chain                   │
  │  Ledger interne (historique complet des mouvements PTF)                 │
  │  Notifications in-app + email SMTP                                      │
  │  Interface web (marketplace, compte, wallet)                            │
  │  Proxy lecture vers nœud PTF (balance on-chain, réputation)             │
  └─────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║              FLUX : CYCLE DE VIE D'UNE TÂCHE                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

  DÉVELOPPEUR (CLI)                     BACKEND FRAMEWORK         ON-CHAIN
  ─────────────────                     ─────────────────         ────────

  ptf wallet create
    └─► keypair secp256k1 généré localement (jamais envoyé)

  [Recharger via ptf_service_plateforme]
    └─► Dépôt on-chain → EscrowVault
        Listener service → LedgerEntry crédit (svc)

  ptf auth login
    └─► requestChallenge ──────────────► nonce (Map TTL 5min)
        signChallenge (local)
        verifyChallenge ───────────────► ecrecover EIP-712
                                         JWT { ptfAddress }

  ptf tasks list → tasks() ─────────────► Task[] filtrés

  ptf task claim <id>
    └─► claimTask() ───────────────────► [Redlock]
                                         balance PTF ≥ 10 ? (on-chain)
                                         réputation OK ?
                                         softLock 10 PTF ──────────────────►
                                         claimTask() ──────────────────────► ProjectRegistry
                                         Task.status = claimed
                                         scheduleExpiry ──► BullMQ

  ptf commit -m "msg" → tracker local (.ptf/active-task.json)

  ptf submit
    └─► submitTask() ──────────────────► Submission (DB)
                                         Task.status = submitted

  [Validation auto + peer review]
    └─► Credits PTF mintés ────────────────────────────────────────────────► CreditToken
        NetworkBroadcast ─────────────► ptf_service_plateforme le capte
                                        LedgerEntry reward (svc)
```

---

## 4. Ce qui n'est pas dans le backend framework

| Donnée | Où elle vit | Backend framework requis ? |
|---|---|---|
| Clé privée du développeur | `~/.ptf/keystore/<addr>.json` (AES-256-GCM) | Non |
| Seed phrase BIP-39 | Sur papier — jamais stockée | Non |
| Config utilisateur | `~/.config/ptf/config.json` | Non |
| Config projet | `.ptf/config.json` dans le repo | Non |
| Tâche active (branche, commits) | `.ptf/active-task.json` | Non |
| Comptes email / sessions | `ptf_service_plateforme` | Non |
| Dépôts / retraits / ledger PTF | `ptf_service_plateforme` | Non |
| Projets et tâches (annuaire) | PostgreSQL (backend framework) | **Oui** |
| Réputation cross-chaîne | On-chain + IChainAdapter | **Oui** |
| Expiration automatique des tâches | Redis / BullMQ | **Oui** |
| Escrow des projets paid | On-chain (EscrowVault) | **Oui** |

---

## 5. Sécurité — invariants clés

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  La clé privée ne quitte jamais la machine du développeur               │
  │     signChallenge() signe en mémoire, la clé est zeroisée après         │
  │                                                                         │
  │  JWT ne contient que { ptfAddress } — pas de userId, pas de device      │
  │     Le backend framework ne connaît aucune donnée utilisateur           │
  │                                                                         │
  │  eip712Signature absente de toutes les réponses GraphQL                 │
  │     Le resolver wallet.resolver.ts supprime le champ avant envoi        │
  │                                                                         │
  │  Double-claim impossible                                                │
  │     Redlock (Redis) + re-lecture status sous lock                       │
  │                                                                         │
  │  Merkle root tamper-proof                                               │
  │     ProjectRegistry.markTaskClaimed() verrouille la root               │
  │     dès le premier claim — impossible de modifier les tâches après      │
  │                                                                         │
  │  Rate limiting                                                          │
  │     200 req/15min global, filtrage renforcé sur requestChallenge        │
  │                                                                         │
  │  Pas de User model dans le framework                                    │
  │     Aucune surface d'attaque sur les données personnelles               │
  └─────────────────────────────────────────────────────────────────────────┘
```
