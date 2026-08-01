'use client';
import { useState, useEffect } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/authStore';
import { usePTFBalance } from '@/hooks/usePTFBalance';
import { GET_WALLET_STATUS, GET_CREDIT_HISTORY } from '@/lib/graphql/queries';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatPTF, formatAddress, formatDateTime, formatHash } from '@/lib/ptf/formatters';
import { CREDIT_TYPE_LABELS } from '@/lib/ptf/constants';

// ---------- Inline UTXO query (not yet in shared queries) ----------
const GET_UTXOS = gql`
  query GetUTXOs($address: String!, $status: String) {
    utxos(address: $address, status: $status) {
      id
      amount
      sourceType
      sourceId
      chain
      status
      createdAt
    }
  }
`;

// ---------- Types ----------
interface UTXO {
  id: string;
  amount: number;
  sourceType: string;
  sourceId: string;
  chain: string;
  status: 'unspent' | 'locked' | 'spent';
  createdAt: string;
}

interface CreditEntry {
  id: string;
  type: string;
  direction: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  taskId: string | null;
  projectId: string | null;
  chain: string | null;
  txHash: string | null;
  note: string | null;
  createdAt: string;
}

interface WalletStatus {
  address: string;
  ptfBalance: number;
  softLocked: number;
  available: number;
  reputationScore: number;
  reputationLevel: string;
  linkedChains: string[];
  isValidAddress: boolean;
  isActivated: boolean;
  hasGasFees: boolean;
  isNotBanned: boolean;
  ownershipProven: boolean;
  meetsMinBalance: boolean;
}

// ---------- Helper components ----------
function CheckIndicator({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'text-ptf-success' : 'text-ptf-error'}>
      {ok ? '✓' : '✗'}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-xs text-ptf-text-3 uppercase tracking-wide">{label}</span>
      <span className={`text-xl font-mono font-bold ${accent ? 'text-ptf-accent' : 'text-ptf-text'}`}>
        {value}
      </span>
    </Card>
  );
}

// ---------- Main Page ----------
export default function WalletPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const address = user?.ptfAddress ?? null;

  // Redirect if not authenticated
  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/login');
    }
  }, [isHydrated, user, router]);

  // Balance
  const { available, locked, total, loading: balLoading } = usePTFBalance(address);

  // Wallet status
  const { data: statusData, loading: statusLoading } = useQuery<{ walletStatus: WalletStatus }>(
    GET_WALLET_STATUS,
    {
      variables: { address: address ?? '', chain: 'polygon' },
      skip: !address,
    }
  );

  // Credit history
  const [historyLimit] = useState(10);
  const [historyOffset, setHistoryOffset] = useState(0);
  const { data: historyData, loading: historyLoading, fetchMore } = useQuery<{ creditHistory: CreditEntry[] }>(
    GET_CREDIT_HISTORY,
    {
      variables: { address: address ?? '', limit: historyLimit, offset: 0 },
      skip: !address,
      fetchPolicy: 'cache-and-network',
    }
  );

  // UTXOs
  const [utxoFilter, setUtxoFilter] = useState<string | null>(null);
  const { data: utxoData, loading: utxoLoading } = useQuery<{ utxos: UTXO[] }>(
    GET_UTXOS,
    {
      variables: { address: address ?? '', status: utxoFilter },
      skip: !address,
      fetchPolicy: 'cache-and-network',
    }
  );

  // Loading/hydration guard
  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || !address) {
    return null; // redirect will fire
  }

  const walletStatus = statusData?.walletStatus;
  const creditHistory = historyData?.creditHistory ?? [];
  const utxos = utxoData?.utxos ?? [];

  const VERIFICATION_CHECKS: Array<{ key: keyof WalletStatus; label: string }> = [
    { key: 'isValidAddress', label: 'Valid Address' },
    { key: 'isActivated', label: 'Account Activated' },
    { key: 'hasGasFees', label: 'Has Gas Fees' },
    { key: 'isNotBanned', label: 'Not Banned' },
    { key: 'ownershipProven', label: 'Ownership Proven' },
    { key: 'meetsMinBalance', label: 'Meets Min Balance' },
  ];

  const UTXO_TABS: Array<{ label: string; value: string | null }> = [
    { label: 'All', value: null },
    { label: 'Unspent', value: 'unspent' },
    { label: 'Locked', value: 'locked' },
    { label: 'Spent', value: 'spent' },
  ];

  function handleLoadMore() {
    const newOffset = historyOffset + historyLimit;
    setHistoryOffset(newOffset);
    fetchMore({
      variables: { offset: newOffset },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          creditHistory: [...prev.creditHistory, ...fetchMoreResult.creditHistory],
        };
      },
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ---------- Header ---------- */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ptf-text">Wallet</h1>
        <p className="text-sm text-ptf-text-2 mt-1 font-mono">{formatAddress(address)}</p>
      </div>

      {/* ---------- Balance Overview ---------- */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-ptf-text mb-3">Balance Overview</h2>
        {balLoading ? (
          <div className="flex items-center gap-2 text-ptf-text-3 text-sm">
            <Spinner size="sm" /> Loading balance...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Available" value={formatPTF(available)} accent />
            <StatCard label="Soft-Locked" value={formatPTF(locked)} />
            <StatCard label="Total" value={formatPTF(total)} />
          </div>
        )}
      </section>

      {/* ---------- Wallet Status ---------- */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-ptf-text mb-3">Wallet Status</h2>
        <Card>
          {statusLoading ? (
            <div className="flex items-center gap-2 text-ptf-text-3 text-sm">
              <Spinner size="sm" /> Loading status...
            </div>
          ) : walletStatus ? (
            <div className="flex flex-col gap-5">
              {/* Verification checks */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {VERIFICATION_CHECKS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <CheckIndicator ok={walletStatus[key] as boolean} />
                    <span className="text-sm text-ptf-text-2">{label}</span>
                  </div>
                ))}
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap gap-6 pt-4 border-t border-ptf-border text-sm">
                <div>
                  <span className="text-ptf-text-3">Reputation Score: </span>
                  <span className="font-mono text-ptf-text font-semibold">{walletStatus.reputationScore}</span>
                </div>
                <div>
                  <span className="text-ptf-text-3">Level: </span>
                  <Badge className="bg-ptf-accent/10 text-ptf-accent">{walletStatus.reputationLevel}</Badge>
                </div>
                <div>
                  <span className="text-ptf-text-3">Linked Chains: </span>
                  <span className="text-ptf-text">
                    {walletStatus.linkedChains.length > 0
                      ? walletStatus.linkedChains.join(', ')
                      : 'None'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-ptf-text-3 text-sm">Unable to load wallet status.</p>
          )}
        </Card>
      </section>

      {/* ---------- Credit History ---------- */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-ptf-text mb-3">Credit History</h2>
        <Card className="overflow-x-auto">
          {historyLoading && creditHistory.length === 0 ? (
            <div className="flex items-center gap-2 text-ptf-text-3 text-sm">
              <Spinner size="sm" /> Loading history...
            </div>
          ) : creditHistory.length === 0 ? (
            <p className="text-ptf-text-3 text-sm text-center py-4">No credit history yet.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ptf-border text-left text-ptf-text-3">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Direction</th>
                    <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                    <th className="pb-2 pr-4 font-medium">Task</th>
                    <th className="pb-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ptf-border">
                  {creditHistory.map((entry) => (
                    <tr key={entry.id} className="text-ptf-text-2">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Badge className="bg-ptf-surface text-ptf-text-2 border border-ptf-border">
                          {CREDIT_TYPE_LABELS[entry.type] ?? entry.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className={entry.direction === 'credit' ? 'text-ptf-success font-medium' : 'text-ptf-error font-medium'}>
                          {entry.direction === 'credit' ? '+ Credit' : '- Debit'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-right font-mono">
                        {formatPTF(entry.amount)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                        {entry.taskId ? formatHash(entry.taskId) : '—'}
                      </td>
                      <td className="py-2 text-xs text-ptf-text-3 max-w-[200px] truncate">
                        {entry.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {creditHistory.length >= historyLimit && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    className="text-sm text-ptf-accent hover:text-ptf-accent-l transition-colors font-medium"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </section>

      {/* ---------- UTXOs ---------- */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-ptf-text mb-3">UTXOs</h2>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4">
          {UTXO_TABS.map((tab) => (
            <button
              key={tab.value ?? 'all'}
              onClick={() => setUtxoFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                utxoFilter === tab.value
                  ? 'bg-ptf-surface text-ptf-text'
                  : 'text-ptf-text-2 hover:text-ptf-text hover:bg-ptf-surface/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card>
          {utxoLoading ? (
            <div className="flex items-center gap-2 text-ptf-text-3 text-sm">
              <Spinner size="sm" /> Loading UTXOs...
            </div>
          ) : utxos.length === 0 ? (
            <p className="text-ptf-text-3 text-sm text-center py-4">
              No {utxoFilter ?? ''} UTXOs found.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-ptf-border">
              {utxos.map((utxo) => (
                <div key={utxo.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      className={
                        utxo.status === 'unspent'
                          ? 'bg-ptf-success/10 text-ptf-success border border-ptf-success/30'
                          : utxo.status === 'locked'
                          ? 'bg-ptf-warning/10 text-ptf-warning border border-ptf-warning/30'
                          : 'bg-ptf-text-3/10 text-ptf-text-3 border border-ptf-text-3/30'
                      }
                    >
                      {utxo.status}
                    </Badge>
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-sm font-semibold text-ptf-text">
                        {formatPTF(utxo.amount)}
                      </span>
                      <span className="text-xs text-ptf-text-3 truncate">
                        {utxo.sourceType} &middot; {utxo.chain}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-ptf-text-3 whitespace-nowrap">
                    {formatDateTime(utxo.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* ---------- Actions ---------- */}
      <section>
        <h2 className="text-base font-semibold text-ptf-text mb-3">Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ptf-text text-sm">Deposit</h3>
              <Badge className="bg-ptf-warning/10 text-ptf-warning border border-ptf-warning/30">Coming soon</Badge>
            </div>
            <p className="text-xs text-ptf-text-3">
              Fund your PTF wallet from an external chain or fiat on-ramp.
            </p>
          </Card>

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ptf-text text-sm">Withdraw</h3>
              <Badge className="bg-ptf-warning/10 text-ptf-warning border border-ptf-warning/30">Coming soon</Badge>
            </div>
            <p className="text-xs text-ptf-text-3">
              Withdraw available PTF to your external wallet address.
            </p>
          </Card>

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ptf-text text-sm">Bridge</h3>
              <Badge className="bg-ptf-warning/10 text-ptf-warning border border-ptf-warning/30">Coming soon</Badge>
            </div>
            <p className="text-xs text-ptf-text-3">
              Bridge PTF tokens between supported chains (Polygon, Ethereum).
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
