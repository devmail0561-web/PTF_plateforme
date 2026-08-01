declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_GRAPHQL_URL: string;
    NEXT_PUBLIC_WS_URL: string;
    NEXT_PUBLIC_API_MOCKING?: string;
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: string;
    NEXT_PUBLIC_GITHUB_CLIENT_ID: string;
    NEXT_PUBLIC_APP_URL: string;
  }
}
