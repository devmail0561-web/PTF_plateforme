import type {
  PtfTask,
  TaskFilters,
  WalletStatus,
  PublicProject,
} from "../types.js";

export function mockWalletStatus(address: string): WalletStatus {
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

export function mockTasks(filters?: TaskFilters): PtfTask[] {
  const tasks: PtfTask[] = [
    {
      id: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      projectId: "0xabc123",
      parentId: null,
      title: "Implémenter le service d'authentification JWT",
      type: "feature",
      priority: "high",
      status: "open",
      rewardMode: "paid",
      reputationPoints: 100,
      duration: "14d",
      deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
      reward: { amount: 150, token: "PTF" },
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
      rewardMode: "free",
      reputationPoints: 70,
      duration: "7d",
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
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
        lateDelivery: { reputation: 5 },
        maliciousCode: { reputation: 500 },
        criticalBug: { reputation: 20 },
        nonCriticalBug: { reputation: 1 },
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

export function mockProjects(): PublicProject[] {
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
      totalRewardPool: "3 600 PTF",
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
      totalRewardPool: "1 800 PTF",
      stack: ["Go", "PostgreSQL"],
      status: "active",
    },
  ];
}

export function generateMockTasks(projectId: string, count: number): PtfTask[] {
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
    rewardMode: "paid" as const,
    reputationPoints: (2 + (i % 3) + 2 + (i % 2) + 3 - (i % 2)) * 10,
    duration: "30d",
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    reward: { amount: 100 + i * 50, token: "PTF" as const },
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
