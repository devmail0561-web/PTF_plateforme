'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-4xl font-bold text-ptf-error font-mono">Error</p>
      <h1 className="text-xl font-semibold text-ptf-text">Something went wrong</h1>
      <p className="text-sm text-ptf-text-2 text-center max-w-md">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 bg-ptf-accent hover:bg-ptf-accent-h text-white rounded-lg text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
