import type { ReputationLevel, TaskStatus, TaskPriority } from '@/types/graphql';

export const REPUTATION_LEVELS: Array<{
  level: ReputationLevel;
  min: number;
  max: number | null;
  color: string;
  bgClass: string;
  textClass: string;
}> = [
  { level: 'Unranked', min: 0,    max: 99,   color: '#6B7280', bgClass: 'bg-rep-unranked/20', textClass: 'text-rep-unranked' },
  { level: 'Junior',   min: 100,  max: 499,  color: '#3B82F6', bgClass: 'bg-rep-junior/20',   textClass: 'text-rep-junior' },
  { level: 'Senior',   min: 500,  max: 1999, color: '#8B5CF6', bgClass: 'bg-rep-senior/20',   textClass: 'text-rep-senior' },
  { level: 'Expert',   min: 2000, max: null, color: '#F59E0B', bgClass: 'bg-rep-expert/20',   textClass: 'text-rep-expert' },
];

export const NEXT_LEVEL_THRESHOLD: Record<ReputationLevel, number | null> = {
  Unranked: 100,
  Junior: 500,
  Senior: 2000,
  Expert: null,
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  validated: 'Validated',
  rejected: 'Rejected',
  disputed: 'Disputed',
  expired: 'Expired',
  blocked: 'Blocked',
};

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  open: 'text-status-open',
  claimed: 'text-status-claimed',
  in_progress: 'text-status-progress',
  submitted: 'text-status-submitted',
  under_review: 'text-status-review',
  validated: 'text-status-validated',
  rejected: 'text-status-rejected',
  disputed: 'text-status-disputed',
  expired: 'text-status-expired',
  blocked: 'text-status-blocked',
};

export const TASK_STATUS_BG: Record<TaskStatus, string> = {
  open: 'bg-status-open/10 border-status-open/30',
  claimed: 'bg-status-claimed/10 border-status-claimed/30',
  in_progress: 'bg-status-progress/10 border-status-progress/30',
  submitted: 'bg-status-submitted/10 border-status-submitted/30',
  under_review: 'bg-status-review/10 border-status-review/30',
  validated: 'bg-status-validated/10 border-status-validated/30',
  rejected: 'bg-status-rejected/10 border-status-rejected/30',
  disputed: 'bg-status-disputed/10 border-status-disputed/30',
  expired: 'bg-status-expired/10 border-status-expired/30',
  blocked: 'bg-status-blocked/10 border-status-blocked/30',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: 'text-priority-critical',
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
};

export const SUPPORTED_CHAINS = ['polygon', 'polygonAmoy', 'ethereum'] as const;

export const CREDIT_TYPE_LABELS: Record<string, string> = {
  task_reward: 'Task Reward',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  punishment: 'Punishment',
  bridge_in: 'Bridge In',
  bridge_out: 'Bridge Out',
  soft_lock: 'Soft Lock',
  soft_unlock: 'Soft Unlock',
};
