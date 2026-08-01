'use client';
import { useSubscription } from '@apollo/client';
import { TASK_STATUS_CHANGED } from '@/lib/graphql/subscriptions';
import type { Task } from '@/types/graphql';

export function useTaskStatusSubscription(taskId: string | null | undefined) {
  const { data } = useSubscription<{ taskStatusChanged: Partial<Task> }>(
    TASK_STATUS_CHANGED,
    {
      variables: { taskId },
      skip: !taskId,
    }
  );

  return data?.taskStatusChanged ?? null;
}
