'use client';
import { useState, useEffect } from 'react';
import { computeCountdown, type CountdownParts } from '@/lib/ptf/formatters';

export function useTaskCountdown(deadline: string | null): CountdownParts {
  const [parts, setParts] = useState<CountdownParts>(() => computeCountdown(deadline));

  useEffect(() => {
    if (!deadline) return;
    setParts(computeCountdown(deadline));
    const id = setInterval(() => {
      setParts(computeCountdown(deadline));
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return parts;
}
