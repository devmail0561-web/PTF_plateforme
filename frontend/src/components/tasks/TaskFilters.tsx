'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'claimed', 'in_progress', 'submitted', 'validated'];

export function TaskFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('offset');
      router.push(`/tasks?${params.toString()}`);
    },
    [router, searchParams]
  );

  const hasFilters = !!(
    searchParams.get('status') ||
    searchParams.get('priority') ||
    searchParams.get('rewardMode') ||
    searchParams.get('q')
  );

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <input
        type="search"
        value={searchParams.get('q') ?? ''}
        onChange={(e) => setParam('q', e.target.value)}
        placeholder="Search tasks..."
        className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text placeholder:text-ptf-text-3 focus:outline-none focus:ring-2 focus:ring-ptf-accent/50 w-48"
      />

      <select
        value={searchParams.get('status') ?? ''}
        onChange={(e) => setParam('status', e.target.value)}
        className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s.replace('_', ' ')}</option>
        ))}
      </select>

      <select
        value={searchParams.get('priority') ?? ''}
        onChange={(e) => setParam('priority', e.target.value)}
        className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50"
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <select
        value={searchParams.get('rewardMode') ?? ''}
        onChange={(e) => setParam('rewardMode', e.target.value)}
        className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50"
      >
        <option value="">Paid & Free</option>
        <option value="paid">Paid only</option>
        <option value="free">Free only</option>
      </select>

      {hasFilters && (
        <button
          onClick={() => router.push('/tasks')}
          className="text-xs text-ptf-text-3 hover:text-ptf-text underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
