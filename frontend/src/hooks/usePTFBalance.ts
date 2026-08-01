'use client';
import { useQuery } from '@apollo/client';
import { GET_UTXO_BALANCE } from '@/lib/graphql/queries';
import type { UTXOBalance } from '@/types/graphql';

export function usePTFBalance(address: string | null | undefined) {
  const { data, loading, refetch } = useQuery<{ utxoBalance: UTXOBalance }>(
    GET_UTXO_BALANCE,
    {
      variables: { address: address ?? '' },
      skip: !address,
      pollInterval: 30000,
    }
  );

  return {
    available: data?.utxoBalance.available ?? 0,
    locked: data?.utxoBalance.locked ?? 0,
    total: data?.utxoBalance.total ?? 0,
    loading,
    refetch,
  };
}
