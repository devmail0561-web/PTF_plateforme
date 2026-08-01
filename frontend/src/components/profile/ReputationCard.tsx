import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ReputationLevelBadge } from './ReputationLevelBadge';
import { REPUTATION_LEVELS } from '@/lib/ptf/constants';
import type { ReputationLevel } from '@/types/graphql';

interface ReputationCardProps {
  total: number;
  level: ReputationLevel;
  completedTasks: number;
  progressPct: number;
  nextThreshold: number | null;
}

export function ReputationCard({ total, level, completedTasks, progressPct, nextThreshold }: ReputationCardProps) {
  const levelInfo = REPUTATION_LEVELS.find((l) => l.level === level) ?? REPUTATION_LEVELS[0];

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ptf-text">Reputation</h2>
        <ReputationLevelBadge level={level} />
      </div>

      <div className="text-center">
        <p className="font-mono text-5xl font-bold" style={{ color: levelInfo.color }}>
          {total.toLocaleString()}
        </p>
        <p className="text-sm text-ptf-text-2 mt-1">reputation points</p>
      </div>

      <div className="flex flex-col gap-2">
        <div style={{ color: levelInfo.color }}>
          <ProgressBar
            value={progressPct}
            max={100}
            colorClass="bg-current"
          />
        </div>
        {nextThreshold ? (
          <p className="text-xs text-ptf-text-3 text-right">
            {total} / {nextThreshold} → {REPUTATION_LEVELS[REPUTATION_LEVELS.findIndex(l => l.level === level) + 1]?.level}
          </p>
        ) : (
          <p className="text-xs text-rep-expert text-right font-medium">Max level reached</p>
        )}
      </div>

      <div className="border-t border-ptf-border pt-4">
        <p className="text-sm text-ptf-text-2">
          <span className="font-semibold text-ptf-text">{completedTasks}</span> tasks completed
        </p>
      </div>
    </Card>
  );
}
