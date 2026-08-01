'use client';
import { useQuery } from '@apollo/client';
import { useParams } from 'next/navigation';
import { GET_TASK } from '@/lib/graphql/queries';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskTemplate } from '@/components/tasks/TaskTemplate';
import { Countdown } from '@/components/ui/Countdown';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatPTF, formatAddress } from '@/lib/ptf/formatters';
import type { Task } from '@/types/graphql';

function CliBlock({ children }: { children: string }) {
  return (
    <code className="block text-xs font-mono bg-ptf-bg border border-ptf-border rounded px-3 py-2 text-ptf-accent-l">
      {children}
    </code>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useQuery<{ task: Task }>(GET_TASK, {
    variables: { id },
  });

  if (loading) return (
    <div className="flex justify-center py-16">
      <Spinner size="lg" className="text-ptf-accent" />
    </div>
  );

  if (error || !data?.task) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <p className="text-ptf-error">{error?.message ?? 'Task not found'}</p>
    </div>
  );

  const task = data.task;
  const isOpen = task.status === 'open';
  const isActive = ['claimed', 'in_progress'].includes(task.status);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <TaskPriorityBadge priority={task.priority} />
            <TaskStatusBadge status={task.status} />
          </div>
          <h1 className="text-2xl font-bold text-ptf-text">{task.title}</h1>
        </div>
        {task.rewardMode === 'paid' && task.rewardAmount != null && (
          <div className="text-right shrink-0">
            <p className="font-mono text-2xl font-bold text-ptf-accent">{formatPTF(task.rewardAmount)}</p>
            <p className="text-xs text-ptf-text-3">{task.rewardToken ?? 'PTF'}</p>
          </div>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Deadline</p>
          <Countdown deadline={task.deadline} />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Duration</p>
          <p className="font-mono text-sm font-semibold text-ptf-text">{task.duration}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Reputation</p>
          <p className="font-mono text-sm font-semibold text-ptf-text">+{task.reputationPoints} pts</p>
        </Card>
      </div>

      {/* CLI action block — always visible, content depends on status */}
      <Card className="bg-ptf-elevated border-ptf-border">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-ptf-text">
            {isOpen ? 'Claim this task' : isActive ? 'Submit your work' : 'CLI commands'}
          </span>
          <Badge className="bg-ptf-accent/10 text-ptf-accent border border-ptf-accent/20 text-[10px]">CLI only</Badge>
        </div>

        {isOpen && (
          <div className="flex flex-col gap-2 text-sm text-ptf-text-2">
            <CliBlock>{`ptf task claim ${task.id}`}</CliBlock>
            <p className="text-xs text-ptf-text-3">
              Verifies wallet criteria, soft-locks 10 PTF, creates branch <code className="font-mono text-ptf-text-3">ptf/{task.id.slice(0, 16)}…</code>, and registers the claim on-chain.
            </p>
          </div>
        )}

        {isActive && (
          <div className="flex flex-col gap-3 text-sm text-ptf-text-2">
            <div>
              <p className="text-xs text-ptf-text-3 mb-1">When you&apos;re done:</p>
              <CliBlock>ptf submit</CliBlock>
              <p className="text-xs text-ptf-text-3 mt-1">
                Auto-detects branch <code className="font-mono">ptf/{task.id.slice(0, 16)}…</code>, runs verification steps, pushes and submits.
              </p>
            </div>
            <div>
              <p className="text-xs text-ptf-text-3 mb-1">To abandon:</p>
              <CliBlock>{`ptf task cancel ${task.id}`}</CliBlock>
            </div>
          </div>
        )}

        {!isOpen && !isActive && (
          <div className="flex flex-col gap-2">
            <CliBlock>{`ptf task show ${task.id}`}</CliBlock>
            <p className="text-xs text-ptf-text-3">This task is no longer available ({task.status}).</p>
          </div>
        )}

        {task.devAddress && (
          <p className="text-xs text-ptf-text-3 font-mono mt-3 pt-3 border-t border-ptf-border">
            Claimed by: {formatAddress(task.devAddress)}
          </p>
        )}
      </Card>

      {/* Context / Objective */}
      <div className="grid sm:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Context</h2>
          <p className="text-sm text-ptf-text leading-relaxed">{task.context}</p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Objective</h2>
          <p className="text-sm text-ptf-text leading-relaxed">{task.objective}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Deliverable</h2>
        <p className="text-sm text-ptf-text leading-relaxed">{task.deliverable}</p>
      </Card>

      {/* Claim requirements */}
      {task.claimCriteria && (
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Claim Requirements</h2>
          <div className="flex flex-col gap-2 text-sm">
            {task.claimCriteria.minReputation != null && (
              <p className="text-ptf-text">Min reputation: <span className="font-semibold">{task.claimCriteria.minReputation}</span></p>
            )}
            {task.claimCriteria.minCompletedTasks != null && (
              <p className="text-ptf-text">Min completed tasks: <span className="font-semibold">{task.claimCriteria.minCompletedTasks}</span></p>
            )}
            {task.claimCriteria.maxActiveTasks != null && (
              <p className="text-ptf-text">Max active tasks: <span className="font-semibold">{task.claimCriteria.maxActiveTasks}</span></p>
            )}
            {task.claimCriteria.requiredSkills?.length ? (
              <div className="flex gap-1 flex-wrap">
                {task.claimCriteria.requiredSkills.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-ptf-muted/50 rounded text-xs font-mono">{s}</span>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      )}

      {/* Verification steps */}
      {task.verificationSteps.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Verification Steps</h2>
          <p className="text-xs text-ptf-text-3 mb-3">Run locally before submitting — <code className="font-mono">ptf submit</code> re-runs these automatically.</p>
          <div className="flex flex-col gap-3">
            {task.verificationSteps.map((step, i) => (
              <div key={i} className="bg-ptf-bg border border-ptf-border rounded-lg p-3">
                <span className="text-xs text-ptf-text-3 uppercase mr-2">{step.type}</span>
                <code className="text-sm font-mono text-ptf-accent-l">{step.command}</code>
                {step.expectedOutput && (
                  <p className="text-xs text-ptf-text-3 mt-1">Expected: {step.expectedOutput}</p>
                )}
                {step.threshold != null && (
                  <p className="text-xs text-ptf-text-3 mt-1">Threshold: {step.threshold}%</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Constraints */}
      {task.constraints && (
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Constraints</h2>
          <div className="flex flex-col gap-4">
            {task.constraints.languages.length > 0 && (
              <div>
                <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-2">Languages</p>
                <div className="flex gap-1.5 flex-wrap">
                  {task.constraints.languages.map((lang) => (
                    <Badge key={lang} className="bg-ptf-accent/10 text-ptf-accent border border-ptf-accent/20">
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-ptf-surface border border-ptf-border rounded-lg p-3 text-center">
                <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Max Files</p>
                <p className="font-mono text-lg font-bold text-ptf-text">{task.constraints.maxFiles}</p>
              </div>
              <div className="bg-ptf-surface border border-ptf-border rounded-lg p-3 text-center">
                <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Max Lines/File</p>
                <p className="font-mono text-lg font-bold text-ptf-text">{task.constraints.maxLinesPerFile}</p>
              </div>
              <div className="bg-ptf-surface border border-ptf-border rounded-lg p-3 text-center">
                <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-1">Max Total Lines</p>
                <p className="font-mono text-lg font-bold text-ptf-text">{task.constraints.maxTotalLines}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-2">Min Test Coverage</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 bg-ptf-surface border border-ptf-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ptf-success rounded-full transition-all"
                    style={{ width: `${task.constraints.minTestCoverage}%` }}
                  />
                </div>
                <span className="font-mono text-sm font-semibold text-ptf-text shrink-0">
                  {task.constraints.minTestCoverage}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-xs text-ptf-text-3 uppercase tracking-wide">Required Tests</p>
              <Badge className={task.constraints.requiredTests ? 'bg-ptf-success/10 text-ptf-success' : 'bg-ptf-surface text-ptf-text-3'}>
                {task.constraints.requiredTests ? 'Yes' : 'No'}
              </Badge>
            </div>

            {task.constraints.forbiddenPatterns.length > 0 && (
              <div>
                <p className="text-xs text-ptf-text-3 uppercase tracking-wide mb-2">Forbidden Patterns</p>
                <div className="flex flex-col gap-1">
                  {task.constraints.forbiddenPatterns.map((pattern) => (
                    <code
                      key={pattern}
                      className="text-xs font-mono bg-ptf-error/10 text-ptf-error px-2 py-1 rounded border border-ptf-error/20"
                    >
                      {pattern}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Penalties */}
      {task.punishments && (
        <Card>
          <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Penalties</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ptf-border">
                  <th className="text-left py-2 pr-4 text-xs text-ptf-text-3 uppercase tracking-wide font-medium">Type</th>
                  <th className="text-right py-2 px-4 text-xs text-ptf-text-3 uppercase tracking-wide font-medium">Credits</th>
                  <th className="text-right py-2 pl-4 text-xs text-ptf-text-3 uppercase tracking-wide font-medium">Reputation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ptf-border">
                {([
                  ['Late Delivery', task.punishments.lateDelivery],
                  ['Critical Bug', task.punishments.criticalBug],
                  ['Non-Critical Bug', task.punishments.nonCriticalBug],
                  ['Malicious Code', task.punishments.maliciousCode],
                ] as const).map(([label, rule]) => (
                  <tr key={label}>
                    <td className="py-2 pr-4 text-ptf-text">{label}</td>
                    <td className="py-2 px-4 text-right font-mono text-ptf-error">
                      {task.rewardMode === 'free'
                        ? <span className="text-ptf-text-3">N/A</span>
                        : rule.credits != null
                        ? `-${rule.credits}`
                        : <span className="text-ptf-text-3">N/A</span>}
                    </td>
                    <td className="py-2 pl-4 text-right font-mono text-ptf-error">
                      -{rule.reputation} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TaskTemplate task={task} />

      {/* Pipeline info */}
      <Card>
        <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide mb-3">Submission pipeline</h2>
        <div className="flex flex-col gap-3">
          {[
            { n: 1, label: 'Automated validation', detail: 'Tests, lint, constraints — run by ptf submit' },
            { n: 2, label: 'Peer review', detail: '3 Expert reviewers (≥ 2000 pts)' },
            { n: 3, label: 'Client validation', detail: 'Auto-approved after 72h if no dispute' },
            { n: 4, label: 'Reward released', detail: task.rewardMode === 'paid' ? `${task.rewardAmount} ${task.rewardToken ?? 'PTF'} + ${task.reputationPoints} pts reputation` : `${task.reputationPoints} pts reputation` },
          ].map(({ n, label, detail }) => (
            <div key={n} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-ptf-accent/20 border border-ptf-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-ptf-accent text-[10px] font-bold">{n}</span>
              </div>
              <div>
                <p className="text-sm text-ptf-text">{label}</p>
                <p className="text-xs text-ptf-text-3">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
