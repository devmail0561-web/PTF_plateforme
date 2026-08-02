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
        verifyChallenge(input: $input) { token user { ptfAddress } }
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

    try {
      // All filter fields declared as variables so the server receives devAddress,
      // rewardMode and skills (previously omitted — caused mine/filter commands to
      // return unfiltered results on the online path).
      // rewardMode and reputationPoints added to selection so tasks list displays
      // correct reward type instead of falling back to "? rep".
      const query = `
        query ListTasks($status: String, $projectId: String, $minReward: Float, $devAddress: String, $rewardMode: String, $skills: [String]) {
          tasks(filter: { status: $status, projectId: $projectId, minReward: $minReward, devAddress: $devAddress, rewardMode: $rewardMode, skills: $skills }) {
            id projectId title status rewardMode reputationPoints reward { amount token }
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

