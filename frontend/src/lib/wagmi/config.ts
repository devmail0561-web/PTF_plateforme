import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon, polygonAmoy, mainnet } from 'wagmi/chains';
import { http } from 'wagmi';

export const wagmiConfig = getDefaultConfig({
  appName: 'PTF — Parallel Task Framework',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'dummy',
  chains: [polygon, polygonAmoy, mainnet],
  transports: {
    [polygon.id]:     http('https://polygon-rpc.com'),
    [polygonAmoy.id]: http('https://rpc-amoy.polygon.technology'),
    [mainnet.id]:     http(),
  },
  ssr: true,
});
