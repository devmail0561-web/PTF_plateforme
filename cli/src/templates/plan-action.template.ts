export const PLAN_ACTION_TEMPLATE = `---
ptf_version: "1.0"
project_id: "{{PROJECT_CRYPTO_ID}}"
project_name: "{{PROJECT_NAME}}"
created_at: "{{DATE}}"
owner: "{{OWNER_WALLET}}"
reward_mode: "{{REWARD_MODE}}"
total_tasks: "{{TOTAL_TASK_COUNT}}"
total_reward_pool: "{{TOTAL_REWARD_POOL}} USD eq."
---

# {{PROJECT_NAME}} — Plan d'action PTF

**Projet ID :** \`{{PROJECT_CRYPTO_ID}}\`
**Version :** 1.0
**Date :** {{DATE}}

---

## Objectif du projet

**Description :** {{PROJECT_DESCRIPTION}}

**Critère de succès :** {{SUCCESS_CRITERION}}

---

## Hors-scope

Ce qui n'est PAS dans ce projet :

- {{OUT_OF_SCOPE_1}}
- {{OUT_OF_SCOPE_2}}
- {{OUT_OF_SCOPE_3}}

---

## Phases

### Phase 1 — {{PHASE_1_NAME}} \`{{PHASE_1_TIMELINE}}\`

> **Objectif :** {{PHASE_1_OBJECTIVE}}
>
> **Livrable vérifiable :** {{PHASE_1_DELIVERABLE_CHECK}}

\`\`\`yaml
id: "{{TASK_1_01_ID}}"
projectId: "{{PROJECT_CRYPTO_ID}}"
parentId: null
title: "{{TASK_1_01_DESCRIPTION}}"
type: feature
priority: critical
constraints:
  maxFiles: 10
  maxLinesPerFile: 300
  maxTotalLines: 800
  requiredTests: true
  minTestCoverage: 80
  languages: ["{{PRIMARY_LANGUAGE}}"]
  forbiddenPatterns: []
scoring:
  complexity: 3
  impact: 4
  effort: 3
  reward:
    amount: 150
    token: "PTF"
dependencies: []
status: open
duration: "30d"
claimCriteria:
  minReputation: 100
  minCompletedTasks: 3
  requiredSkills: ["{{PRIMARY_LANGUAGE}}"]
  maxActiveTasks: 2
punishments:
  lateDelivery:
    credits: 20
    reputation: 10
  maliciousCode:
    credits: 100
    reputation: 500
  criticalBug:
    credits: 50
    reputation: 30
  nonCriticalBug:
    credits: 5
    reputation: 2
context: "{{TASK_1_01_CONTEXT}}"
objective: "{{TASK_1_01_OBJECTIVE}}"
deliverable: "{{TASK_1_01_DELIVERABLE}}"
outOfScope:
  - "{{TASK_1_01_OUT_OF_SCOPE_1}}"
verificationSteps:
  - type: "unit_test"
    command: "npm test"
    expectedOutput: "All tests pass"
  - type: "type_check"
    command: "npx tsc --noEmit"
    expectedOutput: ""
\`\`\`

**Livrable P1 :** {{PHASE_1_DELIVERABLE}}

---

## Critères de succès globaux

- [ ] {{SUCCESS_CRITERION_1}}
- [ ] {{SUCCESS_CRITERION_2}}
- [ ] {{SUCCESS_CRITERION_3}}

---

## Récapitulatif

| Phase | Timeline | Tâches | Reward Pool | Livrable clé |
|-------|----------|--------|-------------|-------------|
| 1 — {{PHASE_1_NAME}} | {{PHASE_1_TIMELINE}} | {{PHASE_1_TASK_COUNT}} | {{PHASE_1_REWARD_POOL}} USD eq. | {{PHASE_1_KEY_DELIVERABLE}} |
| **Total** | **{{TOTAL_TIMELINE}}** | **{{TOTAL_TASK_COUNT}}** | **{{TOTAL_REWARD_POOL}} USD eq.** | **{{PROJECT_NAME}} v1.0** |
`;
