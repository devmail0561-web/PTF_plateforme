export type TaskStatus =
  | 'open'
  | 'claimed'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'validated'
  | 'rejected'
  | 'disputed'
  | 'expired'
  | 'blocked';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType = string;
export type RewardMode = 'free' | 'paid';
export type ReputationLevel = 'Unranked' | 'Junior' | 'Senior' | 'Expert';

export interface TaskScoring {
  complexity: number;
  effort: number;
  impact: number;
}

export interface ClaimCriteria {
  minReputation: number | null;
  minCompletedTasks: number | null;
  requiredSkills: string[] | null;
  maxActiveTasks: number | null;
}

export interface PunishmentRule {
  credits: number | null;
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
  expectedOutput: string | null;
  threshold: number | null;
}

export interface TaskConstraints {
  maxFiles: number;
  maxLinesPerFile: number;
  maxTotalLines: number;
  requiredTests: boolean;
  minTestCoverage: number;
  languages: string[];
  forbiddenPatterns: string[];
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  context: string;
  objective: string;
  deliverable: string;
  outOfScope: string[];
  rewardAmount: number | null;
  rewardToken: string | null;
  rewardMode: RewardMode;
  duration: string;
  deadline: string | null;
  claimedAt: string | null;
  devAddress: string | null;
  dependencies: string[];
  scoring: TaskScoring;
  reputationPoints: number;
  claimCriteria: ClaimCriteria;
  punishments: Punishments;
  verificationSteps: VerificationStep[];
  constraints: TaskConstraints;
  createdAt: string;
}

export interface WalletLink {
  id: string;
  chain: string;
  address: string;
  isPrimary: boolean;
}

export interface UserProfile {
  id: string;
  email: string | null;
  ptfAddress: string | null;
  githubHandle: string | null;
  githubLinked: boolean;
  walletLinked: boolean;
  wallets: WalletLink[];
  skills: string[];
}

export interface JwtPayload {
  userId: string;
  ptfAddress: string;
  githubLinked: boolean;
  walletLinked: boolean;
  deviceId: string;
}

export interface ReputationScore {
  address: string;
  total: number;
  level: ReputationLevel;
  completedTasks: number;
}

export interface ReputationEvent {
  id: string;
  delta: number;
  reason: string;
  taskId: string | null;
  chain: string | null;
  txHash: string | null;
  createdAt: string;
}

export interface CreditEvent {
  id: string;
  devAddress: string;
  type: string;
  direction: string;
  amount: number;
  balanceAfter: number | null;
  taskId: string | null;
  projectId: string | null;
  chain: string;
  txHash: string | null;
  note: string | null;
  createdAt: string;
}

export interface CreditUTXO {
  id: string;
  ownerAddress: string;
  amount: number;
  sourceType: string;
  sourceId: string | null;
  projectId: string | null;
  chain: string;
  txHash: string | null;
  status: 'unspent' | 'spent' | 'locked';
  spentInTxId: string | null;
  createdAt: string;
}

export interface UTXOBalance {
  address: string;
  available: number;
  locked: number;
  total: number;
}

export interface WalletStatus {
  address: string;
  ptfBalance: number;
  softLocked: number;
  available: number;
  reputationScore: number;
  reputationLevel: ReputationLevel;
  linkedChains: string[];
  isValidAddress: boolean;
  isActivated: boolean;
  hasGasFees: boolean;
  isNotBanned: boolean;
  ownershipProven: boolean;
  meetsMinBalance: boolean;
}


export interface Project {
  id: string;
  name: string;
  type: string;
  rewardMode: RewardMode;
  chain: string;
  status: string;
  owner: string;
  repository: string | null;
  stack: string[];
  taskCount: number;
  openTaskCount: number;
  totalRewardPool: string;
  escrowBalance: number;
  isOpenSource: boolean;
  license: string | null;
  createdAt: string;
}

export interface WalletChallenge {
  challengeId: string;
  nonce: string;
}

export interface AuthResult {
  token: string;
  encryptedKey: string;
  deviceToken: string | null;
  user: UserProfile;
}

export interface LoginResult {
  token: string | null;
  encryptedKey: string | null;
  user: UserProfile | null;
  pendingSessionId: string | null;
  requiresVerification: boolean | null;
}
