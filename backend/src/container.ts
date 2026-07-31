import { PrismaClient } from "@prisma/client";
import { Redis, type Redis as RedisType } from "ioredis";
import { ChainRegistry } from "./bal/chain.registry.js";
import { MockChainAdapter } from "./bal/adapters/mock.adapter.js";
import { AuthService } from "./services/auth.service.js";
import { WalletService } from "./services/wallet.service.js";
import { ProjectService } from "./services/project.service.js";
import { ReputationService } from "./services/reputation.service.js";
import { PunishmentService } from "./services/punishment.service.js";
import { TaskService } from "./services/task.service.js";
import { TimerService } from "./services/timer.service.js";
import {
  LLMTaskGeneratorService,
  MockLLMProvider,
} from "./services/taskGenerator.service.js";
import { NotificationService } from "./services/notification.service.js";
import { ReportService } from "./services/report.service.js";
import type { IServiceContainer } from "./graphql/context.js";

export function buildContainer(): {
  services: IServiceContainer;
  prisma: PrismaClient;
  redis: RedisType;
  timerService: TimerService;
} {
  const prisma = new PrismaClient();

  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  // ── Chain Registry ──────────────────────────────────────────────────────────
  const chainRegistry = new ChainRegistry(
    process.env["DEFAULT_CHAIN"] ?? "mock"
  );

  // En dev/test : MockChainAdapter sur toutes les chaînes
  // En prod : remplacer par PolygonAdapter, EthereumAdapter, etc.
  const isDev = process.env["NODE_ENV"] !== "production";
  if (isDev) {
    ["mock", "polygon", "ethereum", "bsc", "avalanche", "arbitrum", "base"].forEach(
      (chain) => chainRegistry.register(chain, new MockChainAdapter(chain))
    );
  } else {
    // Production : importer les vrais adapters
    // const { PolygonAdapter } = await import("./bal/adapters/polygon.adapter.js");
    // chainRegistry.register("polygon", new PolygonAdapter());
    chainRegistry.register("mock", new MockChainAdapter("mock"));
  }

  // ── Services (ordre strict par dépendances) ─────────────────────────────────
  const reputationService = new ReputationService(prisma, chainRegistry);
  const authService = new AuthService(prisma, chainRegistry);
  const walletService = new WalletService(prisma, chainRegistry, authService);
  const projectService = new ProjectService(prisma, chainRegistry);
  const punishmentService = new PunishmentService(prisma, chainRegistry, reputationService);
  const taskService = new TaskService(
    prisma,
    chainRegistry,
    reputationService,
    walletService,
    redis
  );
  const timerService = new TimerService(prisma, punishmentService, redis);
  const notificationService = new NotificationService(prisma);
  const reportService = new ReportService(prisma, chainRegistry);

  // LLM : MockLLMProvider en dev, à remplacer par un provider réel configuré par l'utilisateur
  const llmProvider = new MockLLMProvider();
  const taskGeneratorService = new LLMTaskGeneratorService(llmProvider);

  const services: IServiceContainer = {
    auth: authService,
    project: projectService,
    task: taskService,
    reputation: reputationService,
    wallet: walletService,
    punishment: punishmentService,
    taskGenerator: taskGeneratorService,
    report: reportService,
  };

  return { services, prisma, redis, timerService };
}
