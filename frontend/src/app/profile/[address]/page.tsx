'use client';
import { useQuery } from '@apollo/client';
import { useParams } from 'next/navigation';
import { GET_REPUTATION, GET_CREDIT_HISTORY, GET_UTXO_BALANCE, GET_TASKS } from '@/lib/graphql/queries';
import { ReputationCard } from '@/components/profile/ReputationCard';
import { UTXOBalanceCard } from '@/components/profile/UTXOBalanceCard';
import { CreditHistoryTable } from '@/components/profile/CreditHistoryTable';
import { ReputationHistoryTable } from '@/components/profile/ReputationHistoryTable';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/lib/auth/authStore';
import { useReputationScore } from '@/hooks/useReputationScore';
import { REPUTATION_LEVELS, NEXT_LEVEL_THRESHOLD } from '@/lib/ptf/constants';
import { formatPTF, formatAddress, formatDate } from '@/lib/ptf/formatters';
import Link from 'next/link';
import type { CreditEvent, UTXOBalance, Task, ReputationScore } from '@/types/graphql';

function CopyButton({ text }: { text: string }) {
  const copy = () => navigator.clipboard.writeText(text);
  return (
    <button onClick={copy} className="text-ptf-text-3 hover:text-ptf-text transition-colors text-xs" title="Copy address">
      ⎘
    </button>
  );
}

export default function ProfilePage() {
  const { address } = useParams<{ address: string }>();
  const { user } = useAuthStore();
  const isOwnProfile = user?.ptfAddress?.toLowerCase() === address?.toLowerCase();

  const { data: repData } = useQuery<{ reputationScore: ReputationScore }>(GET_REPUTATION, {
    variables: { address },
  });
  const { data: histData, loading: histLoading } = useQuery<{ creditHistory: CreditEvent[] }>(GET_CREDIT_HISTORY, {
    variables: { address, limit: 20 },
  });
  const { data: balData } = useQuery<{ utxoBalance: UTXOBalance }>(GET_UTXO_BALANCE, {
    variables: { address },
  });
  const { data: tasksData } = useQuery<{ tasks: Task[] }>(GET_TASKS, {
    variables: { filter: { devAddress: address, status: 'validated' } },
  });

  const rep = repData?.reputationScore;
  const levelInfo = rep
    ? REPUTATION_LEVELS.find((l) => l.level === rep.level) ?? REPUTATION_LEVELS[0]
    : REPUTATION_LEVELS[0];
  const nextThreshold = rep ? NEXT_LEVEL_THRESHOLD[rep.level] : 100;
  const progressPct =
    rep && nextThreshold
      ? Math.min(100, ((rep.total - levelInfo.min) / (nextThreshold - levelInfo.min)) * 100)
      : rep?.level === 'Expert'
      ? 100
      : 0;

  const balance = balData?.utxoBalance;
  const completedTasks = tasksData?.tasks ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-ptf-text">
              {formatAddress(address)}
            </h1>
            <CopyButton text={address} />
          </div>
          {isOwnProfile && (
            <span className="text-xs text-ptf-accent-l">This is you</span>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {rep ? (
          <ReputationCard
            total={rep.total}
            level={rep.level}
            completedTasks={rep.completedTasks}
            progressPct={progressPct}
            nextThreshold={nextThreshold}
          />
        ) : (
          <Card className="text-ptf-text-3 text-sm">Loading reputation...</Card>
        )}

        {balance ? (
          <UTXOBalanceCard
            available={balance.available}
            locked={balance.locked}
            total={balance.total}
          />
        ) : (
          <Card className="text-ptf-text-3 text-sm">Loading balance...</Card>
        )}
      </div>

      <Card>
        <h2 className="text-base font-semibold text-ptf-text mb-4">
          Credit History
        </h2>
        <CreditHistoryTable
          events={histData?.creditHistory ?? []}
          loading={histLoading}
        />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ptf-text mb-4">
          Reputation History
        </h2>
        <ReputationHistoryTable address={address} />
      </Card>

      {completedTasks.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-ptf-text mb-4">
            Completed Tasks
            <span className="ml-2 text-sm font-normal text-ptf-text-3">({completedTasks.length})</span>
          </h2>
          <div className="flex flex-col divide-y divide-ptf-border">
            {completedTasks.map((task) => (
              <div key={task.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/tasks/${task.id}`} className="text-sm text-ptf-text hover:text-ptf-accent-l transition-colors truncate block">
                    {task.title}
                  </Link>
                  <p className="text-xs text-ptf-text-3">{formatDate(task.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {task.rewardAmount != null && (
                    <span className="font-mono text-xs text-ptf-success">{formatPTF(task.rewardAmount)}</span>
                  )}
                  <TaskStatusBadge status={task.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
