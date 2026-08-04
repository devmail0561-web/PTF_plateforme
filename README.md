# Parallel Task Framework (PTF)

> _La plateforme décentralisée qui monétise vos compétences_

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Polygon](https://img.shields.io/badge/Blockchain-Polygon_PoS-8247E5.svg)](https://polygon.technology/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8+-363636.svg)](https://soliditylang.org/)

**PTF** est un **écosystème cryptographique open-core** qui connecte des développeurs à des tâches rémunérées — issues de projets open source ou d'entreprises privées. Chaque tâche validée génère des **crédits PTF** (1 PTF = 1 USDC, stable) et fait progresser votre réputation on-chain. Les paiements sont garantis par smart contract : aucun intermédiaire, aucun impayé. PTF récompense la qualité — et **punit automatiquement** les manquements.

> **Architecture open-core — deux dépôts distincts :**
> - **Framework PTF** (ce dépôt, **MIT**) — CLI, contrats EVM, backend réseau. Forkable, auditable, auto-hébergeable.
> - **[PTF Service Plateforme](https://github.com/devmail0561-web/ptf_service_plateforme)** (privé) — comptes, wallet, dépôts/retraits, interface web, matching, KYC.

---

## Démarrer en 5 minutes

### Parcours Développeur

```bash
# 1. Installer la CLI PTF (~30s)
npm install -g @ptf/cli

# 2. Créer son wallet PTF (~1 min)
ptf wallet create
#   → keypair secp256k1 + seed phrase BIP-39 générés localement
#   → clé chiffrée AES-256-GCM — ne quitte jamais votre machine

# 3. Créer un compte sur le service et recharger son solde
#    → https://github.com/devmail0561-web/ptf_service_plateforme
#    → Lier votre adresse PTF depuis les paramètres du service
#    → Déposer des PTF via l'interface web (dépôt on-chain détecté automatiquement)

# 4. Se connecter au nœud PTF (~30s)
ptf auth login
#   → challenge-response EIP-712 (nonce signé localement — clé privée jamais envoyée)
#   → JWT { ptfAddress } émis

# 5. Trouver et réclamer une tâche (~1 min)
ptf tasks list --min-reward 50 --skill typescript
ptf task show <taskId>
ptf task claim <taskId>  # affiche les conditions, confirmer avec [o/N]

# 6. Travailler et soumettre
# ... coder ...
ptf submit
```

### Parcours Créateur

```bash
# 1. Installer la CLI PTF (~30s)
npm install -g @ptf/cli

# 2. S'authentifier + wallet (~1 min)
ptf auth login && ptf wallet connect

# 3a. Créer un projet depuis GitHub Issues (~3 min)
ptf import-issues --repo mon-org/mon-repo --label "help wanted"

# 3b. OU générer depuis une description via IA (~5 min)
# Lancer /ptf-architect "description de ton projet" dans ton éditeur IA
# puis valider et publier :
ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
ptf init --name "mon-projet" --type public --reward paid --chain polygon
# (Optionnel) Configurer son fournisseur LLM avant ptf generate :
# ptf config set-llm anthropic --key sk-ant-...
# ptf config set-llm openai --key sk-...
# ptf config set-llm ollama --url http://localhost:11434  # gratuit, self-hosted
ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
ptf tasks preview --project <projectId>
ptf tasks publish --project <projectId>   # paiement upfront USDC
```

---

```bash
$ ptf task claim 0xf3a9...c201

Tache : Implement rate-limiter middleware
Projet : api-gateway (public — github.com/acme/api-gateway)
Recompense : 85 PTF credits (≈ 85 USDC)
Reputation : +12 pts
Deadline : 72h
Statut : claimed → en cours...

$ ptf submit --task 0xf3a9...c201 --branch feat/rate-limiter

Soumission enregistree. Hash de commit : 0xa1b2...
Validation automatique lancee...
```

---

## Quick Start

### Installation

```bash
# macOS / Linux
curl -L https://github.com/ptf/ptf/releases/latest/download/ptf-$(uname -s)-$(uname -m) \
  -o /usr/local/bin/ptf
chmod +x /usr/local/bin/ptf

# Windows
winget install ptf
```

### Lancer la CLI

La CLI PTF dispose de son propre shell interactif. Lancez `ptf` sans arguments pour entrer dans le prompt PTF :

```bash
$ ptf

   ██████╗ ████████╗███████╗
   ██╔══██╗╚══██╔══╝██╔════╝
   ██████╔╝   ██║   █████╗
   ██╔═══╝    ██║   ██╔══╝
   ██║        ██║   ██║
   ╚═╝        ╚═╝   ╚═╝

   Pay-Task Framework   v0.1.0
   Écosystème décentralisé de tâches rémunérées

   Tapez une commande (ex: tasks, wallet, help) ou exit pour quitter.

ptf › tasks list
ptf › wallet status
ptf › exit
```

Le logo et sa couleur changent aléatoirement à chaque lancement (5 designs, 8 couleurs).

Le mode one-shot reste disponible pour les scripts et pipelines :

```bash
ptf tasks list --available    # exécute et quitte immédiatement
ptf wallet status             # pas de shell interactif
```

### Créer son compte et se connecter

```bash
# ── Étape 1 : Créer son wallet PTF ──────────────────────────────────────
ptf wallet create
# → Keypair secp256k1 + seed phrase BIP-39 générés localement
# → Keystore chiffré AES-256-GCM avec votre mot de passe
# → La clé privée ne quitte JAMAIS votre machine

# Restaurer depuis une seed phrase :
ptf wallet restore

# ── Étape 2 : Créer un compte service et recharger ──────────────────────
# → Rendez-vous sur le service PTF (ptf_service_plateforme)
# → Créez un compte email/mot de passe
# → Liez votre adresse PTF depuis les paramètres
# → Déposez des PTF via l'interface web

# ── Étape 3 : Se connecter au nœud PTF ──────────────────────────────────
ptf auth login
# → Sélectionnez votre wallet local
# → Déchiffrez avec votre mot de passe
# → Challenge-response EIP-712 : nonce signé localement
# → JWT { ptfAddress } émis — aucun mot de passe envoyé au serveur

# Mode offline :
ptf auth login --offline

# Vérifier le statut de connexion :
ptf auth status
```

> **Sécurité :** votre clé privée ne quitte jamais votre machine. Le backend framework ne stocke aucun compte email ni mot de passe. L'identité est votre adresse PTF secp256k1 — prouvée par signature à chaque connexion.

> **Garantie proportionnelle :** pour les **tâches rémunérées** (projets public paid ou private), une garantie PTF est soft-lockée au moment du claim : `clamp(reward × 10%, 10 PTF, 1000 PTF)`. Elle est retournée à la validation ou à l'annulation dans les délais. Les projets **public free** n'exigent aucune garantie.

> **Statut wallet :** `ptf wallet status` vérifie en une commande les 6 conditions requises (format EIP-55, activité on-chain, solde gas natif, solde PTF, statut de ban, ownership).

### Créer un projet (flow pré-création)

Avant de publier un projet sur PTF, le créateur rédige deux documents au **format PTF strict** (`ARCHITECTURE.md` et `PLAN_ACTION.md`). PTF propose trois modes de création selon votre profil :

**Mode 1 — Expert** : rédiger manuellement les fichiers depuis les templates PTF (recommandé si vous maîtrisez le format).

**Mode 2 — Interactif** (vibecoder sans IA) : `ptf describe` lance un interview guidé et génère les fichiers automatiquement. `ptf fix-docs` permet des corrections ciblées après `ptf validate-docs`.

**Mode 3 — IA-assisté ⭐ recommandé** : utilisez le skill `/ptf-architect` dans votre éditeur IA (Claude Code, Cursor, Copilot...). L'IA génère directement `ARCHITECTURE.md` + `PLAN_ACTION.md` conformes PTF — puis `ptf validate-docs` sert de filet de sécurité.

```
/ptf-architect "app de location d'outils, React Native + Node.js + PostgreSQL"
```

> **Skill `/ptf-architect`** : PTF expose ce skill qui injecte dans l'IA les templates, les règles de qualité (termes mesurables, interfaces typées, `verificationSteps` exécutables) et des exemples bon/mauvais. Compatible Claude Code, Cursor, Copilot et tout éditeur supportant les slash commands.

> **Note :** Les templates PTF sont conçus pour être des prompts système — donnez-les à votre IA comme contexte pour qu'elle génère des documents conformes PTF.

```bash
# 0. Choisir le mode de création des documents

# Mode 2 — Interactif :
ptf scaffold --name "mon-projet"                       # templates vides localement
ptf scaffold --github owner/repo --name "mon-projet"   # pré-rempli depuis le repo GitHub
ptf describe                                            # interview interactif → génère les fichiers

# Mode 3 — IA-assisté (depuis votre éditeur IA) :
# /ptf-architect "description du projet" → génère ARCHITECTURE.md + PLAN_ACTION.md

# Mode 4 — Import depuis GitHub Issues :
ptf import-issues --repo owner/repo --label "help wanted"
# → Génère des tâches PTF depuis les issues GitHub en < 15 minutes
# → ptf validate-docs en mode non-bloquant (warnings seulement pour le 1er projet)

# Mode 1 — Expert : éditer les templates manuellement (voir templates/markdown/)

# Templates prêts à l'emploi par secteur (utilisables avec tous les modes) :
ptf scaffold --template api-rest            # API REST Node.js/TypeScript
ptf scaffold --template cli-tool            # Outil CLI Node.js
ptf scaffold --template frontend-component  # Composant React/Next.js
ptf scaffold --template smart-contract      # Smart contract Solidity/EVM
ptf scaffold --template mobile-app          # App React Native
ptf scaffold --template python-lib          # Bibliothèque Python
# → Pré-remplit ARCHITECTURE.md + PLAN_ACTION.md avec les modules,
#   phases, contraintes et interfaces typiques du secteur

# 1. Rédiger ARCHITECTURE.md + PLAN_ACTION.md (format PTF strict)

# 2. Valider le format des deux documents MD
ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
# → ARCHITECTURE.md : OK (toutes sections obligatoires présentes)
# → PLAN_ACTION.md  : OK (toutes sections obligatoires présentes)
#
# En cas d'erreurs, ptf validate-docs affiche des messages d'aide ciblés :
# → ❌ Section "Hors-scope" manquante — ajoutez au moins 3 items explicites
# → ❌ Contrainte vague détectée : "API rapide" — préférez "API répond < 200ms P95"
# → ❌ Module "AuthService" : champ Inputs manquant — précisez les types d'entrée
# → ❌ verificationStep sans commande exécutable dans la tâche 1.2
# → ℹ  Pour corriger interactivement : ptf fix-docs

# 3. Créer le projet et générer le project_id
#    --reward free  → open source, sans rémunération USDC (public free)
#    --reward paid  → projet public rémunéré (public paid)
#    (private est toujours paid, pas de flag --reward)
#    --chain <chain> → chaîne blockchain cible (polygon par défaut)
#    --github owner/repo  → lier un repo GitHub existant (Cas 1)
#    --server https://... → lier son propre serveur git (Cas 2)
#    (sans dépôt)         → PTF crée un repo temporaire, sync auto (Cas 3)
ptf init --name "mon-projet" --type public --reward free --chain polygon --github owner/repo   # open source
ptf init --name "mon-projet" --type public --reward paid --chain ethereum --token USDC --github owner/repo   # public rémunéré
ptf init --name "mon-projet" --type private --chain bsc --token USDT --server https://git.enterprise.com/repo  # privé + serveur propre
ptf init --name "mon-projet" --type private                 # privé sans dépôt → repo temporaire PTF (chaîne par défaut)
# → "Aucun dépôt fourni. Un repo temporaire PTF sera créé. Sync auto à votre connexion."
# → ProjectID généré automatiquement : Hash(owner + name + timestamp)
# → Affiché à l'écran + sauvegardé dans .ptf/config.json

# 4. Générer l'arbre de tâches depuis les deux documents (agent LLM)
ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
```

```
╔══════════════════════════════════════════════════════════╗
║  PTF — Estimation du projet                             ║
╠══════════════════════════════════════════════════════════╣
║  Tâches estimées      : ~47 tâches                      ║
║  Effort total estimé  : ~320 heures-dev                 ║
║  Reward pool suggéré  : 8,500 USDC                      ║
║  Gas reserve (incluse): ~10 USDC                        ║
║  Commission PTF (10%) : 851 USDC  (grille 5k–50k)      ║
║  Total à déposer      : 9,361 USDC                      ║
║    = rewardPool + gasReserve + commission PTF           ║
╠══════════════════════════════════════════════════════════╣
║  Ratio effort/récompense : ✅ Attractif (18 USDC/h)     ║
╚══════════════════════════════════════════════════════════╝
```

```bash
# → Confirmation demandée (nombre de tâches, reward pool, commission)

# 5. Relire les tâches générées avant publication
ptf tasks preview --project <projectId>
# → Interface de revue humaine des tâches générées

# 6. Déposer escrow + publier dans le réseau PTF
ptf tasks publish --project <projectId>
# → Paiement upfront USDC → EscrowVault
# → Dépôt = rewardPool + gasReserve + commission PTF
#   (les gas fees sont incluses dans le dépôt initial du créateur, pas un coût PTF séparé)
# → 47 tâches disponibles dans le réseau PTF
```

> **Note :** le `project_id` est généré automatiquement à la création du projet (`ptf init`) et stocké dans `.ptf/config.json`. Pour retrouver ses projets : `ptf projects list --mine` ou `ptf project info` (dans le répertoire du projet).

> **Exigences sur les documents d'entrée :** les spécifications doivent être précises et vérifiables. **Éviter** : "améliorer les performances", "refactoriser le code". **Préférer** : "latence < 200ms sur P95", "couverture tests > 80%".

### Reclamer et soumettre une tâche

```bash
# Parcourir les taches et projets disponibles
ptf tasks list                                      # lister les taches disponibles
ptf tasks list --available --min-reward 50          # filtrer par reward minimum
ptf tasks list --skill typescript                   # filtrer par competence
ptf tasks list --project <projectId>               # taches d'un projet specifique
ptf projects list                                   # tous les projets (prives : anonymises)
ptf projects list --type public                     # publics uniquement

# Etape 1 — Lister les taches disponibles
ptf tasks list

# Etape 2 — Voir le detail complet d'une tache
# (punishments, deadline, verificationSteps, reward, contraintes)
# [paid] → Vérifie immédiatement : solde PTF >= garantie requise (10% reward, min 10 PTF)
#          → Si insuffisant → erreur "Solde insuffisant. Garantie requise : X PTF."
# [free] → Pas de verification solde, affiche directement les conditions
ptf task show 0xf3a9...c201

# Etape 3 — Reclamer la tache
# → Verification wallet (6 criteres)
# → Verification claimCriteria
# → Si ok → affiche conditions completes + confirmation interactive
# → Dev tape [o/N]
# → Si confirme → attribution + signature EIP-712 automatique + on-chain
ptf task claim 0xf3a9...c201

# Etape 4 — Voir ses taches reclamees (tous projets)
ptf tasks mine
ptf tasks mine --status in_progress
ptf tasks mine --project <projectId>

# (travailler sur le code...)

# Abandonner une tache reclamee
ptf task cancel 0xf3a9...c201
# → Projet free : abandon libre, pénalité réputation si > 50% durée écoulée
# → Projet paid : pénalité lateDelivery si > 50%, soft-lock toujours libéré

# Soumettre
ptf submit --task 0xf3a9...c201 --branch feat/mon-impl

# Suivre la validation
ptf status --task 0xf3a9...c201
# → Tests auto : PASS
# → Peer review : en attente (2/3 reviewers)
# → Credits : en cours de minting...
```

```bash
# Synchronisation repo (Cas 3 — créateur avec repo temporaire PTF)
ptf sync status --project <projectId>   # état de la sync (pending, synced, error)
ptf sync pull --project <projectId>     # sync manuelle (créateur)
ptf sync pending --project <projectId>  # soumissions en attente de sync
```

> **Barrière solde (projets paid uniquement) :** avant d'afficher les conditions d'une tâche rémunérée, PTF vérifie que le solde couvre la garantie requise (`reward × 10%`, min 10 PTF, max 1000 PTF). Si insuffisant : `❌ Solde insuffisant. Garantie requise : X PTF. Déposez des crédits : ptf wallet deposit`. Pour les projets **public free**, cette vérification est ignorée.

> **Signature integree :** `ptf task claim` inclut la verification des conditions et la signature cryptographique EIP-712 de votre wallet dans une seule etape interactive. L'acceptation couvre : punishments, deadline, verificationSteps, reward et contraintes. Elle est enregistree on-chain et **ne peut pas etre contestee apres coup.**

---

## Types de projets

PTF distingue trois modes de projet avec des règles différentes :

| Règle | Public free | Public paid | Private |
|---|---|---|---|
| Reward PTF (1 PTF = 1 USDC) | Non | Oui | Oui |
| Garantie proportionnelle (10% reward, min 10, max 1000 PTF) | Non | Oui | Oui |
| Pénalité crédits | Non | Oui | Oui |
| Pénalité réputation | Oui | Oui | Oui |
| Escrow | Non | Oui | Oui |
| Commission PTF | Non | Oui | Oui |

### Projets publics free (open source)

Les dépôts GitHub publics peuvent être enregistrés sur PTF par leurs mainteneurs en mode **free** : contribution open source sans reward USDC. Aucun escrow, aucune garantie de solde requise. Les pénalités se limitent à la réputation.

```bash
# Mainteneur : enregistrer un repo open source (sans reward)
ptf init --name "mon-projet" --type public --reward free --chain polygon

# Creer des taches liees au repo
ptf task create --project 0xProjectId \
                --title "Fix documentation typos" \
                --complexity 1 \
                --duration 7d
```

### Projets publics paid

Les dépôts GitHub publics peuvent également proposer des tâches rémunérées. Les règles d'escrow, de garantie et de pénalités crédits s'appliquent comme pour les projets privés.

```bash
# Mainteneur : projet public avec reward
ptf init --name "mon-projet" --type public --reward paid --chain ethereum --token USDC

# Creer des taches remunérees
ptf task create --project 0xProjectId \
                --title "Implement rate-limiter middleware" \
                --reward 85 \
                --complexity 3 \
                --duration 30d
```

### Projets prives (entreprises)

Les entreprises peuvent poster des taches sur du code propriétaire. Le développeur ne reçoit que **l'interface, les types, les tests d'acceptance et la spec** — jamais le code source interne. Le travail s'effectue dans un **sandbox Docker/gVisor éphémère** fourni par PTF. La validation est réalisée par un **PTF Agent** certifié déployé dans l'infrastructure de l'entreprise : il reçoit les métadonnées de soumission (commitHash, branchRef), exécute les tests localement, et renvoie uniquement les résultats signés cryptographiquement — jamais le code soumis.

> **Anonymisation des projets privés :** dans les listings (`ptf projects list`), les projets privés sont automatiquement anonymisés : nom → `"Private Project #xxxx"`, owner → `"0x****...****"`, repo → `null`. Les tâches de ces projets affichent un `projectName` anonymisé. En revanche, les informations de claim restent toujours visibles (reward, duration, claimCriteria, stack).

```bash
# Entreprise : creer un projet prive avec serveur propre (Cas 2)
ptf init --name "payment-service-v2" --type private --server https://git.enterprise.com/repo
# → ProjectID genere + sauvegarde dans .ptf/config.json

# Entreprise : creer un projet prive sans depot (Cas 3 — repo temporaire PTF)
ptf init --name "payment-service-v2" --type private
# → "Aucun depot fourni. Un repo temporaire PTF sera cree. Sync auto a votre connexion."

# Le dev recoit uniquement :
# - spec.md (interface + types + acceptance tests)
# - Acces au sandbox isole
# - Aucun acces au code interne
```

### Listing des contributeurs (projets publics uniquement)

```bash
# Lister les contributeurs d'un projet public
ptf contributors list <projectId>

# Verifier si une adresse est contributeur d'un projet public
ptf contributors verify <projectId> <address>
```

> Les projets privés ne permettent pas d'exposer la liste des contributeurs. Toute tentative retourne l'erreur `PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN`.

---

## Systeme de tâches Merkle

Chaque projet PTF reçoit un **identifiant cryptographique unique** à sa création. Les tâches forment un **arbre de chainage de type Merkle** : chaque tâche contient le hash de sa tâche parente, ce qui garantit l'intégrité et la traçabilité de l'arbre complet.

```
ProjectID = Hash(owner + name + timestamp + nonce)

TaskID = Hash(projectId + parentId + metadata + nonce)

                  [Racine — TaskID: 0xRoot]
                 /                         \
    [Backend — 0xA1b2]              [Frontend — 0xC3d4]
        /         \                      /          \
[Auth 0xE5f6] [API 0xG7h8]   [UI 0xI9j0]    [State 0xK1l2]
```

### Structure d'une tâche

> **Note :** une tâche sans `verificationSteps` n'est pas publiable sur PTF.

```json
{
  "id": "0xf3a9...c201",
  "projectId": "0x1234...abcd",
  "parentId": "0xA1b2...e5f6",
  "title": "Implement rate-limiter middleware",
  "context": "L'API gateway n'a actuellement aucun mécanisme de limitation de débit. Le fichier src/middleware/ est vide. La dépendance express-rate-limit est déjà dans package.json.",
  "objective": "Créer un middleware Express qui limite les requêtes à 100 req/min par IP. Retourner HTTP 429 avec un header Retry-After au dépassement.",
  "deliverable": "src/middleware/rateLimiter.ts + tests unitaires src/middleware/rateLimiter.test.ts",
  "outOfScope": "Modification du routeur Express existant, configuration Redis, authentification JWT",
  "verificationSteps": [
    { "step": "Tests unitaires", "command": "npm test -- src/middleware/rateLimiter.test.ts", "expected": "All tests pass" },
    { "step": "Couverture", "command": "npm run coverage -- --file src/middleware/rateLimiter.ts", "expected": ">= 80%" },
    { "step": "Pas de console.log", "command": "grep -r 'console.log' src/middleware/rateLimiter.ts", "expected": "No output" },
    { "step": "Typage strict", "command": "npx tsc --noEmit", "expected": "Exit code 0" }
  ],
  "type": "feature",
  "priority": "high",
  "duration": 30,
  "claimedAt": null,
  "deadline": null,
  "claimCriteria": {
    "minReputation": 100,
    "minCompletedTasks": 3,
    "requiredSkills": ["typescript", "node"],
    "maxActiveTasks": 3
  },
  "punishments": {
    "lateDelivery":   { "credits": -20, "reputation": -10 },
    "maliciousCode":  { "credits": -100, "reputation": -500 },
    "criticalBug":    { "credits": -50, "reputation": -30 },
    "nonCriticalBug": { "credits": -5, "reputation": -2 }
  },
  "constraints": {
    "maxFiles": 5,
    "maxLinesPerFile": 200,
    "requiredTests": true,
    "minTestCoverage": 80,
    "languages": ["typescript"],
    "forbiddenPatterns": ["console.log", "any"]
  },
  "scoring": {
    "complexity": 3,
    "impact": 4,
    "effort": 3,
    "reputationPoints": null,
    "reward": 85.000000
  },
  "dependencies": ["0xParent..."],
  "status": "open",
  "acceptanceCriteria": [
    "Tests unitaires couvrant > 80% du code",
    "Aucune regression sur les tests existants",
    "Documentation JSDoc sur les fonctions publiques"
  ]
}
```

> **Principe :** une tâche est complète si et seulement si ses `verificationSteps` passent tous. Les champs `context`, `objective`, `deliverable`, `outOfScope` et `verificationSteps` sont **obligatoires** — ils sont générés automatiquement par `ptf generate` à partir de `ARCHITECTURE.md` et `PLAN_ACTION.md`.

> **Immutabilité des tâches réclamées :** une tâche dont le statut est différent de `open` (c'est-à-dire `claimed`, `in_progress`, `submitted`, `completed`...) ne peut être **ni modifiée ni supprimée**. Seules les tâches au statut `open` sont éditables par le créateur. Cette règle est ancrée à la fois dans le `TaskService` (backend) et dans le smart contract `ProjectRegistry` (on-chain).

> **Schéma selon le mode de projet :** pour un projet **paid** (public paid ou private), `scoring.reward` est > 0, les `punishments` comportent des `credits` et `reputation`, l'escrow est actif, et la garantie 10 PTF est vérifiée avant d'afficher les conditions. Pour un projet **free** (public free), `scoring.reward` est `null` ou `0`, les `punishments` ne contiennent que des `reputation` (aucun débit de crédits), aucun escrow, aucune garantie de solde requise. Les `claimCriteria` (`minReputation`, `minCompletedTasks`, `requiredSkills`, `maxActiveTasks`) sont dans les deux cas **librement configurés** par le responsable — aucun n'est obligatoire.

> **Durée configurable :** `duration` est exprimé en jours (défaut : 30). Le timer démarre au moment du claim : `deadline = claimedAt + duration`. Les développeurs voient toutes leurs tâches actives multi-projets avec un countdown en temps réel.

---

## Credits PTF et Réputation

### Credits PTF (1 credit = 1 USDC)

Les crédits PTF sont un token stable déployé sur **chaque chaîne supportée** (ERC-20 sur les chaînes EVM, SPL token sur Solana). Ils sont **mintés uniquement à la validation d'une tâche** — jamais en amont. Les fonds sont bloqués en escrow au moment de la création du projet et libérés automatiquement par le smart contract à la validation. La valeur est stable partout : **1 PTF = 1 USDC sur toute chaîne supportée**. Un bridge cross-chaîne (LayerZero ou équivalent) permet de transférer des credits entre chaînes. Chaque crédit est **signé cryptographiquement selon EIP-712**, ce qui garantit son authenticité et sa traçabilité.

**Précision des crédits :** les crédits PTF sont stockés en **float64 avec 6 décimales** (ex : `10.50`, `0.001`, `150.123456`), aligné sur la précision d'USDC. Le **montant minimum de retrait est 1.0 PTF**. Les crédits soft-locked sont également exprimés en float (ex : `10.000000`).

```bash
# Créer / restaurer son wallet
ptf wallet create           # keypair secp256k1 + BIP-39 local
ptf wallet restore          # restaurer depuis seed phrase
ptf wallet list             # wallets présents sur cette machine

# Vérifier son solde et statut (lu on-chain)
ptf wallet status
# → Format EIP-55          : ✅ valide
# → Wallet actif           : ✅ (124 txs on-chain)
# → Solde gas natif        : ✅ 0.23 (seuil : > 0.01)
# → Solde PTF              : ✅ 340.5000 PTF (seuil : >= 10)
# → Wallet banni           : ✅ non banni
# → Ownership prouvé       : ✅ nonce signé et vérifié

# Lister ses UTXOs (unités de crédit spendables)
ptf wallet utxos                          # UTXOs unspent (défaut)
ptf wallet utxos --status spent           # historique des UTXOs dépensés
ptf wallet utxos --chain polygon          # filtrer par chaîne

# Historique des mouvements (récompenses, pénalités, soft-lock)
ptf wallet history
ptf wallet reputation-history

# ── Dépôts et retraits ──────────────────────────────────────────────────
# Les dépôts et retraits de PTF s'effectuent via le service PTF :
# → https://github.com/devmail0561-web/ptf_service_plateforme
# → Interface web : onglet Wallet → Dépôt / Retrait
# → Votre solde est crédité automatiquement après détection on-chain
```

> **Vérifications automatiques :** avant tout claim, PTF vérifie les 6 conditions du wallet : format EIP-55, activité on-chain, solde gas natif, solde PTF ≥ garantie requise (projets paid), statut de ban, ownership prouvé. Pour les projets **public free**, la vérification de solde est ignorée.

> **Séparation des responsabilités :** le framework PTF gère l'identité cryptographique (keypair secp256k1) et les interactions réseau (claim, submit). Les dépôts, retraits, et le compte utilisateur sont dans `ptf_service_plateforme`.

### Système de punitions (configurable par le créateur)

Le créateur de tâche définit les pénalités applicables. Elles sont **exécutées automatiquement** par les smart contracts à la détection de l'infraction. Les règles diffèrent selon le mode du projet :

**Projet public free** — pénalités de réputation uniquement (aucun débit de crédits) :

| Infraction | Crédits | Réputation |
|---|---|---|
| Livraison en retard | — | -10 |
| Code malveillant | — | -500 |
| Bug critique | — | -30 |
| Bug non critique | — | -2 |

```json
"punishments": {
  "lateDelivery":   { "reputation": -10 },
  "maliciousCode":  { "reputation": -500 },
  "criticalBug":    { "reputation": -30 },
  "nonCriticalBug": { "reputation": -2 }
}
```

**Projet paid** (public paid ou private) — pénalités crédits + réputation :

| Infraction | Crédits | Réputation |
|---|---|---|
| Livraison en retard | -20 | -10 |
| Code malveillant | -100 | -500 |
| Bug critique | -50 | -30 |
| Bug non critique | -5 | -2 |

```json
"punishments": {
  "lateDelivery":   { "credits": -20, "reputation": -10 },
  "maliciousCode":  { "credits": -100, "reputation": -500 },
  "criticalBug":    { "credits": -50, "reputation": -30 },
  "nonCriticalBug": { "credits": -5, "reputation": -2 }
}
```

> Les valeurs ci-dessus sont les **valeurs par défaut**. Le créateur peut les ajuster dans les conditions de la tâche. Les punishments sont horodatés, immuables et publics on-chain.

> **Distribution des crédits de pénalité :** les crédits débités au titre d'un punishment sont distribués selon une règle immuable : **80% vers la trésorerie PTF**, **20% vers le fonds du projet correspondant**. Cette règle est ancrée dans le smart contract `EscrowVault`.

> **Bannissement — droit exclusif de la plateforme PTF :** le créateur d'un projet **ne peut pas bannir un développeur**. Il peut uniquement le **signaler** via `ptf report`. La décision de bannissement est prise exclusivement par PTF après analyse. Le champ `ban` n'est pas configurable dans les `punishments`.

### Réputation (indépendante, on-chain, open-source uniquement)

La réputation est un score **non transférable** enregistré on-chain et agrégé cross-chaîne par le `ReputationAggregator`. Elle monte à chaque tâche validée et descend en cas de rejet ou de litige perdu. Elle influence la priorité d'accès aux tâches à fort enjeu et le poids de vote lors des arbitrages DAO.

> **Règle fondamentale :** les points de réputation ne sont accordés que sur des tâches appartenant à un **projet public GitHub avec une licence open-source ou libre reconnue** (OSI-approuvée ou FSF-approuvée). Les projets privés, propriétaires, ou sans licence ne génèrent aucun point. Les **punitions de réputation** (malicious_code, lateDelivery…) s'appliquent à **tous les projets** sans exception.

**Important :** les `reputationPoints` sont **calculés automatiquement par PTF** — ils ne sont pas configurables par le créateur. Le créateur définit `complexity`, `effort` et `impact` (chacun entre 1 et 5). PTF calcule les points selon la formule :

```
reputationPoints = (complexity + effort + impact) x 10 + bonus_duree
                   → 0 si le projet n'est pas open-source vérifié
```

| Niveau | Score | Avantages |
|--------|-------|-----------|
| Unranked | 0–99 | Taches de complexite 1-2 |
| Junior | 100–499 | Taches de complexite 1-3 |
| Senior | 500–1999 | Toutes taches, acces projets prives |
| Expert | 2000+ | Peer reviewer (3 par tache), vote arbitrage DAO |

> **Peer reviewer :** seuil d'éligibilité = 2 000 pts (niveau Expert). Chaque tâche est validée par 3 reviewers Expert tirés au sort.

### Signalement d'un développeur

Le créateur ne peut pas bannir un développeur. Il peut uniquement le signaler via `ptf report` :

```bash
ptf report --dev 0x... --reason malicious_code --task <taskId> --evidence "..."
```

Raisons standardisées : `malicious_code`, `plagiarism`, `fraud`, `harassment`, `spam`, `other`.

Flow : signalement → analyse automatique → escalade PTF si nécessaire → décision de bannissement par PTF exclusivement.

### Visibilité créateur sur les réclamations

```bash
ptf project claimed-tasks --project <projectId>
# → Liste les devs qui ont reclamé les tâches + statut + deadline + réputation
```

---

## Flux complet

```
0. Phase pré-création — Créer ARCHITECTURE.md + PLAN_ACTION.md

   3 modes disponibles :

   Mode 1 — Expert
     Rédige les fichiers manuellement depuis les templates PTF

   Mode 2 — Interactif (vibecoder sans IA)
     ptf scaffold --name "mon-projet"   → templates vides localement
     ptf describe                        → interview guidé → fichiers générés
     ptf fix-docs                        → corrections ciblées après validate-docs

   Mode 3 — IA-assisté ⭐ recommandé
     /ptf-architect "description" dans l'éditeur IA (Claude Code, Cursor, Copilot...)
     → IA génère ARCHITECTURE.md + PLAN_ACTION.md conformes PTF
     ptf validate-docs                   → filet de sécurité final

   Mode 4 — Import GitHub Issues
     ptf import-issues --repo owner/repo --label "help wanted"
     → Génère des tâches PTF depuis les issues GitHub en < 15 minutes
     → ptf validate-docs en mode non-bloquant (warnings seulement pour le 1er projet)

   ptf validate-docs --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
             → vérifie les 2 MD (toujours AVANT ptf init)
   ptf init --name "mon-projet" --language typescript
             → ProjectID généré : Hash(owner + name + timestamp)
             → Sauvegardé dans .ptf/config.json
   ptf generate --project <projectId> --architecture ARCHITECTURE.md --plan PLAN_ACTION.md
             → agent génère l'arbre de tâches avec context/objective/
               deliverable/outOfScope/verificationSteps pour chaque tâche
             → affiche estimation + demande confirmation
   ptf tasks preview --project <projectId>
             → revue humaine des tâches générées
         ↓
1. ptf tasks publish --project <projectId> → Entreprise dépose les fonds + publie le projet
         ↓
2. Systeme calcule le cout total
   (somme rewards + commission PTF selon grille dégressive : 12% / 10% / 8%)
         ↓
3. Entreprise paie UPFRONT → fonds bloques en escrow
   (smart contract EscrowVault sur la chaîne choisie)
         ↓
4. Projet cree avec ProjectID crypto + arbre de taches chainées
   Taches pushees dans le reseau PTF decentralise
   (visibles a TOUS les utilisateurs ; metadonnees seules si tache privee)
         ↓
5. Dev reclame une tache via CLI PTF
   ptf tasks list                     → lister les taches disponibles
   ptf task show <taskId>             → voir le detail
                                        [paid] vérifie solde >= garantie requise (10% reward, min 10 PTF) en premier
                                        [free] pas de verification solde
   ptf task claim <taskId>            → verification wallet (6 criteres) + claimCriteria
                                        [paid] garantie proportionnelle vérifiée (10% reward, min 10, max 1000 PTF), escrow actif
                                        [free] pas de garantie solde, pas d'escrow
                                        → affiche conditions + confirmation [o/N]
                                        → attribution + signature EIP-712 + on-chain
   ptf task cancel <taskId>           → abandonner une tache reclamee
                                        [free] abandon libre, pénalité réputation si > 50% durée écoulée
                                        [paid] pénalité lateDelivery si > 50%, soft-lock libéré
   ptf tasks mine                     → voir ses taches reclamees
   → Anti-collision : Redis distributed lock + transaction blockchain atomique
     (impossible que 2 devs clament la meme tache)
   → Timer demarre : deadline = claimedAt + duration
         ↓
6. Dev travaille → soumet avant deadline
   (sinon : punishment lateDelivery applique automatiquement)
         ↓
7. Validation automatique (< 10 min)
   → verificationSteps + analyse statique Semgrep/Snyk
   → Tous passent : propriétaire notifié (statut pending_owner)
   → Échec : rejeté, dev corrige et re-soumet
         ↓
8. Décision propriétaire
   → Approuve → paiement
   → Refuse + motif → dev accepte (rechargée) ou conteste (arbitrage reviewers Expert)
   → Silence 72h → auto-approbation → paiement
   RÈGLE : si dev a soumis avant deadline → jamais de punition retard
         ↓
9. Credits PTF mintés au dev
         ↓
9. Dev monetise ses credits (conversion USDC / fiat)
```

### Résolution des conflits

Si le client refuse une soumission, le processus de résolution suit trois niveaux :

1. **Verification automatique** — Le motif de refus est vérifié contre les critères objectifs (tests, coverage, contraintes)
2. **Peer review** — Si le motif est invalide ou subjectif, 3 reviewers sont tirés au sort parmi les Experts
3. **Arbitrage DAO** — En dernier recours, vote pondéré par réputation de la communauté PTF

---

## Hébergement du code

PTF est une **plateforme de coordination**, pas d'hébergement. PTF stocke uniquement les **métadonnées** — le code reste sur vos dépôts.

**Ce que PTF stocke :**
- Métadonnées projet (id, type, rewardMode, langue, statut, URL du dépôt, chaîne)
- Métadonnées tâches (hash, contraintes, critères, statuts) — PAS le code
- Métadonnées soumissions (commitHash, branchRef, résultats tests pass/fail) — PAS le code soumis
- Réputation, crédits, disputes
- Hash Arweave des fichiers `ARCHITECTURE.md` et `PLAN_ACTION.md` (ancré on-chain ; fichiers lus via gateway Arweave)

**Les 3 cas d'hébergement du code :**

| Cas | Code hébergé sur | PTF stocke | Soumissions |
|-----|-----------------|------------|-------------|
| **Cas 1 — GitHub public** | `github.com/owner/repo` | URL du repo | PR GitHub |
| **Cas 2 — Serveur propre** | `git.enterprise.com/repo` | URL du serveur | PTF Agent chez le créateur |
| **Cas 3 — Fallback** | Repo temporaire PTF (privé) | Ref interne | Push sur repo temp, sync à la reconnexion |

```
Cas 1 — GitHub public
  Code sur github.com/owner/repo
  PTF stocke l'URL → ptf init --github owner/repo

Cas 2 — Serveur propre du créateur
  Code sur git.enterprise.com/repo
  PTF Agent installé chez le créateur → ptf init --server https://git.enterprise.com/repo

Cas 3 — Fallback (créateur sans serveur)
  PTF crée un repo privé temporaire
  Soumissions pushées là si créateur offline → statut pending_sync
  Sync automatique quand créateur se reconnecte → repo créateur mis à jour
  Repo temporaire nettoyé après sync réussi
```

### Mécanisme offline / sync (Cas 3)

- Créateur **offline** → soumissions pushées sur repo temporaire PTF, statut `pending_sync`
- Créateur **se reconnecte** → sync automatique → repo créateur mis à jour → notifications déclenchées
- Repo temporaire nettoyé après sync réussi

---

## Réseau PTF — Merkle roots et adresses officielles

PTF publie en permanence dans le réseau décentralisé :
- Les **adresses officielles PTF** (adresses de dépôt, contrats)
- Les **Merkle roots** de la plateforme (projets, tâches, adresses)

Ces données sont signées par PTF et diffusées dans le réseau. Tout utilisateur peut vérifier une adresse PTF avant d'envoyer des fonds, via une **preuve Merkle** :

```bash
# Avant tout dépôt : vérification de l'adresse PTF via Merkle root réseau
ptf wallet deposit --chain polygon --amount 50 --token USDC
# → Récupère le Merkle root actuel du réseau PTF
# → Vérifie que l'adresse de dépôt est bien dans l'arbre (preuve Merkle)
# → Si vérifiée : affiche l'adresse officielle PTF
# → Si non vérifiée : erreur "Adresse PTF non reconnue — dépôt annulé"
```

Cette vérification protège contre toute tentative d'usurpation d'adresse. Aucun fonds ne peut être envoyé à une adresse qui n'est pas ancrée dans le Merkle root de la plateforme PTF.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| **Blockchain** | Polygon PoS (défaut) — extensible via Blockchain Abstraction Layer |
| **Smart contracts** | Solidity 0.8+ (EVM) — déployés sur Polygon PoS |
| **Backend framework** | Node.js 20 + TypeScript + Apollo GraphQL + Prisma — données réseau uniquement |
| **Backend service** | Node.js 20 + Apollo GraphQL + Prisma — comptes, dépôts, retraits ([ptf_service_plateforme](https://github.com/devmail0561-web/ptf_service_plateforme)) |
| **Frontend service** | Next.js 14 + TailwindCSS + Apollo Client + Zustand ([ptf_service_plateforme](https://github.com/devmail0561-web/ptf_service_plateforme)) |
| **Base de données** | PostgreSQL (réseau + comptes séparés) + Redis (Redlock + BullMQ) |
| **Indexation** | The Graph (multi-chaîne, un subgraph par chaîne) |
| **Stockage décentralisé** | Arweave (permanent) + IPFS |
| **Sandbox** | Docker + gVisor (projets privés) |
| **Auth framework** | Challenge-response EIP-712 stateless — JWT `{ ptfAddress }` — aucun compte email côté framework |
| **Auth service** | Email + mot de passe + wallet linking challenge-response |
| **Sécurité API** | Rate limiting `express-rate-limit` (200 req/15min global) + depth limit GraphQL |
| **CLI** | Node.js + TypeScript (binaires statiques) — shell interactif REPL avec prompt dédié |
| **IA / LLM** | Compatible tous fournisseurs (OpenAI, Anthropic, Ollama...) — clé API configurée via `ptf config set-llm` — 0 coût LLM pour PTF |

### Chaînes supportées

| Chaîne | Type | Statut |
|--------|------|--------|
| Polygon PoS | EVM (L2) | **Défaut — production** |
| Ethereum | EVM (L1) | Bridge entrant/sortant |
| Arbitrum | EVM (L2) | Roadmap phase 2 |
| Base | EVM (L2) | Roadmap phase 2 |

### Blockchain Abstraction Layer (BAL)

Tous les appels blockchain passent par l'interface `ChainAdapter`. Les services métier PTF ne référencent jamais directement une chaîne — ils délèguent au `ChainRegistry` qui sélectionne l'adapter approprié selon le projet.

```
ChainAdapter (interface)
  ├── PolygonAdapter     ← actif en production
  ├── EthereumAdapter    ← bridge entrant/sortant
  ├── ArbitrumAdapter    ← roadmap phase 2
  └── BaseAdapter        ← roadmap phase 2

ChainRegistry → sélectionne l'adapter selon la chaîne du projet
```

### Smart contracts (déployés sur chaque chaîne supportée)

```
ProjectRegistry    — Enregistrement des projets, ID crypto, arbre de taches
EscrowVault        — Gestion des fonds bloques, liberation a validation,
                     execution automatique des punishments
CreditToken        — ERC-20 PTF credits (EVM) / SPL token (Solana) — minting a validation, EIP-712
ReputationRegistry — Scores de reputation non transferables

→ 4 contrats × N chaînes supportées
→ Même logique déployée sur chaque chaîne EVM ; équivalents Rust/Anchor pour Solana
```

**Exigences de sécurité obligatoires :**

- **EscrowVault** : `nonReentrant` (OpenZeppelin) + pattern checks-effects-interactions + `SafeERC20` obligatoires sur toutes les fonctions manipulant des fonds
- **EIP-712** : nonces par `(devAddress, taskId)` + `chainId` dynamique (EIP-155) + `deadline` sur chaque signature — empêche le replay cross-chaîne et les signatures expirées
- **Audit externe** obligatoire avant tout déploiement mainnet (Certik, Trail of Bits ou équivalent)
- Déploiement initial sur testnet 3 mois minimum avant mainnet
- Multisig pour les fonctions critiques (admin, upgrades)
- Programme de bug bounty actif dès le lancement mainnet

---

## Modele economique

PTF prélève une **commission unique à la création du projet**, calculée sur le budget total bloqué en escrow selon une grille dégressive. Il n'y a pas d'abonnement, pas de frais cachés : la plateforme ne gagne que quand les projets sont financés.

**Token PTF :** toutes les récompenses et commissions sont libellées en **PTF (1 PTF = 1 USDC, stable)**. Le créateur dépose des PTF en escrow ; les devs sont payés en PTF ; ils peuvent retirer en USDC à tout moment via le service PTF.

**Grille de commission :**

| Budget projet (en PTF) | Taux | Exemple |
|------------------------|------|---------|
| < 5 000 PTF (petits projets) | **12%** | 3 000 PTF → commission 360 PTF |
| 5 000 – 50 000 PTF (projets moyens) | **10%** | 10 000 PTF → commission 1 000 PTF |
| > 50 000 PTF (grands projets) | **8%** | 80 000 PTF → commission 6 400 PTF |

```
Exemple — projet moyen :
  Budget projet   : 10 000 PTF
  Commission PTF  : 1 000 PTF (10%) → trésorerie PTF (Gnosis Safe)
  Fonds en escrow : 9 000 PTF → distribués aux devs à validation
```

Le bridge cross-chaîne (LayerZero) permet de transférer des PTF depuis Ethereum ou d'autres chaînes EVM vers Polygon (`ptf wallet bridge`). Chaque retrait PTF → USDC implique des frais de conversion mineurs (< 1%) couvrant les frais de gas.

---

## Lancement — Stratégie de bootstrapping

### Phase seed (Mois 1–3)

```
→ Invitation de mainteneurs OSS existants à créer leurs projets sur PTF
→ Beta fermée avec développeurs actifs
→ Projets PTF internes créés seulement si nécessaire (pas 50 projets obligatoires)
→ Programme Fast-Track Reputation : 100 pts initiaux sur dossier LinkedIn+GitHub vérifié
→ Programme Welcome Credits : 10 PTF offerts aux 1 000 premiers inscrits
→ Mode bootstrap DAO : panel équipe PTF pour les litiges (jusqu'à 100 devs Expert)

Les projets OSS existants apportent une communauté et des contributions réelles dès le lancement.
```

**Budget programme seed (estimé) :**

| Poste | Estimation |
|-------|-----------|
| Welcome Credits (1 000 inscrits × 10 PTF) | 10 000 USDC |
| Projets internes PTF si nécessaire (reward moyen 500 USDC) | variable |
| Commission non prélevée (projets seed) | — (exonéré phase seed) |
| **Total seed USDC** | **~10 000 USDC + variables** |

> La stratégie seed prioritaire est d'inviter des projets OSS existants : ils apportent de vraies tâches et une vraie communauté sans coût USDC pour PTF. Les projets internes sont un complément, pas le socle obligatoire.

---

## Documentation

- [**Guide developpeur**](https://ptf.dev/docs/developer)
- [**Guide entreprise**](https://ptf.dev/docs/enterprise)
- [**Reference CLI**](https://ptf.dev/docs/cli)
- [**Smart contracts**](https://ptf.dev/docs/contracts)
- [**Systeme de taches**](https://ptf.dev/docs/tasks)
- [**Projets prives — securite**](https://ptf.dev/docs/private-security)
- [**Format ARCHITECTURE.md / PLAN_ACTION.md**](https://ptf.dev/docs/project-docs)
- [**Agent de génération de tâches**](https://ptf.dev/docs/task-generator)

---

## Tech Stack detail

- **Smart contracts :** Solidity 0.8+ — Hardhat — OpenZeppelin (EVM) ; Rust + Anchor (Solana)
- **Backend framework :** Node.js 20 + TypeScript + Apollo GraphQL + Prisma — données réseau (projets, tâches, réputation)
- **Backend service :** Node.js 20 + Apollo GraphQL + Prisma — comptes, dépôts, retraits, ledger ([ptf_service_plateforme](https://github.com/devmail0561-web/ptf_service_plateforme))
- **Frontend service :** Next.js 14 + TailwindCSS dark theme + Apollo Client 3 + Zustand ([ptf_service_plateforme](https://github.com/devmail0561-web/ptf_service_plateforme))
- **BAL :** ChainAdapter interface + ChainRegistry + adapters par chaîne
- **Indexation :** The Graph (subgraph par chaîne) + agrégation backend
- **Stockage décentralisé :** Arweave (ARCHITECTURE.md, PLAN_ACTION.md — permanent) + IPFS
- **Base de données :** PostgreSQL 16 + Redis 7
- **CLI :** Node.js + TypeScript (pkg pour binaires statiques Linux/macOS/Windows)
- **Blockchain :** Polygon PoS (production) — Ethereum bridge — Arbitrum/Base roadmap
- **Bridge :** LayerZero (ou équivalent) pour PTF Credits cross-chaîne
- **Sandbox :** Docker + gVisor (runsc) — isolation niveau kernel

---

## Contact

- **Website :** [ptf.dev](https://ptf.dev)
- **GitHub :** [github.com/ptf/ptf](https://github.com/ptf/ptf)
- **Discord :** [discord.gg/ptf](https://discord.gg/ptf)
- **Twitter :** [@ptf_dev](https://twitter.com/ptf_dev)
- **Email :** contact@ptf.dev

---

## Licence

MIT License — voir [LICENSE](LICENSE) pour les details.

---

**PTF est une marketplace de tâches avec garantie blockchain — chaque paiement est escrowé, chaque réputation est on-chain, chaque manquement a un coût.**
