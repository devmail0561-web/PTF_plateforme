import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateArchitectureFile,
  validatePlanFile,
  validateBothDocs,
} from "./docs-validator.js";

const TMP_DIR = join(tmpdir(), "ptf-test-validator-" + Date.now());

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function write(filename: string, content: string): string {
  const path = join(TMP_DIR, filename);
  writeFileSync(path, content, "utf-8");
  return path;
}

const VALID_ARCH = `---
ptf_version: "1.0"
project_name: "TestProject"
reward_mode: "free"
code_language:
  primary: "TypeScript"
---

# TestProject — Architecture

## Objectif du projet

**Description :** API REST de gestion de portefeuille.

**Critère de succès :** Réponse < 200ms P95.

**Public cible :** Développeurs.

**Mode de rémunération :** \`free\`

## Hors-scope

- Retries automatiques
- Dashboard analytics
- Support multi-tenant

## Modules / Composants

| Nom | Rôle | Inputs | Outputs | Dépend de |
|-----|------|--------|---------|-----------|
| AuthService | Authentifie les utilisateurs | credentials | JWT token | UserDB |

## Interfaces

### Interface : IAuthService

\`\`\`typescript
interface IAuthService {
  login(email: string, password: string): Promise<string>;
}
\`\`\`

## Contraintes techniques

### Performance

- Réponse < 200ms P95

### Sécurité

- Aucune clé privée en dur

### Compatibilité

- Node.js 18+

### Couverture de tests minimale par module

| Module | Couverture minimale |
|--------|---------------------|
| AuthService | 85% |

## Dépendances d'implémentation

\`\`\`
[DB] → [AuthService] → [API]
\`\`\`

Ordre d'implémentation :

1. Base de données
2. AuthService
3. API Gateway

## Glossaire

- **JWT** — JSON Web Token pour l'authentification.
- **Escrow** — Contrat de séquestre des fonds.
- **Claim** — Action de réserver une tâche.
`;

const VALID_PLAN = `---
ptf_version: "1.0"
project_name: "TestProject"
reward_mode: "free"
---

# TestProject — Plan d'action PTF

## Objectif du projet

**Description :** Implémenter l'API REST de gestion.

**Critère de succès :** Tests passent à 100%.

## Hors-scope

- Dashboard analytics
- Support mobile
- API v2

## Phases

### Phase 1 — Fondations

\`\`\`yaml
id: "task-001"
projectId: "proj-001"
parentId: null
title: "Initialiser le projet"
type: feature
priority: critical
constraints:
  maxFiles: 5
  maxLinesPerFile: 200
  maxTotalLines: 500
  requiredTests: true
  minTestCoverage: 80
  languages: ["TypeScript"]
  forbiddenPatterns: []
scoring:
  complexity: 2
  impact: 3
  effort: 2
dependencies: []
status: open
duration: "14d"
context: "Le projet est vide. Aucune structure n'existe."
objective: "Créer la structure de base avec toutes les dépendances."
deliverable: "package.json + tsconfig.json + structure src/"
outOfScope:
  - "Logique métier"
  - "CI/CD"
verificationSteps:
  - type: "custom_script"
    command: "npm run build"
    expectedOutput: "Build succeeded"
\`\`\`

**Livrable P1 :** Module de base opérationnel

## Critères de succès globaux

- [ ] Tous les tests passent
- [ ] Couverture >= 80%
- [ ] Build sans erreur
`;

describe("validateArchitectureFile", () => {
  it("should validate a correct ARCHITECTURE.md with 0 errors", () => {
    const path = write("ARCHITECTURE.md", VALID_ARCH);
    const { errors } = validateArchitectureFile(path);
    const hardErrors = errors.filter((e) => e.type === "error");
    expect(hardErrors).toHaveLength(0);
  });

  it("should report missing required sections", () => {
    const withoutObjective = VALID_ARCH.replace(
      "## Objectif du projet",
      "## Objectif SUPPRIMÉ"
    );
    const path = write("ARCH_MISSING.md", withoutObjective);
    const { errors } = validateArchitectureFile(path);
    const hardErrors = errors.filter((e) => e.type === "error");
    expect(hardErrors.some((e) => e.section === "## Objectif du projet")).toBe(true);
  });

  it("should warn on unreplaced placeholders", () => {
    const withPlaceholders = VALID_ARCH.replace(
      "API REST de gestion de portefeuille.",
      "{{PROJECT_DESCRIPTION}}"
    );
    const path = write("ARCH_PLACEHOLDERS.md", withPlaceholders);
    const { errors } = validateArchitectureFile(path);
    const warnings = errors.filter((e) => e.type === "warning");
    expect(
      warnings.some((w) => w.message.includes("{{PROJECT_DESCRIPTION}}"))
    ).toBe(true);
  });

  it("should warn on vague terms", () => {
    const withVague = VALID_ARCH.replace(
      "API REST de gestion de portefeuille.",
      "API pour améliorer les performances."
    );
    const path = write("ARCH_VAGUE.md", withVague);
    const { errors } = validateArchitectureFile(path);
    const warnings = errors.filter((e) => e.type === "warning");
    expect(warnings.some((w) => w.message.includes("améliorer"))).toBe(true);
  });

  it("should return error for non-existent file", () => {
    const { errors } = validateArchitectureFile("/nonexistent/path/ARCH.md");
    expect(errors.some((e) => e.type === "error" && e.section === "fichier")).toBe(true);
  });
});

describe("validatePlanFile", () => {
  it("should validate a correct PLAN_ACTION.md with 0 errors", () => {
    const path = write("PLAN_ACTION.md", VALID_PLAN);
    const { errors } = validatePlanFile(path);
    const hardErrors = errors.filter((e) => e.type === "error");
    expect(hardErrors).toHaveLength(0);
  });

  it("should accept ## Phase N as equivalent to ## Phases", () => {
    const path = write("PLAN_PHASE_N.md", VALID_PLAN);
    const { errors } = validatePlanFile(path);
    const sectionsErrors = errors.filter(
      (e) => e.type === "error" && e.section === "## Phases"
    );
    expect(sectionsErrors).toHaveLength(0);
  });

  it("should detect missing task fields in yaml blocks", () => {
    const missingFields = VALID_PLAN.replace(
      'context: "Le projet est vide. Aucune structure n\'existe."',
      ""
    ).replace(
      'objective: "Créer la structure de base avec toutes les dépendances."',
      ""
    );
    const path = write("PLAN_MISSING_FIELDS.md", missingFields);
    const { errors } = validatePlanFile(path);
    const taskErrors = errors.filter((e) => e.section === "tâche YAML");
    expect(taskErrors.length).toBeGreaterThan(0);
  });

  it("should warn on missing ## Critères de succès globaux", () => {
    const withoutCriteres = VALID_PLAN.replace(
      "## Critères de succès globaux",
      "## Critères SUPPRIMÉS"
    );
    const path = write("PLAN_NO_CRITERES.md", withoutCriteres);
    const { errors } = validatePlanFile(path);
    const hardErrors = errors.filter((e) => e.type === "error");
    expect(
      hardErrors.some((e) => e.section === "## Critères de succès globaux")
    ).toBe(true);
  });
});

describe("validateBothDocs", () => {
  it("should return valid=true when both docs are correct", () => {
    const archPath = write("ARCH_BOTH.md", VALID_ARCH);
    const planPath = write("PLAN_BOTH.md", VALID_PLAN);
    const result = validateBothDocs(archPath, planPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return valid=false when architecture has errors", () => {
    const badArch = "# No sections\n\nJust some text";
    const archPath = write("ARCH_BAD.md", badArch);
    const planPath = write("PLAN_GOOD.md", VALID_PLAN);
    const result = validateBothDocs(archPath, planPath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should collect warnings separately from errors", () => {
    const archWithPlaceholder = VALID_ARCH.replace(
      "API REST de gestion de portefeuille.",
      "{{PROJECT_DESCRIPTION}}"
    );
    const archPath = write("ARCH_PLACEHOLDER.md", archWithPlaceholder);
    const planPath = write("PLAN_CLEAN.md", VALID_PLAN);
    const result = validateBothDocs(archPath, planPath);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should populate summary with section results", () => {
    const archPath = write("ARCH_SUMMARY.md", VALID_ARCH);
    const planPath = write("PLAN_SUMMARY.md", VALID_PLAN);
    const result = validateBothDocs(archPath, planPath);
    expect(result.summary.architecture.length).toBeGreaterThan(0);
    expect(result.summary.plan.length).toBeGreaterThan(0);
    expect(result.summary.architecture.every((s) => s.present)).toBe(true);
  });
});
