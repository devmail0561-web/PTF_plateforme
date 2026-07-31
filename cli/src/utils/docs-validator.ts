import { readFileSync, existsSync } from "fs";
import matter from "gray-matter";
import type { ValidationResult, ValidationError, SectionResult } from "../types.js";

const ARCHITECTURE_REQUIRED_SECTIONS = [
  "## Objectif du projet",
  "## Hors-scope",
  "## Modules / Composants",
  "## Interfaces",
  "## Contraintes techniques",
  "## Dépendances d'implémentation",
  "## Glossaire",
] as const;

const PLAN_REQUIRED_SECTIONS = [
  "## Objectif du projet",
  "## Hors-scope",
  "## Phases",
  "## Critères de succès globaux",
] as const;

const PLACEHOLDER_REGEX = /\{\{[A-Z0-9_]+\}\}/g;

function hasSection(content: string, section: string): boolean {
  const lines = content.split("\n");
  if (lines.some((line) => line.trim() === section)) return true;

  // Accept "## Phase N — ..." as equivalent to "## Phases"
  if (section === "## Phases") {
    return lines.some((line) => /^## Phase \d/.test(line.trim()));
  }
  return false;
}

function findPlaceholders(content: string): string[] {
  const matches = content.match(PLACEHOLDER_REGEX) ?? [];
  return [...new Set(matches)];
}

function checkSection(
  content: string,
  section: string,
  file: "architecture" | "plan"
): { result: SectionResult; errors: ValidationError[] } {
  const present = hasSection(content, section);
  const errors: ValidationError[] = [];

  if (!present) {
    errors.push({
      file,
      section,
      message: `Section obligatoire manquante : ${section}`,
      type: "error",
    });
  }

  const placeholders = present ? findPlaceholdersInSection(content, section) : [];
  const hasPlaceholders = placeholders.length > 0;

  if (hasPlaceholders) {
    errors.push({
      file,
      section,
      message: `Placeholders non remplacés dans ${section} : ${placeholders.slice(0, 3).join(", ")}${placeholders.length > 3 ? ` +${placeholders.length - 3}` : ""}`,
      type: "warning",
    });
  }

  return {
    result: { section, present, hasPlaceholders, warnings: [] },
    errors,
  };
}

function findPlaceholdersInSection(content: string, section: string): string[] {
  const lines = content.split("\n");
  let sectionStart = lines.findIndex((l) => l.trim() === section);

  // Fallback for "## Phases" → match first "## Phase N ..."
  if (sectionStart === -1 && section === "## Phases") {
    sectionStart = lines.findIndex((l) => /^## Phase \d/.test(l.trim()));
  }
  if (sectionStart === -1) return [];

  const sectionEnd = lines.findIndex(
    (l, i) => i > sectionStart && l.startsWith("## ")
  );
  const sectionContent =
    sectionEnd === -1
      ? lines.slice(sectionStart).join("\n")
      : lines.slice(sectionStart, sectionEnd).join("\n");

  return [...new Set(sectionContent.match(PLACEHOLDER_REGEX) ?? [])];
}

function validateFrontmatter(
  data: Record<string, unknown>,
  file: "architecture" | "plan"
): ValidationError[] {
  const errors: ValidationError[] = [];

  const requiredFields =
    file === "architecture"
      ? ["ptf_version", "project_name"]
      : ["ptf_version", "project_name"];

  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push({
        file,
        section: "frontmatter",
        message: `Champ obligatoire manquant dans le frontmatter : ${field}`,
        type: "error",
      });
    }
  }

  const frontmatterStr = JSON.stringify(data);
  const placeholders = frontmatterStr.match(PLACEHOLDER_REGEX) ?? [];
  if (placeholders.length > 0) {
    errors.push({
      file,
      section: "frontmatter",
      message: `Placeholders non remplacés dans le frontmatter : ${[...new Set(placeholders)].join(", ")}`,
      type: "warning",
    });
  }

  return errors;
}

function checkVagueTerms(
  content: string,
  file: "architecture" | "plan"
): ValidationError[] {
  const vagueTerms = [
    { term: /\baméliorer\b/i, suggestion: "préciser avec une métrique mesurable" },
    { term: /\boptimiser\b/i, suggestion: "préciser avec une métrique (ex: < 200ms)" },
    { term: /\bperformant\b/i, suggestion: "préciser avec un chiffre (ex: P95 < 200ms)" },
    { term: /\bscalable\b/i, suggestion: "préciser le seuil (ex: 1000 req/s)" },
    { term: /\brefactoriser\b/i, suggestion: "préciser ce qui doit être changé" },
  ];

  const errors: ValidationError[] = [];
  const lines = content.split("\n");

  vagueTerms.forEach(({ term, suggestion }) => {
    lines.forEach((line, i) => {
      if (term.test(line)) {
        errors.push({
          file,
          section: "contenu",
          message: `Terme vague "${term.source.replace(/\\b|\\i/g, "").replace(/\//g, "")}" détecté (ligne ${i + 1}) — ${suggestion}`,
          type: "warning",
          line: i + 1,
        });
      }
    });
  });

  return errors;
}

export function validateArchitectureFile(filePath: string): {
  errors: ValidationError[];
  sectionResults: SectionResult[];
} {
  if (!existsSync(filePath)) {
    return {
      errors: [
        {
          file: "architecture",
          section: "fichier",
          message: `Fichier non trouvé : ${filePath}`,
          type: "error",
        },
      ],
      sectionResults: [],
    };
  }

  const raw = readFileSync(filePath, "utf-8");
  const { content, data } = matter(raw);
  const errors: ValidationError[] = [];
  const sectionResults: SectionResult[] = [];

  errors.push(...validateFrontmatter(data as Record<string, unknown>, "architecture"));

  for (const section of ARCHITECTURE_REQUIRED_SECTIONS) {
    const { result, errors: sectionErrors } = checkSection(content, section, "architecture");
    sectionResults.push(result);
    errors.push(...sectionErrors);
  }

  const globalPlaceholders = findPlaceholders(content);
  if (globalPlaceholders.length > 0 && !errors.some((e) => e.section === "content" && e.type === "warning")) {
    // Already reported per-section — add a summary only
  }

  errors.push(...checkVagueTerms(content, "architecture"));

  return { errors, sectionResults };
}

export function validatePlanFile(filePath: string): {
  errors: ValidationError[];
  sectionResults: SectionResult[];
} {
  if (!existsSync(filePath)) {
    return {
      errors: [
        {
          file: "plan",
          section: "fichier",
          message: `Fichier non trouvé : ${filePath}`,
          type: "error",
        },
      ],
      sectionResults: [],
    };
  }

  const raw = readFileSync(filePath, "utf-8");
  const { content, data } = matter(raw);
  const errors: ValidationError[] = [];
  const sectionResults: SectionResult[] = [];

  errors.push(...validateFrontmatter(data as Record<string, unknown>, "plan"));

  for (const section of PLAN_REQUIRED_SECTIONS) {
    const { result, errors: sectionErrors } = checkSection(content, section, "plan");
    sectionResults.push(result);
    errors.push(...sectionErrors);
  }

  errors.push(...checkVagueTerms(content, "plan"));
  errors.push(...validateTaskBlocks(content));

  return { errors, sectionResults };
}

function validateTaskBlocks(content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const yamlBlockRegex = /```yaml([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = yamlBlockRegex.exec(content)) !== null) {
    const yamlContent = match[1];
    if (!yamlContent.includes("context:") && !yamlContent.includes("id:")) continue;

    const requiredFields = ["context", "objective", "deliverable", "outOfScope", "verificationSteps"];
    for (const field of requiredFields) {
      if (!yamlContent.includes(`${field}:`)) {
        errors.push({
          file: "plan",
          section: "tâche YAML",
          message: `Champ obligatoire manquant dans un bloc tâche : ${field}`,
          type: "error",
        });
      }
    }

    if (yamlContent.includes('context: "{{') || yamlContent.includes("context: '{{")) {
      errors.push({
        file: "plan",
        section: "tâche YAML",
        message: "Champ 'context' contient un placeholder non remplacé",
        type: "warning",
      });
    }
  }

  return errors;
}

export function validateBothDocs(
  archPath: string,
  planPath: string
): ValidationResult {
  const { errors: archErrors, sectionResults: archSections } =
    validateArchitectureFile(archPath);
  const { errors: planErrors, sectionResults: planSections } =
    validatePlanFile(planPath);

  const allErrors = [...archErrors, ...planErrors];
  const errors = allErrors.filter((e) => e.type === "error");
  const warnings = allErrors.filter((e) => e.type === "warning");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      architecture: archSections,
      plan: planSections,
    },
  };
}
