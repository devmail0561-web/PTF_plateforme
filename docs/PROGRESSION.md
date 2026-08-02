# PTF — Progression du projet

> Version : **V0.2.0-alpha** — Dernière mise à jour : **2026-08-02**
>
> Commits récents : `fb647b7` tokenomics flottant → `1ea8e65` wallet BIP-39 + challenge-response → `a26cd79` séparation données utilisateurs → `848c4e1` suppression frontend + nettoyage services → `eaaf912` fix logique free/paid CLI

---

## Avancement global

```
██████████████████████████████░░░░░░░░░░  75%
```

| Module | Statut | Progression |
|---|---|---|
| Documentation | ✅ À jour | 100% |
| CLI (framework) | ✅ Terminé | 100% |
| Smart contracts EVM | ✅ Terminé | 100% |
| Audit sécurité (15 rounds) | ✅ Terminé | 100% |
| Backend framework (réseau) | ⚠️ En cours | 80% |
| ptf_service_plateforme — backend | ⚠️ En cours | 75% |
| ptf_service_plateforme — frontend | ⚠️ En cours | 70% |
| Infrastructure | 🔴 À faire | 5% |
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

**119 findings sécurité corrigés (15 rounds d'audit)**
**~60 tests Foundry — 3 invariants EscrowVault**

---

### ⚠️ Backend framework — 80%

**10 services — Apollo GraphQL — Prisma — 7 modèles DB réseau**

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

#### Manquants (2 services)

| Service | Priorité | Description |
|---|---|---|
| `EscrowService` | 🔴 Haute | Orchestrer `releaseTaskReward()` on-chain à la validation d'une tâche |
| `ValidationService` | 🔴 Haute | Exécuter les `verificationSteps` automatiquement + sandbox gVisor (projets privés) |

#### BAL (Blockchain Abstraction Layer)

| Adapter | Statut |
|---|---|
| `MockChainAdapter` | ✅ Opérationnel (dev/test) |
| `EvmAdapterBase` | ✅ Classe de base ethers.js |
| `PolygonAdapter` | ⚠️ Structure présente — throw si `SIGNER_PRIVATE_KEY` absent |
| `EthereumAdapter` | ⚠️ Structure présente — throw si `SIGNER_PRIVATE_KEY` absent |

#### Tests : 25 (Jest — 2 suites)

- `reputation.service.test.ts` : 17 tests (formule, niveaux, grille commissions)
- `reconciliation.worker.test.ts` : 8 tests (checkpoint, detectStaleSpent, lifecycle)

---

### ⚠️ ptf_service_plateforme — Backend — 75%

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

**Tests : 0** — à écrire (priorité moyenne)

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
| Notifications | 🔴 | Page dédiée notifications in-app à faire |
| Marketplace tâches | 🔴 | Accès au réseau PTF depuis le service (optionnel) |

---

### ⚠️ Infrastructure — 5%

| Composant | Statut | Priorité |
|---|---|---|
| `docker-compose.yml` ptf_service | ✅ Présent | — |
| GitHub Actions CI — framework | ✅ Présent | — |
| GitHub Actions CI — service | ✅ Présent | — |
| `docker-compose.yml` framework (PostgreSQL + Redis + backend) | 🔴 Manquant | 🔴 Haute |
| Déploiement VPS (Hetzner CX21) | 🔴 À faire | 🟡 Moyenne |
| Contrats testnet Polygon Amoy | 🔴 À faire | 🟡 Moyenne |
| The Graph subgraph | 🔴 À faire | 🟠 Basse |
| Monitoring (Grafana Cloud) | 🔴 À faire | 🟠 Basse |

---

## Statistiques globales

| Métrique | Valeur |
|---|---|
| Fichiers source totaux (framework) | 69 fichiers |
| Lignes TypeScript (backend + CLI) | ~8 500 lignes |
| Lignes Solidity | ~640 lignes |
| Tests : CLI (Vitest) + Backend (Jest) + Contracts (Foundry) | 13 + 25 + ~60 = **~98 tests** |
| TypeScript errors | **0** (typecheck passe sur les deux projets) |
| Commits framework | 15 |
| Findings sécurité corrigés | **119** (15 rounds d'audit) |
| Findings ouverts | **0** |

---

## Roadmap — Prochaines étapes prioritaires

### 🔴 Priorité 1 — Compléter le backend framework

**`EscrowService`**
- Implémenter `releaseTaskReward(taskId)` : appel `EscrowVault.releaseTaskReward()` on-chain via `PolygonAdapter`
- Câbler dans `TaskService` à la validation d'une soumission
- Fichier : `backend/src/services/escrow.service.ts`

**`ValidationService`**
- Exécuter les `verificationSteps` d'une tâche après soumission (`submitTask`)
- Retourner pass/fail par step + log
- Mode sandbox Docker/gVisor pour les projets privés
- Fichier : `backend/src/services/validation.service.ts`

---

### 🔴 Priorité 2 — docker-compose framework + testnet

**`docker-compose.yml` framework**
```yaml
# PostgreSQL + Redis + backend framework
# À créer à la racine de PTF_plateforme
```

**Déploiement contrats Polygon Amoy (testnet)**
- Exécuter `contracts/evm/scripts/Deploy.s.sol` sur Amoy
- Renseigner les adresses dans `.env` du backend
- Activer `PolygonAdapter` (retirer le fallback vers MockAdapter)
- Durée minimale testnet avant mainnet : 3 mois

---

### 🟡 Priorité 3 — Tests ptf_service_plateforme

- Tests Jest pour `DepositService` (confirmation, idempotence)
- Tests Jest pour `WithdrawalService` (réservation atomique, remboursement)
- Tests Jest pour `LedgerService` (solde, crédit/débit)
- Câbler le broadcast on-chain réel dans `WithdrawalService`

---

### 🟡 Priorité 4 — Finaliser ptf_service_plateforme frontend

- Page notifications in-app
- Améliorer le flux de wallet linking (afficher nonce directement, sans `prompt()`)
- Tests Vitest pour les pages critiques (wallet, settings)

---

### 🟠 Priorité 5 — Infra + indexation

- VPS Hetzner (déploiement backend framework + service)
- The Graph subgraph Polygon (indexation events on-chain)
- Arweave : stockage permanent ARCHITECTURE.md + PLAN_ACTION.md
- Monitoring Grafana Cloud

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
