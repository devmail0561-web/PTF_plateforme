import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';

export function formatPTF(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${amount.toFixed(2)} PTF`;
}

export function formatAddress(address: string | null | undefined): string {
  if (!address) return '—';
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  urgency: 'normal' | 'warning' | 'critical';
  totalSeconds: number;
}

export function computeCountdown(deadline: string | null): CountdownParts {
  if (!deadline) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false, urgency: 'normal', totalSeconds: 0 };
  }
  const totalSeconds = differenceInSeconds(new Date(deadline), new Date());
  if (totalSeconds <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, urgency: 'critical', totalSeconds: 0 };
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgency = totalSeconds < 86400 ? 'critical' : totalSeconds < 172800 ? 'warning' : 'normal';
  return { days, hours, minutes, seconds, isExpired: false, urgency, totalSeconds };
}

export function formatHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  if (hash.length < 10) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}
