import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildContainer } from "./container.js";
import { taskResolvers } from "./graphql/resolvers/task.resolver.js";
import { projectResolvers } from "./graphql/resolvers/project.resolver.js";
import { walletResolvers } from "./graphql/resolvers/wallet.resolver.js";
import type { GraphQLContext } from "./graphql/context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(
  join(__dirname, "graphql", "schema.graphql"),
  "utf-8"
);

const resolvers = {
  Query: {
    health: () => "OK",
    ...taskResolvers.Query,
    ...projectResolvers.Query,
    ...walletResolvers.Query,
  },
  Mutation: {
    ...taskResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...walletResolvers.Mutation,
  },
};

async function main() {
  const { services, prisma, redis, timerService } = buildContainer();

  const isProd = process.env["NODE_ENV"] === "production";

  // GraphQL query depth validator (CIA-D5) — rejects queries deeper than MAX_DEPTH.
  // Prevents deeply-nested queries from causing O(n) DB joins.
  const MAX_QUERY_DEPTH = 6;
  function queryDepth(selectionSet: Record<string, unknown> | undefined, depth = 0): number {
    if (!selectionSet) return depth;
    const selections = (selectionSet as { selections?: unknown[] }).selections ?? [];
    if (selections.length === 0) return depth;
    return Math.max(
      ...selections.map((sel) =>
        queryDepth((sel as { selectionSet?: Record<string, unknown> }).selectionSet, depth + 1)
      )
    );
  }
  const depthLimitRule = (context: { reportError: (e: Error) => void }) => ({
    Document(node: { definitions: Array<{ selectionSet?: Record<string, unknown> }> }) {
      for (const def of node.definitions) {
        const depth = queryDepth(def.selectionSet);
        if (depth > MAX_QUERY_DEPTH) {
          context.reportError(
            new Error(`Query depth ${depth} exceeds maximum allowed depth of ${MAX_QUERY_DEPTH}`)
          );
        }
      }
    },
  });

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    // Disable introspection in production to limit schema reconnaissance.
    introspection: !isProd,
    validationRules: [depthLimitRule as never],
    formatError: (formattedError, error) => {
      console.error("[GraphQL Error]", error);
      // Strip internal stack traces and details from production responses.
      if (isProd) {
        const code = (formattedError.extensions?.["code"] as string | undefined) ?? "INTERNAL_ERROR";
        return { message: formattedError.message, extensions: { code } };
      }
      return formattedError;
    },
  });

  await server.start();

  const app = express();
  // In production CORS_ORIGIN must be set explicitly — wildcard "*" is rejected.
  const corsOrigin = process.env["CORS_ORIGIN"];
  if (isProd && !corsOrigin) {
    throw new Error("[PTF] CORS_ORIGIN env var is required in production.");
  }
  app.use(cors({ origin: corsOrigin ?? "*" }));
  app.use(express.json());

  // Rate limiting — applies to all routes including /graphql (CIA-D2).
  // Sensitive auth mutations are further rate-limited by the stricter limiter below.
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { errors: [{ message: "Too many requests — retry after 15 minutes" }] },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { errors: [{ message: "Too many auth attempts — retry after 15 minutes" }] },
  });

  app.use(globalLimiter);

  // Stricter rate limit on auth mutations (requestChallenge / verifyChallenge).
  app.use("/graphql", (req, res, next) => {
    const body = (req.body?.query ?? "") as string;
    const AUTH_OPS = /\b(requestChallenge|verifyChallenge)\b/;
    if (AUTH_OPS.test(body)) return authLimiter(req, res, next);
    next();
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  // GraphQL endpoint
  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => {
        let user: { ptfAddress: string } | null = null;
        let token: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7);
          try {
            const payload = await services.auth.verifyJwt(token);
            user = { ptfAddress: payload.ptfAddress };
          } catch {
            // Token invalide — requête anonyme
            token = null;
          }
        }
        return { services, user, token };
      },
    })
  );

  const PORT = parseInt(process.env["PORT"] ?? "4000");

  const httpServer = app.listen(PORT, () => {
    console.log(`🚀 PTF Backend démarré sur http://localhost:${PORT}/graphql`);
  });

  // Démarrage du TimerService (expiration tâches + alertes deadline)
  if (redis.status === "wait") await redis.connect();
  await timerService.start();

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[Server] SIGTERM reçu — arrêt gracieux");
    await timerService.stop();
    await prisma.$disconnect();
    await redis.disconnect();
    httpServer.close(() => process.exit(0));
  });

  process.on("SIGINT", async () => {
    await timerService.stop();
    await prisma.$disconnect();
    await redis.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[Server] Erreur fatale :", err);
  process.exit(1);
});
