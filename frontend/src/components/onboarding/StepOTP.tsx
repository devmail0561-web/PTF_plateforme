'use client';
import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/auth/authStore';
import { VERIFY_NEW_DEVICE } from '@/lib/graphql/mutations';
import type { AuthResult } from '@/types/graphql';

interface StepOTPProps {
  onNext: () => void;
}

export function StepOTP({ onNext }: StepOTPProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { setAuth, setDeviceToken } = useAuthStore();

  const [verifyDevice, { loading }] = useMutation<{ verifyNewDevice: AuthResult }>(VERIFY_NEW_DEVICE);

  const pendingSessionId =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('ptf_pending_session') ?? 'pending-session-mock-001'
      : 'pending-session-mock-001';

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d !== '') && value) {
      submit(next.join(''));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function submit(code: string) {
    setError(null);
    try {
      const { data, errors } = await verifyDevice({
        variables: { pendingSessionId, otp: code },
      });
      if (errors?.length) throw new Error(errors[0].message);
      const result = data?.verifyNewDevice;
      if (!result) throw new Error('Verification failed');
      setAuth(result.token, result.user, result.encryptedKey);
      if (result.deviceToken) setDeviceToken(result.deviceToken);
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('ptf_pending_session');
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-ptf-text">Verify your email</h2>
        <p className="text-sm text-ptf-text-2 mt-1">
          Enter the 6-digit code sent to your email.{' '}
          <span className="text-ptf-text-3">(Mock: use <code className="font-mono text-ptf-accent-l">123456</code>)</span>
        </p>
      </div>

      <div className="flex justify-center gap-2">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-10 h-12 text-center text-lg font-mono font-bold rounded-lg bg-ptf-elevated border border-ptf-border text-ptf-text focus:outline-none focus:ring-2 focus:ring-ptf-accent/50 focus:border-ptf-accent"
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-ptf-error text-center">{error}</p>
      )}

      {loading && (
        <p className="text-sm text-ptf-text-2 text-center">Verifying...</p>
      )}
    </div>
  );
}
