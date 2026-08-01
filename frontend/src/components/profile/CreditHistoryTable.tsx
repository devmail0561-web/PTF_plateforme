'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatPTF, formatDateTime, formatHash } from '@/lib/ptf/formatters';
import { CREDIT_TYPE_LABELS } from '@/lib/ptf/constants';
import { clsx } from 'clsx';
import type { CreditEvent } from '@/types/graphql';

interface CreditHistoryTableProps {
  events: CreditEvent[];
  loading?: boolean;
}

const PAGE_SIZE = 10;

export function CreditHistoryTable({ events, loading }: CreditHistoryTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(events.length / PAGE_SIZE);
  const slice = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-ptf-text-3">
        Loading history...
      </div>
    );
  }

  if (!events.length) {
    return (
      <p className="text-ptf-text-3 text-sm py-6 text-center">No credit history yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ptf-border text-ptf-text-2 text-xs uppercase tracking-wide">
              <th className="text-left pb-2 pr-4">Type</th>
              <th className="text-right pb-2 pr-4">Amount</th>
              <th className="text-right pb-2 pr-4">Balance</th>
              <th className="text-left pb-2 pr-4">Tx</th>
              <th className="text-right pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((ev) => (
              <tr key={ev.id} className="border-b border-ptf-border/50 hover:bg-ptf-surface/50 transition-colors">
                <td className="py-3 pr-4">
                  <span className="text-ptf-text">
                    {CREDIT_TYPE_LABELS[ev.type] ?? ev.type}
                  </span>
                </td>
                <td className={clsx('py-3 pr-4 text-right font-mono font-semibold', ev.direction === 'credit' ? 'text-ptf-success' : 'text-ptf-error')}>
                  {ev.direction === 'credit' ? '+' : '-'}{formatPTF(ev.amount)}
                </td>
                <td className="py-3 pr-4 text-right font-mono text-ptf-text-2">
                  {ev.balanceAfter != null ? formatPTF(ev.balanceAfter) : '—'}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-ptf-text-3">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
