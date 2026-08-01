# PTF Project — Summary

**Mis a jour :** 2026-08-01
**Statut :** En cours de developpement — frontend MVP V0.1.0 terminé + backend core + auth + licences + workers on-chain (dépôts + réconciliation) + audit 14 rounds (101/101 findings corrigés, 0 ouvert)

---

## Qu'est-ce que PTF ?

**Parallel Task Framework (PTF)** est un **écosystème cryptographique décentralisé** qui permet aux développeurs de **monétiser leurs compétences** en réclamant des tâches rémunérées sur des projets publics (GitHub) ou privés (entreprises).

Les paiements sont garantis par smart contract sur la chaîne choisie par le créateur : les fonds sont bloqués en escrow avant le démarrage du projet et libérés automatiquement à la validation de chaque tâche. Les développeurs gagnent des **crédits PTF** (1 credit = 1 USDC stable partout, signés EIP-712) et une **réputation cross-chaîne** indépendante. PTF **récompense la qualité et punit automatiquement les manquements** via un système de punishments configurable.

**Tagline :** _"L'écosystème cryptographique qui récompense ET punit"_

---

## Structure du projet

```
PTF_project/
├── README.md                          ← Vision produit + quick start
├── SUMMARY.md                         ← Ce fichier
├── LICENSE (MIT)
├── .gitignore
│
├── contracts/
│   ├── evm/                           ← Smart contracts Solidity EVM (a implementer)
│   │   ├── ProjectRegistry.sol        ← ID crypto projets + arbre taches
│   │   ├── EscrowVault.sol            ← Fonds bloques + liberation a validation
│   │   ├── CreditToken.sol            ← ERC-20 PTF credits (minting, EIP-712)
│   │   └── ReputationRegistry.sol     ← Scores reputation non transferables
│   └── solana/                        ← Programmes Rust/Anchor Solana (a implementer)
│       ├── project_registry/          ← Equivalent Solana de ProjectRegistry
│       ├── escrow_vault/              ← Equivalent Solana de EscrowVault
│       ├── credit_token/              ← SPL token PTF credits
│       └── reputation_registry/       ← Scores reputation Solana
│
├── backend/                           ← API Node.js + TypeScript (a implementer)
│   ├── src/
│   │   ├── graphql/                   ← Schema + resolvers Apollo
│   │   ├── bal/                       ← Blockchain Abstraction Layer
│   │   │   ├── chain.adapter.ts       ← Interface ChainAdapter
│   │   │   ├── chain.registry.ts      ← ChainRegistry (selection dynamique)
│   │   │   ├── adapters/
│   │   │   │   ├── polygon.adapter.ts
│   │   │   │   ├── ethereum.adapter.ts
│   │   │   │   ├── bsc.adapter.ts
│   │   │   │   ├── avalanche.adapter.ts
│   │   │   │   ├── arbitrum.adapter.ts
│   │   │   │   ├── base.adapter.ts
│   │   │   │   └── solana.adapter.ts
│   │   ├── services/
│   │   │   ├── project.service.ts        ← Gestion projets + ID crypto + ref depot + chaîne
│   │   │   ├── task.service.ts           ← Arbre de taches Merkle (metadonnees, pas le code)
│   │   │   ├── escrow.service.ts         ← Interface avec EscrowVault (via ChainAdapter)
│   │   │   ├── validation.service.ts     ← Tests auto + coordination peer review
│   │   │   ├── reputation.service.ts     ← Calcul + mise a jour scores
│   │   │   ├── reputationAggregator.service.ts ← Agregation cross-chaine des scores
│   │   │   ├── dispute.service.ts        ← Workflow resolution conflits
│   │   │   ├── sandbox.service.ts        ← Coordination Docker/gVisor (projets prives) — ne stocke pas le code
│   │   │   ├── sync.service.ts           ← Repo temporaire PTF (Cas 3), detection reconnexion, sync auto
│   │   │   ├── crossChainBridge.service.ts ← Bridge PTF Credits entre chaines (LayerZero)
│   │   │   ├── graphIndexer.service.ts   ← Requetes The Graph (multi-chaine)
│   │   │   ├── decentralizedStorage.service.ts ← Upload/lecture Arweave + IPFS
│   │   │   └── taskGenerator.service.ts  ← Parse MD via LLM, genere arbre taches
│   │   ├── blockchain/                ← ChainRegistry + adapters (BAL)
│   │   └── sandbox/                   ← Orchestration Docker/gVisor
│   └── prisma/                        ← Schema PostgreSQL (donnees mutables uniquement)
│
├── cli/                               ← CLI PTF Node.js/TypeScript (a implementer)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── auth.ts                ← GitHub OAuth + wallet linking
│   │   │   ├── init.ts                ← Creer projet sur PTF
│   │   │   ├── link.ts                ← Lier repo GitHub a projet PTF
│   │   │   ├── push.ts                ← Publier taches vers PTF
│   │   │   ├── tasks.ts               ← Lister taches disponibles
│   │   │   ├── claim.ts               ← Reclamer une tache
│   │   │   ├── submit.ts              ← Soumettre une tache terminee
│   │   │   ├── wallet.ts              ← Gestion credits + retrait
│   │   │   ├── validate-docs.ts       ← Verifier format PTF des ARCHITECTURE.md + PLAN_ACTION.md
│   │   │   ├── estimate.ts            ← ROI check avant generation
│   │   │   ├── generate.ts            ← Generer arbre de taches depuis les 2 MD (LLM)
│   │   │   ├── preview.ts             ← Revue humaine des taches generees
│   │   │   └── publish.ts             ← Depot escrow + publication projet PTF
│   │   └── utils/
│   │       ├── crypto.ts              ← Calcul ID taches (Hash Merkle)
│   │       └── api.ts                 ← Client GraphQL PTF
│   └── package.json
│
├── frontend/                          ← Dashboard Next.js (V0.1.0 MVP ✅)
│   ├── app/
│   │   ├── tasks/                     ← Marketplace taches + filtres (200)
│   │   ├── tasks/[id]/                ← Detail tache (200)
│   │   ├── dashboard/                 ← Dev dashboard (307→/login via middleware)
│   │   ├── profile/[address]/         ← Profil public developpeur (200)
│   │   ├── login/                     ← Connexion (200)
│   │   ├── register/                  ← Inscription (200)
│   │   └── onboarding/                ← Wizard OTP → GitHub → wallet (200)
│   ├── middleware.ts                  ← Edge middleware (protection /dashboard)
│   ├── mocks/                         ← MSW 2 handlers + fixtures (10+ taches mock)
│   └── package.json
│
├── .claude/
│   └── commands/
│       └── ptf-architect.md           ← Skill PTF pour IA (Claude Code, Cursor, Copilot...)
│                                         Injecte les templates + règles de qualité PTF
│                                         Usage : /ptf-architect "description du projet"
│
└── docs/
    ├── ARCHITECTURE.md                ← Architecture technique detaillee
    └── CONTRACTS.md                   ← Spec des 4 smart contracts
```

---

## Composants cles

### 4 Smart Contracts (déployés sur chaque chaîne supportée)

> Même logique déployée sur chaque chaîne EVM (Solidity). Équivalents Rust/Anchor pour Solana. Au total : 4 contrats × N chaînes.

**ProjectRegistry.sol / project_registry (Solana)**
- Enregistrement des projets avec ID cryptographique unique
- `ProjectID = Hash(owner + name + timestamp + nonce)`
- Stockage de la racine de l'arbre de taches (Merkle root)
- Verification d'integrite de l'arbre a chaque mise a jour

**EscrowVault.sol / escrow_vault (Solana)**
- **Uniquement activé pour les projets paid** (public paid et private) — les projets public free ne l'utilisent pas
- Reception et blocage des fonds USDC/token a la creation du projet paid (sur la chaîne du projet)
- Liberation automatique vers CreditToken a validation d'une tache
- **Execution automatique des punishments crédits** pour les projets paid (lateDelivery, maliciousCode, criticalBug, nonCriticalBug) ; les projets free n'ont que des pénalités de réputation (gérées par ReputationRegistry)
- Gestion des remboursements en cas d'expiration ou litige gagne
- Acces restreint : seul le contrat de validation peut declencher la liberation

**CreditToken.sol / credit_token (Solana SPL)**
- Token stable (symbol : PTF, decimal : 6, pegged 1:1 USDC) — ERC-20 sur chaînes EVM, SPL sur Solana
- Minting exclusivement sur autorisation d'EscrowVault
- Chaque credit signé cryptographiquement selon **EIP-712** (vérifiable via `ptf wallet verify`)
- Burning lors des retraits vers wallet externe
- Bridge cross-chaîne via LayerZero : **1 PTF = 1 USDC sur toute chaîne supportée**
- Aucune inflation possible hors validation de tache

**ReputationRegistry.sol / reputation_registry (Solana)**
- Score par adresse wallet, non transferable (non ERC-20)
- Incremente a chaque validation reussie (+reputationPoints defini dans la tache)
- Decremente en cas de litige perdu ou soumission rejetee
- Consulte par EscrowVault pour ponderer les votes d'arbitrage DAO
- Agrégeé cross-chaîne par le `ReputationAggregator` (backend)

### Services backend

| Service | Responsabilite |
|---------|----------------|
| `auth.service` | Email + password (scrypt) + clé secp256k1 générée serveur, OTP email nouvel appareil, TrustedDevice, DeviceSession, GitHub OAuth, wallet EIP-712 challenge-response |
| `email.service` | SMTP Nodemailer — envoi OTP email lors d'une connexion depuis un nouvel appareil |
| `github.service` | Vérification licence OSS (public + OSI/FSF) via GitHub API, création automatique LICENSE.md |
| `licenses.ts` | Catalogue 50+ licences (OSI, FSF-libre, source-available, propriétaire) avec SPDX IDs |
| `project.service` | Création projets (non-bloquant sur licence), vérification OSS, `createProjectLicense()`, ancrage Merkle |
| `task.service` | CRUD metadonnees taches — `reputationPoints=0` si projet non open-source vérifié |
| `escrow.service` | Interface avec EscrowVault via ChainAdapter — verification paiements, triggers |
| `validation.service` | Orchestration tests auto + coordination 3 peer reviewers ; recoit uniquement les resultats (pass/fail), pas le code |
| `reputation.service` | Calcul delta reputation, ecriture on-chain via ChainAdapter |
| `reputationAggregator.service` | Agregation cross-chaine des scores de tous les wallets lies d'un dev — score global unifie |
| `dispute.service` | Workflow 3 niveaux (auto → peer → DAO) |
| `sandbox.service` | Coordination Docker/gVisor pour projets prives — ne stocke pas le code soumis |
| `sync.service` | Gestion repo temporaire PTF (Cas 3), detection reconnexion createur, sync automatique, nettoyage repo temp |
| `punishment.service` | Detection infractions, calcul penalites, execution on-chain via ChainAdapter |
| `timer.service` | Gestion deadlines (claimedAt + duration), countdown multi-projets, alertes |
| `taskGenerator.service` | Parse ARCHITECTURE.md + PLAN_ACTION.md via LLM (fournisseur configuré par l'utilisateur via `ptf config set-llm`), genere l'arbre de taches avec context/objective/deliverable/outOfScope/verificationSteps, verifie la coherence des dependances |
| `documentGenerator.service` | Interview interactif (`ptf describe`), corrections guidées (`ptf fix-docs`), génération templates locaux (`ptf scaffold`), validation format PTF — orchestrateur du flow pré-création non-IA |
| `ChainRegistry` | Selectionne dynamiquement le ChainAdapter selon la chaîne du projet |
| `ReputationAggregator` | Unifie les scores de reputation de tous les wallets lies d'un dev (multi-chaine) |
| `CrossChainBridge` | Bridge PTF Credits entre chaines via LayerZero (ou equivalent) |
| `GraphIndexer` | Requetes The Graph multi-chaine (un subgraph par chaine), aggregation backend |
| `DecentralizedStorage` | Upload/lecture Arweave (ARCHITECTURE.md, PLAN_ACTION.md — permanent) + IPFS ; hash ancre on-chain |
| `ReportService` | Gestion des signalements (`ptf report`) — reception, analyse automatique, escalade PTF, historique |
| `CurrencyConverter` | Conversion multi-devises (EUR, ETH, BTC, USDT...) vers USDC via oracle Chainlink, frais 0.5%, taux garanti 60s |
| `NetworkBroadcast` | Publication et mise a jour des Merkle roots + adresses officielles PTF dans le reseau decentralise ; signature PTF sur chaque broadcast |

### CLI PTF

```bash
# --- Création des documents PTF (Mode 2 — Interactif) ---
ptf scaffold --name "mon-projet"                       # Templates vides localement (Mode 2)
ptf scaffold --github owner/repo --name "mon-projet"   # Templates pré-remplis depuis repo (Mode 2)
ptf describe                                            # Interview interactif → génère les fichiers (Mode 2)
ptf fix-docs                                            # Corrections guidées après validate-docs (Mode 2)
# Mode 3 — depuis votre éditeur IA : /ptf-architect "description du projet"

# --- Flow pré-création de projet ---
# Valider les docs AVANT ptf init (ordre canonique)
ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
                            # ETAPE 1 — Toujours avant ptf init

# Mode 4 — Import depuis GitHub Issues
ptf import-issues --repo owner/repo --label "help wanted"
                            # Génère des tâches PTF depuis les issues GitHub en < 15 minutes
                            # ptf validate-docs en mode non-bloquant pour le 1er projet

# Cas 1 — lier un repo GitHub existant
ptf init --name "mon-projet" --type public --reward free --chain polygon --github owner/repo
                            # Projet open source sans reward (public free)
                            # → Hash(owner + name + timestamp) sauvegarde dans .ptf/config.json
ptf init --name "mon-projet" --type public --reward paid --chain ethereum --token USDC --github owner/repo
                            # Projet public remunere (public paid) sur Ethereum
# Cas 2 — lier son propre serveur git
ptf init --name "mon-projet" --type private --chain bsc --token USDT --server https://git.enterprise.com/repo
                            # Projet prive + serveur propre (PTF Agent installe chez le createur)
# Cas 3 — sans depot (PTF cree un repo temporaire)
ptf init --name "mon-projet" --type private
                            # Projet prive sans depot (chaîne par défaut)
                            # → "Aucun depot fourni. Un repo temporaire PTF sera cree. Sync auto a votre connexion."
ptf config set-llm anthropic --key sk-ant-...  # Configurer son LLM (optionnel avant generate)
ptf config set-llm openai --key sk-...         # OpenAI
ptf config set-llm ollama --url http://localhost:11434  # Ollama self-hosted, gratuit
ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
                            # Generer l'arbre de taches depuis les 2 MD (agent LLM)
                            # LLM = abonnement de l'utilisateur, 0 coût PTF
                            # → Affiche estimation (nb taches, reward pool, commission) + demande confirmation
ptf tasks preview --project <projectId>
                            # Revue humaine des taches generees avant publication
ptf tasks publish --project <projectId>
                            # Paiement upfront USDC → EscrowVault + publication reseau PTF

# --- Gestion de projet ---
ptf auth                    # Lier GitHub OAuth + wallet (toute chaîne supportée)
ptf link                    # Associer un repo GitHub a un projet PTF
ptf push                    # Publier des taches (fichier JSON/YAML vers PTF)

# --- Listing projets et taches ---
ptf projects list                             # Tous les projets (prives anonymises automatiquement)
ptf projects list --type public               # Projets publics uniquement
ptf projects list --mine                      # Ses propres projets avec leurs IDs
ptf project info                              # Dans le repertoire → affiche le project_id local
ptf tasks list                                # Taches disponibles (tous projets)
ptf tasks list --min-reward 50 --skill typescript  # Filtrer par reward et competence
ptf tasks list --project <id>                 # Taches d'un projet specifique

# --- Listing contributeurs (projets publics uniquement) ---
ptf contributors list <projectId>             # Liste des contributeurs d'un projet public
ptf contributors verify <projectId> <address> # Verifier si une adresse est contributeur

# --- Workflow developpeur ---
ptf tasks list              # Lister les taches disponibles (filtres : reward, complexity...)
ptf task show <id>          # Detail complet d'une tache
                            # [paid] verifie solde >= 10 PTF en premier
                            # [free] pas de verification solde
                            # (punishments, deadline, verificationSteps, reward, contraintes, langue)
ptf task claim <id>         # Reclamer la tache :
                            # → Verification wallet (6 criteres)
                            # → Verification claimCriteria
                            # → Affiche conditions completes + confirmation [o/N]
                            # → Si confirme : attribution + signature EIP-712 automatique + on-chain
ptf tasks mine              # Voir toutes ses taches reclamees (tous projets)
ptf tasks mine --status in_progress
                            # Filtrer par statut
ptf tasks mine --project <projectId>
                            # Filtrer par projet
ptf task cancel <id>        # Abandonner une tache reclamee
                            # [free] abandon libre, penalite reputation si > 50% duree ecoulee
                            # [paid] penalite lateDelivery si > 50%, soft-lock toujours libere
ptf submit <id>             # Soumettre une tache (branch + commit hash)
ptf status <id>             # Suivre la validation en cours

# --- Wallet ---
ptf wallet                  # Consulter solde credits + soft-locked + historique
ptf wallet deposit          # Deposer des credits PTF
ptf wallet verify <address> # Verifier la signature EIP-712 des credits d'une adresse
ptf wallet status           # Etat detaille : 6 verifications (format, activite, gas natif, PTF, ban, ownership)
ptf wallet withdraw         # Convertir credits → USDC wallet ou fiat
ptf wallet link --chain ethereum --address 0x...  # Lier un wallet d'une autre chaîne
ptf wallet link --chain solana --address ...       # Lier un wallet Solana
ptf wallet chains            # Voir ses wallets par chaîne et leurs soldes
ptf wallet bridge --from polygon --to ethereum --amount 50  # Bridge PTF Credits entre chaines

# --- Synchronisation repo (Cas 3 — repo temporaire PTF) ---
ptf sync status --project <projectId>   # Etat de la sync (pending_sync, synced, error)
ptf sync pull --project <projectId>     # Sync manuelle (createur)
ptf sync pending --project <projectId>  # Soumissions en attente de sync
```

> **Note :** le `project_id` est généré automatiquement par `ptf init` et stocké dans `.ptf/config.json` avec la chaîne choisie (`chain`). La langue configurée à l'init est une condition affichée au dev lors du claim (ex : `Langue requise : TypeScript 5.0+`). La vérification du solde >= 10 PTF est la première barrière, déclenchée dès `ptf task show` — **uniquement pour les projets paid** (public paid et private). Les projets free ignorent cette vérification. Tout appel blockchain passe par le `ChainAdapter` — jamais de référence directe à une chaîne dans les services métier.

---

## Flux complet

```
[Entreprise / Mainteneur — Phase pré-création]
    |
    ├─ Créer ARCHITECTURE.md + PLAN_ACTION.md — 3 modes :
    |
    |   Mode 1 — Expert
    |     Rédiger manuellement depuis les templates PTF
    |
    |   Mode 2 — Interactif (vibecoder sans IA)
    |     ptf scaffold --name "mon-projet"       → templates vides localement
    |     ptf scaffold --github owner/repo       → pré-rempli depuis repo GitHub
    |     ptf describe                            → interview guidé → fichiers générés
    |     ptf fix-docs                            → corrections ciblées après validate-docs
    |
    |   Mode 3 — IA-assisté ⭐ recommandé
    |     /ptf-architect "description" dans éditeur IA
    |     → IA génère ARCHITECTURE.md + PLAN_ACTION.md conformes PTF
    |     ptf validate-docs                       → filet de sécurité
    |
    |   Exigences : specs mesurables ("latence < 200ms P95", "coverage > 80%")
    |   Eviter : "ameliorer les perf", "refactoriser le code"
    |        ↓
    ├─ ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
    |   → Verifie que les 2 MD respectent le format PTF (sections obligatoires)
    |   → TOUJOURS AVANT ptf init
    |        ↓
    ├─ ptf init --name "mon-projet" --type public --reward free --chain polygon --github owner/repo  # open source
    |   ptf init --name "mon-projet" --type public --reward paid --chain ethereum --token USDC --github owner/repo # public remunere
    |   ptf init --name "mon-projet" --type private --chain bsc --token USDT --server https://git.enterprise.com/repo # serveur propre
    |   ptf init --name "mon-projet" --type private               # sans depot → repo temporaire PTF (chaîne par défaut)
    |   → ProjectID genere : Hash(owner + name + timestamp)
    |   → Sauvegarde dans .ptf/config.json (avec projectType, repoUrl ou repoMode, chain)
    |        ↓
    ├─ ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
    |   → Agent LLM parse les 2 MD
    |   → Genere l'arbre de taches avec IDs crypto chaines
    |   → Remplit context, objective, deliverable, outOfScope, verificationSteps
    |   → Calcule dependances et recompenses suggerees
    |   → Affiche estimation (nb taches, reward pool, commission) + demande confirmation
    |        ↓
    ├─ ptf tasks preview --project <projectId>
    |   → Revue humaine des taches generees
    |        ↓
    ├─ ptf tasks publish --project <projectId>
    |        ↓
    |   [paid] Systeme calcule cout total (somme rewards + commission PTF selon grille : 12%/10%/8%)
    |          Paiement UPFRONT (USDC/token → EscrowVault sur la chaîne du projet)
    |   [free] Pas de calcul de cout, pas d'escrow, pas de commission
    |        ↓
    |   Arbre de taches Merkle construit et ancre on-chain
    |   Taches pushees dans le reseau PTF decentralise
    |   (visibles a tous ; metadonnees seules si projet prive)
    |
[Developpeur]
    |
    ├─ ptf tasks list / ptf projects list (prives : anonymises)
    ├─ ptf task show <taskId>
    |   [paid] Verifie immediatement : solde PTF >= 10 credits
    |          Si insuffisant → erreur "Solde insuffisant. Minimum 10 PTF requis."
    |   [free] Pas de verification solde
    |   → Si ok → affiche detail complet (punishments, deadline, verificationSteps,
    |              reward, contraintes, langue requise)
    |        ↓
    ├─ ptf task claim <taskId>
    |        ↓
    |   Verification wallet (6 criteres : format EIP-55, activite on-chain,
    |   MATIC > 0.01, PTF >= 10, non banni, ownership prouve)
    |   Verification claimCriteria (minReputation, minCompletedTasks,
    |   requiredSkills, maxActiveTasks) — librement configures par le responsable
    |   [paid] Garantie 10 PTF verifiee, escrow actif, credits soft-locked
    |   [free] Pas de garantie solde, pas d'escrow
    |   → Si ok → affiche conditions completes + confirmation interactive [o/N]
    |   → Si confirme → attribution + signature EIP-712 automatique + enregistrement on-chain
    |   Anti-collision : Redis distributed lock + transaction blockchain atomique
    |   (impossible que 2 devs clament la meme tache simultanement)
    |   Timer demarre : deadline = claimedAt + duration (defaut 30j)
    |        ↓
    ├─ statut : open → claimed
    ├─ ptf tasks mine          → voir ses taches reclamees (tous projets)
    ├─ ptf task cancel <taskId> → abandonner une tache reclamee
    |   [free] abandon libre, penalite reputation si > 50% duree ecoulee
    |   [paid] penalite lateDelivery si > 50%, soft-lock toujours libere
    ├─ (travail dans sandbox ou repo local)
    ├─ ptf submit <taskId> --branch feat/impl
    |   PTF enregistre : commitHash + branchRef (metadonnees) — jamais le code soumis
    |   (punishment lateDelivery si soumission apres deadline)
    |        ↓
    |   [Validation automatique — verificationSteps]
    |   PTF Agent (chez le createur) recoit les metadonnees de soumission
    |   Execute les tests localement → renvoie uniquement les resultats (pass/fail)
    |   Execution de chaque verificationStep (commandes exactes definies dans la tache)
    |   Tache complete si et seulement si TOUS les verificationSteps passent
    |   Tests d'acceptance + contraintes (maxFiles, coverage, patterns interdits)
    |   punishment criticalBug / nonCriticalBug si defauts detectes
    |   [paid] penalites credits + reputation ; [free] penalites reputation uniquement
    |        ↓
    |   [Peer Review — si tests passent]
    |   3 reviewers Expert tires au sort (seuil eligibilite : >= 2000 pts)
    |        ↓
    |   [Validation client / mainteneur]
    |   → Auto-approbation apres 72h si silence du client
    |        ↓
    |   Credits PTF mintes (EscrowVault → CreditToken → wallet dev, sur la chaîne du projet)
    |   Credits signes EIP-712 — verifiables via ptf wallet verify
    |   Reputation mise a jour on-chain + agregation cross-chaine (ReputationAggregator)
    |
[Recharge de compte (dev)]
    |
    ├─ ptf wallet deposit --chain polygon --amount 50 --token USDC
    |   → NetworkBroadcast recupere le Merkle root réseau PTF actuel
    |   → Verification de l'adresse officielle PTF via preuve Merkle
    |   → Si verifiee → transfert vers adresse officielle PTF
    |   → Confirmation on-chain → CurrencyConverter credite en PTF
    |
    ├─ ptf wallet deposit --currency ETH --amount 0.1
    |   → CurrencyConverter : ETH → USDC via oracle Chainlink
    |   → Frais ~0.5%, taux garanti 60s
    |   → USDC → PTF credits credites
    |
[En cas de conflit]
    |
    ├─ Niveau 1 : Verification automatique du motif de refus
    ├─ Niveau 2 : Peer review (3 Experts) si motif subjectif/invalide
    └─ Niveau 3 : Arbitrage DAO (vote pondere par reputation)
```

---

## Stratégie de bootstrapping

### Phase seed (Mois 1–3)

```
→ Invitation de mainteneurs OSS existants à créer leurs projets sur PTF
→ Beta fermée avec développeurs actifs
→ Projets PTF internes créés seulement si nécessaire (pas 50 projets obligatoires)
→ Programme Fast-Track Reputation : 100 pts initiaux sur dossier LinkedIn+GitHub vérifié
→ Programme Welcome Credits : 10 PTF offerts aux 1 000 premiers inscrits
→ Mode bootstrap DAO : panel équipe PTF pour les litiges (jusqu'à 100 devs Expert)

Les projets OSS invités apportent une communauté et des contributions réelles dès le lancement.
```

**Budget seed USDC estimé :**
- Welcome Credits 1 000 inscrits × 10 PTF = 10 000 USDC
- Projets internes PTF si nécessaire (reward moyen 500 USDC) = variable
- Commission exonérée pendant la phase seed
- **Total USDC : ~10 000 USDC + éventuels projets internes**

**Budget global seed révisé (capital à lever) : €190k–300k**
- Salaires 4 devs × 6 mois : €150k–200k
- Audit smart contracts : €30k–80k
- Infrastructure 12 mois : ~€600–1 500
- Marketing : €10k–20k

---

## Prochaines etapes de developpement

### Phase 1 — Smart Contracts (semaines 1-4)

```bash
# Setup environnement EVM
npm install --global hardhat
npx hardhat init

# Ordre d'implementation EVM (Solidity)
1. contracts/evm/CreditToken.sol        ← ERC-20 simple, base de tout
2. contracts/evm/ReputationRegistry.sol ← Stockage scores, lecture par les autres
3. contracts/evm/EscrowVault.sol        ← Logique de paiement, interagit avec CreditToken
4. contracts/evm/ProjectRegistry.sol    ← Orchestrateur principal, ancrage Merkle

# Déploiement multi-chaîne EVM
# → Deploy sur chaque testnet (Polygon Mumbai, Ethereum Sepolia, BSC testnet, etc.)
# → Script de déploiement paramétré par chaîne
# → Vérification contrats sur explorateurs (Polygonscan, Etherscan, BscScan...)
# → Deploy sur mainnets après validation testnet

# Setup environnement Solana
anchor init ptf-solana

# Ordre d'implementation Solana (Rust/Anchor)
1. contracts/solana/credit_token/       ← SPL token PTF credits
2. contracts/solana/reputation_registry/ ← Scores reputation
3. contracts/solana/escrow_vault/        ← Gestion fonds + punishments
4. contracts/solana/project_registry/    ← Enregistrement projets + Merkle

# Tests unitaires obligatoires pour chaque contrat (EVM : Hardhat ; Solana : anchor test)
```

### Phase 2 — Backend Node.js + TypeScript (semaines 5-12)

```bash
# Setup
npm init && npm install typescript apollo-server prisma ethers @solana/web3.js redis

# Ordre d'implementation
1. Schema Prisma (Project + champ chain, Task, User, ValidationRecord, PunishmentRecord, WalletLink)
2. BAL — Blockchain Abstraction Layer :
   a. Interface ChainAdapter (méthodes : deployContract, callContract, getBalance, mintTokens, bridgeTokens...)
   b. ChainRegistry (sélection dynamique d'adapter selon chain du projet)
   c. Adapters EVM : PolygonAdapter, EthereumAdapter, BSCAdapter, AvalancheAdapter, ArbitrumAdapter, BaseAdapter
   d. SolanaAdapter (Rust/Anchor via @solana/web3.js)
3. Services metier (project → task → escrow → validation) — tous via ChainAdapter, jamais directement on-chain
4. reputationAggregator.service (agrégation cross-chaîne, wallets liés du dev)
5. crossChainBridge.service (LayerZero ou équivalent — bridge PTF Credits entre chaînes)
6. graphIndexer.service (The Graph multi-chaîne — un subgraph par chaîne, agrégation backend)
7. decentralizedStorage.service (Arweave upload/lecture, IPFS, hash ancré on-chain)
8. timer.service (gestion deadlines, countdown, alertes expiration)
9. punishment.service (detection infractions, calcul penalites, execution on-chain via ChainAdapter)
10. taskGenerator.service (parse ARCHITECTURE.md + PLAN_ACTION.md via LLM, genere arbre taches)
11. sync.service (repo temporaire PTF, detection reconnexion createur, sync automatique)
12. Schema GraphQL + resolvers
13. Service sandbox (coordination Docker API + gVisor — ne stocke pas le code)
14. Service dispute (workflow 3 niveaux)
```

### Phase 3 — CLI PTF (semaines 11-14)

```bash
# Ordre d'implementation
1. auth.ts               ← GitHub OAuth flow + wallet connect
2. tasks.ts              ← Query GraphQL taches disponibles
                            ptf tasks list (--min-reward, --skill, --project)
                            ptf tasks mine (--status, --project) avec countdown
3. task-show.ts          ← Detail complet d'une tache
                            [paid] Verifie solde >= 10 PTF en premier (barriere #1)
                            [free] Pas de verification solde
                            → Affiche conditions completes (punishments, deadline,
                              verificationSteps, reward, contraintes, langue requise)
4. claim.ts              ← Mutation claim interactive :
                            → Verification wallet (6 criteres)
                            → Verification claimCriteria
                            → Affichage conditions completes + confirmation [o/N]
                            → Si confirme : attribution + signature EIP-712 automatique + on-chain
                            (l'acceptation est integree dans le flow de claim)
5. tasks-mine.ts         ← ptf tasks mine : vue multi-projets des taches reclamees
                            Affiche : taskId, projectName (anonymise si prive), titre,
                            statut, deadline, jours restants, reward, langue
6. submit.ts             ← Upload diff/branch + trigger validation
7. wallet.ts             ← Balance + soft-locked + withdraw flow + deposit
                            ptf wallet verify (EIP-712)
                            ptf wallet status (6 verifications : format, activite, MATIC, PTF, ban, ownership)
8. init.ts               ← Creation projet (flow entreprise) :
                            ptf init --name "mon-projet" --type public --reward free --github owner/repo
                            ptf init --name "mon-projet" --type public --reward paid --github owner/repo
                            ptf init --name "mon-projet" --type private --server https://git.enterprise.com/repo
                            ptf init --name "mon-projet" --type private  # Cas 3 : repo temporaire PTF
                            → Genere ProjectID = Hash(owner + name + timestamp)
                            → Sauvegarde dans .ptf/config.json avec projectType + repoUrl/repoMode
9. project-info.ts       ← ptf project info : affiche le project_id local depuis .ptf/config.json
10. push.ts              ← Upload taches JSON/YAML (avec duration, claimCriteria, punishments)
11. projects.ts          ← ptf projects list (--type public/private, --mine) avec anonymisation auto projets prives
12. contributors.ts      ← ptf contributors list <projectId> + ptf contributors verify <projectId> <address>
                            Erreur PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN pour projets prives
13. validate-docs.ts     ← Lecture ARCHITECTURE.md + PLAN_ACTION.md, verification format PTF strict
                            ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
14. generate.ts          ← Appel TaskGeneratorService (LLM) → generation arbre de taches
                            ptf generate --project <projectId> --architecture ... --plan ...
                            → Affiche estimation + demande confirmation
15. preview.ts           ← Affichage interactif des taches generees pour revue humaine
                            ptf tasks preview --project <projectId>
16. publish.ts           ← Depot escrow + publication projet sur le reseau PTF
                            ptf tasks publish --project <projectId>
17. sync.ts              ← Gestion sync repo temporaire (Cas 3)
                            ptf sync status --project <projectId>
                            ptf sync pull --project <projectId>
                            ptf sync pending --project <projectId>
18. scaffold.ts          ← Génération des templates PTF localement
                            ptf scaffold --name "mon-projet"
                            ptf scaffold --github owner/repo --name "mon-projet"
19. describe.ts          ← Interview interactif → génère ARCHITECTURE.md + PLAN_ACTION.md
                            ptf describe
                            (appelle documentGenerator.service)
20. fix-docs.ts          ← Corrections guidées post validate-docs
                            ptf fix-docs
                            (appelle documentGenerator.service pour corriger les erreurs détectées)
```

### Phase 4 — Frontend Next.js (semaines 15-20) — V0.1.0 TERMINÉ ✅

```bash
# V0.1.0 MVP — implémenté
✅ /login + /register       ← Auth pages (email + mot de passe)
✅ /onboarding              ← Wizard OTP (123456) → GitHub OAuth → wallet EIP-712 RainbowKit
✅ /tasks                   ← Marketplace taches avec filtres (statut/priorité/reward)
✅ /tasks/[id]              ← Detail tache complet
✅ /dashboard               ← Dashboard dev protégé (middleware Edge → /login)
✅ /profile/[address]       ← Profil public developpeur

# V0.5.0 — restant à faire
🔴 /project/new             ← Wizard creation projet + depot escrow
🔴 /project/:id             ← Suivi projet createur (taches, devs, escrow)
🔴 /wallet                  ← Solde PTF, soft-locks, depot, retrait, bridge
🔴 /leaderboard             ← Top devs par reputation

# Stack frontend V0.1.0
# Next.js 14.2.5 App Router + TailwindCSS dark theme
# Apollo Client 3 + wagmi v2 + RainbowKit + Zustand + MSW 2
# http://localhost:3000 (npm run dev depuis frontend/)
```

---

## Checklist de developpement

### Smart Contracts

**EVM (Solidity — contracts/evm/)**
- [ ] `CreditToken.sol` — ERC-20, minting restreint, burning sur retrait, **signature EIP-712**, bridge cross-chaîne ; **precision float64, 6 decimales (uint256 × 10^6 on-chain), minimum retrait 1.0 PTF**
- [ ] `ReputationRegistry.sol` — scores par wallet, non transferable
- [ ] `EscrowVault.sol` — depot USDC/token, liberation conditionnelle, remboursement, **execution punishments crédits** (projets paid uniquement) ; **distribution 80% tresorerie PTF / 20% fonds projet** (regle immutable on-chain)
- [ ] `EscrowVault.sol` — **nonReentrant** sur toutes les fonctions manipulant des fonds (OpenZeppelin)
- [ ] `EscrowVault.sol` — **pattern checks-effects-interactions** obligatoire
- [ ] `EscrowVault.sol` — **SafeERC20** obligatoire pour tous les transferts de tokens
- [ ] `ProjectRegistry.sol` — ID crypto, Merkle root, acces controle, **flag projectType (free/paid) + chain stockés on-chain** ; **immutabilite des taches : modification/suppression interdite si statut != open**
- [ ] **EIP-712** : nonces par `(devAddress, taskId)` + `chainId` dynamique (EIP-155) + `deadline` sur chaque signature
- [ ] **Logique free/paid dans EscrowVault** : activer escrow uniquement si `projectType == paid` ; ignorer pour `free`
- [ ] **Logique free/paid dans punishment.service** : debiter credits uniquement si `projectType == paid` ; penalites reputation uniquement si `free`
- [ ] **Logique garantie 10 PTF** : verifier solde uniquement pour les taches paid (avant `ptf task show`)
- [ ] Tests unitaires Hardhat (couverture > 95%)
- [ ] Tests anti-collision (race condition, double claim)
- [ ] **Audit externe obligatoire avant mainnet** (Certik, Trail of Bits ou equivalent)
- [ ] Deploy sur testnets 3 mois minimum avant mainnet
- [ ] Script de deploiement parametré par chaîne (Polygon, Ethereum, BSC, Avalanche, Arbitrum, Base)
- [ ] Deploy sur testnets (Polygon Mumbai, Ethereum Sepolia, BSC testnet...)
- [ ] Deploy sur mainnets EVM

**Solana (Rust/Anchor — contracts/solana/)**
- [ ] `credit_token/` — SPL token PTF (1:1 USDC), minting restreint, bridge cross-chaîne
- [ ] `reputation_registry/` — scores par adresse Solana, non transferable
- [ ] `escrow_vault/` — gestion fonds SOL/USDC, liberation conditionnelle, punishments
- [ ] `project_registry/` — ID crypto, Merkle root, flag projectType
- [ ] Tests anchor test (couverture > 95%)
- [ ] Deploy sur Solana devnet + validation
- [ ] Deploy sur Solana mainnet

### Backend
- [ ] Schema Prisma + migrations PostgreSQL (inclure `duration`, `claimedAt`, `punishments`, `claimCriteria`, `context`, `objective`, `deliverable`, `outOfScope`, `verificationSteps`, `chain`, modeles `TaskAcceptance`, `ContributorRecord`, `WalletLink`)
- [ ] **BAL — Interface `ChainAdapter`** : méthodes abstraites (deployContract, callContract, getBalance, mintTokens, burnTokens, bridgeTokens, getReputation, setReputation...)
- [ ] **BAL — `ChainRegistry`** : sélection dynamique d'adapter selon `chain` du projet ; register/unregister adapters
- [ ] **BAL — Adapters EVM** : `PolygonAdapter`, `EthereumAdapter`, `BSCAdapter`, `AvalancheAdapter`, `ArbitrumAdapter`, `BaseAdapter` (ethers.js)
- [ ] **BAL — `SolanaAdapter`** : Rust/Anchor via `@solana/web3.js`
- [ ] `project.service` (chaîne du projet stockée, tous appels via ChainAdapter) + tests
- [ ] `task.service` (calcul hash Merkle, push reseau PTF) + tests
- [ ] `escrow.service` (ecoute evenements on-chain via ChainAdapter) + tests
- [ ] `validation.service` (pipeline tests auto, execution verificationSteps) + tests
- [ ] `reputation.service` (ecriture on-chain via ChainAdapter) + tests
- [ ] **`reputationAggregator.service`** (agrégation cross-chaîne — wallets liés du dev, score global unifié) + tests
- [ ] **`crossChainBridge.service`** (LayerZero ou équivalent — bridge PTF Credits entre chaînes) + tests
- [ ] **`graphIndexer.service`** (The Graph multi-chaîne — requêtes par chaîne, agrégation backend) + tests
- [ ] **`decentralizedStorage.service`** (Arweave upload/lecture, hash ancré on-chain, IPFS) + tests
- [ ] `dispute.service` (workflow 3 niveaux) + tests
- [ ] `sandbox.service` (coordination Docker/gVisor — ne stocke pas le code soumis) + tests
- [ ] `sync.service` (repo temporaire PTF, detection reconnexion, sync automatique, nettoyage) + tests
- [ ] **Repo temporaire PTF (Cas 3)** : creation automatique si createur sans depot, statut `pending_sync`, sync a la reconnexion, nettoyage apres sync reussi
- [ ] `timer.service` (deadlines, countdown, alertes) + tests
- [ ] `punishment.service` (detection, calcul, execution on-chain via ChainAdapter) + tests
- [ ] `taskGenerator.service` (parse MD via LLM, generation arbre taches, coherence dependances) + tests
- [ ] `documentGenerator.service` (interview interactif, corrections guidées, scaffold templates, validation format PTF) + tests
- [ ] **`ReportService`** (reception signalements `ptf report`, analyse automatique, escalade PTF, historique immuable on-chain) + tests
- [ ] **`CurrencyConverter`** (oracle Chainlink multi-devises → USDC → PTF, frais 0.5%, taux garanti 60s, validation Merkle adresse avant depot) + tests
- [ ] **`NetworkBroadcast`** (publication Merkle roots + adresses officielles PTF dans le reseau, signature PTF sur chaque broadcast, verification adresse avant depot) + tests
- [ ] **Immutabilite des taches** : `task.service` rejette toute modification/suppression si statut != `open` ; verifiee aussi on-chain via `ProjectRegistry`
- [ ] **Calcul `reputationPoints`** dans `reputation.service` : (complexity + effort + impact) × 10 + bonus_duree — non configurable par le createur
- [ ] **Anti-collision** : Redis distributed lock + integration blockchain atomique
- [ ] **Acceptation on-chain integree dans claim** : signature EIP-712 automatique + enregistrement on-chain declenchés lors du `ptf task claim` (apres confirmation interactive)
- [ ] **Anonymisation projets prives** : middleware listing — nom/owner/repo masques, infos claim visibles
- [ ] **Verification wallet multi-criteres** : 6 checks (format EIP-55, activite, gas natif, PTF, ban, ownership) avant claim/accept/withdraw
- [ ] **Listing contributeurs** : `contributor.service` — restreint aux projets publics (erreur `PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN`)
- [ ] Schema GraphQL + resolvers
- [ ] Auth GitHub OAuth (Passport.js)
- [ ] Tests d'integration API

### CLI
- [ ] Commande `ptf auth`
- [ ] Commande `ptf tasks list` (`--min-reward`, `--skill`, `--project`)
- [ ] Commande `ptf tasks mine` (`--status`, `--project`) avec countdown multi-projets
- [ ] Commande `ptf task show <id>` ([paid] verifie solde >= 10 PTF en premier ; [free] pas de vérification solde ; affiche conditions completes : punishments, deadline, verificationSteps, reward, contraintes, langue)
- [ ] Commande `ptf task claim <id>` (verification wallet 6 criteres + claimCriteria + confirmation interactive + signature EIP-712 automatique + on-chain)
- [ ] Commande `ptf task cancel <id>` (abandonner une tache reclamee — penalite reputation si free + > 50% duree ; lateDelivery si paid + > 50% duree ; soft-lock toujours libere)
- [ ] Commande `ptf import-issues --repo owner/repo --label <label>` (import issues GitHub → taches PTF en < 15 min ; validate-docs non-bloquant pour le 1er projet)
- [ ] Commande `ptf submit`
- [ ] Commande `ptf status`
- [ ] Commande `ptf wallet`
- [ ] Commande `ptf wallet deposit` (dépôt via adresse officielle vérifiée par Merkle root ; `--currency` pour conversion multi-devises)
- [ ] Commande `ptf wallet convert --from <devise> --amount <n>` (conversion via CurrencyConverter + oracle Chainlink)
- [ ] Commande `ptf wallet verify <address>` (verification EIP-712)
- [ ] Commande `ptf wallet status` (6 verifications : format EIP-55, activite on-chain, gas natif > seuil, PTF >= 10, non banni, ownership)
- [ ] Commande `ptf wallet link --chain <chain> --address <address>` (lier un wallet d'une autre chaîne)
- [ ] Commande `ptf wallet chains` (voir ses wallets par chaîne et leurs soldes)
- [ ] Commande `ptf wallet bridge --from <chain> --to <chain> --amount <n>` (bridge PTF Credits entre chaînes)
- [ ] Commande `ptf wallet withdraw --amount <n> --to <address|bank>` (minimum 1.0 PTF)
- [ ] Commande `ptf report --dev <address> --reason <reason> --task <taskId> --evidence <text>` (signalement dev — raisons : malicious_code, plagiarism, fraud, harassment, spam, other)
- [ ] Commande `ptf project claimed-tasks --project <projectId>` (liste devs ayant reclamé les tâches + statut + deadline + réputation)
- [ ] Commande `ptf projects list` (`--type public/private`, `--mine`) avec anonymisation auto des projets prives
- [ ] Commande `ptf project info` (affiche le project_id local depuis `.ptf/config.json`)
- [ ] Commande `ptf contributors list <projectId>` (projets publics uniquement)
- [ ] Commande `ptf contributors verify <projectId> <address>` (projets publics uniquement)
- [ ] Commande `ptf init --name <name> --type <public|private> [--reward <free|paid>] [--chain <chain>] [--token <token>] [--github owner/repo | --server https://...]` (genere ProjectID + sauvegarde `.ptf/config.json` avec projectType + repoUrl/repoMode + chain ; sans depot = Cas 3 repo temporaire PTF ; chaîne par défaut si --chain absent)
- [ ] Commande `ptf sync status --project <id>` (etat sync repo temporaire)
- [ ] Commande `ptf sync pull --project <id>` (sync manuelle createur)
- [ ] Commande `ptf sync pending --project <id>` (soumissions en attente de sync)
- [ ] Commande `ptf push`
- [ ] Commande `ptf validate-docs --architecture ... --plan ...` (verification format PTF des 2 MD — executer AVANT ptf init ; ordre canonique : validate-docs → init → generate → tasks preview → tasks publish)
- [ ] Commande `ptf generate --project <id> --architecture ... --plan ...` (appel taskGenerator.service → arbre de taches + estimation + confirmation)
- [ ] Commande `ptf tasks preview --project <id>` (revue interactive des taches generees)
- [ ] Commande `ptf tasks publish --project <id>` (paiement upfront USDC → escrow + publication projet)
- [ ] Commande `ptf scaffold --name <name>` (génère templates PTF vides localement)
- [ ] Commande `ptf scaffold --github owner/repo --name <name>` (templates pré-remplis depuis repo GitHub)
- [ ] Commande `ptf describe` (interview interactif → génère ARCHITECTURE.md + PLAN_ACTION.md via documentGenerator.service)
- [ ] Commande `ptf fix-docs` (corrections guidées après validate-docs via documentGenerator.service)
- [ ] Binaires statiques Linux/macOS/Windows (pkg)
- [ ] Tests CLI end-to-end

### Frontend
- [x] Auth — login / register (email + mot de passe) ✅ V0.1.0
- [x] Onboarding wizard — OTP (123456) → GitHub OAuth → wallet EIP-712 RainbowKit ✅ V0.1.0
- [x] Page marketplace taches (`/tasks`) ✅ V0.1.0
- [x] Detail tache (`/tasks/[id]`) ✅ V0.1.0
- [x] Dashboard developpeur (`/dashboard`) protégé Edge middleware ✅ V0.1.0
- [x] Page profil developpeur public (`/profile/[address]`) ✅ V0.1.0
- [x] Design system dark mode crypto (violet/amber/vert) ✅ V0.1.0
- [x] Hooks : useAuth, usePTFBalance, useReputationScore, useTaskCountdown, useTaskStatusSubscription, useClaimEligibility ✅ V0.1.0
- [x] MSW 2 — 10+ taches mock, fixtures auth/profil, handlers GraphQL ✅ V0.1.0
- [ ] Page wallet (`/wallet`) — solde PTF, soft-locks, depot, retrait, bridge
- [ ] Dashboard createur (`/project/new`, `/project/:id`) — escrow + suivi avancement
- [ ] Visualisation arbre de taches projet (Merkle interactif)
- [ ] Leaderboard (`/leaderboard`) — top devs par reputation

### Infrastructure
- [ ] CI/CD GitHub Actions (test + deploy)
- [ ] Node PTF Agent certifie (pour projets prives)
- [ ] Monitoring on-chain multi-chaîne (alertes evenements contrats sur toutes les chaînes)
- [ ] Documentation API (GraphQL Playground)
- [ ] Subgraphs The Graph déployés par chaîne (Polygon, Ethereum, BSC, Avalanche, Arbitrum, Base, Solana)
- [ ] Arweave gateway configuré (lecture ARCHITECTURE.md / PLAN_ACTION.md via hash on-chain)
- [ ] Configuration LayerZero (bridge cross-chaîne PTF Credits)

**Coûts infrastructure réels PTF (hors audit et salaires) :**
- Dev : ~€5/mois (1 VPS Hetzner CX21)
- MVP : ~€20/mois (2 VPS Hetzner CX31)
- Production an 1 : ~€70–120/mois
- Scale an 2 : ~€350–450/mois

*PostgreSQL et Redis auto-hébergés sur VPS (inclus). RPC Polygon/Ethereum/BSC publics gratuits. The Graph hosted service gratuit petits volumes. Grafana Cloud free tier. Vercel free tier frontend.*

**LLM (ptf generate, ptf describe) : fourni par l'utilisateur, 0 coût PTF.** Configuration via `ptf config set-llm` (OpenAI, Anthropic, Ollama self-hosted...).

---

## Variables d'environnement (structure multi-chaîne)

```env
# ── Auth ────────────────────────────────────────────────────────────
JWT_SECRET=<random-string-32chars-min>      # obligatoire — throw au démarrage si absent
SIGNER_PRIVATE_KEY=0x<hex64>               # obligatoire en prod — clé de signature on-chain

# ── Opérateur PTF (change UTXOs + worker) ───────────────────────────
PTF_OPERATOR_PRIVATE_KEY=0x<hex64>         # obligatoire en prod — signe les change UTXOs (S9)
PTF_OPERATOR_ADDRESS=0x<address>           # adresse publique de l'opérateur (pour logs)

# ── Workers on-chain (dépôts N1 + réconciliation N3) ────────────────
RPC_WS_URL=wss://polygon-mainnet.infura.io/ws/v3/<key>  # WebSocket RPC — active le DepositWorker
RPC_HTTP_URL=https://polygon-rpc.com                    # HTTP RPC — active le ReconciliationWorker
ESCROW_VAULT_ADDRESS=0x<address>           # adresse du contrat EscrowVault déployé
RECONCILIATION_INTERVAL_MS=60000           # intervalle scan réconciliation (défaut: 60s)
RECONCILIATION_BATCH_SIZE=2000             # blocs par batch (défaut: 2000)
RECONCILIATION_START_BLOCK=0               # bloc de départ si pas de checkpoint

# ── Email (OTP nouvel appareil) ──────────────────────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@ptf.dev
SMTP_PASS=<secret>
SMTP_FROM=PTF <noreply@ptf.dev>

# ── GitHub (vérification licences) ───────────────────────────────────
GITHUB_TOKEN=<pat>          # optionnel — augmente de 60 à 5000 req/h
GITHUB_CLIENT_ID=<oauth-id>
GITHUB_CLIENT_SECRET=<oauth-secret>

# ── CORS ─────────────────────────────────────────────────────────────
CORS_ORIGIN=https://app.ptf.dev  # obligatoire en production

# ── Chaîne par défaut PTF ────────────────────────────────────────────
PTF_DEFAULT_CHAIN=polygon

# RPC par chaîne EVM
RPC_POLYGON=https://polygon-rpc.com
RPC_ETHEREUM=https://mainnet.infura.io/v3/<KEY>
RPC_BSC=https://bsc-dataseed.binance.org
RPC_AVALANCHE=https://api.avax.network/ext/bc/C/rpc
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc
RPC_BASE=https://mainnet.base.org

# RPC Solana
RPC_SOLANA=https://api.mainnet-beta.solana.com

# Adresses contrats par chaîne (EVM)
CONTRACT_PROJECT_REGISTRY_POLYGON=0x...
CONTRACT_PROJECT_REGISTRY_ETHEREUM=0x...
CONTRACT_ESCROW_VAULT_POLYGON=0x...
CONTRACT_ESCROW_VAULT_ETHEREUM=0x...
CONTRACT_CREDIT_TOKEN_POLYGON=0x...
CONTRACT_CREDIT_TOKEN_ETHEREUM=0x...
CONTRACT_REPUTATION_REGISTRY_POLYGON=0x...
CONTRACT_REPUTATION_REGISTRY_ETHEREUM=0x...
# (idem pour BSC, Avalanche, Arbitrum, Base)

# Programmes Solana
PROGRAM_PROJECT_REGISTRY_SOLANA=...
PROGRAM_ESCROW_VAULT_SOLANA=...
PROGRAM_CREDIT_TOKEN_SOLANA=...
PROGRAM_REPUTATION_REGISTRY_SOLANA=...

# The Graph (subgraph par chaîne)
GRAPH_URL_POLYGON=https://api.thegraph.com/subgraphs/name/ptf/ptf-polygon
GRAPH_URL_ETHEREUM=https://api.thegraph.com/subgraphs/name/ptf/ptf-ethereum
GRAPH_URL_BSC=https://api.thegraph.com/subgraphs/name/ptf/ptf-bsc
# (idem pour les autres chaînes)

# Stockage décentralisé
ARWEAVE_KEY_FILE=./arweave-key.json
ARWEAVE_GATEWAY=https://arweave.net
IPFS_GATEWAY=https://ipfs.io/ipfs/

# Bridge cross-chaîne (LayerZero)
LAYERZERO_ENDPOINT_POLYGON=0x...
LAYERZERO_ENDPOINT_ETHEREUM=0x...
```

---

## Contact & Liens

- **GitHub :** `github.com/ptf/ptf` (a creer)
- **Website :** `ptf.dev` (a enregistrer)
- **Discord :** `discord.gg/ptf` (a creer)
- **Twitter :** `@ptf_dev` (a creer)
- **Email :** `contact@ptf.dev` (a configurer)

---

**Statut :** Phase de conception terminée — backend opérationnel (90%), audit sécurité complet (101/101 corrigés), frontend MVP terminé. Prochaine étape : EscrowService + ValidationService + déploiement testnet.

**PTF est un écosystème cryptographique — pas seulement une plateforme. Il récompense la qualité, punit les manquements, et garantit l'intégrité de chaque transaction.**
