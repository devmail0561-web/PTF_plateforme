'use client';
import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useAccount, useSignTypedData } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { keccak256, toUtf8Bytes } from 'ethers';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/auth/authStore';
import { REQUEST_WALLET_CHALLENGE, CONFIRM_LINK_WALLET } from '@/lib/graphql/mutations';

interface StepWalletProps {
  onNext: () => void;
}

export function StepWallet({ onNext }: StepWalletProps) {
  const { address, isConnected } = useAccount();
  const { signTypedData } = useSignTypedData();
  const { setAuth, user, token } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const [requestChallenge] = useMutation<{ requestWalletChallenge: { challengeId: string; nonce: string } }>(REQUEST_WALLET_CHALLENGE);
  const [confirmLink] = useMutation<{ confirmLinkWallet: { token: string } }>(CONFIRM_LINK_WALLET);

  if (user?.walletLinked) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="text-ptf-success text-4xl">✓</div>
        <p className="text-ptf-text text-center">Wallet linked successfully</p>
        <Button onClick={onNext}>Go to Dashboard</Button>
      </div>
    );
  }

  async function handleLink() {
    if (!address) return;
    setError(null);
    setLinking(true);
    try {
      const chain = 'polygon';
      const { data: challengeData, errors: challengeErrors } = await requestChallenge({
        variables: { chain, address },
      });
      if (challengeErrors?.length) throw new Error(challengeErrors[0].message);
      const { challengeId, nonce } = challengeData!.requestWalletChallenge;

      const salt = keccak256(toUtf8Bytes(chain)) as `0x${string}`;

      await new Promise<void>((resolve, reject) => {
        signTypedData(
          {
            domain: { name: 'PTFWalletLink', version: '1', salt },
            types: {
              WalletLink: [
                { name: 'nonce', type: 'string' },
                { name: 'userId', type: 'string' },
              ],
            },
            primaryType: 'WalletLink',
            message: {
              nonce,
              userId: user?.id ?? '',
            },
          },
          {
            onSuccess: async (signature) => {
              const { data, errors } = await confirmLink({
                variables: { challengeId, signature },
              });
              if (errors?.length) { reject(new Error(errors[0].message)); return; }
              if (data?.confirmLinkWallet && token) {
                const existingKey = typeof localStorage !== 'undefined'
                  ? localStorage.getItem('ptf_encrypted_key') ?? ''
                  : '';
                const updatedUser = { ...user!, walletLinked: true };
                setAuth(data.confirmLinkWallet.token, updatedUser, existingKey);
                resolve();
              }
            },
            onError: (err) => reject(err),
          }
        );
      });

      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet linking failed');
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-ptf-text">Link your wallet</h2>
        <p className="text-sm text-ptf-text-2 mt-1">
          Required to claim tasks and receive PTF credits.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex justify-center">
          <ConnectButton label="Connect Wallet" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-ptf-elevated border border-ptf-border rounded-lg px-4 py-3">
            <p className="text-xs text-ptf-text-3 mb-1">Connected wallet</p>
            <p className="font-mono text-sm text-ptf-text">{address}</p>
          </div>

          {error && (
            <p className="text-sm text-ptf-error text-center">{error}</p>
          )}

          <Button loading={linking} onClick={handleLink} className="w-full">
            Link this wallet
          </Button>
        </div>
      )}
    </div>
  );
}
