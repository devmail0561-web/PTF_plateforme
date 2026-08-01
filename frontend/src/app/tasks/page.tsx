'use client';
import { Suspense, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useSearchParams } from 'next/navigation';
import { GET_TASKS } from '@/lib/graphql/queries';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { Spinner } from '@/components/ui/Spinner';
import type { Task } from '@/types/graphql';

const PAGE_SIZE = 12;

function TasksGrid() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(0);

  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const filter = {
    status: searchParams.get('status') || undefined,
    priority: searchParams.get('priority') || undefined,
    rewardMode: searchParams.get('rewardMode') || undefined,
  };

  const { data, loading, error } = useQuery<{ tasks: Task[] }>(GET_TASKS, {
    variables: { filter },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-ptf-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-ptf-error">Failed to load tasks: {error.message}</p>
      </div>
    );
  }

  const allTasks = (data?.tasks ?? []).filter((t) => {
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.context?.toLowerCase().includes(q) ||
      t.claimCriteria.requiredSkills?.some((s) => s.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(allTasks.length / PAGE_SIZE);
  const tasks = allTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!tasks.length && !loading) {
    return (
      <div className="text-center py-16">
        <p className="text-ptf-text-3">No tasks match your filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text disabled:opacity-40 hover:bg-ptf-elevated transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-ptf-text-2">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text disabled:opacity-40 hover:bg-ptf-elevated transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      <p className="text-xs text-ptf-text-3 text-center">
        {allTasks.length} task{allTasks.length !== 1 ? 's' : ''}
        {q && ` matching "${q}"`}
      </p>
    </div>
  );
}

export default function TasksPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ptf-text">Marketplace</h1>
            <p className="text-sm text-ptf-text-2 mt-1">Claim tasks and earn PTF credits</p>
          </div>
        </div>

        <Suspense fallback={null}>
          <TaskFilters />
        </Suspense>

        <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" className="text-ptf-accent" /></div>}>
          <TasksGrid />
        </Suspense>
      </div>
    </div>
  );
}
