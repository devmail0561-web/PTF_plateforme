import { gql } from '@apollo/client';

export const TASK_STATUS_CHANGED = gql`
  subscription TaskStatusChanged($taskId: ID!) {
    taskStatusChanged(taskId: $taskId) {
      id
      status
      deadline
      claimedAt
      devAddress
    }
  }
`;
