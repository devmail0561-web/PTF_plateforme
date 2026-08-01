import { Badge } from '@/components/ui/Badge';
import { PRIORITY_LABELS, PRIORITY_COLOR } from '@/lib/ptf/constants';
import type { TaskPriority } from '@/types/graphql';
import { clsx } from 'clsx';

interface TaskPriorityBadgeProps {
  priority: TaskPriority;
}

export function TaskPriorityBadge({ priority }: TaskPriorityBadgeProps) {
  return (
    <Badge className={clsx('bg-ptf-muted/50', PRIORITY_COLOR[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
