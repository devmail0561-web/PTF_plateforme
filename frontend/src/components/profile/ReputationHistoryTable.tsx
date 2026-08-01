'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_REPUTATION_HISTORY } from '@/lib/graphql/queries';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDateTime, formatHash } from '@/lib/ptf/formatters';
import { clsx } from 'clsx';
import Link from 'next/link';
import type { ReputationEvent } from '@/types/graphql';

interface ReputationHistoryTableProps {
  address: string;
}

const REASON_LABELS: Record<string, string> = {
  task_validated: 'Task Validated',
  'punishment:lateDelivery': 'Late Delivery',
  'punishment:criticalBug': 'Critical Bug',
  'punishment:nonCriticalBug': 'Non-Critical Bug',
  'punishment:maliciousCode': 'Malicious Code',
};

const PAGE_SIZE = 10;

export function ReputationHistoryTable({ address }: ReputationHistoryTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, loading, error } = useQuery<{ reputationHistory: ReputationEvent[] }>(
    GET_REPUTATION_HISTORY,
    {
      variables: { address, limit },
      skip: !address,
    }
  );

  const events = data?.reputationHistory ?? [];

  if (loading && !events.length) {
    return (
      <div className="flex items-center justify-center h-32 text-ptf-text-3">
        Loading reputation history...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-ptf-error text-sm py-6 text-center">
        Failed to load reputation history.
      </p>
    );
  }

  if (!events.length) {
    return (
      <p className="text-ptf-text-3 text-sm py-6 text-center">No reputation history yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ptf-border text-ptf-text-2 text-xs uppercase tracking-wide">
              <th className="text-left pb-2 pr-4">Delta</th>
              <th className="text-left pb-2 pr-4">Reason</th>
              <th className="text-left pb-2 pr-4">Task</th>
              <th className="text-left pb-2 pr-4">Chain</th>
              <th className="text-left pb-2 pr-4">Tx</th>
              <th className="text-right pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className="border-b border-ptf-border/50 hover:bg-ptf-surface/50 transition-colors">
                <td className="py-3 pr-4">
                  <span
                    className={clsx(
                      'font-mono font-semibold',
                      ev.delta > 0 ? 'text-ptf-success' : 'text-ptf-error'
                    )}
                  >
                    {ev.delta > 0 ? `+${ev.delta} pts` : `${ev.delta} pts`}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="text-ptf-text">
                    {REASON_LABELS[ev.reason] ?? ev.reason}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {ev.taskId ? (
                    <Link
                      href={`/tasks/${ev.taskId}`}
                      className="text-ptf-accent hover:underline text-xs font-mono"
                    >
                      {ev.taskId.slice(0, 8)}...
                    </Link>
                  ) : (
                    <span className="text-ptf-text-3">—</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {ev.chain ? (
                    <Badge variant="outline" className="text-ptf-text-2 border-ptf-border">
                      {ev.chain}
                    </Badge>
                  ) : (
                    <span className="text-ptf-text-3">—</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {ev.txHash ? (
                    <span className="font-mono text-ptf-text-3 text-xs">
                      {formatHash(ev.txHash)}
                    </span>
                  ) : (
                    <span className="text-ptf-text-3">—</span>
                  )}
                </td>
                <td className="py-3 text-right text-ptf-text-3 text-xs whitespace-nowrap">
                  {formatDateTime(ev.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length >= limit && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
