# PTF — Progression du projet

> Version : **V0.2.7-alpha** — Dernière mise à jour : **2026-08-02**
>
> Commits récents : `47a7e98` subgraph The Graph → `1c88d8b` audit sécurité 43 findings → `(en cours)` 7 findings restants corrigés (Pausable, rollback, O(n) dedup, Decimal)

---

## Avancement global

```
███████████████████████████████████░░░░░  88%
```

| Module | Statut | Progression |
|---|---|---|
| Documentation | ✅ À jour | 100% |
| CLI (framework) | ✅ Terminé | 100% |
| Smart contracts EVM | ✅ Terminé | 100% |
| Audit sécurité (17 rounds) | ✅ Terminé | 100% |
| Backend framework (réseau) | ⚠️ En cours | 95% |
| ptf_service_plateforme — backend | ⚠️ En cours | 90% |
| ptf_service_plateforme — frontend | ⚠️ En cours | 85% |
| Infrastructure | ⚠️ En cours | 80% |
| Blockchain réelle (testnet) | 🔴 À faire | 0% |
| Solana / Anchor | 🔴 À faire | 0% |

---

## Architecture actuelle

Le projet est désormais séparé en deux dépôts distincts :

| | PTF Framework (`PTF_plateforme`) | PTF Service (`ptf_service_plateforme`) |
|---|---|---|
| Visibilité | Open-source | Privé |
| Contenu | CLI, backend réseau, contrats | Backend comptes, frontend web |
| Auth | Challenge-response EIP-712 stateless | Email/password + wallet linking |
| Données | Projets, tâches, réputation on-chain | Comptes, dépôts, retraits, ledger |

---

## Détail par module

---

### ✅ CLI — 100%

**14 commandes — ESM — Commander.js + ethers.js v6 + chalk v5**

| Catégorie | Commandes |
|---|---|
| Wallet | `create`, `restore`, `list`, `status`, `history`, `utxos`, `reputation-history` |
| Auth | `login`, `logout`, `status` — challenge-response EIP-712 stateless |
| Projets | `init`, `scaffold`, `generate`, `validate-docs`, `projects` |
| Tâches | `tasks list/mine/preview/publish`, `task show/template/claim/cancel` |
| Workflow dev | `commit`, `submit`, `status` |
| Utilitaires | `config`, `report`, `contributors` |

**Logique free/paid correcte (corrigée `2026-08-02`) :**
- `free` = projet public open source → reward en **points de réputation**
- `paid` = escrow PTF, reward PTF au taux marché, garantie 10 PTF
- `isPaid` basé sur `task.rewardMode === "paid"` (plus sur `reward.amount > 0`)
- Affichage CLI : `+70 pts rep (free)` en cyan / montant PTF en vert pour `paid`

**Wallet BIP-39 (clé ne quitte jamais la machine) :**
- Keypair secp256k1 + seed phrase BIP-39 générés localement
- Keystore chiffré AES-256-GCM
- Authentification : challenge-response EIP-712 (nonce signé localement → JWT `{ptfAddress}`)

**Tests : 13 (Vitest — docs-validator)**

---

### ✅ Smart contracts EVM — 100%

**4 contrats Solidity 0.8.20 — Foundry — OpenZeppelin v5**

| Contrat | Description |
|---|---|
| `CreditToken.sol` | ERC-20 PTF, EIP-712 nonces `(address, taskId)`, mint/burn minter-gated |
| `EscrowVault.sol` | Fonds projets paid, soft-lock 10 PTF, release reward, punishments 80/20 BPS |
| `ProjectRegistry.sol` | Ancrage Merkle, verrou au premier claim, preuve Merkle |
| `ReputationRegistry.sol` | Score on-chain immuable, historique, 4 niveaux |

**152 findings sécurité corrigés (16 rounds d'audit)**
**~60 tests Foundry — 3 invariants EscrowVault**

---

### ⚠️ Backend framework — 95%

**12 services — Apollo GraphQL — Prisma — 7 modèles DB réseau**

**JWT contient uniquement `{ ptfAddress }` — aucun compte email côté framework.**

#### Services présents

| Service | Description |
|---|---|
| `AuthService` | Nonces en mémoire (TTL 5min), JWT stateless `{ptfAddress}` |
| `WalletService` | Solde et soft-lock lus on-chain via `IChainAdapter` |
| `ProjectService` | Création, publication, ancrage Merkle, vérification licence OSS |
| `TaskService` | Anti-collision Redlock, cycle de vie complet, vue pub/privé |
| `ReputationService` | Lecture/écriture on-chain, formule `(c+e+i)×10 + bonus_durée`, zéro si projet non OSS |
| `PunishmentService` | Pénalités on-chain, tous projets, sans crédits pour les projets free |
| `TimerService` | BullMQ deadlines, alertes 72/48/24h |
| `GithubService` | Vérification licence OSS + création LICENSE.md |
| `LicenseCatalog` | 50+ licences OSI/FSF/source-available |
| `LLMTaskGenerator` | Génération tâches depuis ARCHITECTURE.md + PLAN_ACTION.md |
| `EscrowService` | Release reward USDC on-chain + réputation + ContributorRecord atomique |
| `ValidationService` | Exécution des `verificationSteps` en shell + persistance résultats DB |

#### BAL (Blockchain Abstraction Layer)

| Adapter | Statut |
|---|---|
| `MockChainAdapter` | ✅ Opérationnel (dev/test) |
| `EvmAdapterBase` | ✅ Classe de base ethers.js |
| `PolygonAdapter` | ✅ Activé automatiquement si `SIGNER_PRIVATE_KEY` présent |
| `EthereumAdapter` | ⚠️ Structure présente — throw si `SIGNER_PRIVATE_KEY` absent |

#### Tests : 25 (Jest — 2 suites)

- `reputation.service.test.ts` : 17 tests (formule, niveaux, grille commissions)
- `reconciliation.worker.test.ts` : 8 tests (checkpoint, detectStaleSpent, lifecycle)

---

### ⚠️ ptf_service_plateforme — Backend — 90%

**7 services — Apollo GraphQL — Prisma — 10 modèles DB**

| Service | Statut | Description |
|---|---|---|
| `AuthService` | ✅ | Email/password, sessions, wallet linking challenge-response |
| `UserService` | ✅ | Profil, vérification email, reset mot de passe |
| `LedgerService` | ✅ | Crédits/débits internes, solde, historique |
| `DepositService` | ✅ | Traitement dépôts on-chain, confirmation, crédit ledger |
| `WithdrawalService` | ✅ | Retrait avec réservation atomique, frais 0.1%, remboursement si échec |
| `NotificationService` | ✅ | Notifications in-app + email SMTP |
| `PtfNodeService` | ✅ | Proxy lecture vers nœud PTF (balance, réputation on-chain) |
| `DepositListener` | ⚠️ | Architecture BullMQ prête — broadcast on-chain réel non câblé |

**Tests : 20** — LedgerService (8), DepositService (6), WithdrawalService (6)

---

### ⚠️ ptf_service_plateforme — Frontend — 70%

**Next.js 14 App Router — Tailwind — Apollo Client — Zustand**

| Page | Statut | Description |
|---|---|---|
| `/login` | ✅ | Email + password |
| `/register` | ✅ | Inscription avec note wallet CLI |
| `/forgot-password` + `/reset-password` | ✅ | Reset via email |
| `/dashboard` | ✅ | Solde, réputation, alertes wallet/email, accès rapide |
| `/wallet` | ✅ | Dépôt (adresse escrow), retrait (modal + frais), historique ledger |
| `/profile` | ✅ | Réputation on-chain, solde on-chain, infos compte |
| `/settings` | ✅ | Liaison wallet PTF, vérification email, sécurité |
| `/notifications` | ✅ | Liste, marquer lu / tout lu, badge live, icônes par type |
| Wallet linking | ✅ | Modal inline remplace `prompt()` — nonce + commande CLI affichés |
| Marketplace tâches | 🔴 | Accès au réseau PTF depuis le service (optionnel) |

---

### ⚠️ Infrastructure — 20%

| Composant | Statut | Priorité |
|---|---|---|
| `docker-compose.yml` ptf_service (dev) | ✅ Présent | — |
| `docker-compose.yml` framework (dev — PostgreSQL 16 + Redis 7) | ✅ Présent | — |
| `infra/docker-compose.prod.yml` (framework prod) | ✅ Présent — GHCR + secrets env | — |
| `infra/docker-compose.service.prod.yml` (service prod) | ✅ Présent — réseau `ptf-bridge` isolé (DB inaccessible) | — |
| `infra/nginx.conf` | ✅ Durci — HSTS, nosniff, ciphers modernes, server_tokens off | — |
| `infra/setup-vps.sh` | ✅ Corrigé — UFW idempotent, certbot `docker compose exec` | — |
| `infra/.env.*.example` | ✅ Présents — framework + service | — |
| GitHub Actions CI — framework | ✅ Corrigé (`a9313ca`) — Foundry deps + typecheck + tests | — |
| GitHub Actions CI — service | ✅ Présent | — |
| GitHub Actions Deploy (`deploy.yml`) | ✅ Présent — build GHCR + SSH Hetzner + Prisma migrate | — |
| `contracts/evm/Makefile` + `deploy-amoy.sh` | ✅ Présents | — |
| Déploiement VPS (Hetzner CX21) | 🔴 À faire — créer le serveur + pointer les DNS | 🔴 Haute |
| Secrets GitHub Actions | 🔴 À faire — `VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN` | 🔴 Haute |
| Contrats testnet Polygon Amoy | 🔴 À faire — besoin de `DEPLOYER_PK` + MATIC Amoy | 🔴 Haute |
| The Graph subgraph | ⚠️ Corrigé partiellement — compile (imports fixés), handlers manquants | — |
| Monitoring (Grafana Cloud) | 🔴 À faire | 🟠 Basse |

---

## Statistiques globales

| Métrique | Valeur |
|---|---|
| Fichiers source totaux (framework) | 71 fichiers |
| Lignes TypeScript (backend + CLI) | ~8 700 lignes |
| Lignes Solidity | ~640 lignes |
| Tests : CLI (Vitest) + Backend Jest (framework) + Service Jest + Contracts (Foundry) | 13 + 25 + 20 + ~60 = **~118 tests** |
| TypeScript errors | **0** (typecheck passe sur les deux projets) |
| CI GitHub Actions | ✅ Corrigé (`a9313ca`) — Foundry deps installées dans le CI |
| Commits framework | 16 |
| Findings sécurité corrigés | **152** (16 rounds d'audit) |
| Findings ouverts | **7** (non bloquants — voir `AUDIT_CORRECTIONS.md`) |

---

## Roadmap — Prochaines étapes prioritaires

### ✅ Priorité 1 — Backend framework COMPLÉTÉ

- `EscrowService` (`backend/src/services/escrow.service.ts`) — `releaseTaskReward()` câblé
- `ValidationService` (`backend/src/services/validation.service.ts`) — exécution verificationSteps
- Mutations GraphQL ajoutées : `validateSubmission`, `releaseTaskReward`
- BAL étendu : `IChainAdapter.releaseTaskReward()` + implémentation Mock + EVM
- `PolygonAdapter` activé automatiquement si `SIGNER_PRIVATE_KEY` présent

---

### ⚠️ Priorité 2 — docker-compose framework + testnet

**`docker-compose.yml` framework** ✅ Créé (`docker-compose.yml` à la racine — PostgreSQL 16 + Redis 7 + backend)

**Scripts déploiement testnet** ✅
- `contracts/evm/scripts/deploy-amoy.sh` — déploiement automatisé + génération `backend/.env.testnet`
- `contracts/evm/Makefile` — `make deploy-amoy`, `make test`, `make coverage`

**Déploiement contrats Polygon Amoy (testnet)**
- Exécuter `contracts/evm/scripts/Deploy.s.sol` sur Amoy
- Renseigner les adresses dans `.env` du backend
- Activer `PolygonAdapter` (retirer le fallback vers MockAdapter)
- Durée minimale testnet avant mainnet : 3 mois

---

### ✅ Priorité 4 — Frontend ptf_service_plateforme COMPLÉTÉ

- `/notifications` — page dédiée : liste, marquer lu / tout lu, badge live (poll 30s), icônes par type
- `settings/page.tsx` — `prompt()` remplacé par modal inline propre : nonce + commande CLI copiable
- `Navbar` — lien Notifications ajouté, badge pointe vers `/notifications`
- `dashboard/page.tsx` — carte Notifications avec compteur non lus

---

### ✅ Priorité 3 — Tests ptf_service_plateforme COMPLÉTÉS

- `LedgerService` : 8 tests (solde, crédit/débit, historique, balanceAfter, INSUFFICIENT_BALANCE)
- `DepositService` : 6 tests (confirmation, idempotence, adresse inconnue, notification)
- `WithdrawalService` : 6 tests (réservation atomique, INSUFFICIENT_BALANCE, fee 0.1%, remboursement, confirmation)
- Total : **20 tests** — tous passent ✅
- Câbler le broadcast on-chain réel dans `WithdrawalService` — 🔴 reste à faire

---

### 🟡 Priorité 4 — Finaliser ptf_service_plateforme frontend

- Page notifications in-app
- Améliorer le flux de wallet linking (afficher nonce directement, sans `prompt()`)
- Tests Vitest pour les pages critiques (wallet, settings)

---

### ✅ Priorité 5 — Infra VPS COMPLÉTÉE (configuration)

- `infra/setup-vps.sh` — setup Ubuntu 22.04 : Docker, UFW, fail2ban, Certbot, cron TLS
- `infra/docker-compose.prod.yml` — framework prod : GHCR, healthchecks, réseau isolé
- `infra/docker-compose.service.prod.yml` — service prod : partage réseau ptf-net avec framework
- `infra/nginx.conf` — TLS, rate-limiting auth, reverse proxy 3 domaines
- `infra/.env.*.example` — templates variables de production
- `.github/workflows/deploy.yml` — CD : build GHCR → SSH Hetzner → Prisma migrate → healthcheck

**Reste à faire (actions manuelles) :**
- Créer le VPS Hetzner CX21 (4€/mois)
- Pointer les DNS (`api.ptf-framework.dev`, `api.ptf-service.dev`, `app.ptf-service.dev`)
- Lancer `setup-vps.sh` + `certbot` + remplir les `.env`
- Ajouter les secrets GitHub : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_TOKEN`

---

### ✅ Priorité 6 — The Graph subgraph COMPLÉTÉ

**Structure :** `subgraph/` — 4 dataSources, 12 entités GraphQL, 4 handlers AssemblyScript

| Fichier | Rôle |
|---------|------|
| `subgraph/subgraph.yaml` | Config : 4 contrats, network matic, event handlers |
| `subgraph/schema.graphql` | 12 entités : Project, Task, TaskReward, Punishment, Withdrawal, UTXORecord, Developer, ReputationEvent, CreditEvent, GlobalStats |
| `subgraph/src/projectRegistry.ts` | ProjectRegistered, MerkleRootUpdated, TaskClaimed, ProjectLocked |
| `subgraph/src/escrowVault.ts` | ProjectFunded, TaskRewardReleased, PunishmentExecuted, WithdrawalExecuted, UTXOSpent |
| `subgraph/src/reputationRegistry.ts` | ReputationUpdated → historique immuable par dev |
| `subgraph/src/creditToken.ts` | CreditClaimed + Transfer (in/out) |
| `subgraph/abis/*.json` | ABIs extraits pour les 4 contrats |
| `subgraph/scripts/update-addresses.sh` | Patch subgraph.yaml depuis `backend/.env.testnet` |

**Déploiement (après deploy Amoy) :**
```bash
bash subgraph/scripts/update-addresses.sh   # injecte les adresses
cd subgraph && npm install
npm run codegen && npm run build
npm run deploy:amoy                         # ou deploy:studio pour mainnet
```

**Reste à faire :** déployer sur The Graph Studio après les contrats Amoy

---

### 🟠 Priorité 7 — Monitoring + Arweave

- Monitoring Grafana Cloud (métriques backend + alertes)
- Arweave : stockage permanent ARCHITECTURE.md + PLAN_ACTION.md

---

### 🔵 Long terme — V1.0.0

```
Testnet 3 mois sans incident critique
  ↓
Audit externe (Certik / Trail of Bits)
  ↓
LayerZero bridge cross-chaîne
  ↓
Solana / Anchor (4 contrats équivalents Rust)
  ↓
Programme bug bounty actif
  ↓
Mainnet
```
