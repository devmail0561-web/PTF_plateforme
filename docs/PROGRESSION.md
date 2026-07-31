# PTF — Progression du projet

> Version : **V0.0.1** — Dernière mise à jour : **2026-07-31**
> Commits : `7efdde9` (MVP initial) → `fc22203` (Smart contracts) → `c3032b5` (UTXO provenance) → `03fe287` (audit sécurité multi-agents) → rounds CIA 5–10 (auth refonte, licences, réputation OSS) → round 11 (7 findings ouverts corrigés)

---

## Avancement global

```
██████████████████████░░░░░░░░░░░░░░░░░░  50%
```

| Module | Statut | Progression |
|--------|--------|-------------|
| Documentation | ✅ Mise à jour | 100% |
| CLI | ✅ Terminé | 100% |
| Backend (core) | ✅ En cours | 85% |
| Smart contracts EVM | ✅ Terminé | 100% |
| Audit sécurité (rounds 1–11) | ✅ Terminé | 100% |
| Authentification (refonte complète) | ✅ Terminé | 100% |
| Licences OSS (catalogue + auto-création) | ✅ Terminé | 100% |
| Worker on-chain (dépôts N1) | ✅ Terminé | 100% |
| Frontend | 🔴 À faire | 0% |
| Infrastructure | 🔴 À faire | 0% |
| Blockchain réelle | 🔴 À faire | 0% |
| Solana / Anchor | 🔴 À faire | 0% |

---

## Détail par module

---

### ✅ Documentation — 100%

**Fichiers : 6 documents**

| Fichier | Description |
|---------|-------------|
| `docs/ARCHITECTURE.md` | Architecture technique complète (~5 000 lignes) |
| `docs/BUSINESS_PLAN.md` | Modèle économique, tokenomics, commissions |
| `docs/SMART_CONTRACT_AUDIT.md` | Stratégie d'audit (Slither, Mythril, Foundry, agents IA) |
| `README.md` | Présentation générale du projet |
| `SUMMARY.md` | Vision condensée de l'écosystème PTF |
| `examples/oseye-example/README.md` | Exemple de projet créé avec PTF |

**Templates : 6 fichiers**
- `templates/markdown/ARCHITECTURE.template.md`
- `templates/markdown/PLAN_ACTION.template.md`
- `templates/markdown/CONTRIBUTING.template.md`
- `templates/github/ci.template.yml`, `code-review.template.yml`, `PULL_REQUEST_TEMPLATE.template.md`

---

### ✅ CLI — 100%

**21 fichiers TypeScript — ESM — Commander.js + ethers.js v6**

| Catégorie | Fichiers | Description |
|-----------|----------|-------------|
| **Commandes** (13) | `init`, `config`, `scaffold`, `generate`, `tasks`, `task`, `validate-docs`, `auth`, `wallet`, `submit`, `projects`, `report`, `contributors` | Cycle complet créateur + développeur |
| **Utilitaires** | `crypto.ts` | `generateProjectId` (keccak256), `computeMerkleRoot`, `hashConditions` (EIP-712) |
| **Utilitaires** | `config.ts` | Walk-up `.ptf/config.json` (comme git), `requireProjectConfig`, drafts |
| **Utilitaires** | `docs-validator.ts` | Validation ARCHITECTURE.md + PLAN_ACTION.md, sections requises, placeholders, termes vagues |
| **Utilitaires** | `api.ts` | Client GraphQL + mode offline complet (`PTF_OFFLINE`) |
| **Utilitaires** | `display.ts` | Formatage terminal (chalk, ora, tableaux) |
| **Templates** | `architecture.template.ts`, `plan-action.template.ts` | Prompts système pour le skill `/ptf-architect` |
| **Types** | `types.ts` | Interfaces partagées CLI |
| **Tests** | `docs-validator.test.ts` | **13 tests Vitest** |
| **Skill** | `.claude/commands/ptf-architect.md` | Mode 3 IA-assisté (Claude Code, Cursor, Copilot) |

**Commandes disponibles :**
```bash
ptf init         ptf scaffold     ptf describe     ptf validate-docs
ptf generate     ptf tasks        ptf task         ptf submit
ptf wallet       ptf auth         ptf config       ptf projects
ptf contributors ptf report       ptf fix-docs     ptf sync
```

---

### ✅ Backend — 85%

**30 fichiers TypeScript — Apollo Server v4 + Prisma + BullMQ + Redlock + Nodemailer + express-rate-limit**

#### Services implémentés (14/17)

| Service | Fichier | Description |
|---------|---------|-------------|
| `AuthService` | `auth.service.ts` | Email + password (scrypt) + clé PTF secp256k1 générée serveur + OTP email nouvel appareil + gestion appareils |
| `EmailService` | `email.service.ts` | SMTP Nodemailer — envoi OTP email nouvel appareil |
| `GithubService` | `github.service.ts` | Vérification licence repo (public + OSI/FSF) + création automatique LICENSE.md via GitHub API |
| `LicenseCatalog` | `licenses.ts` | Catalogue 50+ licences : OSI, FSF-libre, source-available, propriétaire — avec SPDX IDs, clés GitHub |
| `TaskService` | `task.service.ts` | Anti-collision Redlock, assertMutable, cycle de vie complet, vue publique/privée, soft-lock UTXO synchronisé, `reputationPoints=0` si projet non OSS |
| `ProjectService` | `project.service.ts` | Création projet, vérification licence non-bloquante, `createProjectLicense()`, ancrage Merkle |
| `ReputationService` | `reputation.service.ts` | Formule `(c+e+i)×10 + bonus_durée` — zéro si `!project.isOpenSource` |
| `PunishmentService` | `punishment.service.ts` | Exécution punishments tous projets, UTXO spend synchronisé |
| `WalletService` | `wallet.service.ts` | Vérification 6 critères, soft-lock, multi-chaîne |
| `TimerService` | `timer.service.ts` | BullMQ deadlines, countdown alertes 72/48/24h, pagination `take:500` |
| `NotificationService` | `notification.service.ts` | Webhooks, événements temps réel |
| `ReportService` | `report.service.ts` | Signalements (adresses enregistrées uniquement — plus de ghost users) |
| `UTXOService` | `utxo.service.ts` | UTXO Bitcoin-style : mint/spend/lock/unlock transactionnels, verifyProof multi-chain, amount>0 guards |
| `CreditLedgerService` | `creditLedger.service.ts` | Ledger comptable + utxoId tracé par événement |
| `DepositWorker` | `workers/deposit.worker.ts` | Écoute `CreditClaimed` / `UTXOSpent` on-chain → `UTXOService.mint()` avec guard idempotency (N1) |

#### Services manquants (3/17)

| Service | Priorité | Description |
|---------|----------|-------------|
| `EscrowService` | 🔴 Haute | Lien backend ↔ EscrowVault (release reward on-chain) |
| `ValidationService` | 🔴 Haute | Tests automatiques + sandbox gVisor (projets privés) |
| `SyncService` | 🟡 Moyenne | Repo temporaire PTF (Cas 3), reconnexion, sync auto |

#### Blockchain Abstraction Layer (BAL)

| Adapter | Fichier | Statut |
|---------|---------|--------|
| `MockChainAdapter` | `mock.adapter.ts` | ✅ Opérationnel (dev/test) |
| `EVMAdapterBase` | `evm.adapter.base.ts` | ✅ Classe de base |
| `PolygonAdapter` | `polygon.adapter.ts` | ⚠️ Structure présente — throw si `SIGNER_PRIVATE_KEY` absent |
| `EthereumAdapter` | `ethereum.adapter.ts` | ⚠️ Structure présente — throw si `SIGNER_PRIVATE_KEY` absent |

#### API GraphQL

- **17 Queries** : `tasks`, `task`, `myTasks`, `projects`, `project`, `myProjects`, `walletStatus`, `walletBalance`, `projectContributors`, `reputationScore`, `creditHistory`, `creditBalance`, `utxos`, `utxoBalance`, `utxoProvenance`, `myDevices`, `verifyRepoLicense`, `getLicenses`, `health`
- **18 Mutations** : `register`, `login`, `verifyNewDevice`, `requestGithubOAuthState`, `linkGithub`, `requestWalletChallenge`, `confirmLinkWallet`, `revokeDevice`, `revokeAllOtherDevices`, `createProject`, `publishProject`, `createProjectLicense`, `generateTasks`, `claimTask`, `submitTask`, `cancelTask`, `withdrawCredits`, `reportUser`
- **1 Subscription** : `taskStatusChanged`

#### Base de données (Prisma — 18 tables)

`User`, `DeviceSession`, `TrustedDevice`, `PendingDeviceSession`, `AuthChallenge`, `WalletLinkChallenge`, `Project`, `Task`, `Submission`, `WalletLink`, `ContributorRecord`, `Reputation`, `ReputationEvent`, `PunishmentRecord`, `Report`, `CreditUTXO`, `CreditTransaction`, `CreditEvent`

**Nouveaux champs notables :**
- `User.email`, `User.passwordHash`, `User.ptfPublicKey`, `User.ptfAddress`, `User.encryptedKey`
- `Project.isOpenSource`, `Project.license`, `Project.licenseVerifiedAt`

#### Tests

**17 tests Jest** — `reputation.service.test.ts` :
- `calculatePoints` : min=30, max=150, canonique 3+3+4=100, bonus <7j +10%, <14j +5%
- `getLevel` : 8 cas aux bornes (Unranked/Junior/Senior/Expert)
- Grille de commission : 3 cas (<5k, 5k-50k, >50k USDC)

---

### ✅ Smart contracts EVM — 100%

**4 contrats Solidity 0.8.20 — Foundry — OpenZeppelin v5**

#### Contrats

| Contrat | Fichier | Lignes | Description |
|---------|---------|--------|-------------|
| `CreditToken` | `CreditToken.sol` | ~110 | ERC-20 stable 6 décimales, EIP-712 nonces `(address, taskId)`, mint/burn minter-gated |
| `ReputationRegistry` | `ReputationRegistry.sol` | ~100 | Score on-chain immuable, historique complet, writer-gated, 4 niveaux |
| `ProjectRegistry` | `ProjectRegistry.sol` | ~150 | Ancre Merkle, verrou au premier claim, preuve Merkle, registrar-gated |
| `EscrowVault` | `EscrowVault.sol` | ~270 | SafeERC20 + ReentrancyGuard + CEI, EIP-712 release et UTXO (full domain separator), soft-lock 10 PTF, punishment **80/20 BPS**, UTXO withdrawal avec guard intra-call, mintUTXOReceipt idempotent |

#### Sécurité implémentée (post-audit)

- **EscrowVault** : `nonReentrant` sur toutes les fonctions fonds, pattern CEI strict, `SafeERC20` sur tous les transferts
- **EIP-712 UTXO** : `_hashTypedDataV4(structHash)` avec domain separator complet (`PTFEscrowVault`) — anti-replay cross-contrat et cross-chaîne
- **Anti double-spend intra-call** : déduplication `seenIds[]` dans la boucle de vérification UTXO avant le guard `spentUTXOs`
- **Chain dynamique** : `keccak256(bytes(inp.chain))` au lieu de `"polygon"` hardcodé
- **mintUTXOReceipt idempotent** : `spentUTXOs[utxoId]` guard avant mint — empêche l'inflation par replay opérateur
- **escrowBalance intègre** : `executePunishment` ne pollue plus le mapping USDC avec des unités PTF
- **Distribution punishments** : 80% trésorerie PTF + 20% PTF mintés au contrat — hardcodé en BPS, non contournable
- **Immutabilité tâches** : `ProjectRegistry.markTaskClaimed()` verrouille le Merkle root irréversiblement
- **Gas** : `owner()` mis en cache avant la boucle de vérification UTXO

#### Tests Foundry (~60 tests)

| Fichier | Tests | Couverture |
|---------|-------|------------|
| `CreditToken.t.sol` | 10 tests + 1 fuzz | Mint, burn, claim EIP-712, replay, expiration, mauvais signer |
| `ReputationRegistry.t.sol` | 12 tests + 1 fuzz | Score, historique, niveaux aux bornes, floor à 0 |
| `ProjectRegistry.t.sol` | 10 tests | Registration, Merkle root, lock au claim, Merkle proof, déactivation |
| `EscrowVault.t.sol` | 15 tests | Funding, soft-lock, release EIP-712, replay, distribution 80/20 |
| `EscrowVaultInvariant.t.sol` | 3 invariants | **Solvabilité**, **cohérence soft-lock**, **intégrité BPS** |

#### Script de déploiement

`scripts/Deploy.s.sol` — déploiement ordonné des 4 contrats + wiring des permissions, compatible Foundry broadcast + vérification explorer.

---

### 🔴 Frontend — 0%

**Stack prévue : Next.js 14 + TailwindCSS + wagmi/viem**

Vues à implémenter :

| Vue | Route | Description |
|-----|-------|-------------|
| **Marketplace** | `/tasks` | Liste toutes les tâches avec filtres (reward, skill, projet) |
| **Dashboard développeur** | `/dashboard` | Tâches réclamées, countdown, historique, réputation |
| **Profil développeur** | `/profile/:address` | Score, niveau, historique complet, crédits |
| **Créateur — Nouveau projet** | `/project/new` | Wizard : upload MD, évaluation coût, dépôt escrow |
| **Créateur — Suivi projet** | `/project/:id` | Tâches, devs actifs, escrow, soumissions |
| **Wallet** | `/wallet` | Solde PTF, soft-locks, dépôt, retrait, bridge cross-chaîne |
| **Leaderboard** | `/leaderboard` | Top devs par réputation globale |

---

### 🔴 Infrastructure — 0%

| Composant | Description | Priorité |
|-----------|-------------|----------|
| `docker-compose.yml` | PostgreSQL + Redis + backend en local | 🔴 Haute |
| CI/CD GitHub Actions | Build, test, lint sur chaque PR | 🔴 Haute |
| Déploiement VPS Hetzner | Backend + DB sur CX21 (~€3.79/mois) | 🟡 Moyenne |
| Contrats testnet | Déploiement Polygon Amoy (3 mois min) | 🟡 Moyenne |
| The Graph subgraph | Indexation on-chain multi-chaîne | 🟠 Basse |
| Arweave / IPFS | Stockage permanent ARCHITECTURE.md + PLAN_ACTION.md | 🟠 Basse |
| Monitoring Grafana Cloud | Alertes backend + on-chain | 🟠 Basse |

---

### 🔴 Blockchain réelle — 0%

| Tâche | Description |
|-------|-------------|
| Connecter `PolygonAdapter` aux contrats déployés | Remplacer `MockChainAdapter` en prod |
| `EscrowService` | Orchestrer release reward + soft-lock via EscrowVault on-chain |
| Chainlink `CurrencyConverter` | Oracle prix pour dépôts multi-devises |
| LayerZero bridge | `ptf wallet bridge --from polygon --to ethereum` |
| `NetworkBroadcast` | Publication Merkle roots + adresses officielles PTF signées |

---

### 🔴 Solana / Anchor — 0%

Équivalents Rust des 4 contrats EVM pour la chaîne Solana :
- `credit_token` (SPL token — 1 PTF = 1 USDC)
- `reputation_registry`
- `project_registry`
- `escrow_vault`

---

## Statistiques globales

| Métrique | Valeur |
|----------|--------|
| **Fichiers source totaux** | 95+ fichiers |
| **Lignes TypeScript** (CLI + Backend) | ~8 500 lignes |
| **Lignes Solidity** | ~640 lignes |
| **Tests unitaires** | 13 (Vitest) + 17 (Jest) + ~60 (Foundry) = **90 tests** |
| **Commits** | 5 |
| **Bugs sécurité corrigés** | **80** (11 rounds d'audit — smart contracts, backend, auth, licences, workers) |
| **Findings ouverts** | **2** (N3 réconciliation rétroactive, CIA-I9 DB-before-on-chain) |
| **Progression globale** | **~57%** |

---

## Roadmap V0.0.1 → V1.0.0

```
V0.0.1 (actuel)
├── ✅ Documentation
├── ✅ CLI (13 commandes, mode offline)
├── ✅ Backend (9 services, GraphQL, Prisma)
└── ✅ Smart contracts EVM (4 contrats, 90 tests)

V0.0.2
├── 🔴 Services backend manquants (EscrowService, ValidationService, SyncService)
├── 🔴 Docker compose (dev local)
└── 🔴 CI/CD GitHub Actions

V0.1.0
├── 🔴 Frontend MVP (marketplace + dashboard dev + profil)
├── 🔴 Adapters blockchain réels (Polygon testnet)
└── 🔴 Déploiement testnet Polygon Amoy

V0.5.0 (Beta fermée)
├── 🔴 Frontend complet (toutes les vues)
├── 🔴 Audit smart contracts (Slither + Mythril + agents IA)
├── 🔴 Infrastructure VPS Hetzner
└── 🔴 Solana / Anchor

V1.0.0 (Mainnet)
├── 🔴 Testnet 3 mois sans incident critique
├── 🔴 Audit externe (Certik / Trail of Bits)
├── 🔴 LayerZero bridge cross-chaîne
├── 🔴 The Graph indexer
└── 🔴 Programme bug bounty actif
```
