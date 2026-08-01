import type { ReputationScore, CreditEvent, UTXOBalance, ReputationEvent } from '@/types/graphql';

export const mockReputation: ReputationScore = {
  address: '0xMockDev0000000000000000000000000000001',
  total: 850,
  level: 'Senior',
  completedTasks: 12,
};

export const mockReputationExpert: ReputationScore = {
  address: '0xMockDev0000000000000000000000000000002',
  total: 2340,
  level: 'Expert',
  completedTasks: 31,
};

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockCreditHistory: CreditEvent[] = [
  {
    id: 'evt-001',
    devAddress: '0xMockDev0000000000000000000000000000001',
    type: 'task_reward',
    direction: 'credit',
    amount: 150.00,
    balanceAfter: 890.50,
    taskId: 'task-006',
    projectId: 'proj-002',
    chain: 'polygon',
    txHash: '0xabc123def456aaa0000000000000000000000000000000000000000000000001',
    note: null,
    createdAt: daysAgo(1),
  },
  {
    id: 'evt-002',
    devAddress: '0xMockDev0000000000000000000000000000001',
    type: 'task_reward',
    direction: 'credit',
    amount: 80.00,
    balanceAfter: 740.50,
    taskId: 'task-004',
    projectId: 'proj-001',
    chain: 'polygon',
    txHash: '0xbbb000000000000000000000000000000000000000000000000000000000002',
    note: null,
    createdAt: daysAgo(5),
  },
  {
    id: 'evt-003',
    devAddress: '0xMockDev0000000000000000000000000000001',
    type: 'deposit',
    direction: 'credit',
    amount: 500.00,
    balanceAfter: 660.50,
    taskId: null,
    projectId: null,
    chain: 'polygon',
    txHash: '0xccc000000000000000000000000000000000000000000000000000000000003',
    note: 'Initial deposit',
    createdAt: daysAgo(10),
  },
  {
    id: 'evt-004',
    devAddress: '0xMockDev0000000000000000000000000000001',
    type: 'punishment',
    direction: 'debit',
    amount: 5.00,
    balanceAfter: 160.50,
    taskId: 'task-002',
    projectId: 'proj-001',
    chain: 'polygon',
    txHash: null,
    note: 'nonCriticalBug penalty',
    createdAt: daysAgo(15),
  },
  {
    id: 'evt-005',
    devAddress: '0xMockDev0000000000000000000000000000001',
    type: 'task_reward',
    direction: 'credit',
    amount: 120.00,
    balanceAfter: 165.50,
    taskId: 'task-003',
    projectId: 'proj-002',
    chain: 'polygon',
    txHash: '0xddd000000000000000000000000000000000000000000000000000000000004',
    note: null,
    createdAt: daysAgo(20),
  },
];

export const mockUTXOBalance: UTXOBalance = {
  address: '0xMockDev0000000000000000000000000000001',
  available: 740.50,
  locked: 20.00,
  total: 760.50,
};

export const mockReputationHistory: ReputationEvent[] = [
  {
    id: 'rep-evt-001',
    delta: 120,
    reason: 'task_validated',
    taskId: 'task-006',
    chain: 'polygon',
    txHash: '0xabc123def456aaa0000000000000000000000000000000000000000000000001',
    createdAt: daysAgo(1),
  },
  {
    id: 'rep-evt-002',
    delta: 70,
    reason: 'task_validated',
    taskId: 'task-004',
    chain: 'polygon',
    txHash: '0xbbb000000000000000000000000000000000000000000000000000000000002',
    createdAt: daysAgo(5),
  },
  {
    id: 'rep-evt-003',
    delta: -2,
    reason: 'non_critical_bug',
    taskId: 'task-002',
    chain: 'polygon',
    txHash: null,
    createdAt: daysAgo(15),
  },
  {
    id: 'rep-evt-004',
    delta: 80,
    reason: 'task_validated',
    taskId: 'task-003',
    chain: 'polygon',
    txHash: '0xddd000000000000000000000000000000000000000000000000000000000004',
    createdAt: daysAgo(20),
  },
];
