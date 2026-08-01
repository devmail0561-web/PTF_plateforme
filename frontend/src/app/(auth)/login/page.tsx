'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApolloClient } from '@apollo/client';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'browser'
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const deviceToken = typeof localStorage !== 'undefined'
        ? localStorage.getItem('ptf_device_token') ?? undefined
        : undefined;
      const result = await login(email, password, deviceName, deviceToken);
      if (result.requiresVerification && result.pendingSessionId) {
        sessionStorage.setItem('ptf_pending_session', result.pendingSessionId);
        router.push('/onboarding?step=otp');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ptf-accent">PTF</h1>
          <p className="text-ptf-text-2 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dev@example.com"
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-ptf-error bg-ptf-error/10 border border-ptf-error/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={isLoading} className="w-full">
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm text-ptf-text-2">
          No account?{' '}
          <Link href="/register" className="text-ptf-accent-l hover:underline">
            Register
          </Link>
        </p>
      </div>
    </Card>
  );
}
