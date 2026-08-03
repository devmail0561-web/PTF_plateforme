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
import { mockWalletStatus, mockTasks, mockProjects, generateMockTasks } from "./mock-data.js";

// ── Schema → CLI type adapters ─────────────────────────────────────────────────
// Le schema GraphQL du backend stocke reward à plat (rewardAmount / rewardToken)
// et les flags wallet à plat (isValidAddress…). Le CLI utilise des structs imbriquées.

interface RawTask {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  type: string;
  priority: string;
  status: string;
  rewardMode: string;
  reputationPoints: number;
  rewardAmount?: number | null;
  rewardToken?: string | null;
  duration: string;
  deadline?: string | null;
  claimedAt?: string | null;
  devAddress?: string | null;
  context?: string;
  objective?: string;
  deliverable?: string;
  outOfScope?: string[];
  dependencies?: string[];
  claimCriteria?: { requiredSkills?: string[]; minReputation?: number; maxActiveTasks?: number; minCompletedTasks?: number };
  punishments?: { lateDelivery?: { credits?: number; reputation: number }; maliciousCode?: { credits?: number; reputation: number }; criticalBug?: { credits?: number; reputation: number }; nonCriticalBug?: { credits?: number; reputation: number } };
  constraints?: { maxFiles?: number; maxLinesPerFile?: number; maxTotalLines?: number; requiredTests?: boolean; minTestCoverage?: number; languages?: string[]; forbiddenPatterns?: string[] };
  scoring?: { complexity: number; effort: number; impact: number };
  verificationSteps?: { type: string; command: string; expectedOutput?: string; threshold?: number }[];
}

function mapTask(r: RawTask): PtfTask {
  return {
    id: r.id,
    projectId: r.projectId,
    parentId: r.parentId ?? null,
    title: r.title,
    type: r.type,
    priority: r.priority as PtfTask["priority"],
    status: r.status as PtfTask["status"],
    rewardMode: r.rewardMode as "free" | "paid",
    reputationPoints: r.reputationPoints ?? 0,
    reward: r.rewardAmount != null ? { amount: r.rewardAmount, token: (r.rewardToken ?? "PTF") as "PTF" } : undefined,
    duration: r.duration,
    deadline: r.deadline ?? undefined,
    claimedAt: r.claimedAt ?? undefined,
    devAddress: r.devAddress ?? undefined,
    context: r.context ?? "",
    objective: r.objective ?? "",
    deliverable: r.deliverable ?? "",
    outOfScope: r.outOfScope ?? [],
    dependencies: r.dependencies ?? [],
    claimCriteria: r.claimCriteria ?? {},
    punishments: {
      lateDelivery:   r.punishments?.lateDelivery   ?? { reputation: 10 },
      maliciousCode:  r.punishments?.maliciousCode  ?? { reputation: 500 },
      criticalBug:    r.punishments?.criticalBug    ?? { reputation: 30 },
      nonCriticalBug: r.punishments?.nonCriticalBug ?? { reputation: 2 },
    },
    constraints: {
      maxFiles:        r.constraints?.maxFiles        ?? 10,
      maxLinesPerFile: r.constraints?.maxLinesPerFile ?? 500,
      maxTotalLines:   r.constraints?.maxTotalLines   ?? 2000,
      requiredTests:   r.constraints?.requiredTests   ?? true,
      minTestCoverage: r.constraints?.minTestCoverage ?? 80,
      languages:       r.constraints?.languages       ?? [],
      forbiddenPatterns: r.constraints?.forbiddenPatterns ?? [],
    },
    scoring: {
      complexity: (Math.min(5, Math.max(1, r.scoring?.complexity ?? 3))) as 1|2|3|4|5,
      effort:     (Math.min(5, Math.max(1, r.scoring?.effort     ?? 3))) as 1|2|3|4|5,
      impact:     (Math.min(5, Math.max(1, r.scoring?.impact     ?? 3))) as 1|2|3|4|5,
    },
    verificationSteps: r.verificationSteps ?? [],
  };
}

interface RawWalletStatus {
  address: string;
  ptfBalance: number;
  softLocked: number;
  available: number;
  reputationScore: number;
  reputationLevel: string;
  linkedChains?: string[];
  isValidAddress: boolean;
  isActivated: boolean;
  hasGasFees: boolean;
  isNotBanned: boolean;
  ownershipProven: boolean;
  meetsMinBalance: boolean;
}

function mapWalletStatus(r: RawWalletStatus): WalletStatus {
  return {
    address:         r.address,
    ptfBalance:      r.ptfBalance,
    softLocked:      r.softLocked,
    available:       r.available,
    reputationScore: r.reputationScore,
    reputationLevel: r.reputationLevel as WalletStatus["reputationLevel"],
    linkedChains:    r.linkedChains ?? [],
    meetsMinBalance: r.meetsMinBalance,
    verification: {
      isValidAddress:  r.isValidAddress,
      isActivated:     r.isActivated,
      hasGasFees:      r.hasGasFees,
      isNotBanned:     r.isNotBanned,
      ownershipProven: r.ownershipProven,
    },
  };
}

export class PtfApiClient {
  private readonly apiUrl: string;
  private offline: boolean;
  private readonly apiToken: string | undefined;

  constructor(config: PtfUserConfig) {
    this.apiUrl = config.ptfApiUrl ?? "https://api.ptf.dev";
    this.offline = !config.ptfApiUrl;
    // sessionToken est le JWT retourné après challenge-response
    this.apiToken = config.sessionToken ?? (config as unknown as { ptfApiToken?: string }).ptfApiToken;
  }

  isOffline(): boolean {
    return this.offline || process.env["PTF_OFFLINE"] === "true";
  }

  // ── Auth challenge-response ────────────────────────────────────────────────

  async requestAuthChallenge(ptfAddress: string): Promise<{ nonce: string; expiresAt: string }> {
    const data = await this.query<{ requestChallenge: { nonce: string; expiresAt: string } }>(
      `mutation RequestChallenge($ptfAddress: String!) {
        requestChallenge(ptfAddress: $ptfAddress) { nonce expiresAt }
      }`,
      { ptfAddress }
    );
    return data.requestChallenge;
  }

  async verifyAuthChallenge(
    ptfAddress: string,
    nonce:      string,
    signature:  string,
    deviceName = "PTF CLI"
  ): Promise<{ token: string }> {
    const data = await this.query<{ verifyChallenge: { token: string } }>(
      `mutation VerifyChallenge($input: VerifyChallengeInput!) {
        verifyChallenge(input: $input) { token }
      }`,
      { input: { ptfAddress, nonce, signature, deviceName } }
    );
    return data.verifyChallenge;
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

    const query = `
      query ListTasks($status: String, $projectId: String, $minReward: Float, $devAddress: String, $rewardMode: String, $skills: [String!]) {
        tasks(filter: { status: $status, projectId: $projectId, minReward: $minReward, devAddress: $devAddress, rewardMode: $rewardMode, skills: $skills }) {
          id projectId title status rewardMode reputationPoints
          rewardAmount rewardToken
          priority duration deadline
          claimCriteria { requiredSkills minReputation }
          punishments {
            lateDelivery { credits reputation }
            maliciousCode { credits reputation }
            criticalBug   { credits reputation }
            nonCriticalBug { credits reputation }
          }
          constraints { maxFiles maxLinesPerFile maxTotalLines requiredTests minTestCoverage languages forbiddenPatterns }
          scoring { complexity effort impact }
        }
      }
    `;
    try {
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: filters ?? {} }),
      });
      const json = (await res.json()) as { data?: { tasks: RawTask[] }; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
      return { tasks: (json.data?.tasks ?? []).map(mapTask), offline: false };
    } catch {
      return { tasks: mockTasks(filters), offline: true };
    }
  }

  async getTask(id: string): Promise<{ task: PtfTask | null; offline: boolean }> {
    if (this.isOffline()) {
      const task = mockTasks().find((t) => t.id === id) ?? mockTasks()[0];
      return { task: { ...task, id }, offline: true };
    }

    const query = `
      query GetTask($id: ID!) {
        task(id: $id) {
          id projectId title status rewardMode reputationPoints
          rewardAmount rewardToken
          priority duration deadline
          context objective deliverable
          outOfScope dependencies
          claimCriteria { requiredSkills minReputation maxActiveTasks minCompletedTasks }
          punishments {
            lateDelivery  { credits reputation }
            maliciousCode { credits reputation }
            criticalBug   { credits reputation }
            nonCriticalBug { credits reputation }
          }
          constraints { maxFiles maxLinesPerFile maxTotalLines requiredTests minTestCoverage languages forbiddenPatterns }
          scoring { complexity effort impact }
          verificationSteps { type command expectedOutput threshold }
        }
      }
    `;
    try {
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { id } }),
      });
      const json = (await res.json()) as { data?: { task: RawTask | null }; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
      return { task: json.data?.task ? mapTask(json.data.task) : null, offline: false };
    } catch {
      const task = mockTasks().find((t) => t.id === id) ?? mockTasks()[0];
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
    address: string,
    chain = "mock"
  ): Promise<{ status: WalletStatus; offline: boolean }> {
    if (this.isOffline()) {
      return { status: mockWalletStatus(address), offline: true };
    }

    const query = `
      query WalletStatus($address: String!, $chain: String!) {
        walletStatus(address: $address, chain: $chain) {
          address ptfBalance softLocked available
          reputationScore reputationLevel linkedChains
          isValidAddress isActivated hasGasFees isNotBanned ownershipProven meetsMinBalance
        }
      }
    `;
    try {
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiToken ? { "Authorization": `Bearer ${this.apiToken}` } : {}),
        },
        body: JSON.stringify({ query, variables: { address, chain } }),
      });
      const json = (await res.json()) as {
        data?: { walletStatus: RawWalletStatus };
        errors?: { message: string }[];
      };
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
      if (!json.data?.walletStatus) throw new Error("Réponse vide du serveur");
      return { status: mapWalletStatus(json.data.walletStatus), offline: false };
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

    const query = `
      query Projects($type: String, $mine: Boolean) {
        projects(filter: { type: $type, mine: $mine }) {
          id name type rewardMode owner repository
          taskCount openTaskCount totalRewardPool stack status createdAt
        }
      }
    `;
    try {
      const res = await fetch(this.apiUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: filter ?? {} }),
      });
      const json = (await res.json()) as {
        data?: { projects: Array<{ id: string; name: string; type: string; rewardMode: string; owner: string; repository?: string; taskCount: number; openTaskCount: number; totalRewardPool: string; stack: string[]; status: string; createdAt: string }> };
        errors?: { message: string }[];
      };
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
      const projects = (json.data?.projects ?? []).map((p) => ({
        projectId: p.id,
        name: p.name,
        type: p.type as PublicProject["type"],
        rewardMode: p.rewardMode as PublicProject["rewardMode"],
        owner: p.owner,
        repository: p.repository,
        taskCount: p.taskCount,
        openTaskCount: p.openTaskCount,
        totalRewardPool: p.totalRewardPool,
        stack: p.stack,
        status: p.status,
      }));
      return { projects, offline: false };
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

    const mutation = `
      mutation GenerateTasks($projectId: ID!, $architectureMd: String!, $planActionMd: String!) {
        generateTasks(projectId: $projectId, architectureMd: $architectureMd, planActionMd: $planActionMd) {
          tasks { title type priority rewardAmount duration scoring { complexity effort impact } }
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
        variables: { projectId, architectureMd: archContent, planActionMd: planContent },
      }),
    });
    const json = (await res.json()) as {
      data?: { generateTasks: { tasks: Array<{ title: string; type: string; priority: string; rewardAmount?: number; duration?: string; scoring: { complexity: number; effort: number; impact: number } }>; estimation: ProjectEstimation } };
      errors?: { message: string }[];
    };
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
    if (!json.data?.generateTasks) throw new Error("Réponse vide du serveur");
    const result = json.data.generateTasks;
    const tasks = generateMockTasks(projectId, result.tasks.length).map((t, i) => ({
      ...t,
      title:    result.tasks[i]?.title    ?? t.title,
      type:     result.tasks[i]?.type     ?? t.type,
      priority: (result.tasks[i]?.priority ?? t.priority) as PtfTask["priority"],
      reward:   result.tasks[i]?.rewardAmount != null ? { amount: result.tasks[i].rewardAmount!, token: "PTF" as const } : t.reward,
      duration: result.tasks[i]?.duration ?? t.duration,
    }));
    return { tasks, estimation: result.estimation, offline: false };
  }
}

