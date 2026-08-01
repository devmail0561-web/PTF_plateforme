'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_PROJECTS } from '@/lib/graphql/queries';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatAddress } from '@/lib/ptf/formatters';
import Link from 'next/link';
import type { Project } from '@/types/graphql';

type FilterType = 'all' | 'public' | 'private';
type FilterMode = 'all' | 'paid' | 'free';

export default function ProjectsPage() {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [modeFilter, setModeFilter] = useState<FilterMode>('all');

  const { data, loading, error } = useQuery<{ projects: Project[] }>(GET_PROJECTS, {
    variables: {
      filter: {
        ...(typeFilter !== 'all' && { type: typeFilter }),
        ...(modeFilter !== 'all' && { rewardMode: modeFilter }),
      },
    },
    fetchPolicy: 'cache-and-network',
  });

  const projects = data?.projects ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ptf-text">Projects</h1>
            <p className="text-sm text-ptf-text-2 mt-1">Browse active projects looking for contributors</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FilterType)}
            className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50"
          >
            <option value="all">All types</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as FilterMode)}
            className="px-3 py-2 text-sm bg-ptf-surface border border-ptf-border rounded-lg text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50"
          >
            <option value="all">Paid & Free</option>
            <option value="paid">Paid only</option>
            <option value="free">Free only</option>
          </select>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" className="text-ptf-accent" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-ptf-error">Failed to load projects: {error.message}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-ptf-text-3">No projects match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card className="flex flex-col gap-4 hover:border-ptf-muted transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ptf-text text-sm leading-snug line-clamp-2">
            {project.name}
          </h3>
          <p className="text-xs text-ptf-text-3 mt-1 font-mono">
            {formatAddress(project.owner)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className={project.type === 'public'
            ? 'bg-ptf-success/10 text-ptf-success border border-ptf-success/30'
            : 'bg-ptf-warning/10 text-ptf-warning border border-ptf-warning/30'
          }>
            {project.type}
          </Badge>
          <Badge className={project.status === 'active'
            ? 'bg-status-open/10 text-status-open border border-status-open/30'
            : 'bg-ptf-text-3/10 text-ptf-text-3 border border-ptf-text-3/30'
          }>
            {project.status}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-ptf-text-2">
        <div>
          <span className="text-ptf-text-3">Open tasks: </span>
          <span className="font-semibold text-ptf-text">{project.openTaskCount}</span>
          <span className="text-ptf-text-3"> / {project.taskCount}</span>
        </div>
        <div>
          <span className="text-ptf-text-3">Pool: </span>
          <span className="font-mono font-semibold text-ptf-accent">{project.totalRewardPool}</span>
        </div>
      </div>

      {project.stack.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {project.stack.map((tech) => (
            <span key={tech} className="px-1.5 py-0.5 bg-ptf-muted/50 rounded text-xs text-ptf-text-2">
              {tech}
            </span>
          ))}
        </div>
      )}

      {project.repository && (
        <p className="text-xs text-ptf-text-3 font-mono truncate">
          {project.repository}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-ptf-border">
        <Badge className={project.rewardMode === 'paid'
          ? 'bg-ptf-accent/10 text-ptf-accent border border-ptf-accent/20'
          : 'bg-ptf-surface text-ptf-text-3 border border-ptf-border'
        }>
          {project.rewardMode === 'paid' ? 'Paid' : 'Free / OSS'}
        </Badge>
        {project.isOpenSource && project.license && (
          <span className="text-xs text-ptf-text-3">{project.license}</span>
        )}
      </div>
    </Card>
  );
}
