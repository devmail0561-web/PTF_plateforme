import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";
import cors from "cors";
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

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    formatError: (formattedError, error) => {
      console.error("[GraphQL Error]", error);
      return formattedError;
    },
  });

  await server.start();

  const app = express();
  app.use(cors({ origin: process.env["CORS_ORIGIN"] ?? "*" }));
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  // GraphQL endpoint
  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => {
        let user = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          try {
            user = await services.auth.verifyJwt(authHeader.slice(7));
          } catch {
            // Token invalide — requête anonyme
          }
        }
        return { services, user };
      },
    })
  );

  const PORT = parseInt(process.env["PORT"] ?? "4000");

  const httpServer = app.listen(PORT, () => {
    console.log(`🚀 PTF Backend démarré sur http://localhost:${PORT}/graphql`);
  });

  // Démarrage du TimerService (expiration tâches + alertes deadline)
  await redis.connect();
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
