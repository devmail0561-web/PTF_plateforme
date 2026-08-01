'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuthStore } from '@/lib/auth/authStore';
import { usePTFBalance } from '@/hooks/usePTFBalance';
import { useReputationScore } from '@/hooks/useReputationScore';
import { ReputationLevelBadge } from '@/components/profile/ReputationLevelBadge';
import { formatPTF, formatAddress } from '@/lib/ptf/formatters';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

const NAV_LINKS: Array<{ href: string; label: string; auth?: boolean }> = [
  { href: '/tasks', label: 'Marketplace' },
  { href: '/projects', label: 'Projects' },
  { href: '/dashboard', label: 'Dashboard', auth: true },
  { href: '/wallet', label: 'Wallet', auth: true },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { token, user, clearAuth } = useAuthStore();
  const address = user?.ptfAddress;
  const { available, loading: balLoading } = usePTFBalance(address);
  const { level, score } = useReputationScore(address);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    clearAuth();
    router.replace('/login');
    setMenuOpen(false);
  }

  const visibleLinks = NAV_LINKS.filter((link) => !link.auth || token);

  return (
    <nav className="sticky top-0 z-50 border-b border-ptf-border bg-ptf-bg/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo + desktop nav */}
          <div className="flex items-center gap-6">
            <Link href="/tasks" className="font-bold text-ptf-accent text-lg tracking-tight">
              PTF
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {visibleLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    pathname.startsWith(link.href)
                      ? 'bg-ptf-surface text-ptf-text'
                      : 'text-ptf-text-2 hover:text-ptf-text hover:bg-ptf-surface/50'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            {token && address ? (
              <>
                <div className="flex items-center gap-2">
                  <ReputationLevelBadge level={level} size="sm" />
                  <span className="text-xs text-ptf-text-3">{score} pts</span>
                </div>
                <p className="font-mono text-sm font-semibold text-ptf-success">
                  {balLoading ? '…' : formatPTF(available)}
                </p>
                <Link
                  href={`/profile/${address}`}
                  className="font-mono text-xs text-ptf-text-2 hover:text-ptf-accent-l transition-colors"
                >
                  {formatAddress(address)}
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
                  Login
                </Button>
                <Button size="sm" onClick={() => router.push('/register')}>
                  Register
                </Button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-ptf-text-2 hover:text-ptf-text transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-ptf-border bg-ptf-bg px-4 pb-4">
          <div className="flex flex-col gap-1 pt-3">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={clsx(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname.startsWith(link.href)
                    ? 'bg-ptf-surface text-ptf-text'
                    : 'text-ptf-text-2 hover:text-ptf-text hover:bg-ptf-surface/50'
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-ptf-border mt-2">
              {token && address ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-3">
                    <ReputationLevelBadge level={level} size="sm" />
                    <span className="text-xs text-ptf-text-3">{score} pts</span>
                    <span className="ml-auto font-mono text-sm font-semibold text-ptf-success">
                      {balLoading ? '…' : formatPTF(available)}
                    </span>
                  </div>
                  <Link
                    href={`/profile/${address}`}
                    onClick={() => setMenuOpen(false)}
                    className="px-3 py-2 font-mono text-xs text-ptf-text-2 hover:text-ptf-accent-l transition-colors"
                  >
                    {formatAddress(address)}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 text-sm text-left text-ptf-error hover:text-ptf-text transition-colors rounded-md hover:bg-ptf-surface/50"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { router.push('/login'); setMenuOpen(false); }} className="flex-1">
                    Login
                  </Button>
                  <Button size="sm" onClick={() => { router.push('/register'); setMenuOpen(false); }} className="flex-1">
                    Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
