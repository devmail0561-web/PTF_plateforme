'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/auth/authStore';
import {
  REQUEST_GITHUB_OAUTH_STATE,
  LINK_GITHUB,
} from '@/lib/graphql/mutations';

interface StepGitHubProps {
  onNext: () => void;
}

export function StepGitHub({ onNext }: StepGitHubProps) {
  const searchParams = useSearchParams();
  const { setAuth, user, token } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [requestState, { loading: requesting }] = useMutation<{ requestGithubOAuthState: { state: string } }>(REQUEST_GITHUB_OAUTH_STATE);
  const [linkGithub, { loading: linking }] = useMutation<{ linkGithub: { token: string; user: typeof user } }>(LINK_GITHUB);
  const calledRef = useRef(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  useEffect(() => {
    if (code && state && !calledRef.current) {
      calledRef.current = true;
      linkGithub({ variables: { code, state } })
        .then(({ data, errors }) => {
          if (errors?.length) throw new Error(errors[0].message);
          if (data?.linkGithub && token) {
            const existingKey = typeof localStorage !== 'undefined'
              ? localStorage.getItem('ptf_encrypted_key') ?? ''
              : '';
            setAuth(data.linkGithub.token, data.linkGithub.user as typeof user & NonNullable<typeof user>, existingKey);
            onNext();
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'GitHub linking failed'));
    }
  }, [code, state]);

  if (user?.githubLinked) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="text-ptf-success text-4xl">✓</div>
        <p className="text-ptf-text text-center">GitHub account linked as <strong>@{user.githubHandle ?? 'user'}</strong></p>
        <Button onClick={onNext}>Continue</Button>
      </div>
    );
  }

  async function handleConnect() {
    setError(null);
    try {
      const { data, errors } = await requestState();
      if (errors?.length) throw new Error(errors[0].message);
      const oauthState = data?.requestGithubOAuthState.state;
      if (!oauthState) throw new Error('Could not get OAuth state');

      const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? 'mock_client_id',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/onboarding?step=github`,
        scope: 'read:user',
        state: oauthState,
      });
      window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-ptf-text">Link your GitHub account</h2>
        <p className="text-sm text-ptf-text-2 mt-1">
          Required to contribute to public projects and verify your identity.
        </p>
      </div>

      {code && state && (
        <p className="text-sm text-ptf-text-2 text-center">Completing GitHub authorization...</p>
      )}

      {error && (
        <p className="text-sm text-ptf-error text-center">{error}</p>
      )}

      {!code && (
        <Button
          loading={requesting || linking}
          onClick={handleConnect}
          className="w-full"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          Connect GitHub
        </Button>
      )}
    </div>
  );
}
