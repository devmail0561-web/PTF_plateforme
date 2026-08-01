'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_MY_TASKS, GET_UTXO_BALANCE } from '@/lib/graphql/queries';
import { CANCEL_TASK } from '@/lib/graphql/mutations';
import { useAuthStore } from '@/lib/auth/authStore';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { Countdown } from '@/components/ui/Countdown';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ReputationLevelBadge } from '@/components/profile/ReputationLevelBadge';
import { UTXOBalanceCard } from '@/components/profile/UTXOBalanceCard';
import { useReputationScore } from '@/hooks/useReputationScore';
import { useTaskStatusSubscription } from '@/hooks/useTaskStatusSubscription';
import { formatPTF } from '@/lib/ptf/formatters';
import { toast } from '@/lib/toast/toastStore';
import Link from 'next/link';
import type { Task, UTXOBalance } from '@/types/graphql';

function CliLine({ children }: { children: string }) {
  return (
    <code className="block text-xs font-mono bg-ptf-bg border border-ptf-border rounded px-2 py-1.5 text-ptf-accent-l">
      {children}
    </code>
  );
}

function ActiveTaskCard({ task }: { task: Task }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTask, { loading: cancelling }] = useMutation(CANCEL_TASK, {
    refetchQueries: ['GetMyTasks'],
  });

  const liveUpdate = useTaskStatusSubscription(task.id);
  const liveStatus = liveUpdate?.status ?? task.status;
  const isSubmittable = ['claimed', 'in_progress'].includes(liveStatus);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link href={`/tasks/${task.id}`} className="hover:text-ptf-accent-l transition-colors">
            <h3 className="font-semibold text-ptf-text text-sm leading-snug line-clamp-2">{task.title}</h3>
          </Link>
          <p className="text-xs text-ptf-text-3 mt-1 line-clamp-2">{task.context}</p>
        </div>
        <TaskStatusBadge status={liveStatus} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-ptf-text-3">Deadline</span>
          <Countdown deadline={task.deadline} />
        </div>
        {task.rewardMode === 'paid' && task.rewardAmount != null && (
          <div className="text-right">
            <span className="text-xs text-ptf-text-3">Reward</span>
            <p className="font-mono font-bold text-ptf-accent text-sm">{formatPTF(task.rewardAmount)}</p>
          </div>
        )}
      </div>

      {/* CLI submit command */}
      {isSubmittable && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-ptf-text-3">Submit via CLI when ready:</p>
          <CliLine>ptf submit</CliLine>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-ptf-border">
        <Link
          href={`/tasks/${task.id}`}
          className="flex-1 text-center px-3 py-1.5 text-xs font-medium bg-ptf-surface hover:bg-ptf-elevated text-ptf-text border border-ptf-border rounded-lg transition-colors"
        >
          View details
        </Link>
        {isSubmittable && (
          <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
            Cancel task
          </Button>
        )}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel task?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ptf-text-2">
            Are you sure you want to abandon <span className="text-ptf-text font-medium">{task.title}</span>?
            {task.rewardMode === 'paid' && (
              <span className="text-ptf-warning block mt-1">
                A late delivery penalty may apply if more than 50% of the duration has elapsed.
              </span>
            )}
          </p>
          <p className="text-xs text-ptf-text-3">
            You can also cancel via CLI: <code className="font-mono text-ptf-accent-l">ptf task cancel {task.id.slice(0, 16)}…</code>
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep working</Button>
            <Button
              variant="danger"
              loading={cancelling}
              onClick={async () => {
                await cancelTask({ variables: { taskId: task.id } });
                toast.info('Task cancelled.');
                setCancelOpen(false);
              }}
            >
              Yes, cancel
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const address = user?.ptfAddress;

  const { data: tasksData, loading } = useQuery<{ myTasks: Task[] }>(GET_MY_TASKS);
  const { data: balData } = useQuery<{ utxoBalance: UTXOBalance }>(GET_UTXO_BALANCE, {
    variables: { address: address ?? '' },
    skip: !address,
  });

  const { level, score, completedTasks } = useReputationScore(address);
  const balance = balData?.utxoBalance;

  const activeTasks = (tasksData?.myTasks ?? []).filter(
    (t) => ['claimed', 'in_progress', 'submitted', 'under_review'].includes(t.status)
  );
  const historyTasks = (tasksData?.myTasks ?? []).filter(
    (t) => ['validated', 'rejected', 'expired'].includes(t.status)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold text-ptf-text">Dashboard</h1>
            <p className="text-sm text-ptf-text-2 mt-1">Your active tasks and history</p>
          </div>

          <section>
            <h2 className="text-base font-semibold text-ptf-text mb-3">
              Active Tasks
              <span className="ml-2 text-sm font-normal text-ptf-text-3">({activeTasks.length})</span>
            </h2>
            {loading ? (
              <p className="text-ptf-text-3 text-sm">Loading tasks...</p>
            ) : activeTasks.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-ptf-text-3 mb-3">No active tasks.</p>
                <p className="text-xs text-ptf-text-3 mb-2">Claim a task via CLI:</p>
                <code className="text-xs font-mono text-ptf-accent-l">ptf task claim &lt;taskId&gt;</code>
                <p className="mt-3">
                  <Link href="/tasks" className="text-ptf-accent-l hover:underline text-sm">
                    Browse the marketplace →
                  </Link>
                </p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {activeTasks.map((task) => (
                  <ActiveTaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </section>

          {historyTasks.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-ptf-text mb-3">
                History
                <span className="ml-2 text-sm font-normal text-ptf-text-3">({historyTasks.length})</span>
              </h2>
              <div className="flex flex-col divide-y divide-ptf-border">
                {historyTasks.map((task) => (
                  <div key={task.id} className="py-3 flex items-center justify-between gap-4">
                    <Link href={`/tasks/${task.id}`} className="text-sm text-ptf-text hover:text-ptf-accent-l transition-colors truncate">
                      {task.title}
                    </Link>
                    <div className="flex items-center gap-3 shrink-0">
                      {task.rewardAmount != null && (
                        <span className="font-mono text-xs text-ptf-success">{formatPTF(task.rewardAmount)}</span>
                      )}
                      <TaskStatusBadge status={task.status} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:w-72 flex flex-col gap-4">
          <Card className="p-4">
            <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-3">Reputation</p>
            <div className="flex items-center gap-2">
              <ReputationLevelBadge level={level} />
              <span className="font-mono font-bold text-ptf-text">{score} pts</span>
            </div>
            <p className="text-xs text-ptf-text-3 mt-2">{completedTasks} tasks completed</p>
            {address && (
              <Link href={`/profile/${address}`} className="text-xs text-ptf-accent-l hover:underline mt-2 block">
                View full profile →
              </Link>
            )}
          </Card>

          {balance && (
            <UTXOBalanceCard
              available={balance.available}
              locked={balance.locked}
              total={balance.total}
            />
          )}

          <Card className="p-4">
            <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-3">Quick CLI</p>
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <p className="text-ptf-text-3 mb-1">Claim a task</p>
                <code className="font-mono text-ptf-accent-l block bg-ptf-bg border border-ptf-border rounded px-2 py-1">ptf task claim &lt;id&gt;</code>
              </div>
              <div>
                <p className="text-ptf-text-3 mb-1">Submit your work</p>
                <code className="font-mono text-ptf-accent-l block bg-ptf-bg border border-ptf-border rounded px-2 py-1">ptf submit</code>
              </div>
              <div>
                <p className="text-ptf-text-3 mb-1">Check status</p>
                <code className="font-mono text-ptf-accent-l block bg-ptf-bg border border-ptf-border rounded px-2 py-1">ptf status</code>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
