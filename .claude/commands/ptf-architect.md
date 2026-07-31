# PTF Architect — Skill officiel PTF pour éditeurs IA

**Usage :** `/ptf-architect "description du projet"`

Ce skill génère `ARCHITECTURE.md` et `PLAN_ACTION.md` conformes au format PTF standard, prêts à passer `ptf validate-docs` sans erreur.

---

## Règles absolues (non négociables)

1. **Chaque module** dans `## Modules / Composants` a : Nom, Rôle, Inputs typés, Outputs typés, Dépend de
2. **Chaque interface** est typée TypeScript (ou langage du projet)
3. **Chaque contrainte** est mesurable : `"< 200ms"`, `"> 80% coverage"`, `"0 erreur lint"` — JAMAIS de termes vagues
4. **INTERDITS** : "améliorer", "optimiser", "performant", "scalable", "refactoriser" sans métrique associée
5. **Chaque tâche YAML** a les 5 champs obligatoires : `context`, `objective`, `deliverable`, `outOfScope`, `verificationSteps`
6. **Chaque verificationStep** a une commande exacte exécutable (`npm test`, `npx eslint`, `cargo test`, etc.)
7. **Le hors-scope** est explicite (minimum 3 items) dans ARCHITECTURE.md ET PLAN_ACTION.md
8. **Aucun placeholder** `{{...}}` ne reste dans le fichier généré

---

## Format ARCHITECTURE.md à générer

```markdown
---
ptf_version: "1.0"
project_name: "<NOM DU PROJET>"
project_type: "public | private"
reward_mode: "free | paid"
stack:
  languages: ["<LANGAGE_1>"]
  frameworks: ["<FRAMEWORK_1>"]
  runtime: "<VERSION>"
  database: "<DB>"
  blockchain: "<CHAIN ou N/A>"
code_language:
  primary: "<LANGAGE>"
  allowed: ["<LANGAGE>"]
  forbidden: []
  version: "<VERSION>"
---

# <NOM DU PROJET> — Architecture

## Objectif du projet

**Description :** <1-3 phrases précises, pas de généralités>

**Critère de succès :** <métrique mesurable — ex: "API répond < 200ms P95 sous 1000 req/s">

**Public cible :** <qui utilise ce projet, dans quel contexte>

**Mode de rémunération :** `free | paid`

---

## Hors-scope

- <item spécifique 1 — pas "gestion des erreurs" mais "retries automatiques sur timeout réseau">
- <item spécifique 2>
- <item spécifique 3>
[+ d'autres si nécessaire]

---

## Modules / Composants

| Nom | Rôle | Inputs | Outputs | Dépend de |
|-----|------|--------|---------|-----------|
| <NomModule> | <rôle précis> | `<type: TypeScript>` | `<type: TypeScript>` | <Module ou —> |
[un module par ligne]

---

## Interfaces

### Interface : <NomInterface>

```typescript
interface INomInterface {
  <méthode>(param: Type): Promise<ReturnType>;
  // ...
}
```

[une interface par module externe]

---

## Contraintes techniques

### Performance
- <contrainte mesurable — ex: "Réponse API < 200ms P95 sous 500 req/s">

### Sécurité
- <contrainte actionnable — ex: "Aucune clé privée dans le code — git-secrets à chaque commit">

### Compatibilité
- <ex: "Node.js >= 18, PostgreSQL >= 15">

### Couverture de tests minimale par module

| Module | Couverture minimale |
|--------|---------------------|
| <Module> | <N>% |

---

## Dépendances d'implémentation

```
[ModuleA] ──► [ModuleB] ──► [ModuleC]
                          └─► [ModuleD]
```

Ordre d'implémentation :
1. <Module fondation>
2. <Module suivant> — dépend de 1
3. <Module final> — dépend de 2

---

## Glossaire

- **<Terme>** — <définition en une phrase>
- **<Terme>** — <définition>
- **<Terme>** — <définition>
```

---

## Format PLAN_ACTION.md à générer

```markdown
---
ptf_version: "1.0"
project_id: "<SERA_GÉNÉRÉ_PAR_PTF_INIT>"
project_name: "<NOM DU PROJET>"
created_at: "<DATE>"
owner: "<SERA_REMPLI_APRÈS_PTF_INIT>"
reward_mode: "free | paid"
total_tasks: "<N>"
total_reward_pool: "<N> USDC"
---

# <NOM DU PROJET> — Plan d'action PTF

## Objectif du projet

**Description :** <même que ARCHITECTURE.md>

**Critère de succès :** <même que ARCHITECTURE.md>

---

## Hors-scope

- <item 1>
- <item 2>
- <item 3>

---

## Phases

### Phase 1 — <Nom Phase> `<durée estimée>`

> **Objectif :** <objectif précis de la phase>
>
> **Livrable vérifiable :** `npm test` : 100% pass, couverture XX%

```yaml
id: "task-1-01"
projectId: "<SERA_GÉNÉRÉ_PAR_PTF_INIT>"
parentId: null
title: "<Titre explicite de la tâche>"
type: feature | fix | refactor | test | docs | infra
priority: critical | high | medium | low
constraints:
  maxFiles: <N>
  maxLinesPerFile: <N>
  maxTotalLines: <N>
  requiredTests: true
  minTestCoverage: <N>
  languages: ["<LANGAGE>"]
  forbiddenPatterns: []
scoring:
  complexity: <1-5>
  impact: <1-5>
  effort: <1-5>
  reward:
    amount: <N>
    token: "USDC"
dependencies: []
status: open
duration: "30d"
claimCriteria:
  minReputation: <N>
  minCompletedTasks: <N>
  requiredSkills: ["<SKILL>"]
  maxActiveTasks: 2
punishments:
  lateDelivery:
    credits: <N>      # si paid
    reputation: <N>
  maliciousCode:
    credits: <N>
    reputation: <N>
  criticalBug:
    credits: <N>
    reputation: <N>
  nonCriticalBug:
    credits: <N>
    reputation: <N>
context: "<État existant précis : ce qui existe, ce qui manque, où trouver les fichiers>"
objective: "<Résultat attendu précis et mesurable — ex: 'Créer X qui fait Y avec contrainte Z'>"
deliverable: "<Fichiers créés/modifiés + fonctions exposées — ex: 'src/auth/jwt.ts + src/auth/__tests__/jwt.test.ts'>"
outOfScope:
  - "<Ce qui est explicitement hors scope>"
  - "<Item 2>"
verificationSteps:
  - type: "unit_test"
    command: "npm test -- src/path/to/test.ts"
    expectedOutput: "All tests pass"
  - type: "type_check"
    command: "npx tsc --noEmit"
    expectedOutput: ""
  - type: "lint"
    command: "npx eslint src/path/to/file.ts"
    expectedOutput: ""
```

[répéter pour chaque tâche de la phase]

**Livrable P1 :** <livrable concret vérifiable>

### Phase 2 — <Nom Phase> `<durée>`

> *Dépend de : Phase 1 complète*

[mêmes tâches YAML]

---

## Critères de succès globaux

- [ ] <critère mesurable 1>
- [ ] <critère mesurable 2>
- [ ] <critère mesurable 3>

---

## Récapitulatif

| Phase | Timeline | Tâches | Reward Pool | Livrable clé |
|-------|----------|--------|-------------|-------------|
| 1 — <Nom> | <durée> | <N> | <N> USDC | <livrable> |
| **Total** | **<total>** | **<N>** | **<N> USDC** | **<projet> v1.0** |
```

---

## Workflow après génération

Une fois les fichiers générés par ce skill :

```bash
# 1. Valider le format (doit passer sans erreur)
ptf validate-docs

# 2. Initialiser le projet PTF (génère le projectId)
ptf init --name "<nom>" --type public --reward free|paid --chain polygon

# 3. Générer les tâches depuis les MD (via LLM configuré)
ptf generate --project <projectId>

# 4. Revoir les tâches générées
ptf tasks preview

# 5. Publier dans le réseau PTF
ptf tasks publish
```

---

## Exemples de bonnes descriptions

**✅ Contexte bien décrit :**
> "Le service Auth existe déjà dans `src/auth/`. L'interface `JWTValidator` est définie dans `src/auth/interfaces.ts` mais n'a aucune implémentation concrète. La dépendance `jsonwebtoken` est dans `package.json`."

**❌ Contexte insuffisant (rejeté par ptf validate-docs) :**
> "Il manque la validation JWT."

**✅ Objectif mesurable :**
> "Implémenter `JWTValidator.verify(token: string): DecodedToken` qui vérifie signature RS256, expiration et claims requis. Couverture de tests >= 90%."

**❌ Objectif vague :**
> "Ajouter un validateur JWT performant."

---

*Ce skill est le Mode 3 (IA-assisté) de création de projet PTF. Recommandé pour les vibecoders.*
*Les templates sont des prompts système — leur qualité détermine la qualité des tâches générées.*
