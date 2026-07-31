import type { TaskDraft, GenerationResult, LlmConfig, ProjectEstimation } from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

export interface ILLMProvider {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export interface ITaskGeneratorService {
  generate(
    projectId: string,
    archContent: string,
    planContent: string,
    llmConfig: LlmConfig
  ): Promise<GenerationResult>;
}

const SYSTEM_PROMPT = `Tu es un expert en décomposition de projets logiciels en tâches atomiques pour la plateforme PTF.

RÈGLES ABSOLUES :
- Chaque tâche a : context (état existant précis), objective (résultat mesurable), deliverable (fichiers/fonctions), outOfScope (liste), verificationSteps (commandes exactes)
- Les verificationSteps n'utilisent que des commandes de cette allowlist : npm test, npx jest, npx vitest, pytest, cargo test, go test, npx tsc --noEmit, npx eslint, npm run build
- Les tâches sont atomiques (<500 lignes de code par tâche)
- Les dépendances forment un DAG sans cycle
- Le scoring : complexity/effort/impact entre 1 et 5

RETOURNE UNIQUEMENT du JSON valide au format :
{
  "tasks": [
    {
      "title": "...",
      "type": "feature|fix|refactor|test|docs|infra",
      "priority": "critical|high|medium|low",
      "context": "...",
      "objective": "...",
      "deliverable": "...",
      "outOfScope": ["..."],
      "verificationSteps": [{"type": "unit_test", "command": "npm test", "expectedOutput": ""}],
      "scoring": {"complexity": 3, "effort": 2, "impact": 4},
      "rewardAmount": 150,
      "duration": "14d",
      "dependencies": [],
      "claimCriteria": {"minReputation": 100, "requiredSkills": ["TypeScript"]},
      "punishments": {"lateDelivery": {"credits": 20, "reputation": 10}, "maliciousCode": {"credits": 100, "reputation": 500}, "criticalBug": {"credits": 50, "reputation": 30}, "nonCriticalBug": {"credits": 5, "reputation": 2}},
      "constraints": {"maxFiles": 5, "maxLinesPerFile": 200, "maxTotalLines": 500, "requiredTests": true, "minTestCoverage": 80, "languages": ["TypeScript"], "forbiddenPatterns": []}
    }
  ]
}`;

export class LLMTaskGeneratorService implements ITaskGeneratorService {
  constructor(private readonly llmProvider: ILLMProvider) {}

  async generate(
    projectId: string,
    archContent: string,
    planContent: string,
    _llmConfig: LlmConfig
  ): Promise<GenerationResult> {
    if (!(await this.llmProvider.isAvailable())) {
      throw new PtfError(
        PtfErrorCode.LLM_NOT_CONFIGURED,
        "LLM non disponible. Configurez un provider : ptf config set-llm <provider> --key <key>"
      );
    }

    const userMessage = `ARCHITECTURE.md:\n${archContent}\n\n---\n\nPLAN_ACTION.md:\n${planContent}\n\n---\n\nGénère les tâches PTF pour ce projet (projectId: ${projectId}).`;

    const raw = await this.llmProvider.complete(SYSTEM_PROMPT, userMessage);

    let tasks: TaskDraft[];
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? raw) as { tasks: TaskDraft[] };
      tasks = parsed.tasks;
    } catch {
      throw new Error("Le LLM n'a pas retourné un JSON valide");
    }

    // Validation DAG — détection de cycles
    this.validateDAG(tasks);

    const estimation = this.computeEstimation(tasks);

    return { tasks, estimation };
  }

  private validateDAG(tasks: TaskDraft[]): void {
    const titles = new Set(tasks.map((t) => t.title));
    for (const task of tasks) {
      for (const dep of task.dependencies ?? []) {
        if (!titles.has(dep) && !dep.startsWith("0x")) {
          // Dépendance vers titre inconnu — warning seulement
          console.warn(`[TaskGenerator] Dépendance inconnue : ${dep}`);
        }
      }
    }
    // Détection de cycles via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adj = new Map<string, string[]>();

    tasks.forEach((t) => adj.set(t.title, t.dependencies ?? []));

    const dfs = (node: string): boolean => {
      if (inStack.has(node)) return true; // cycle
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const dep of adj.get(node) ?? []) {
        if (dfs(dep)) return true;
      }
      inStack.delete(node);
      return false;
    };

    for (const task of tasks) {
      if (dfs(task.title)) {
        throw new PtfError(
          PtfErrorCode.DAG_CYCLE_DETECTED,
          `Cycle détecté dans les dépendances des tâches`
        );
      }
    }
  }

  private computeEstimation(tasks: TaskDraft[]): ProjectEstimation {
    const totalReward = tasks.reduce((s, t) => s + (t.rewardAmount ?? 0), 0);
    const totalEffortHours = tasks.reduce(
      (s, t) => s + t.scoring.effort * 8,
      0
    );
    const commissionRate =
      totalReward < 5000 ? 0.12 : totalReward <= 50000 ? 0.10 : 0.08;
    const commissionAmount = totalReward * commissionRate;

    return {
      taskCount: tasks.length,
      totalEffortHours,
      rewardPoolSuggested: totalReward,
      commissionRate,
      commissionAmount,
      totalDeposit: totalReward + commissionAmount,
    };
  }
}

// Implémentation simple pour dev/test
export class MockLLMProvider implements ILLMProvider {
  async complete(_system: string, _user: string): Promise<string> {
    return JSON.stringify({
      tasks: [
        {
          title: "Initialiser la structure du projet",
          type: "infra",
          priority: "critical",
          context: "Le repo est vide.",
          objective: "Créer la structure de base avec build fonctionnel.",
          deliverable: "package.json, tsconfig.json, src/index.ts",
          outOfScope: ["Logique métier", "Tests E2E"],
          verificationSteps: [
            { type: "custom_script", command: "npm run build", expectedOutput: "" },
          ],
          scoring: { complexity: 2, effort: 2, impact: 3 },
          rewardAmount: 100,
          duration: "7d",
          dependencies: [],
          claimCriteria: { minReputation: 50, requiredSkills: ["TypeScript"] },
          punishments: {
            lateDelivery: { credits: 10, reputation: 5 },
            maliciousCode: { credits: 100, reputation: 500 },
            criticalBug: { credits: 30, reputation: 20 },
            nonCriticalBug: { credits: 3, reputation: 1 },
          },
          constraints: {
            maxFiles: 5, maxLinesPerFile: 100, maxTotalLines: 300,
            requiredTests: false, minTestCoverage: 0,
            languages: ["TypeScript"], forbiddenPatterns: [],
          },
        },
      ],
    });
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
