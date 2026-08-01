import { Badge } from '@/components/ui/Badge';
import { REPUTATION_LEVELS } from '@/lib/ptf/constants';
import type { ReputationLevel } from '@/types/graphql';
import { clsx } from 'clsx';

interface ReputationLevelBadgeProps {
  level: ReputationLevel;
  size?: 'sm' | 'md';
}

export function ReputationLevelBadge({ level, size = 'md' }: ReputationLevelBadgeProps) {
  const info = REPUTATION_LEVELS.find((l) => l.level === level) ?? REPUTATION_LEVELS[0];
  return (
    <Badge
      variant="outline"
      className={clsx(
        info.bgClass,
        info.textClass,
        `border-current/30`,
        size === 'sm' && 'text-xs px-1.5 py-0.5',
        size === 'md' && 'text-sm px-2.5 py-1 font-semibold'
      )}
    >
      {level}
    </Badge>
  );
}
