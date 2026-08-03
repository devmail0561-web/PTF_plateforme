/**
 * NodeCacheService — couche de cache à deux niveaux pour les lectures.
 *
 * Architecture :
 *   L1 — Mémoire (Map) : lectures sans latence réseau. Chaque worker Node.js
 *        a sa propre L1 — cohérence éventuelle entre workers via Redis Stream.
 *   L2 — Redis Sentinel : cohérence entre workers et entre nœuds du réseau.
 *        Miss L1 → Redis → populate L1. Miss Redis → PostgreSQL → populate L1+L2.
 *
 * Règle absolue :
 *   - Les LECTURES passent par ce service (L1 → L2 → DB).
 *   - Les ÉCRITURES contournent ce service (DB directement) mais
 *     appellent ensuite invalidate() pour purger les entrées obsolètes.
 *   - Le stream "cache-events" propage les invalidations aux autres workers/nœuds.
 *
 * Données en cache :
 *   - Tâches actives (status != validated/archived) : L1 TTL 5min, L2 TTL 5min
 *   - Statuts de tâches (champs mutables seuls) : L1 TTL 30s, L2 TTL 30s
 *   - Projets actifs : L1 TTL 2min, L2 TTL 2min
 *   - Liste de tâches par filtre courant : L2 seulement, TTL 30s
 *
 * Ce qui ne passe pas par le cache :
 *   - Opérations sous Redlock (claim) — toujours DB pour la cohérence forte
 *   - Écritures — toujours DB
 *   - Données financières (soldes, escrow) — toujours on-chain
 */

import type { Task, Project } from "@prisma/client";
import type { Redis as RedisType } from "ioredis";

// ── TTL constants ──────────────────────────────────────────────────────────────
const TTL_TASK_MS      = 5 * 60_000;   // 5 min — métadonnées immuables
const TTL_STATUS_MS    = 30_000;        // 30s  — statuts mutables
const TTL_PROJECT_MS   = 2 * 60_000;   // 2 min
const TTL_LIST_MS      = 30_000;        // 30s  — résultats de liste

const TTL_TASK_S       = 300;
const TTL_STATUS_S     = 30;
const TTL_PROJECT_S    = 120;
const TTL_LIST_S       = 30;

const STREAM_KEY       = "cache-events";
const STREAM_GROUP     = "cache-invalidator";
const MAX_STREAM_LEN   = 10_000;

// ── Types ──────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type TaskStatus = {
  status: string;
  claimedAt: string | null;
  deadline: string | null;
  devAddress: string | null;
};

// ── NodeCacheService ───────────────────────────────────────────────────────────

export class NodeCacheService {
  // L1 — per-worker in-memory maps
  private readonly taskL1     = new Map<string, CacheEntry<Task>>();
  private readonly statusL1   = new Map<string, CacheEntry<TaskStatus>>();
  private readonly projectL1  = new Map<string, CacheEntry<Project>>();
  private readonly listL1     = new Map<string, CacheEntry<string[]>>(); // key → taskIds

  private streamConsumerName = `worker-${process.pid}`;
  private gcInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redis: RedisType) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Create consumer group for cache invalidation stream (idempotent)
    try {
      await this.redis.xgroup("CREATE", STREAM_KEY, STREAM_GROUP, "0", "MKSTREAM");
    } catch {
      // Group already exists — expected on restart
    }

    // Start consuming invalidation events from other workers/nodes
    void this.consumeInvalidations();

    // Periodic L1 GC — evict expired entries every 60s
    this.gcInterval = setInterval(() => this.gcL1(), 60_000);
    console.log(`[NodeCache] Started — worker ${this.streamConsumerName}`);
  }

  async stop(): Promise<void> {
    if (this.gcInterval) clearInterval(this.gcInterval);
  }

  // ── Seed from PostgreSQL at startup ─────────────────────────────────────────
  // Populate L1 + L2 from DB so the first requests never hit PostgreSQL.

  async seed(tasks: Task[], projects: Project[]): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const task of tasks) {
      if (task.status === "validated" || task.status === "archived") continue;
      this.taskL1.set(task.id, { value: task, expiresAt: Date.now() + TTL_TASK_MS });
      this.statusL1.set(task.id, {
        value: this.extractStatus(task),
        expiresAt: Date.now() + TTL_STATUS_MS,
      });
      pipeline.setex(`task:${task.id}`, TTL_TASK_S, JSON.stringify(task));
    }

    for (const project of projects) {
      if (project.status === "archived") continue;
      this.projectL1.set(project.id, { value: project, expiresAt: Date.now() + TTL_PROJECT_MS });
      pipeline.setex(`project:${project.id}`, TTL_PROJECT_S, JSON.stringify(project));
    }

    await pipeline.exec();
    console.log(`[NodeCache] Seeded — ${tasks.length} tasks, ${projects.length} projects`);
  }

  // ── Task reads ───────────────────────────────────────────────────────────────

  async getTask(id: string): Promise<Task | null> {
    // L1
    const l1 = this.taskL1.get(id);
    if (l1 && l1.expiresAt > Date.now()) return l1.value;

    // L2
    const raw = await this.redis.get(`task:${id}`);
    if (raw) {
      const task = JSON.parse(raw) as Task;
      this.taskL1.set(id, { value: task, expiresAt: Date.now() + TTL_TASK_MS });
      return task;
    }

    return null; // caller falls back to DB and calls putTask()
  }

  async getTaskStatus(id: string): Promise<TaskStatus | null> {
    // L1
    const l1 = this.statusL1.get(id);
    if (l1 && l1.expiresAt > Date.now()) return l1.value;

    // L2
    const raw = await this.redis.get(`task:status:${id}`);
    if (raw) {
      const status = JSON.parse(raw) as TaskStatus;
      this.statusL1.set(id, { value: status, expiresAt: Date.now() + TTL_STATUS_MS });
      return status;
    }

    return null;
  }

  // Returns cached taskIds for a list query key, or null on miss.
  async getTaskList(key: string): Promise<string[] | null> {
    const l1 = this.listL1.get(key);
    if (l1 && l1.expiresAt > Date.now()) return l1.value;

    const raw = await this.redis.get(`tasklist:${key}`);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      this.listL1.set(key, { value: ids, expiresAt: Date.now() + TTL_LIST_MS });
      return ids;
    }

    return null;
  }

  // ── Project reads ────────────────────────────────────────────────────────────

  async getProject(id: string): Promise<Project | null> {
    const l1 = this.projectL1.get(id);
    if (l1 && l1.expiresAt > Date.now()) return l1.value;

    const raw = await this.redis.get(`project:${id}`);
    if (raw) {
      const project = JSON.parse(raw) as Project;
      this.projectL1.set(project.id, { value: project, expiresAt: Date.now() + TTL_PROJECT_MS });
      return project;
    }

    return null;
  }

  // ── Cache population (called after DB reads/writes) ──────────────────────────

  putTask(task: Task): void {
    this.taskL1.set(task.id, { value: task, expiresAt: Date.now() + TTL_TASK_MS });
    this.statusL1.set(task.id, {
      value: this.extractStatus(task),
      expiresAt: Date.now() + TTL_STATUS_MS,
    });
    // Fire-and-forget Redis write — non-blocking
    this.redis.pipeline()
      .setex(`task:${task.id}`, TTL_TASK_S, JSON.stringify(task))
      .setex(`task:status:${task.id}`, TTL_STATUS_S, JSON.stringify(this.extractStatus(task)))
      .exec()
      .catch((err: unknown) => console.error("[NodeCache] Redis write error", err));
  }

  putTaskList(key: string, taskIds: string[]): void {
    this.listL1.set(key, { value: taskIds, expiresAt: Date.now() + TTL_LIST_MS });
    this.redis
      .setex(`tasklist:${key}`, TTL_LIST_S, JSON.stringify(taskIds))
      .catch((err: unknown) => console.error("[NodeCache] Redis write error", err));
  }

  putProject(project: Project): void {
    this.projectL1.set(project.id, { value: project, expiresAt: Date.now() + TTL_PROJECT_MS });
    this.redis
      .setex(`project:${project.id}`, TTL_PROJECT_S, JSON.stringify(project))
      .catch((err: unknown) => console.error("[NodeCache] Redis write error", err));
  }

  // ── Invalidation ─────────────────────────────────────────────────────────────
  // Called after every DB write. Publishes to stream so other workers/nodes
  // also invalidate their L1 entries.

  async invalidateTask(taskId: string): Promise<void> {
    this.taskL1.delete(taskId);
    this.statusL1.delete(taskId);
    // Invalidate all list caches that may contain this task
    for (const key of this.listL1.keys()) this.listL1.delete(key);

    await this.redis.pipeline()
      .del(`task:${taskId}`)
      .del(`task:status:${taskId}`)
      .xadd(STREAM_KEY, "MAXLEN", "~", String(MAX_STREAM_LEN), "*",
        "type", "task", "id", taskId)
      .exec();
  }

  async invalidateProject(projectId: string): Promise<void> {
    this.projectL1.delete(projectId);
    await this.redis.pipeline()
      .del(`project:${projectId}`)
      .xadd(STREAM_KEY, "MAXLEN", "~", String(MAX_STREAM_LEN), "*",
        "type", "project", "id", projectId)
      .exec();
  }

  // ── Stream consumer — propagate invalidations from other workers/nodes ────────

  private async consumeInvalidations(): Promise<void> {
    while (true) {
      try {
        const results = await this.redis.xreadgroup(
          "GROUP", STREAM_GROUP, this.streamConsumerName,
          "COUNT", "100", "BLOCK", "2000",
          "STREAMS", STREAM_KEY, ">"
        ) as Array<[string, Array<[string, string[]]>]> | null;

        if (!results) continue;

        const ids: string[] = [];
        for (const [, messages] of results) {
          for (const [msgId, fields] of messages) {
            const type = fields[fields.indexOf("type") + 1];
            const id   = fields[fields.indexOf("id")   + 1];

            if (type === "task") {
              this.taskL1.delete(id);
              this.statusL1.delete(id);
              for (const key of this.listL1.keys()) this.listL1.delete(key);
            } else if (type === "project") {
              this.projectL1.delete(id);
            }
            ids.push(msgId);
          }
        }

        if (ids.length > 0) {
          await this.redis.xack(STREAM_KEY, STREAM_GROUP, ...ids);
        }
      } catch {
        // Redis disconnected — retry after brief pause
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private extractStatus(task: Task): TaskStatus {
    return {
      status:     task.status,
      claimedAt:  task.claimedAt?.toISOString() ?? null,
      deadline:   task.deadline?.toISOString()  ?? null,
      devAddress: task.devAddress ?? null,
    };
  }

  private gcL1(): void {
    const now = Date.now();
    for (const [k, v] of this.taskL1)    if (v.expiresAt <= now) this.taskL1.delete(k);
    for (const [k, v] of this.statusL1)  if (v.expiresAt <= now) this.statusL1.delete(k);
    for (const [k, v] of this.projectL1) if (v.expiresAt <= now) this.projectL1.delete(k);
    for (const [k, v] of this.listL1)    if (v.expiresAt <= now) this.listL1.delete(k);
  }

  // Build a deterministic cache key from a TaskFilter object
  static listKey(filter: Record<string, unknown>): string {
    const sorted = JSON.stringify(
      Object.fromEntries(
        Object.entries(filter)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
      )
    );
    return sorted;
  }
}
