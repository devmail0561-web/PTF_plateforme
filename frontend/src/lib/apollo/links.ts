import {
  ApolloLink,
  HttpLink,
  split,
  from,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { useAuthStore } from '@/lib/auth/authStore';

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/graphql';

export const authLink = new ApolloLink((operation, forward) => {
  const token = useAuthStore.getState().token;
  if (token) {
    operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
      headers: { ...headers, Authorization: `Bearer ${token}` },
    }));
  }
  return forward(operation);
});

export const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === 'UNAUTHORIZED') {
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      }
    }
  }
  if (networkError) {
    console.error('[Apollo NetworkError]', networkError);
  }
});

const httpLink = new HttpLink({
  uri: GRAPHQL_URL,
  credentials: 'same-origin',
});

const wsLink =
  typeof window !== 'undefined'
    ? new GraphQLWsLink(
        createClient({
          url: WS_URL,
          connectionParams: () => ({
            Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
          }),
        })
      )
    : null;

const splitLink =
  wsLink !== null
    ? split(
        ({ query }) => {
          const def = getMainDefinition(query);
          return (
            def.kind === 'OperationDefinition' &&
            def.operation === 'subscription'
          );
        },
        wsLink,
        httpLink
      )
    : httpLink;

export const apolloLinks = from([authLink, errorLink, splitLink]);
