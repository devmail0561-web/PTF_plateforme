import { gql } from '@apollo/client';

export const GET_TASKS = gql`
  query GetTasks($filter: TaskFilterInput) {
    tasks(filter: $filter) {
      id
      projectId
      title
      type
      priority
      status
      rewardAmount
      rewardToken
      rewardMode
      duration
      deadline
      claimedAt
      devAddress
      dependencies
      scoring { complexity effort impact }
      reputationPoints
      claimCriteria { minReputation minCompletedTasks requiredSkills maxActiveTasks }
      punishments {
        lateDelivery { credits reputation }
        maliciousCode { credits reputation }
        criticalBug { credits reputation }
        nonCriticalBug { credits reputation }
      }
      createdAt
    }
  }
`;

export const GET_TASK = gql`
  query GetTask($id: ID!) {
    task(id: $id) {
      id
      projectId
      title
      type
      priority
      status
      context
      objective
      deliverable
      outOfScope
      rewardAmount
      rewardToken
      rewardMode
      duration
      deadline
      claimedAt
      devAddress
      dependencies
      scoring { complexity effort impact }
      reputationPoints
      claimCriteria { minReputation minCompletedTasks requiredSkills maxActiveTasks }
      punishments {
        lateDelivery { credits reputation }
        maliciousCode { credits reputation }
        criticalBug { credits reputation }
        nonCriticalBug { credits reputation }
      }
      verificationSteps { type command expectedOutput threshold }
      constraints {
        maxFiles maxLinesPerFile maxTotalLines
        requiredTests minTestCoverage languages forbiddenPatterns
      }
      createdAt
    }
  }
`;

export const GET_MY_TASKS = gql`
  query GetMyTasks($status: String) {
    myTasks(status: $status) {
      id
      projectId
      title
      type
      priority
      status
      context
      objective
      deliverable
      rewardAmount
      rewardToken
      rewardMode
      duration
      deadline
      claimedAt
      devAddress
      scoring { complexity effort impact }
      reputationPoints
      punishments {
        lateDelivery { credits reputation }
      }
      verificationSteps { type command expectedOutput threshold }
      createdAt
    }
  }
`;

export const GET_REPUTATION = gql`
  query GetReputation($address: String!) {
    reputationScore(address: $address) {
      address
      total
      level
      completedTasks
    }
  }
`;

export const GET_CREDIT_HISTORY = gql`
  query GetCreditHistory($address: String!, $limit: Int, $offset: Int) {
    creditHistory(address: $address, limit: $limit, offset: $offset) {
      id
      type
      direction
      amount
      balanceAfter
      taskId
      projectId
      chain
      txHash
      note
      createdAt
    }
  }
`;

export const GET_UTXO_BALANCE = gql`
  query GetUTXOBalance($address: String!) {
    utxoBalance(address: $address) {
      address
      available
      locked
      total
    }
  }
`;

export const GET_REPUTATION_HISTORY = gql`
  query GetReputationHistory($address: String!, $limit: Int) {
    reputationHistory(address: $address, limit: $limit) {
      id
      delta
      reason
      taskId
      chain
      txHash
      createdAt
    }
  }
`;

export const GET_PROJECTS = gql`
  query GetProjects($filter: ProjectFilterInput) {
    projects(filter: $filter) {
      id
      name
      type
      rewardMode
      chain
      status
      owner
      repository
      stack
      taskCount
      openTaskCount
      totalRewardPool
      escrowBalance
      isOpenSource
      license
      createdAt
    }
  }
`;

export const GET_WALLET_STATUS = gql`
  query GetWalletStatus($address: String!, $chain: String!) {
    walletStatus(address: $address, chain: $chain) {
      address
      ptfBalance
      softLocked
      available
      reputationScore
      reputationLevel
      linkedChains
      isValidAddress
      isActivated
      hasGasFees
      isNotBanned
      ownershipProven
      meetsMinBalance
    }
  }
`;
