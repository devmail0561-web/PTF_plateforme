'use client';
import { ApolloProvider } from '@apollo/client';
import { useMemo, type ReactNode } from 'react';
import { makeApolloClient } from './client';

export function PTFApolloProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => makeApolloClient(), []);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
