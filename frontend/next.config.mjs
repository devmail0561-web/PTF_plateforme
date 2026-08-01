/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias['msw/browser'] = false;
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-eval' in development only
              process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-eval'",  // keep unsafe-eval for wagmi/ethers, remove unsafe-inline in prod
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' ws://localhost:4000 http://localhost:4000 https://rpc-amoy.polygon.technology https://polygon-rpc.com wss://*.walletconnect.org https://*.walletconnect.org",
              "img-src 'self' data: https://avatars.githubusercontent.com",
              "worker-src 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
