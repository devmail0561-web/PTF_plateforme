import type {
  PtfTask,
  TaskFilters,
  ClaimResult,
  SubmitResult,
  WalletStatus,
  PublicProject,
  PtfUserConfig,
  ProjectEstimation,
  LlmConfig,
} from "../types.js";

function mockWalletStatus(address: string): WalletStatus {
  return {
    address,
    ptfBalance: 25.5,
    softLocked: 10.0,
    available: 15.5,
    reputationScore: 350,
    reputationLevel: "Junior",
    linkedChains: ["polygon"],
    verification: {
      isValidAddress: true,
      isActivated: true,
      hasGasFees: true,
      isNotBanned: true,
      ownershipProven: true,
    },
    meetsMinBalance: true,
  };
}

function mockTasks(filters?: TaskFilters): PtfTask[] {
  const tasks: PtfTask[] = [
    {
      id: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      projectId: "0xabc123",
      parentId: null,
      title: "Implémenter le service d'authentification JWT",
      type: "feature",
      priority: "high",
      status: "open",
      duration: "14d",
      deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
      reward: { amount: 150, token: "USDC" },
      constraints: {
        maxFiles: 5,
        maxLinesPerFile: 200,
        maxTotalLines: 500,
        requiredTests: true,
        minTestCoverage: 85,
        languages: ["TypeScript"],
        forbiddenPatterns: [],
      },
      scoring: { complexity: 3, effort: 3, impact: 4 },
      dependencies: [],
      claimCriteria: {
        minReputation: 100,
        minCompletedTasks: 3,
        requiredSkills: ["TypeScript", "Node.js"],
        maxActiveTasks: 2,
      },
      punishments: {
        lateDelivery: { credits: 20, reputation: 10 },
        maliciousCode: { credits: 100, reputation: 500 },
        criticalBug: { credits: 50, reputation: 30 },
        nonCriticalBug: { credits: 5, reputation: 2 },
      },
      context:
        "Le service Auth existe déjà dans src/auth/. La validation JWT n'est pas encore implémentée. L'interface JWTValidator est définie mais sans implémentation.",
      objective:
        "Implémenter JWTValidator qui vérifie signature, expiration et claims d'un token RS256. Couverture >= 85%.",
      deliverable:
        "src/auth/jwt-validator.ts + src/auth/__tests__/jwt-validator.test.ts",
      outOfScope: [
        "Refresh token (tâche séparée)",
        "Modification de l'interface existante",
        "Migration de base de données",
      ],
      verificationSteps: [
        { type: "type_check", command: "npx tsc --noEmit", expectedOutput: "" },
        {
          type: "unit_test",
          command: "npx jest src/auth/__tests__/jwt-validator.test.ts --coverage",
          threshold: 85,
        },
        {
          type: "lint",
          command: "npx eslint src/auth/jwt-validator.ts",
          expectedOutput: "",
        },
      ],
    },
    {
      id: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
      projectId: "0xabc123",
      parentId: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      title: "Créer le middleware de rate limiting",
      type: "feature",
      priority: "medium",
      status: "open",
      duration: "7d",
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      reward: { amount: 75, token: "USDC" },
      constraints: {
        maxFiles: 3,
        maxLinesPerFile: 150,
        maxTotalLines: 300,
        requiredTests: true,
        minTestCoverage: 80,
        languages: ["TypeScript"],
        forbiddenPatterns: [],
      },
      scoring: { complexity: 2, effort: 2, impact: 3 },
      dependencies: ["0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"],
      claimCriteria: {
        minReputation: 50,
        requiredSkills: ["TypeScript", "Express"],
      },
      punishments: {
        lateDelivery: { credits: 10, reputation: 5 },
        maliciousCode: { credits: 100, reputation: 500 },
        criticalBug: { credits: 30, reputation: 20 },
        nonCriticalBug: { credits: 3, reputation: 1 },
      },
      context:
        "L'API gateway n'a aucun mécanisme de limitation de débit. Le dossier src/middleware/ est vide. express-rate-limit est dans package.json.",
      objective:
        "Créer un middleware Express limitant à 100 req/min par IP. Retourner HTTP 429 + Retry-After header.",
      deliverable:
        "src/middleware/rateLimiter.ts + src/middleware/rateLimiter.test.ts",
      outOfScope: [
        "Modification du routeur Express",
        "Configuration Redis",
        "Auth JWT",
      ],
      verificationSteps: [
        {
          type: "unit_test",
          command: "npm test -- src/middleware/rateLimiter.test.ts",
          expectedOutput: "All tests pass",
        },
        {
          type: "type_check",
          command: "npx tsc --noEmit",
          expectedOutput: "Exit code 0",
        },
      ],
    },
  ];

  if (!filters) return tasks;

  return tasks.filter((t) => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.minReward && (t.reward?.amount ?? 0) < filters.minReward)
      return false;
    if (filters.projectId && t.projectId !== filters.projectId) return false;
    if (filters.skills?.length) {
      const taskSkills = t.claimCriteria.requiredSkills ?? [];
      if (!filters.skills.some((s) => taskSkills.includes(s))) return false;
    }
    return true;
  });
}

function mockProjects(): PublicProject[] {
  return [
    {
      projectId: "0xabc123",
      type: "public",
      rewardMode: "paid",
      name: "OpenAuth Framework",
      owner: "0xAbCd1234...5678",
      description: "Framework d'authentification open source",
      repository: "github.com/org/openauth",
      taskCount: 24,
      openTaskCount: 18,
      totalRewardPool: "3 600 USDC",
      stack: ["TypeScript", "Node.js", "PostgreSQL"],
      status: "active",
    },
    {
      projectId: "0xdef456",
      type: "private",
      rewardMode: "paid",
      name: "Private Project #def4",
      owner: "0x****...****",
      taskCount: 12,
      openTaskCount: 8,
      totalRewardPool: "1 800 USDC",
      stack: ["Go", "PostgreSQL"],
      status: "active",
    },
  ];
}

export class PtfApiClient {
  private readonly apiUrl: string;
  private offline: boolean;
  private readonly apiToken: string | undefined;

  constructor(config: PtfUserConfig) {
    this.apiUrl = config.ptfApiUrl ?? "https://api.ptf.dev";
    // Offline when no URL is configured; try to connect otherwise (network errors fall back gracefully)
    this.offline = !config.ptfApiUrl;
    this.apiToken = (config as unknown as { ptfApiToken?: string }).ptfApiToken;
  }

  isOffline(): boolean {
    return this.offline || process.env["PTF_OFFLINE"] === "true";
  }

  /**
   * Generic GraphQL query helper. Throws on HTTP errors or GraphQL errors.
   */
  async query<T>(queryString: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.apiUrl + "/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
      },
      body: JSON.stringify({ query: queryString, variables: variables ?? {} }),
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join(", "));
    }
    return json.data as T;
  }

  async getTasks(filters?: TaskFilters): Promise<{ tasks: PtfTask[]; offline: boolean }> {
    if (this.isOffline()) {
      return { tasks: mockTasks(filters), offline: true };
    }

    try {
      const query = `
        query ListTasks($status: String, $projectId: String, $minReward: Float) {
          tasks(filter: { status: $status, projectId: $projectId, minReward: $minReward }) {
            id projectId title status reward { amount token }
            priority duration deadline claimCriteria { requiredSkills minReputation }
          }
        }
      `;
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: filters ?? {} }),
      });
      const data = (await res.json()) as { data?: { tasks: PtfTask[] } };
      return { tasks: data.data?.tasks ?? [], offline: false };
    } catch {
      return { tasks: mockTasks(filters), offline: true };
    }
  }

  async getTask(id: string): Promise<{ task: PtfTask | null; offline: boolean }> {
    if (this.isOffline()) {
      const task = mockTasks().find((t) => t.id === id) ?? mockTasks()[0];
      return { task: { ...task, id }, offline: true };
    }

    try {
      const query = `query GetTask($id: String!) { task(id: $id) { id title status context objective deliverable } }`;
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { id } }),
      });
      const data = (await res.json()) as { data?: { task: PtfTask } };
      return { task: data.data?.task ?? null, offline: false };
    } catch {
      const task = mockTasks()[0];
      return { task: { ...task, id }, offline: true };
    }
  }

  async claimTask(
    taskId: string,
    devAddress: string,
    conditionsHash: string
  ): Promise<{ result: ClaimResult; offline: boolean }> {
    if (this.isOffline()) {
      return {
        result: {
          taskId,
          devAddress,
          claimedAt: new Date().toISOString(),
          deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
          conditionsHash,
          signature: "0x" + "b".repeat(130),
        },
        offline: true,
      };
    }

    // Note: conditionsHash is computed client-side and compared after the server responds.
    // The server computes its own hash independently; we pass it here only for the post-call check.
    const mutation = `
      mutation ClaimTask($taskId: String!, $devAddress: String!) {
        claimTask(taskId: $taskId, devAddress: $devAddress) {
          taskId devAddress claimedAt deadline conditionsHash signature
        }
      }
    `;
    const res = await fetch(this.apiUrl + "/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
      },
      body: JSON.stringify({ query: mutation, variables: { taskId, devAddress } }),
    });
    const data = (await res.json()) as {
      data?: { claimTask: ClaimResult };
      errors?: { message: string }[];
    };
    if (!data.data?.claimTask) {
      throw new Error(data.errors?.[0]?.message ?? "Claim échoué — réponse vide du serveur");
    }
    return { result: data.data.claimTask, offline: false };
  }

  async submitTask(
    taskId: string,
    branch: string,
    commitHash: string
  ): Promise<{ result: SubmitResult; offline: boolean }> {
    const submittedAt = new Date().toISOString();

    if (this.isOffline()) {
      return {
        result: {
          taskId,
          commitHash,
          branch,
          submittedAt,
          validationJobId: "job_" + Math.random().toString(36).slice(2),
        },
        offline: true,
      };
    }

    const mutation = `
      mutation SubmitTask($taskId: String!, $branch: String!, $commitHash: String!) {
        submitTask(taskId: $taskId, branch: $branch, commitHash: $commitHash) {
          taskId commitHash branch submittedAt validationJobId
        }
      }
    `;
    const res = await fetch(this.apiUrl + "/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
      },
      body: JSON.stringify({ query: mutation, variables: { taskId, branch, commitHash } }),
    });
    const data = (await res.json()) as {
      data?: { submitTask: SubmitResult };
      errors?: { message: string }[];
    };
    if (!data.data?.submitTask) {
      throw new Error(data.errors?.[0]?.message ?? "Submit échoué — réponse vide du serveur");
    }
    return { result: data.data.submitTask, offline: false };
  }

  async getWalletStatus(
    address: string
  ): Promise<{ status: WalletStatus; offline: boolean }> {
    if (this.isOffline()) {
      return { status: mockWalletStatus(address), offline: true };
    }

    try {
      const query = `query WalletStatus($address: String!) { walletStatus(address: $address) { address ptfBalance softLocked available reputationScore reputationLevel } }`;
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
        },
        body: JSON.stringify({ query, variables: { address } }),
      });
      const data = (await res.json()) as {
        data?: { walletStatus: WalletStatus };
        errors?: { message: string }[];
      };
      if (!data.data?.walletStatus) {
        if (data.errors?.length) throw new Error(data.errors[0].message);
        return { status: mockWalletStatus(address), offline: true };
      }
      return { status: data.data.walletStatus, offline: false };
    } catch {
      return { status: mockWalletStatus(address), offline: true };
    }
  }

  async getProjects(
    filter?: { type?: string; mine?: boolean }
  ): Promise<{ projects: PublicProject[]; offline: boolean }> {
    if (this.isOffline()) {
      return { projects: mockProjects(), offline: true };
    }

    try {
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query Projects($type: String, $mine: Boolean) { projects(filter: { type: $type, mine: $mine }) { projectId type rewardMode name owner openTaskCount totalRewardPool stack status } }`,
          variables: filter ?? {},
        }),
      });
      const data = (await res.json()) as { data?: { projects: PublicProject[] } };
      return { projects: data.data?.projects ?? [], offline: false };
    } catch {
      return { projects: mockProjects(), offline: true };
    }
  }

  async generateTasks(
    projectId: string,
    archContent: string,
    planContent: string,
    _llmConfig: LlmConfig
  ): Promise<{ tasks: PtfTask[]; estimation: ProjectEstimation; offline: boolean }> {
    const estimation: ProjectEstimation = {
      taskCount: 12,
      totalEffortHours: 96,
      rewardPoolSuggested: 1800,
      commissionRate: 0.12,
      commissionAmount: 216,
      totalDeposit: 2016,
      byPhase: [
        { name: "Fondations", taskCount: 3, rewardPool: 450 },
        { name: "Backend", taskCount: 5, rewardPool: 900 },
        { name: "Frontend", taskCount: 4, rewardPool: 450 },
      ],
    };

    if (this.isOffline()) {
      const tasks = generateMockTasks(projectId, 5);
      return { tasks, estimation, offline: true };
    }

    try {
      const mutation = `
        mutation GenerateTasks($projectId: String!, $architecture: String!, $planAction: String!) {
          generateTasks(projectId: $projectId, architecture: $architecture, planAction: $planAction) {
            tasks { id title type priority status duration reward { amount token } context objective deliverable }
            estimation { taskCount totalEffortHours rewardPoolSuggested commissionRate commissionAmount totalDeposit }
          }
        }
      `;
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
        },
        body: JSON.stringify({
          query: mutation,
          variables: { projectId, architecture: archContent, planAction: planContent },
        }),
      });
      const data = (await res.json()) as {
        data?: { generateTasks: { tasks: PtfTask[]; estimation: ProjectEstimation } };
        errors?: { message: string }[];
      };
      if (!data.data?.generateTasks) {
        if (data.errors?.length) throw new Error(data.errors[0].message);
        const tasks = generateMockTasks(projectId, 5);
        return { tasks, estimation, offline: true };
      }
      const result = data.data.generateTasks;
      return { tasks: result.tasks, estimation: result.estimation, offline: false };
    } catch {
      const tasks = generateMockTasks(projectId, 5);
      return { tasks, estimation, offline: true };
    }
  }
}

function generateMockTasks(projectId: string, count: number): PtfTask[] {
  const titles = [
    "Initialiser la structure du projet",
    "Implémenter le module d'authentification",
    "Créer les types et interfaces partagés",
    "Configurer la base de données PostgreSQL",
    "Implémenter les resolvers GraphQL",
    "Créer les tests d'intégration",
    "Déployer le contrat EscrowVault",
    "Implémenter le service de réputation",
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: "0x" + (i + 1).toString(16).padStart(64, "0"),
    projectId,
    parentId: i === 0 ? null : "0x" + i.toString(16).padStart(64, "0"),
    title: titles[i] ?? `Tâche ${i + 1}`,
    type: "feature",
    priority: i === 0 ? "critical" : i < 3 ? "high" : "medium",
    status: "open" as const,
    duration: "30d",
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    reward: { amount: 100 + i * 50, token: "USDC" as const },
    constraints: {
      maxFiles: 5,
      maxLinesPerFile: 200,
      maxTotalLines: 500,
      requiredTests: true,
      minTestCoverage: 80,
      languages: ["TypeScript"],
      forbiddenPatterns: [],
    },
    scoring: {
      complexity: Math.min(5, Math.max(1, 2 + (i % 3))) as 1 | 2 | 3 | 4 | 5,
      effort: Math.min(5, Math.max(1, 2 + (i % 2))) as 1 | 2 | 3 | 4 | 5,
      impact: Math.min(5, Math.max(1, 3 - (i % 2))) as 1 | 2 | 3 | 4 | 5,
    },
    dependencies: i === 0 ? [] : ["0x" + i.toString(16).padStart(64, "0")],
    claimCriteria: { minReputation: 50, requiredSkills: ["TypeScript"] },
    punishments: {
      lateDelivery: { credits: 20, reputation: 10 },
      maliciousCode: { credits: 100, reputation: 500 },
      criticalBug: { credits: 50, reputation: 30 },
      nonCriticalBug: { credits: 5, reputation: 2 },
    },
    context: `Contexte de la tâche ${i + 1} — module à implémenter depuis zéro.`,
    objective: `Implémenter ${titles[i] ?? "la tâche"} selon les spécifications PTF.`,
    deliverable: `src/modules/task${i + 1}/index.ts + tests correspondants`,
    outOfScope: ["Refactoring du code existant", "Documentation externe"],
    verificationSteps: [
      { type: "type_check", command: "npx tsc --noEmit", expectedOutput: "" },
      { type: "unit_test", command: "npm test", threshold: 80 },
    ],
  }));
}
