# PTF — Progression du projet

> Version : **V0.1.0-alpha** — Dernière mise à jour : **2026-08-01**
> Commits : `7efdde9` (MVP initial) → `fc22203` (Smart contracts) → `c3032b5` (UTXO provenance) → `03fe287` (audit sécurité multi-agents) → rounds CIA 5–10 (auth refonte, licences, réputation OSS) → round 11 (7 findings ouverts corrigés) → round 12 (21 findings) → round 14 (ReconciliationWorker N3 + CIA-I9) → frontend V0.1.0 MVP → round 15 (CLI audit 18 findings + workflow automatisé) → **frontend V0.2.0** (16 correctifs : bugs, MSW complets, /projects, nav mobile, toasts, pagination, recherche)

---

## Avancement global

```
████████████████████████████████░░░░░░░░  80%
```

| Module | Statut | Progression |
|--------|--------|-------------|
| Documentation | ✅ Mise à jour | 100% |
| CLI | ✅ Terminé | 100% |
| Backend (core) | ✅ En cours | 90% |
| Smart contracts EVM | ✅ Terminé | 100% |
| Audit sécurité (rounds 1–15) | ✅ Terminé | 100% |
| Authentification (refonte complète) | ✅ Terminé | 100% |
| Licences OSS (catalogue + auto-création) | ✅ Terminé | 100% |
| Workers on-chain (dépôts N1 + réconciliation N3) | ✅ Terminé | 100% |
| **Frontend V0.2.0** | ✅ **Terminé** | **100%** |
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

**27 fichiers TypeScript — ESM — Commander.js + ethers.js v6**

| Catégorie | Fichiers | Description |
|-----------|----------|-------------|
| **Commandes** (15) | `init`, `config`, `scaffold`, `generate`, `tasks`, `task`, `validate-docs`, `auth`, `wallet`, `submit`, `commit`, `status`, `projects`, `report`, `contributors` | Cycle complet créateur + développeur |
| **Utilitaires** | `crypto.ts` | `generateProjectId` (keccak256), `computeMerkleRoot`, `hashConditions` (EIP-712) |
| **Utilitaires** | `config.ts` | Walk-up `.ptf/config.json` (comme git), `requireProjectConfig`, drafts |
| **Utilitaires** | `docs-validator.ts` | Validation ARCHITECTURE.md + PLAN_ACTION.md, sections requises, placeholders, termes vagues |
| **Utilitaires** | `api.ts` | Client GraphQL + mode offline complet (`PTF_OFFLINE`) |
| **Utilitaires** | `mock-data.ts` | Données mock isolées (offline fallback) — séparées du code production |
| **Utilitaires** | `display.ts` | Formatage terminal (chalk, ora, tableaux) |
| **Utilitaires** | `shell.ts` | `shellEscape()`, `gitCmd()` — prévention injection shell sur tous les `execSync` |
| **Utilitaires** | `tracker.ts` | Suivi tâches actives : local `.ptf/active-task.json` + global `~/.config/ptf/active-tasks.json`, résolution auto par branche `ptf/<taskId>` |
| **Utilitaires** | `template.ts` | `buildTaskTemplate()` — génère le template de soumission markdown |
| **Templates** | `architecture.template.ts`, `plan-action.template.ts` | Prompts système pour le skill `/ptf-architect` |
| **Types** | `types.ts` | Interfaces partagées CLI |
| **Tests** | `docs-validator.test.ts` | **13 tests Vitest** |
| **Skill** | `.claude/commands/ptf-architect.md` | Mode 3 IA-assisté (Claude Code, Cursor, Copilot) |

**Workflow développeur automatisé :**
```bash
ptf task claim <taskId>   # Clone repo + crée branche ptf/<taskId> + track
ptf commit                # Commit avec tracking, lint, protection fichiers sensibles
ptf submit                # Auto push + soumission API (détection branche + tâche auto)
ptf status                # Progression tâche active (deadline, commits, diff stats)
```

**Commandes disponibles :**
```bash
ptf init         ptf scaffold     ptf describe     ptf validate-docs
ptf generate     ptf tasks        ptf task         ptf submit
ptf commit       ptf status       ptf wallet       ptf auth
ptf config       ptf projects     ptf contributors ptf report
ptf fix-docs     ptf sync
```

**Audit CLI (18 findings corrigés) :**
- Shell injection fixes (shellEscape/gitCmd sur tous les execSync)
- Fichiers sensibles (.env, *.key, *.pem) auto-unstage avant commit
- API réellement appelée (report, cancel, contributors — pas juste des mocks)
- Détection base branch dynamique (main/master/develop)
- OAuth callback path fix, dead code supprimé, mock data isolée

---

### ✅ Backend — 85%

**31 fichiers TypeScript — Apollo Server v4 + Prisma + BullMQ + Redlock + Nodemailer + express-rate-limit**

#### Services implémentés (15/17)

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
| `ReconciliationWorker` | `workers/reconciliation.worker.ts` | Scan rétroactif blocs historiques (N3), backfill events manqués, revert UTXOs stale (CIA-I9) |

#### Services manquants (2/17)

| Service | Priorité | Description |
|---------|----------|-------------|
| `EscrowService` | 🔴 Haute | Lien backend ↔ EscrowVault (release reward on-chain) |
| `ValidationService` | 🔴 Haute | Tests automatiques + sandbox gVisor (projets privés) |

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

#### Base de données (Prisma — 20 tables)

`User`, `DeviceSession`, `TrustedDevice`, `PendingDeviceSession`, `AuthChallenge`, `WalletLinkChallenge`, `Project`, `Task`, `Submission`, `WalletLink`, `ContributorRecord`, `Reputation`, `ReputationEvent`, `PunishmentRecord`, `Report`, `CreditUTXO`, `CreditTransaction`, `CreditEvent`, `NetworkBroadcast`, `SyncCheckpoint`

**Nouveaux champs notables :**
- `User.email`, `User.passwordHash`, `User.ptfPublicKey`, `User.ptfAddress`, `User.encryptedKey`
- `Project.isOpenSource`, `Project.license`, `Project.licenseVerifiedAt`

#### Tests

**32 tests Jest** — 2 suites :

`reputation.service.test.ts` (17 tests) :
- `calculatePoints` : min=30, max=150, canonique 3+3+4=100, bonus <7j +10%, <14j +5%
- `getLevel` : 8 cas aux bornes (Unranked/Junior/Senior/Expert)
- Grille de commission : 3 cas (<5k, 5k-50k, >50k USDC)

`reconciliation.worker.test.ts` (15 tests) :
- Checkpoint : get (startBlock / stored), save (upsert lowercase)
- `detectStaleSpent` (CIA-I9) : revert withdrawals, skip punishments, skip null spendingTx, multi-UTXOs, empty
- Event handlers : parseLog null guards (CreditClaimed, UTXOSpent)
- Lifecycle : start/stop, stop idempotent, config defaults
- Factory : env-var guards (RPC_HTTP_URL, ESCROW_VAULT_ADDRESS)

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

#### Sécurité implémentée (post-audit — 14 rounds, 101 findings corrigés)

- **EscrowVault** : `nonReentrant` sur toutes les fonctions fonds, pattern CEI strict, `SafeERC20` sur tous les transferts
- **EIP-712 UTXO** : `_hashTypedDataV4(structHash)` avec domain separator complet (`PTFEscrowVault`) — anti-replay cross-contrat et cross-chaîne
- **Anti double-spend intra-call** : déduplication `seenIds[]` dans la boucle de vérification UTXO avant le guard `spentUTXOs`
- **Chain dynamique** : `keccak256(bytes(inp.chain))` au lieu de `"polygon"` hardcodé
- **mintUTXOReceipt idempotent** : `spentUTXOs[utxoId]` guard avant mint — empêche l'inflation par replay opérateur
- **escrowBalance intègre** : `executePunishment` ne pollue plus le mapping USDC avec des unités PTF
- **Distribution punishments** : 80% trésorerie PTF + 20% PTF mintés au contrat — hardcodé en BPS, non contournable
- **Immutabilité tâches** : `ProjectRegistry.markTaskClaimed()` verrouille le Merkle root irréversiblement
- **Gas** : `owner()` mis en cache avant la boucle de vérification UTXO
- **ReconciliationWorker (N3)** : scan rétroactif par checkpoint — backfill CreditClaimed et UTXOSpent manqués après crash/downtime
- **detectStaleSpent (CIA-I9)** : revert automatique des UTXOs "spent" sans confirmation on-chain après 10min

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

### ✅ Frontend V0.2.0 — 100%

**~75 fichiers TypeScript — Next.js 14.2.5 App Router + TailwindCSS dark theme + Apollo Client 3 + wagmi v2 + RainbowKit + Zustand + MSW 2**

#### Pages implémentées

| Page | Route | Accès | Description |
|------|-------|-------|-------------|
| **Marketplace** | `/tasks` | Public | Tâches avec filtres status/priority/rewardMode + **recherche textuelle** + **pagination 12/page** |
| **Détail tâche** | `/tasks/[id]` | Public | Fiche complète : constraints, punishments, verificationSteps, reward, ClaimButton avec modal conditions |
| **Dashboard développeur** | `/dashboard` | Auth | Tâches actives, countdown, historique, réputation + balance sidebar |
| **Profil public** | `/profile/[address]` | Public | Score, niveau, historique réputation paginé, crédits, tâches complétées |
| **Wallet** | `/wallet` | Auth | Balance overview (3 cartes), statut 6 vérifications, historique crédits paginé, UTXOs filtrés (All/Unspent/Locked/Spent), actions coming-soon |
| **Projects** | `/projects` | Public | Catalogue projets avec filtres type/rewardMode, cartes avec stack + pool + open tasks |
| **Login** | `/login` | Public | Connexion email + mot de passe |
| **Register** | `/register` | Public | Inscription email + mot de passe |
| **Onboarding** | `/onboarding` | Auth | Wizard 3 étapes : OTP → GitHub OAuth → wallet EIP-712 via RainbowKit |
| **404** | `not-found.tsx` | — | Page 404 avec lien retour marketplace |
| **Error** | `error.tsx` | — | Boundary d'erreur avec bouton "Try again" |
| **Loading** | `loading.tsx` | — | Skeleton global Spinner |

#### Middleware Edge

- `middleware.ts` protège `/dashboard` et `/wallet` → redirect `/login` si non authentifié

#### MSW 2 — Mock Service Worker (couverture complète)

| Handler | Queries couvertes |
|---------|-------------------|
| `tasks.handlers` | `GetTasks`, `GetTask`, `GetMyTasks`, `ClaimTask`, `SubmitTask`, `CancelTask` |
| `profile.handlers` | `GetReputation`, `GetCreditHistory` (paginé), `GetUTXOBalance`, `GetWalletStatus`, `GetReputationHistory`, `GetUTXOs` (filtré) |
| `projects.handlers` | `GetProjects` (filtré type + rewardMode) |
| `auth.handlers` | `Login`, `Register`, `VerifyNewDevice`, `LinkGithub`, `RequestWalletChallenge`, `ConfirmLinkWallet` |

#### Composants UI

| Composant | Description |
|-----------|-------------|
| `Card`, `Badge`, `Button`, `Modal`, `Spinner`, `Input`, `ProgressBar`, `Countdown` | Primitives de base |
| `Toaster` | Notifications toast (success / error / warning / info) — position bottom-right, auto-dismiss 4s |
| `Navbar` | Desktop + **menu hamburger mobile** — liens auth-conditionnels, balance PTF + niveau réputation inline |

#### Système de toasts

`toastStore.ts` (Zustand) + `toast.success/error/info/warning()` utilisé sur :
- Claim task → success
- Submit task → success
- Cancel task → info
- Erreurs GraphQL → error

#### Hooks custom

| Hook | Rôle |
|------|------|
| `useAuth` | Session utilisateur, login/logout |
| `usePTFBalance` | Solde crédits PTF (polling 30s) |
| `useReputationScore` | Score, niveau, progression vers palier suivant |
| `useTaskCountdown` | Countdown deadline en temps réel |
| `useTaskStatusSubscription` | Subscription GraphQL statut tâche |
| `useClaimEligibility` | Éligibilité au claim (réputation, tâches actives réelles, skills) |

#### Fixtures mock

| Fixture | Contenu |
|---------|---------|
| `tasks.fixture.ts` | 10 tâches multi-projets, 2 tâches utilisateur actives |
| `profile.fixture.ts` | Réputation (Senior + Expert), 5 crédits, 4 événements réputation, balance UTXO |
| `auth.fixture.ts` | `mockUser` avec skills, JWT signé mock |
| `projects.fixture.ts` | 4 projets (2 publics, 1 OSS gratuit, 1 privé) |

#### Lancer le frontend

```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
npm run typecheck  # 0 erreurs TypeScript
```

#### Correctifs V0.2.0 (par rapport à V0.1.0)

| # | Type | Correctif |
|---|------|-----------|
| 1 | Bug | Double négatif pénalités mock (`credits: -20` → `20`, le UI préfixe `-`) |
| 2 | Bug | `ClaimButton` comptait faussement 0 tâches actives — désormais via `GET_MY_TASKS` réel |
| 3 | Bug | Handler `GetTasks` dupliqué (tasks + profile) → doublon supprimé |
| 4 | MSW | `GetReputationHistory` manquant → handler + fixture ajoutés |
| 5 | MSW | `GetUTXOs` manquant → handler avec 5 UTXOs (unspent/locked/spent) |
| 6 | MSW | `GetProjects` manquant → handler + fixture + page `/projects` |
| 7 | UX | Navigation mobile absente → menu hamburger complet |
| 8 | UX | Pas de recherche → input texte dans `TaskFilters` (titre + contexte + skills) |
| 9 | UX | Pas de pagination → pages de 12 + compteur résultats |
| 10 | UX | Aucun toast/feedback → `Toaster` + `toastStore` Zustand |
| 11 | UX | Onglet "All" manquant sur UTXOs wallet → ajouté en premier |
| 12 | Sécurité | `/wallet` non protégé par middleware Edge → ajouté à `PROTECTED_ROUTES` |
| 13–16 | Fonctionnel | `not-found`, `error`, `loading`, `GET_PROJECTS` query ajoutés |

#### Vues restantes (V0.5.0)

| Vue | Route | Description |
|-----|-------|-------------|
| **Créateur — Nouveau projet** | `/project/new` | Wizard : upload MD, évaluation coût, dépôt escrow |
| **Créateur — Suivi projet** | `/project/:id` | Tâches, devs actifs, escrow, soumissions |
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
| **Fichiers source totaux** | 170+ fichiers |
| **Lignes TypeScript** (CLI + Backend + Frontend) | ~16 000 lignes |
| **Lignes Solidity** | ~640 lignes |
| **Tests unitaires** | 13 (Vitest) + 32 (Jest) + ~60 (Foundry) = **105 tests** |
| **Erreurs TypeScript frontend** | **0** (`npm run typecheck` passe) |
| **Commits** | 8 |
| **Bugs sécurité corrigés** | **119** (15 rounds d'audit — smart contracts, backend, auth, licences, workers, réconciliation, CLI) |
| **Findings frontend corrigés** | **16** (V0.2.0 — bugs, MSW, UX, sécurité) |
| **Findings ouverts** | **0** |
| **Progression globale** | **~80%** |

---

## Roadmap V0.0.1 → V1.0.0

```
V0.0.1 (actuel)
├── ✅ Documentation
├── ✅ CLI (15 commandes, workflow automatisé, mode offline)
├── ✅ Backend (15 services, GraphQL, Prisma, 2 workers on-chain)
├── ✅ Smart contracts EVM (4 contrats, 90 tests)
└── ✅ Audit sécurité complet (119/119 findings corrigés, 15 rounds)

V0.0.2
├── 🔴 Services backend manquants (EscrowService, ValidationService)
├── 🔴 Docker compose (dev local) ← infrastructure toujours à faire
└── ✅ CI/CD GitHub Actions (ajouté)

V0.1.0
├── ✅ Frontend MVP (marketplace + dashboard dev + profil) ← TERMINÉ
├── 🔴 Adapters blockchain réels (Polygon testnet)
└── 🔴 Déploiement testnet Polygon Amoy

V0.2.0
└── ✅ Frontend V0.2.0 ← TERMINÉ
    ├── Page /wallet (balance, UTXOs, historique crédits)
    ├── Page /projects (catalogue projets)
    ├── Nav mobile (hamburger)
    ├── Toasts (claim, submit, cancel)
    ├── Recherche + pagination marketplace
    ├── MSW complets (ReputationHistory, UTXOs, Projects)
    └── 16 bugs/gaps corrigés

V0.5.0 (Beta fermée)
├── 🔴 Frontend complet (leaderboard, project/new, project/:id)
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
