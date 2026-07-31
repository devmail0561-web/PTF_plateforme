---
ptf_version: "1.0"
project_id: "{{PROJECT_CRYPTO_ID}}"
project_name: "{{PROJECT_NAME}}"
created_at: "{{DATE}}"
owner: "{{OWNER_WALLET}}"
escrow_balance: "{{ESCROW_BALANCE}} USDC"
status: "active"
reward_mode: "{{REWARD_MODE}}"
total_tasks: "{{TOTAL_TASK_COUNT}}"
total_reward_pool: "{{TOTAL_REWARD_POOL}} USDC"
---

# {{PROJECT_NAME}} — Plan d'action PTF

> **Pour les IA** : Ce fichier décrit les phases et tâches d'un projet PTF.
> Règles absolues :
> - Chaque tâche a un `context` (état existant), `objective` (résultat précis), `deliverable` (fichiers/fonctions)
> - Chaque `verificationStep` a une commande exacte exécutable (`npm test`, `npx eslint`, etc.)
> - Chaque phase a un livrable vérifiable (pas "phase terminée" mais "module X fonctionne, tests passent")
> - Le `outOfScope` de chaque tâche est explicite
> Ce fichier sera validé par `ptf validate-docs` avant génération des tâches.

**Projet ID :** `{{PROJECT_CRYPTO_ID}}`  
**Version :** 1.0  
**Date :** {{DATE}}  
**Statut :** Actif

---

## Architecture standard PTF

> Ce fichier est l'un des **2 fichiers d'entrée OBLIGATOIRES** pour `ptf generate` (avec `ARCHITECTURE.md`).
> Il doit respecter le format standard PTF pour passer la validation `ptf validate-docs`.

Sections obligatoires :
- `## Objectif du projet` (description + critère mesurable)
- `## Hors-scope` (liste explicite)
- `## Phases` (avec livrables vérifiables)
- `## Critères de succès globaux`

---

## Exigences de qualité des descriptions

> Chaque tâche DOIT avoir une description suffisamment explicite pour qu'un développeur qui n'a jamais vu le projet puisse l'implémenter sans poser de questions.

Les champs `context`, `objective`, `deliverable`, `outOfScope` et `verificationSteps` sont **obligatoires** pour chaque tâche. Une tâche sans ces champs sera rejetée par `ptf validate-docs`.

**✅ BON EXEMPLE de tâche bien décrite :**
```yaml
context: "L'API gateway n'a aucun mécanisme de limitation de débit. Le fichier
          src/middleware/ est vide. La dépendance express-rate-limit est déjà dans package.json."
objective: "Créer un middleware Express qui limite les requêtes à 100 req/min par IP.
            Retourner HTTP 429 avec un header Retry-After au dépassement."
deliverable: "src/middleware/rateLimiter.ts + tests src/middleware/rateLimiter.test.ts"
outOfScope: ["Modification du routeur Express existant", "Configuration Redis", "Auth JWT"]
verificationSteps:
  - command: "npm test -- src/middleware/rateLimiter.test.ts"
    expectedOutput: "All tests pass"
  - command: "npm run coverage -- --file src/middleware/rateLimiter.ts"
    expectedOutput: ">= 80%"
  - command: "npx tsc --noEmit"
    expectedOutput: "Exit code 0"
```

**❌ MAUVAIS EXEMPLE (rejeté par ptf validate-docs) :**
```yaml
context: "Il manque un rate limiter."
objective: "Ajouter un rate limiter."
deliverable: "Le middleware"
outOfScope: []
verificationSteps: []
```
→ Problèmes : context vague, objective sans métrique, deliverable sans chemin de fichier,
  outOfScope vide, verificationSteps sans commandes exécutables.

---

## Pré-génération

Avant de générer les tâches PTF à partir de ce plan, exécuter dans l'ordre :

```bash
# 1. Valider la complétude des documents sources (ARCHITECTURE.md + PLAN_ACTION.md)
ptf validate-docs --project {{PROJECT_CRYPTO_ID}}

# 2. Estimer les coûts et la durée totale du projet
ptf estimate --project {{PROJECT_CRYPTO_ID}}

# 3. Générer les tâches et les publier dans le réseau PTF
ptf generate --project {{PROJECT_CRYPTO_ID}}
```

`ptf validate-docs` vérifie que tous les placeholders sont remplacés, que chaque tâche a un `context` non vide, et que les dépendances sont cohérentes.  
`ptf estimate` calcule le reward pool total et la durée estimée à partir des champs `scoring`.  
`ptf generate` crée les tâches on-chain et les rend visibles aux développeurs.

---

## Lecture du plan

Chaque tâche est identifiée par un **hash cryptographique** : `Hash(projectId + parentId + metadata + nonce)`.  
**Statuts :** `open` · `claimed` · `in_review` · `disputed` · `completed` · `expired`  
**Réclamation :** `ptf task claim <task_id>` — lie votre wallet à la tâche (confirmation intégrée).

---

## Workflow PTF

### Mode de rémunération

> Ce projet est en mode **`{{REWARD_MODE}}`** (valeur de `reward_mode` dans le frontmatter).
>
> - **`free`** : projet open source — pas de reward USDC, pas d'escrow, pas de garantie 10 PTF. Pénalités sur la réputation uniquement.
> - **`paid`** : projet rémunéré — reward USDC par tâche, fonds bloqués en escrow, garantie 10 PTF requise. Pénalités crédits + réputation.

### Cycle de vie d'une tâche

1. **Trouver une tâche disponible** — `ptf tasks list --status open --project {{PROJECT_CRYPTO_ID}}`
2. **Consulter les conditions** — `ptf task show <task_id>` (punitions, deadline, reward, contraintes)
   → Si `reward_mode: paid` : vérification immédiate solde ≥ 10 PTF (première barrière)
3. **Demander la tâche** — `ptf task claim <task_id>`
   → Vérification wallet (6 critères) + claimCriteria
   → Envoi des conditions complètes au développeur
   → Confirmation interactive [o/N] — l'acceptation est intégrée dans cette étape
   → Attribution + signature EIP-712 auto + enregistrement on-chain
4. **Voir ses tâches réclamées** — `ptf tasks mine`
5. **Implémenter** — respecter les contraintes définies dans chaque tâche
6. **Soumettre** — `ptf submit <task_id> --branch <branch>`
7. **Validation automatique** — lint + tests + couverture + contraintes structurelles
8. **Peer review** — 1 reviewer PTF certifié
9. **Validation client** — approbation de {{OWNER_WALLET}}
10. **Crédits distribués** — automatiquement vers votre wallet

> **Immutabilité des tâches réclamées :** une fois réclamée (statut ≠ `open`), une tâche ne peut plus être modifiée ni supprimée par le créateur du projet. Cette règle est définitive et protège le développeur contre tout changement de conditions en cours de route.

**Pour le responsable du projet — suivre les tâches en cours :**

```bash
# Voir toutes les tâches réclamées du projet (dev, réputation, deadline, statut)
ptf project claimed-tasks --project {{PROJECT_CRYPTO_ID}}
```

### Critères d'acceptance génériques

- [ ] Compilation/exécution sans erreur
- [ ] Tests unitaires présents, couverture > {{COVERAGE_THRESHOLD}}%
- [ ] Nombre de fichiers modifiés dans les limites définies par tâche
- [ ] Lignes de code dans les limites définies par tâche
- [ ] Pas de secrets hardcodés (détection automatique)
- [ ] Documentation inline obligatoire sur les fonctions publiques
- [ ] Interfaces contrats respectées
- [ ] CI PTF passe (lint + tests + build + security scan)

---

## Phase 1 — {{PHASE_1_NAME}} `{{PHASE_1_TIMELINE}}`

> **Objectif :** {{PHASE_1_OBJECTIVE}}
>
> **Livrable vérifiable :** {{PHASE_1_DELIVERABLE_CHECK}}
> *(Exemple : "Module AuthService opérationnel — `npm test src/auth` : 100% pass, couverture 92%")*
> *(Ne pas écrire : "Phase 1 terminée" — trop vague, non vérifiable automatiquement)*

### 1.0 — Fondations (bloque toute la Phase 2)

```yaml
id: "{{TASK_1_01_ID}}"
projectId: "{{PROJECT_CRYPTO_ID}}"
parentId: null
title: "{{TASK_1_01_DESCRIPTION}}"
type: {{TASK_1_01_TYPE}}
priority: critical
constraints:
  maxFiles: {{TASK_1_01_MAX_FILES}}
  maxLinesPerFile: {{TASK_1_01_MAX_LINES_PER_FILE}}
  maxTotalLines: {{TASK_1_01_MAX_TOTAL_LINES}}
  requiredTests: true
  minTestCoverage: {{COVERAGE_THRESHOLD}}
  languages: ["{{TASK_1_01_LANGUAGE}}"]
  forbiddenPatterns: []
scoring:
  complexity: {{TASK_1_01_COMPLEXITY}}    # 1-5, configuré par le créateur
  impact: {{TASK_1_01_IMPACT}}            # 1-5, configuré par le créateur
  effort: {{TASK_1_01_EFFORT}}            # 1-5, configuré par le créateur
  # reputationPoints calculé automatiquement par PTF (non configurable par le créateur)
  reward:
    amount: {{TASK_1_01_REWARD}}
    token: "USDC"
dependencies: []
blockedBy: []
unlocks: ["{{TASK_1_05_ID}}", "{{TASK_1_08_ID}}"]
status: open
duration: "30d"
deadline: "{{TASK_1_01_DEADLINE}}"
claimCriteria:
  # Tous les critères sont configurables par le responsable du projet.
  # Aucun critère n'est imposé par défaut — les champs ci-dessous sont des exemples.
  # La garantie 10 PTF est une règle systémique (non configurable ici, s'applique aux projets paid uniquement).
  minReputation: 100
  minCompletedTasks: 5
  requiredSkills: ["{{TASK_1_01_LANGUAGE}}"]
  maxActiveTasks: 2
punishments:
  # Version paid (reward_mode: paid) — pénalités crédits + réputation :
  # Distribution des crédits prélevés : 80% → trésorerie PTF / 20% → fonds du projet
  lateDelivery:
    credits: 50
    reputation: 20
  maliciousCode:
    credits: 500
    reputation: 200
    # ban : décision exclusive de PTF — ne pas configurer ici
  criticalBug:
    credits: 100
    reputation: 50
  nonCriticalBug:
    credits: 20
    reputation: 10
  # Si reward_mode: free — remplacer par réputation uniquement, ex :
  # lateDelivery:
  #   reputation: 20
  # maliciousCode:
  #   reputation: 200
  #   # ban : décision exclusive de PTF
context: "Le repo est vide. Aucune structure de projet n'existe."
objective: "Mettre en place la structure de base du projet avec toutes les dépendances et la configuration de build."
deliverable: "package.json configuré, tsconfig.json, structure de dossiers src/, tests/ créée, script de build fonctionnel"
outOfScope:
  - "Toute logique métier"
  - "Les fichiers de configuration spécifiques aux modules"
  - "La CI/CD"
verificationSteps:
  - type: "custom_script"
    command: "npm run build"
    expectedOutput: "Build succeeded"
  - type: "custom_script"
    command: "npm test"
    expectedOutput: "0 failed"
  - type: "lint"
    command: "npm run lint"
    expectedOutput: "0 errors"
acceptanceCriteria:
  - "{{TASK_1_01_CRITERIA_1}}"
  - "{{TASK_1_01_CRITERIA_2}}"
```

```yaml
id: "{{TASK_1_02_ID}}"
projectId: "{{PROJECT_CRYPTO_ID}}"
parentId: "{{TASK_1_01_ID}}"
title: "{{TASK_1_02_DESCRIPTION}}"
type: {{TASK_1_02_TYPE}}
priority: high
constraints:
  maxFiles: {{TASK_1_02_MAX_FILES}}
  maxLinesPerFile: {{TASK_1_02_MAX_LINES_PER_FILE}}
  maxTotalLines: {{TASK_1_02_MAX_TOTAL_LINES}}
  requiredTests: true
  minTestCoverage: {{COVERAGE_THRESHOLD}}
  languages: ["{{TASK_1_02_LANGUAGE}}"]
  forbiddenPatterns: []
scoring:
  complexity: {{TASK_1_02_COMPLEXITY}}    # 1-5, configuré par le créateur
  impact: {{TASK_1_02_IMPACT}}            # 1-5, configuré par le créateur
  effort: {{TASK_1_02_EFFORT}}            # 1-5, configuré par le créateur
  # reputationPoints calculé automatiquement par PTF (non configurable par le créateur)
  reward:
    amount: {{TASK_1_02_REWARD}}
    token: "USDC"
dependencies: ["{{TASK_1_01_ID}}"]
blockedBy: ["{{TASK_1_01_ID}}"]
unlocks: ["{{TASK_1_06_ID}}", "{{TASK_1_09_ID}}"]
status: open
duration: "{{TASK_DURATION}}"
deadline: "{{TASK_1_02_DEADLINE}}"
claimCriteria:
  # Tous configurables. Aucun critère imposé par défaut.
  minReputation: {{MIN_REPUTATION}}
  minCompletedTasks: {{MIN_COMPLETED_TASKS}}
  requiredSkills: ["{{TASK_1_02_LANGUAGE}}"]
  maxActiveTasks: {{MAX_ACTIVE_TASKS}}
punishments:
  # paid : inclure credits + reputation / free : reputation uniquement
  # Distribution des crédits prélevés : 80% → trésorerie PTF / 20% → fonds du projet
  lateDelivery:
    credits: {{LATE_PENALTY_CREDITS}}
    reputation: {{LATE_PENALTY_REPUTATION}}
  maliciousCode:
    credits: {{MALICIOUS_PENALTY_CREDITS}}
    reputation: {{MALICIOUS_PENALTY_REPUTATION}}
    # ban : décision exclusive de PTF — ne pas configurer ici
  criticalBug:
    credits: {{CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{CRITICAL_BUG_PENALTY_REPUTATION}}
  nonCriticalBug:
    credits: {{NON_CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{NON_CRITICAL_BUG_PENALTY_REPUTATION}}
context: "{{TASK_1_02_CONTEXT}}"
objective: "{{TASK_1_02_OBJECTIVE}}"
deliverable: "{{TASK_1_02_DELIVERABLE}}"
outOfScope: ["{{TASK_1_02_OUT_OF_SCOPE_1}}"]
verificationSteps:
  - type: "{{TASK_1_02_VERIFY_TYPE}}"
    command: "{{TASK_1_02_VERIFY_COMMAND}}"
    expectedOutput: "{{TASK_1_02_VERIFY_OUTPUT}}"
acceptanceCriteria:
  - "{{TASK_1_02_CRITERIA_1}}"
  - "{{TASK_1_02_CRITERIA_2}}"
```

### 1.1 — {{SUBSECTION_1_1_NAME}}

```yaml
id: "{{TASK_1_03_ID}}"
projectId: "{{PROJECT_CRYPTO_ID}}"
parentId: "{{TASK_1_01_ID}}"
title: "{{TASK_1_03_DESCRIPTION}}"
type: {{TASK_1_03_TYPE}}
priority: medium
constraints:
  maxFiles: {{TASK_1_03_MAX_FILES}}
  maxLinesPerFile: {{TASK_1_03_MAX_LINES_PER_FILE}}
  maxTotalLines: {{TASK_1_03_MAX_TOTAL_LINES}}
  requiredTests: true
  minTestCoverage: {{COVERAGE_THRESHOLD}}
  languages: ["{{TASK_1_03_LANGUAGE}}"]
  forbiddenPatterns: []
scoring:
  complexity: {{TASK_1_03_COMPLEXITY}}    # 1-5, configuré par le créateur
  impact: {{TASK_1_03_IMPACT}}            # 1-5, configuré par le créateur
  effort: {{TASK_1_03_EFFORT}}            # 1-5, configuré par le créateur
  # reputationPoints calculé automatiquement par PTF (non configurable par le créateur)
  reward:
    amount: {{TASK_1_03_REWARD}}
    token: "USDC"
dependencies: ["{{TASK_1_01_ID}}", "{{TASK_1_02_ID}}"]
blockedBy: ["{{TASK_1_01_ID}}", "{{TASK_1_02_ID}}"]
unlocks: ["{{TASK_2_01_ID}}"]
status: open
duration: "{{TASK_DURATION}}"
deadline: "{{TASK_1_03_DEADLINE}}"
claimCriteria:
  # Tous configurables. Aucun critère imposé par défaut.
  minReputation: {{MIN_REPUTATION}}
  minCompletedTasks: {{MIN_COMPLETED_TASKS}}
  requiredSkills: ["{{TASK_1_03_LANGUAGE}}"]
  maxActiveTasks: {{MAX_ACTIVE_TASKS}}
punishments:
  # paid : inclure credits + reputation / free : reputation uniquement
  # Distribution des crédits prélevés : 80% → trésorerie PTF / 20% → fonds du projet
  lateDelivery:
    credits: {{LATE_PENALTY_CREDITS}}
    reputation: {{LATE_PENALTY_REPUTATION}}
  maliciousCode:
    credits: {{MALICIOUS_PENALTY_CREDITS}}
    reputation: {{MALICIOUS_PENALTY_REPUTATION}}
    # ban : décision exclusive de PTF — ne pas configurer ici
  criticalBug:
    credits: {{CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{CRITICAL_BUG_PENALTY_REPUTATION}}
  nonCriticalBug:
    credits: {{NON_CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{NON_CRITICAL_BUG_PENALTY_REPUTATION}}
context: "{{TASK_1_03_CONTEXT}}"
objective: "{{TASK_1_03_OBJECTIVE}}"
deliverable: "{{TASK_1_03_DELIVERABLE}}"
outOfScope: ["{{TASK_1_03_OUT_OF_SCOPE_1}}"]
verificationSteps:
  - type: "{{TASK_1_03_VERIFY_TYPE}}"
    command: "{{TASK_1_03_VERIFY_COMMAND}}"
    expectedOutput: "{{TASK_1_03_VERIFY_OUTPUT}}"
acceptanceCriteria:
  - "{{TASK_1_03_CRITERIA_1}}"
  - "{{TASK_1_03_CRITERIA_2}}"
```

**Livrable P1 :** {{PHASE_1_DELIVERABLE}}

---

## Phase 2 — {{PHASE_2_NAME}} `{{PHASE_2_TIMELINE}}`

> **Objectif :** {{PHASE_2_OBJECTIVE}}
>
> **Livrable vérifiable :** {{PHASE_2_DELIVERABLE_CHECK}}
> *(Exemple : "API Gateway opérationnelle — `npm run test:integration` : tous les endpoints répondent < 200ms P95")*

*Dépend de : Phase 1 complète (toutes les tâches en statut `completed`)*

```yaml
id: "{{TASK_2_01_ID}}"
projectId: "{{PROJECT_CRYPTO_ID}}"
parentId: "{{TASK_1_03_ID}}"
title: "{{TASK_2_01_DESCRIPTION}}"
type: {{TASK_2_01_TYPE}}
priority: high
constraints:
  maxFiles: {{TASK_2_01_MAX_FILES}}
  maxLinesPerFile: {{TASK_2_01_MAX_LINES_PER_FILE}}
  maxTotalLines: {{TASK_2_01_MAX_TOTAL_LINES}}
  requiredTests: true
  minTestCoverage: {{COVERAGE_THRESHOLD}}
  languages: ["{{TASK_2_01_LANGUAGE}}"]
  forbiddenPatterns: ["{{TASK_2_01_FORBIDDEN_PATTERN}}"]
scoring:
  complexity: {{TASK_2_01_COMPLEXITY}}    # 1-5, configuré par le créateur
  impact: {{TASK_2_01_IMPACT}}            # 1-5, configuré par le créateur
  effort: {{TASK_2_01_EFFORT}}            # 1-5, configuré par le créateur
  # reputationPoints calculé automatiquement par PTF (non configurable par le créateur)
  reward:
    amount: {{TASK_2_01_REWARD}}
    token: "USDC"
dependencies: ["{{TASK_1_03_ID}}"]
blockedBy: ["{{TASK_1_03_ID}}"]
unlocks: ["{{TASK_3_01_ID}}"]
status: open
duration: "{{TASK_DURATION}}"
deadline: "{{TASK_2_01_DEADLINE}}"
claimCriteria:
  # Tous configurables. Aucun critère imposé par défaut.
  minReputation: {{MIN_REPUTATION}}
  minCompletedTasks: {{MIN_COMPLETED_TASKS}}
  requiredSkills: ["{{TASK_2_01_LANGUAGE}}"]
  maxActiveTasks: {{MAX_ACTIVE_TASKS}}
punishments:
  # paid : inclure credits + reputation / free : reputation uniquement
  # Distribution des crédits prélevés : 80% → trésorerie PTF / 20% → fonds du projet
  lateDelivery:
    credits: {{LATE_PENALTY_CREDITS}}
    reputation: {{LATE_PENALTY_REPUTATION}}
  maliciousCode:
    credits: {{MALICIOUS_PENALTY_CREDITS}}
    reputation: {{MALICIOUS_PENALTY_REPUTATION}}
    # ban : décision exclusive de PTF — ne pas configurer ici
  criticalBug:
    credits: {{CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{CRITICAL_BUG_PENALTY_REPUTATION}}
  nonCriticalBug:
    credits: {{NON_CRITICAL_BUG_PENALTY_CREDITS}}
    reputation: {{NON_CRITICAL_BUG_PENALTY_REPUTATION}}
context: "{{TASK_2_01_CONTEXT}}"
objective: "{{TASK_2_01_OBJECTIVE}}"
deliverable: "{{TASK_2_01_DELIVERABLE}}"
outOfScope: ["{{TASK_2_01_OUT_OF_SCOPE_1}}"]
verificationSteps:
  - type: "{{TASK_2_01_VERIFY_TYPE}}"
    command: "{{TASK_2_01_VERIFY_COMMAND}}"
    expectedOutput: "{{TASK_2_01_VERIFY_OUTPUT}}"
acceptanceCriteria:
  - "{{TASK_2_01_CRITERIA_1}}"
  - "{{TASK_2_01_CRITERIA_2}}"
```

**Livrable P2 :** {{PHASE_2_DELIVERABLE}}

---

## Récapitulatif

| Phase | Timeline | Tâches | Reward Pool | Livrable clé |
|-------|----------|--------|-------------|-------------|
| 1 — {{PHASE_1_NAME}} | {{PHASE_1_TIMELINE}} | {{PHASE_1_TASK_COUNT}} | {{PHASE_1_REWARD_POOL}} USDC | {{PHASE_1_KEY_DELIVERABLE}} |
| 2 — {{PHASE_2_NAME}} | {{PHASE_2_TIMELINE}} | {{PHASE_2_TASK_COUNT}} | {{PHASE_2_REWARD_POOL}} USDC | {{PHASE_2_KEY_DELIVERABLE}} |
| **Total** | **{{TOTAL_TIMELINE}}** | **{{TOTAL_TASK_COUNT}}** | **{{TOTAL_REWARD_POOL}} USDC** | **{{PROJECT_NAME}} v1.0** |

---

## Commandes PTF utiles

```bash
# Initialiser un projet PTF dans le repo (génère un project_id, stocké dans .ptf/config.json)
# --reward free  → open source, pas de reward USDC, pénalités réputation uniquement
# --reward paid  → rémunéré, escrow USDC, garantie 10 PTF, pénalités crédits + réputation
ptf init --name "mon-projet" --language typescript --reward free|paid

# Lister les tâches disponibles
ptf tasks list --project {{PROJECT_CRYPTO_ID}} --status open

# Voir le détail d'une tâche (première barrière : vérifie solde ≥ 10 PTF)
ptf task show <task_id>

# Demander une tâche — vérifie wallet + claimCriteria, envoie conditions, confirmation interactive [o/N]
# La signature EIP-712 et l'enregistrement on-chain sont réalisés automatiquement à la confirmation
ptf task claim <task_id>

# Voir ses tâches réclamées (avec countdown multi-projets)
ptf tasks mine

# Vérifier les contraintes avant soumission
ptf validate <task_id> --dry-run

# Soumettre une tâche
ptf submit <task_id> --branch <branch>

# Voir son solde de crédits
ptf wallet balance

# Vérifier la validité des crédits signés
ptf wallet verify <address>

# Vérifier le statut complet du wallet (format, gas, PTF, ban, ownership)
ptf wallet status

# Lister les projets disponibles (privés anonymisés)
ptf projects list

# Voir les informations d'un projet (dont le project_id)
ptf project info

# Lister ses propres projets
ptf projects list --mine

# Lister les contributeurs d'un projet public
ptf contributors list <project_id>

# Publier les tâches dans le réseau PTF (visibles à tous)
ptf tasks publish

# --- Signalement ---
# Signaler un comportement problématique (malicious_code, plagiarism, fraud, harassment, spam, other)
ptf report --dev <address> --reason <raison> --task <taskId> --evidence "description"

# --- Suivi des tâches réclamées (responsable du projet) ---
# Affiche : dev, réputation, deadline, statut pour chaque tâche réclamée
ptf project claimed-tasks --project <projectId>

# --- Wallet : dépôt et conversion ---
# Dépôt depuis Polygon en USDC
ptf wallet deposit --chain polygon --amount 50 --token USDC

# Dépôt en ETH (conversion automatique)
ptf wallet deposit --currency ETH --amount 0.1

# Conversion depuis une devise fiat
ptf wallet convert --from EUR --amount 100

# --- Adresses officielles PTF ---
# Vérifier les adresses officielles PTF avant tout envoi de fonds
ptf network addresses
```
