export interface PtfProjectConfig {
  projectId: string;
  name: string;
  type: "public" | "private";
  rewardMode: "free" | "paid";
  chain: string;
  token?: string;
  github?: string;
  server?: string;
  repoMode?: "github" | "self-hosted" | "ptf-temp";
  language?: string;
  createdAt: string;
  network: "mainnet" | "testnet";
  ownerAddress?: string;
}

export interface PtfUserConfig {
  githubToken?: string;
  walletAddress?: string;
  walletChain?: string;
  ptfApiUrl?: string;
  llmProvider?: "anthropic" | "openai" | "ollama" | "mistral";
  llmApiKey?: string;
  llmUrl?: string;
  llmModel?: string;
}

export interface ValidationError {
  file: "architecture" | "plan";
  section: string;
  message: string;
  line?: number;
  type: "error" | "warning";
}

export interface SectionResult {
  section: string;
  present: boolean;
  hasPlaceholders: boolean;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    architecture: SectionResult[];
    plan: SectionResult[];
  };
}

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

export interface PtfTask {
  id: string;
  projectId: string;
  parentId: string | null;
  networkId?: string;
  title: string;
  type: string;
  priority: TaskPriority;
  constraints: TaskConstraints;
  scoring: TaskScoring;
  dependencies: string[];
  blockedBy?: string[];
  unlocks?: string[];
  status: TaskStatus;
  duration: string;
  claimedAt?: string;
  deadline?: string;
  devAddress?: string;
  reward?: {
    amount: number;
    token: "USDC";
  };
  claimCriteria: ClaimCriteria;
  punishments: Punishments;
  context: string;
  objective: string;
  deliverable: string;
  outOfScope: string[];
  verificationSteps: VerificationStep[];
  acceptanceCriteria?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  projectType?: "public" | "private" | "all";
  rewardMode?: "free" | "paid" | "all";
  minReward?: number;
  maxReward?: number;
  skills?: string[];
  priority?: TaskPriority;
  projectId?: string;
  devAddress?: string;
}

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
  branch: string;
  submittedAt: string;
  validationJobId: string;
}

export interface WalletVerification {
  isValidAddress: boolean;
  isActivated: boolean;
  hasGasFees: boolean;
  isNotBanned: boolean;
  ownershipProven: boolean;
}

export interface WalletStatus {
  address: string;
  ptfBalance: number;
  softLocked: number;
  available: number;
  reputationScore: number;
  reputationLevel: "Unranked" | "Junior" | "Senior" | "Expert";
  linkedChains: string[];
  verification: WalletVerification;
  meetsMinBalance: boolean;
}

export interface ProjectEstimation {
  taskCount: number;
  totalEffortHours: number;
  rewardPoolSuggested: number;
  commissionRate: number;
  commissionAmount: number;
  totalDeposit: number;
  byPhase?: { name: string; taskCount: number; rewardPool: number }[];
}

export interface PublicProject {
  projectId: string;
  networkId?: string;
  type: "public" | "private";
  rewardMode: "free" | "paid";
  name: string;
  owner: string;
  description?: string;
  repository?: string;
  taskCount: number;
  openTaskCount: number;
  totalRewardPool?: string;
  stack?: string[];
  status: string;
  createdAt?: string;
}

export interface LlmConfig {
  provider: string;
  apiKey?: string;
  url?: string;
  model?: string;
}
