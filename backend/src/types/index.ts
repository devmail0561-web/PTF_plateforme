// ─── Reward mode ─────────────────────────────────────────────────────────────

export type ProjectRewardMode = "free" | "paid";
export type ProjectType = "public" | "private";
export type SyncStatus = "synced" | "pending" | "syncing" | "error";
export type RepoType = "github" | "self-hosted" | "ptf-temp";

// ─── Task ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "validated"
  | "rejected"
  | "disputed"
  | "expired"
  | "blocked";

export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskType = "feature" | "fix" | "refactor" | "test" | "docs" | "infra";

export interface TaskConstraints {
  maxFiles: number;
  maxLinesPerFile: number;
  maxTotalLines: number;
  requiredTests: boolean;
  minTestCoverage: number;
  languages: string[];
  languageVersion?: string;
  forbiddenPatterns: string[];
}

export interface TaskScoring {
  complexity: 1 | 2 | 3 | 4 | 5;
  effort: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
}

export interface ClaimCriteria {
  minReputation?: number;
  minCompletedTasks?: number;
  requiredSkills?: string[];
  maxActiveTasks?: number;
}

export interface PunishmentRule {
  credits?: number;
  reputation: number;
}

export interface Punishments {
  lateDelivery: PunishmentRule;
  maliciousCode: PunishmentRule;
  criticalBug: PunishmentRule;
  nonCriticalBug: PunishmentRule;
}

export interface VerificationStep {
  type: string;
  command: string;
  expectedOutput?: string;
  threshold?: number;
}

export interface TaskDraft {
  title: string;
  type: TaskType;
  priority: TaskPriority;
  parentId?: string;
  context: string;
  objective: string;
  deliverable: string;
  outOfScope: string[];
  constraints: TaskConstraints;
  verificationSteps: VerificationStep[];
  claimCriteria: ClaimCriteria;
  punishments: Punishments;
  scoring: TaskScoring;
  rewardAmount?: number;
  duration?: string;
  dependencies?: string[];
}

// ─── Reputation ──────────────────────────────────────────────────────────────

export type ReputationLevel = "Unranked" | "Junior" | "Senior" | "Expert";

export const REPUTATION_LEVELS: { level: ReputationLevel; min: number }[] = [
  { level: "Expert", min: 2000 },
  { level: "Senior", min: 500 },
  { level: "Junior", min: 100 },
  { level: "Unranked", min: 0 },
];

// ─── Punishment types ─────────────────────────────────────────────────────────

export type PunishmentType =
  | "lateDelivery"
  | "maliciousCode"
  | "criticalBug"
  | "nonCriticalBug";

// ─── Wallet ──────────────────────────────────────────────────────────────────

export interface WalletVerificationResult {
  isValidAddress: boolean;
  isActivated: boolean;
  hasGasFees: boolean;
  isNotBanned: boolean;
  ownershipProven: boolean;
  errors: string[];
}

export interface CreditBalance {
  address: string;
  balance: number;
  softLocked: number;
  available: number;
}

// ─── Project views (public / anonymised) ────────────────────────────────────

export interface PublicProjectView {
  projectId: string;
  type: ProjectType;
  rewardMode: ProjectRewardMode;
  name: string;
  owner: string;
  description?: string;
  repository?: string;
  taskCount: number;
  openTaskCount: number;
  totalRewardPool: string;
  stack: string[];
  status: string;
  isOpenSource: boolean;
  license?: string;      // SPDX identifier, e.g. "MIT"
  createdAt?: string;
}

export interface PublicTaskView {
  taskId: string;
  projectId: string;
  projectName: string;
  type: string;
  rewardMode: ProjectRewardMode;
  priority: TaskPriority;
  title: string;
  reward: { amount: number; token: string } | null;
  duration: string;
  deadline?: string;
  claimCriteria: ClaimCriteria;
  punishments: Punishments;
  verificationSteps: VerificationStep[];
  status: TaskStatus;
  dependencies: string[];
  context: string;
}

// ─── Claim / Submit results ───────────────────────────────────────────────────

export interface ClaimResult {
  taskId: string;
  devAddress: string;
  claimedAt: string;
  deadline: string;
  conditionsHash: string;
  signature: string;
}

export interface SubmitResult {
  taskId: string;
  commitHash: string;
  branchRef: string;
  submittedAt: string;
  validationJobId: string;
}

// ─── Estimation ──────────────────────────────────────────────────────────────

export interface ProjectEstimation {
  taskCount: number;
  totalEffortHours: number;
  rewardPoolSuggested: number;
  commissionRate: number;
  commissionAmount: number;
  totalDeposit: number;
  byPhase?: { name: string; taskCount: number; rewardPool: number }[];
}

export interface GenerationResult {
  tasks: TaskDraft[];
  estimation: ProjectEstimation;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface VerificationResult {
  stepIndex: number;
  passed: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
}

export type ValidationOutcome = "passed" | "failed" | "error";

// ─── LLM ─────────────────────────────────────────────────────────────────────

export interface LlmConfig {
  provider: string;
  apiKey?: string;
  url?: string;
  model?: string;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface TaskFilter {
  status?: TaskStatus;
  projectType?: ProjectType | "all";
  rewardMode?: ProjectRewardMode | "all";
  minReward?: number;
  maxReward?: number;
  skills?: string[];
  priority?: TaskPriority;
  projectId?: string;
  devAddress?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectFilter {
  type?: ProjectType | "all";
  mine?: boolean;
  ownerAddress?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
