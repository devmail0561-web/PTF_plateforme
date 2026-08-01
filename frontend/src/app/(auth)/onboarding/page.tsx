'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { StepOTP } from '@/components/onboarding/StepOTP';
import { StepGitHub } from '@/components/onboarding/StepGitHub';
import { StepWallet } from '@/components/onboarding/StepWallet';

const STEPS = ['otp', 'github', 'wallet'] as const;
type Step = typeof STEPS[number];

function StepIndicator({ current }: { current: Step }) {
  const labels = { otp: 'Verify Email', github: 'Link GitHub', wallet: 'Link Wallet' };
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
            s === current ? 'bg-ptf-accent text-white' :
            STEPS.indexOf(current) > i ? 'bg-ptf-success text-white' :
            'bg-ptf-muted text-ptf-text-3'
          }`}>
            {STEPS.indexOf(current) > i ? '✓' : i + 1}
          </div>
          <span className={`text-xs hidden sm:block ${s === current ? 'text-ptf-text' : 'text-ptf-text-3'}`}>
            {labels[s]}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-px ${STEPS.indexOf(current) > i ? 'bg-ptf-success' : 'bg-ptf-muted'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const step = (searchParams.get('step') ?? 'github') as Step;

  const handleNext = (nextStep?: Step) => {
    if (nextStep) {
      router.push(`/onboarding?step=${nextStep}`);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-ptf-accent">PTF</h1>
        <p className="text-ptf-text-2 text-sm mt-1">Complete your account setup</p>
      </div>

      <StepIndicator current={step} />

      <Card>
        {step === 'otp' && <StepOTP onNext={() => handleNext('github')} />}
        {step === 'github' && <StepGitHub onNext={() => handleNext('wallet')} />}
        {step === 'wallet' && <StepWallet onNext={() => handleNext()} />}
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-64 text-ptf-text-3">Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
