'use client';
import { useQuery } from '@apollo/client';
import { GET_REPUTATION } from '@/lib/graphql/queries';
import type { ReputationScore } from '@/types/graphql';
import { REPUTATION_LEVELS, NEXT_LEVEL_THRESHOLD } from '@/lib/ptf/constants';

export function useReputationScore(address: string | null | undefined) {
  const { data, loading } = useQuery<{ reputationScore: ReputationScore }>(
    GET_REPUTATION,
    {
      variables: { address: address ?? '' },
      skip: !address,
    }
  );

  const score = data?.reputationScore;
  const levelInfo = REPUTATION_LEVELS.find((l) => l.level === score?.level) ?? REPUTATION_LEVELS[0];
  const nextThreshold = score ? NEXT_LEVEL_THRESHOLD[score.level] : 100;

  const progressPct = score && nextThreshold
    ? Math.min(100, ((score.total - levelInfo.min) / (nextThreshold - levelInfo.min)) * 100)
    : score?.level === 'Expert'
    ? 100
    : 0;

  return {
    score: score?.total ?? 0,
    level: score?.level ?? 'Unranked',
    completedTasks: score?.completedTasks ?? 0,
    levelInfo,
    nextThreshold,
    progressPct,
    loading,
  };
}
