export const ARCHITECTURE_TEMPLATE = `---
ptf_version: "1.0"
project_name: "{{PROJECT_NAME}}"
project_type: "public | private"
reward_mode: "{{REWARD_MODE}}"
stack:
  languages: ["{{LANGUAGE_1}}"]
  frameworks: ["{{FRAMEWORK_1}}"]
  runtime: "{{RUNTIME_VERSION}}"
  database: "{{DB_TYPE}}"
  blockchain: "{{CHAIN}}"
code_language:
  primary: "{{PRIMARY_LANGUAGE}}"
  allowed: ["{{ALLOWED_LANGUAGE_1}}"]
  forbidden: []
  version: "{{LANGUAGE_VERSION}}"
---

# {{PROJECT_NAME}} — Architecture

> Ce document est la source de vérité pour la génération automatique des tâches PTF.
> Il doit être complet, précis et sans ambiguïté avant d'exécuter \`ptf generate\`.

---

## Objectif du projet

**Description :** {{PROJECT_DESCRIPTION}}

**Critère de succès :** {{SUCCESS_CRITERION}}

**Public cible :** {{TARGET_AUDIENCE}}

**Mode de rémunération :** \`{{REWARD_MODE}}\` — \`free\` (open source) | \`paid\` (rémunéré, escrow PTF, récompenses libellées en USD payées en PTF au taux oracle)

---

## Hors-scope

Ce qui n'est PAS dans le périmètre de ce projet :

- {{OUT_OF_SCOPE_1}}
- {{OUT_OF_SCOPE_2}}
- {{OUT_OF_SCOPE_3}}

---

## Modules / Composants

| Nom | Rôle | Inputs | Outputs | Dépend de |
|-----|------|--------|---------|-----------|
| {{MODULE_1_NAME}} | {{MODULE_1_ROLE}} | {{MODULE_1_INPUTS}} | {{MODULE_1_OUTPUTS}} | {{MODULE_1_DEPS}} |
| {{MODULE_2_NAME}} | {{MODULE_2_ROLE}} | {{MODULE_2_INPUTS}} | {{MODULE_2_OUTPUTS}} | {{MODULE_2_DEPS}} |

---

## Interfaces

### Interface : {{INTERFACE_1_NAME}}

\`\`\`typescript
{{INTERFACE_1_DEFINITION}}
\`\`\`

---

## Contraintes techniques

### Performance

- {{PERF_CONSTRAINT_1}}

### Sécurité

- {{SECURITY_CONSTRAINT_1}}

### Compatibilité

- {{COMPAT_CONSTRAINT_1}}

### Couverture de tests minimale par module

| Module | Couverture minimale |
|--------|---------------------|
| {{MODULE_1_NAME}} | {{MODULE_1_COVERAGE}}% |

---

## Dépendances d'implémentation

\`\`\`
{{DEPENDENCY_DIAGRAM}}
\`\`\`

Ordre d'implémentation :

1. {{IMPL_ORDER_1}}
2. {{IMPL_ORDER_2}}
3. {{IMPL_ORDER_3}}

---

## Glossaire

- **{{TERM_1}}** — {{DEFINITION_1}}
- **{{TERM_2}}** — {{DEFINITION_2}}
- **{{TERM_3}}** — {{DEFINITION_3}}
`;
