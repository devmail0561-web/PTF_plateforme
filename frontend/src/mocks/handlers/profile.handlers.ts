import { graphql, HttpResponse } from 'msw';
import {
  mockReputation,
  mockReputationExpert,
  mockCreditHistory,
  mockUTXOBalance,
  mockReputationHistory,
} from '../data/profile.fixture';

export const profileHandlers = [
  graphql.query('GetReputation', ({ variables }) => {
    const rep =
      variables.address === '0xMockDev0000000000000000000000000000002'
        ? mockReputationExpert
        : mockReputation;
    return HttpResponse.json({ data: { reputationScore: rep } });
  }),

  graphql.query('GetCreditHistory', ({ variables }) => {
    const limit = variables.limit ?? 20;
    const offset = variables.offset ?? 0;
    const sliced = mockCreditHistory.slice(offset, offset + limit);
    return HttpResponse.json({ data: { creditHistory: sliced } });
  }),

  graphql.query('GetUTXOBalance', () => {
    return HttpResponse.json({ data: { utxoBalance: mockUTXOBalance } });
  }),

  graphql.query('GetWalletStatus', ({ variables }) => {
    return HttpResponse.json({
      data: {
        walletStatus: {
          address: variables.address,
          ptfBalance: 760.50,
          softLocked: 20.00,
          available: 740.50,
          reputationScore: mockReputation.total,
          reputationLevel: mockReputation.level,
          linkedChains: ['polygon'],
          isValidAddress: true,
          isActivated: true,
          hasGasFees: true,
          isNotBanned: true,
          ownershipProven: true,
          meetsMinBalance: true,
        },
      },
    });
  }),

  graphql.query('GetReputationHistory', ({ variables }) => {
    const limit = variables.limit ?? 20;
    const sliced = mockReputationHistory.slice(0, limit);
    return HttpResponse.json({ data: { reputationHistory: sliced } });
  }),

  graphql.query('GetUTXOs', ({ variables }) => {
    const allUtxos = [
      { id: 'utxo-001', amount: 150.00, sourceType: 'task_reward', sourceId: 'task-006', chain: 'polygon', status: 'unspent', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'utxo-002', amount: 500.00, sourceType: 'deposit', sourceId: null, chain: 'polygon', status: 'unspent', createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
      { id: 'utxo-003', amount: 20.00, sourceType: 'soft_lock', sourceId: 'task-005', chain: 'polygon', status: 'locked', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: 'utxo-004', amount: 80.00, sourceType: 'task_reward', sourceId: 'task-004', chain: 'polygon', status: 'unspent', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
      { id: 'utxo-005', amount: 30.00, sourceType: 'task_reward', sourceId: 'task-002', chain: 'polygon', status: 'spent', createdAt: new Date(Date.now() - 20 * 86400000).toISOString() },
    ];
    const filtered = variables.status
      ? allUtxos.filter((u) => u.status === variables.status)
      : allUtxos;
    return HttpResponse.json({ data: { utxos: filtered } });
  }),
];
