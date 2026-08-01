import { ApolloClient, InMemoryCache } from '@apollo/client';
import { apolloLinks } from './links';

let clientInstance: ApolloClient<unknown> | null = null;

export function makeApolloClient() {
  return new ApolloClient({
    link: apolloLinks,
    cache: new InMemoryCache({
      typePolicies: {
        Task: { keyFields: ['id'] },
        UserProfile: { keyFields: ['id'] },
        ReputationScore: { keyFields: ['address'] },
        UTXOBalance: { keyFields: ['address'] },
        CreditLedgerBalance: { keyFields: ['address'] },
        WalletStatus: { keyFields: ['address'] },
      },
    }),
    defaultOptions: {
      watchQuery: { errorPolicy: 'all' },
      query: { errorPolicy: 'all' },
    },
  });
}

export function getApolloClient() {
  if (typeof window === 'undefined') {
    return makeApolloClient();
  }
  if (!clientInstance) {
    clientInstance = makeApolloClient();
  }
  return clientInstance;
}
