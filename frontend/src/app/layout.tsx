import type { Metadata } from 'next';
import './globals.css';
import { PTFApolloProvider } from '@/lib/apollo/ApolloProvider';
import { PTFWagmiProvider } from '@/lib/wagmi/WagmiProvider';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from '@/components/ui/Toaster';
import { HydrationGuard } from './HydrationGuard';
import { MSWInit } from './MSWInit';

export const metadata: Metadata = {
  title: 'PTF — Parallel Task Framework',
  description: 'The cryptographic ecosystem that rewards AND punishes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <PTFWagmiProvider>
          <PTFApolloProvider>
            <HydrationGuard>
              <MSWInit />
              <Navbar />
              <main className="min-h-screen">{children}</main>
              <Toaster />
            </HydrationGuard>
          </PTFApolloProvider>
        </PTFWagmiProvider>
      </body>
    </html>
  );
}
