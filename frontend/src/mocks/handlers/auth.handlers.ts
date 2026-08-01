import { graphql, HttpResponse } from 'msw';
import { mockUser, mockJwt, mockPendingSession } from '../data/auth.fixture';

export const authHandlers = [
  graphql.mutation('Register', () => {
    return HttpResponse.json({
      data: {
        register: {
          token: mockJwt,
          encryptedKey: 'v1:mocksalt:mockiv:mockciphertext:mocktag',
          user: mockUser,
        },
      },
    });
  }),

  graphql.mutation('Login', ({ variables }) => {
    const { deviceToken } = variables.input ?? {};
    if (deviceToken === 'known-device-token') {
      return HttpResponse.json({
        data: {
          login: {
            token: mockJwt,
            encryptedKey: 'v1:mocksalt:mockiv:mockciphertext:mocktag',
            user: mockUser,
            pendingSessionId: null,
            requiresVerification: false,
          },
        },
      });
    }
    return HttpResponse.json({
      data: {
        login: {
          token: null,
          encryptedKey: null,
          user: null,
          ...mockPendingSession,
        },
      },
    });
  }),

  graphql.mutation('VerifyNewDevice', ({ variables }) => {
    if (variables.otp !== '123456') {
      return HttpResponse.json({
        errors: [{ message: 'Invalid OTP', extensions: { code: 'INVALID_OTP' } }],
      });
    }
    return HttpResponse.json({
      data: {
        verifyNewDevice: {
          token: mockJwt,
          encryptedKey: 'v1:mocksalt:mockiv:mockciphertext:mocktag',
          deviceToken: 'known-device-token',
          user: mockUser,
        },
      },
    });
  }),

  graphql.mutation('RequestGithubOAuthState', () => {
    return HttpResponse.json({
      data: { requestGithubOAuthState: { state: 'mock-github-state-nonce-12345' } },
    });
  }),

  graphql.mutation('LinkGithub', () => {
    return HttpResponse.json({
      data: {
        linkGithub: {
          token: mockJwt,
          user: { ...mockUser, githubLinked: true },
        },
      },
    });
  }),

  graphql.mutation('RequestWalletChallenge', () => {
    return HttpResponse.json({
      data: {
        requestWalletChallenge: {
          challengeId: 'challenge-mock-001',
          nonce: 'mock-nonce-abc123def456',
        },
      },
    });
  }),

  graphql.mutation('ConfirmLinkWallet', () => {
    return HttpResponse.json({
      data: {
        confirmLinkWallet: {
          token: mockJwt,
          walletLink: { id: 'wallet-001', chain: 'polygon', address: '0xMockWallet0000000000000000000000001', isPrimary: true },
        },
      },
    });
  }),
];
