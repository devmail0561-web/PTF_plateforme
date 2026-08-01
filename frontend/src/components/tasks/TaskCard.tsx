'use client';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { formatPTF, formatAddress } from '@/lib/ptf/formatters';
import type { Task } from '@/types/graphql';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const isOpen = task.status === 'open';

  return (
    <Card className="flex flex-col gap-4 hover:border-ptf-muted transition-colors">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/tasks/${task.id}`}
          className="flex-1 min-w-0 hover:text-ptf-accent-l transition-colors"
        >
          <h3 className="font-semibold text-ptf-text text-sm leading-snug line-clamp-2">
            {task.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          <TaskPriorityBadge priority={task.priority} />
          <TaskStatusBadge status={task.status} />
        </div>
      </div>

      {task.rewardMode === 'paid' && task.rewardAmount != null ? (
        <div className="flex items-center gap-1">
          <span className="font-mono font-bold text-ptf-accent text-base">
            {formatPTF(task.rewardAmount)}
          </span>
          <span className="text-xs text-ptf-text-3">{task.rewardToken ?? 'USDC'}</span>
        </div>
      ) : (
        <span className="text-xs text-ptf-text-3 italic">Free / Reputation only</span>
      )}

      <div className="flex items-center justify-between text-xs text-ptf-text-2 gap-2">
        <div className="flex flex-col gap-1">
          {task.claimCriteria.minReputation != null && (
            <span>Rep. req: <span className="text-ptf-text font-medium">{task.claimCriteria.minReputation}</span></span>
          )}
          {task.claimCriteria.requiredSkills?.length ? (
            <div className="flex gap-1 flex-wrap">
              {task.claimCriteria.requiredSkills.slice(0, 3).map((s) => (
                <span key={s} className="px-1.5 py-0.5 bg-ptf-muted/50 rounded text-xs">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          {task.deadline ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-ptf-text-3">Deadline</span>
              <Countdown deadline={task.deadline} />
            </div>
          ) : (
            <span className="text-ptf-text-3">{task.duration}</span>
          )}
        </div>
      </div>

      {task.devAddress && task.status !== 'open' && (
        <p className="text-xs text-ptf-text-3 font-mono">
          Dev: {formatAddress(task.devAddress)}
        </p>
      )}

      {isOpen && (
        <div className="pt-2 border-t border-ptf-border">
          <p className="text-xs text-ptf-text-3 mb-1">Claim via CLI</p>
          <code className="block text-xs font-mono bg-ptf-bg border border-ptf-border rounded px-2 py-1.5 text-ptf-accent-l truncate">
            ptf task claim {task.id.slice(0, 20)}…
          </code>
        </div>
      )}
    </Card>
  );
}
