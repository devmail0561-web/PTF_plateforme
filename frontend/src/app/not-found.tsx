import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-6xl font-bold text-ptf-accent font-mono">404</p>
      <h1 className="text-xl font-semibold text-ptf-text">Page not found</h1>
      <p className="text-sm text-ptf-text-2 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/tasks"
        className="mt-4 px-4 py-2 bg-ptf-accent hover:bg-ptf-accent-h text-white rounded-lg text-sm font-medium transition-colors"
      >
        Back to Marketplace
      </Link>
    </div>
  );
}
