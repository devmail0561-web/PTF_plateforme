import { Badge } from '@/components/ui/Badge';
import { TASK_STATUS_LABELS, TASK_STATUS_COLOR, TASK_STATUS_BG } from '@/lib/ptf/constants';
import type { TaskStatus } from '@/types/graphql';
import { clsx } from 'clsx';

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={clsx(
        TASK_STATUS_COLOR[status],
        TASK_STATUS_BG[status]
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}
