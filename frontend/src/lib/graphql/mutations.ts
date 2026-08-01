import { gql } from '@apollo/client';

export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      token
      encryptedKey
      user {
        id
        email
        ptfAddress
        githubLinked
        walletLinked
        wallets { id chain address isPrimary }
      }
    }
  }
`;

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      encryptedKey
      user { id email ptfAddress githubLinked walletLinked }
      pendingSessionId
      requiresVerification
    }
  }
`;

export const VERIFY_NEW_DEVICE = gql`
  mutation VerifyNewDevice($pendingSessionId: ID!, $otp: String!) {
    verifyNewDevice(pendingSessionId: $pendingSessionId, otp: $otp) {
      token
      encryptedKey
      deviceToken
      user { id email ptfAddress githubLinked walletLinked wallets { id chain address isPrimary } }
    }
  }
`;

export const REQUEST_GITHUB_OAUTH_STATE = gql`
  mutation RequestGithubOAuthState {
    requestGithubOAuthState { state }
  }
`;

export const LINK_GITHUB = gql`
  mutation LinkGithub($code: String!, $state: String!) {
    linkGithub(code: $code, state: $state) {
      token
      user { id githubLinked githubHandle walletLinked wallets { id chain address isPrimary } }
    }
  }
`;

export const REQUEST_WALLET_CHALLENGE = gql`
  mutation RequestWalletChallenge($chain: String!, $address: String!) {
    requestWalletChallenge(chain: $chain, address: $address) {
      challengeId
      nonce
    }
  }
`;

export const CONFIRM_LINK_WALLET = gql`
  mutation ConfirmLinkWallet($challengeId: ID!, $signature: String!) {
    confirmLinkWallet(challengeId: $challengeId, signature: $signature) {
      token
      walletLink { id chain address isPrimary }
    }
  }
`;


export const CANCEL_TASK = gql`
  mutation CancelTask($taskId: ID!) {
    cancelTask(taskId: $taskId)
  }
`;
