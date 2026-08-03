import { PrismaClient } from "@prisma/client";
import { Redis, Cluster, type Redis as RedisType, type Cluster as ClusterType } from "ioredis";
import { ChainRegistry } from "./bal/chain.registry.js";
import { MockChainAdapter } from "./bal/adapters/mock.adapter.js";
import { PolygonAdapter } from "./bal/adapters/polygon.adapter.js";
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
import { GithubService } from "./services/github.service.js";
import { EscrowService } from "./services/escrow.service.js";
import { ValidationService } from "./services/validation.service.js";
import { MetadataService } from "./services/metadata.service.js";
import { MockStorageProvider } from "./services/storage.provider.js";
import { NodeCacheService } from "./services/node-cache.service.js";
import type { IServiceContainer } from "./graphql/context.js";

// ── Redis factory ──────────────────────────────────────────────────────────────
// Redis A — Sentinel: Redlock + rate-limit counters + auth nonces
// Redis B — Cluster:  BullMQ queues + cache
// Falls back to a single standalone Redis when sentinel/cluster env vars are absent
// (dev / CI). Never silently falls back in production.

function buildRedisSentinel(): RedisType {
  const sentinels = [
    process.env["REDIS_SENTINEL_1"],
    process.env["REDIS_SENTINEL_2"],
    process.env["REDIS_SENTINEL_3"],
  ].filter(Boolean) as string[];

  if (sentinels.length >= 2) {
    return new Redis({
      sentinels: sentinels.map((h) => {
        const [host, port] = h.split(":");
        return { host, port: parseInt(port ?? "26379") };
      }),
      name: process.env["REDIS_SENTINEL_MASTER_NAME"] ?? "ptf-sentinel-master",
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "[PTF] REDIS_SENTINEL_1/2/3 are required in production — refusing to start with a single Redis instance (SPOF)."
    );
  }

  return new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

function buildRedisCluster(): RedisType | ClusterType {
  const nodes = [
    process.env["REDIS_CLUSTER_1"],
    process.env["REDIS_CLUSTER_2"],
    process.env["REDIS_CLUSTER_3"],
  ].filter(Boolean) as string[];

  if (nodes.length >= 2) {
    return new Cluster(
      nodes.map((h) => {
        const [host, port] = h.split(":");
        return { host, port: parseInt(port ?? "6380") };
      }),
      {
        redisOptions: { maxRetriesPerRequest: null },
        lazyConnect: true,
      }
    );
  }

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "[PTF] REDIS_CLUSTER_1/2/3 are required in production — refusing to start with a single Redis instance (SPOF)."
    );
  }

  // Dev fallback: reuse the same standalone instance for BullMQ
  return new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

export function buildContainer(): {
  services: IServiceContainer;
  prisma: PrismaClient;
  redisSentinel: RedisType;
  redisQueue: RedisType | ClusterType;
  timerService: TimerService;
  nodeCache: NodeCacheService;
} {
  const prisma = new PrismaClient();

  // Redis A — Sentinel (locks, rate-limit, nonces)
  const redisSentinel = buildRedisSentinel();
  // Redis B — Cluster (BullMQ queues, cache listings)
  const redisQueue = buildRedisCluster();

  // ── Chain Registry ──────────────────────────────────────────────────────────
  const chainRegistry = new ChainRegistry(
    process.env["DEFAULT_CHAIN"] ?? "mock"
  );

  // Adapters : PolygonAdapter si SIGNER_PRIVATE_KEY présent, MockChainAdapter sinon
  const hasSignerKey = !!process.env["SIGNER_PRIVATE_KEY"];

  // Toujours enregistrer mock pour les tests et le dev sans clé
  ["mock", "ethereum", "bsc", "avalanche", "arbitrum", "base"].forEach(
    (chain) => chainRegistry.register(chain, new MockChainAdapter(chain))
  );

  if (hasSignerKey) {
    // Testnet / production : PolygonAdapter réel
    chainRegistry.register("polygon", new PolygonAdapter());
  } else {
    // Dev sans clé : MockChainAdapter sur polygon aussi
    chainRegistry.register("polygon", new MockChainAdapter("polygon"));
  }

  // ── Services (ordre strict par dépendances) ─────────────────────────────────
  const authService       = new AuthService();
  const githubService     = new GithubService();
  const reputationService = new ReputationService(chainRegistry);
  const walletService     = new WalletService(chainRegistry);
  const punishmentService = new PunishmentService(prisma, chainRegistry, reputationService);

  // MetadataService — uses MockStorageProvider in dev (no Arweave key).
  // In production, replace MockStorageProvider with ArweaveStorageAdapter.
  const storageProvider = new MockStorageProvider();
  const metadataService = new MetadataService(
    chainRegistry.getDefault(),
    storageProvider,
  );

  // NodeCacheService — L1 (memory) + L2 (Redis) cache for reads.
  // Seeded from PostgreSQL at startup so the first requests never hit the DB.
  // Invalidation events propagated via Redis Stream to all workers/nodes.
  const nodeCache = new NodeCacheService(redisSentinel);

  const taskService       = new TaskService(
    prisma,
    chainRegistry,
    reputationService,
    walletService,
    redisSentinel,    // Redlock runs on Sentinel
    metadataService,
    nodeCache,
  );
  const timerService      = new TimerService(prisma, punishmentService, redisQueue);  // BullMQ on Cluster
  const escrowService     = new EscrowService(prisma, chainRegistry, reputationService);
  const validationService = new ValidationService(prisma);

  const projectService    = new ProjectService(prisma, chainRegistry, githubService, nodeCache);

  // LLM : MockLLMProvider en dev, à remplacer par un provider réel configuré par l'utilisateur
  const llmProvider = new MockLLMProvider();
  const taskGeneratorService = new LLMTaskGeneratorService(llmProvider);

  const services: IServiceContainer = {
    auth:          authService,
    project:       projectService,
    task:          taskService,
    reputation:    reputationService,
    wallet:        walletService,
    punishment:    punishmentService,
    escrow:        escrowService,
    validation:    validationService,
    taskGenerator: taskGeneratorService,
    github:        githubService,
  };

  return { services, prisma, redisSentinel, redisQueue, timerService, nodeCache };
}
