'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deviceName = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'browser';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await register(email, password, deviceName);
      router.push('/onboarding?step=github');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ptf-accent">PTF</h1>
          <p className="text-ptf-text-2 text-sm mt-1">Create your account</p>
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
            placeholder="Min. 8 characters"
            required
            autoComplete="new-password"
          />
          <Input
            label="Confirm Password"
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />

          {error && (
            <p className="text-sm text-ptf-error bg-ptf-error/10 border border-ptf-error/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={isLoading} className="w-full">
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-ptf-text-2">
          Already have an account?{' '}
          <Link href="/login" className="text-ptf-accent-l hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </Card>
  );
}
