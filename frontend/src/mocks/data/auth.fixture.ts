import type { UserProfile } from '@/types/graphql';

export const mockUser: UserProfile = {
  id: 'user-mock-001',
  email: 'dev@ptf.example',
  ptfAddress: '0xMockCurrentUser0000000000000000000001',
  githubHandle: 'mockdev',
  githubLinked: true,
  walletLinked: true,
  wallets: [
    { id: 'wallet-001', chain: 'polygon', address: '0xMockWallet0000000000000000000000001', isPrimary: true },
  ],
  skills: ['TypeScript', 'GraphQL', 'Node.js'],
};

export const mockJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({
    userId: 'user-mock-001',
    ptfAddress: '0xMockCurrentUser0000000000000000000001',
    githubLinked: true,
    walletLinked: true,
    deviceId: 'device-mock-001',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  })).replace(/=/g, '') +
  '.mock-signature';

export const mockPendingSession = {
  pendingSessionId: 'pending-session-mock-001',
  requiresVerification: true,
};
