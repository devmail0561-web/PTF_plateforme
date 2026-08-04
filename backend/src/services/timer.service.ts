import type { PrismaClient } from "@prisma/client";
import type { IPunishmentService } from "./punishment.service.js";
import type { IValidationService } from "./validation.service.js";
import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { OWNER_VALIDATION_TIMEOUT_MS } from "./validation.service.js";

const QUEUE_NAME   = "task-expiry";
const ALERT_JOB_ID = "deadline-alerts-recurring";

export interface ITimerService {
  scheduleExpiry(taskId: string, deadline: Date, chain: string): Promise<void>;
  cancelExpiry(taskId: string): Promise<void>;
  // Planifie l'auto-validation 72h après que les tests auto ont passé (silence propriétaire)
  scheduleValidationTimeout(taskId: string): Promise<void>;
  cancelValidationTimeout(taskId: string): Promise<void>;
  checkDeadlineAlerts(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class TimerService implements ITimerService {
  private queue: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly punishmentService: IPunishmentService,
    private readonly validationService: IValidationService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly redis: any
  ) {
    this.queue = new Queue(QUEUE_NAME, {
      connection: redis,
    });
  }

  async scheduleExpiry(
    taskId: string,
    deadline: Date,
    chain: string
  ): Promise<void> {
    const delay = Math.max(0, deadline.getTime() - Date.now());

    await this.queue.add(
      "expire",
      { taskId, chain },
      {
        jobId: `expire:${taskId}`,
        delay,
        removeOnComplete: true,
        removeOnFail: 100,
      }
    );
  }

  async cancelExpiry(taskId: string): Promise<void> {
    const job = await this.queue.getJob(`expire:${taskId}`);
    await job?.remove();
  }

  async scheduleValidationTimeout(taskId: string): Promise<void> {
    await this.queue.add(
      "validation-timeout",
      { taskId },
      {
        jobId: `validation-timeout:${taskId}`,
        delay: OWNER_VALIDATION_TIMEOUT_MS,
        removeOnComplete: true,
        removeOnFail: 100,
      }
    );
  }

  async cancelValidationTimeout(taskId: string): Promise<void> {
    const job = await this.queue.getJob(`validation-timeout:${taskId}`);
    await job?.remove();
  }

  async checkDeadlineAlerts(): Promise<void> {
    const now = new Date();
    const alerts = [72, 48, 24]; // heures avant deadline

    for (const hours of alerts) {
      const threshold = new Date(now.getTime() + hours * 3600000);
      const tasks = await this.prisma.task.findMany({
        where: {
          status: "claimed",
          deadline: {
            gte: now,
            lte: threshold,
          },
        },
        select: { id: true, devAddress: true, deadline: true, title: true },
        take: 500,
      });

      for (const task of tasks) {
        if (task.devAddress && task.deadline) {
          // TODO: Notification via NotificationService
          console.log(
            `[TimerService] Alerte deadline ${hours}h : tâche ${task.id} → ${task.devAddress}`
          );
        }
      }
    }
  }

  async start(): Promise<void> {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ taskId: string; chain?: string } | { type: "deadline-alerts" }>) => {
        if ("type" in job.data && job.data.type === "deadline-alerts") {
          await this.checkDeadlineAlerts();
          return;
        }

        const { taskId, chain } = job.data as { taskId: string; chain?: string };

        // Job auto-validation : propriétaire silencieux depuis 72h
        if (job.name === "validation-timeout") {
          await this.validationService.autoApprove(taskId);
          return;
        }

        // Job expiry : dev n'a pas soumis avant la deadline
        const task = await this.prisma.task.findUnique({
          where: { id: taskId },
          select: {
            status: true,
            devAddress: true,
            submittedAt: true,
            project: { select: { rewardMode: true } },
          },
        });

        if (!task || !task.devAddress) return;

        // Règle deadline : punition UNIQUEMENT si le dev n'avait pas soumis avant la deadline
        // Si soumis avant deadline → jamais de punition retard, même si validation traîne
        if (task.submittedAt) return;

        if (task.status !== "claimed") return;

        await this.punishmentService.execute(
          "lateDelivery",
          task.devAddress,
          taskId,
          chain ?? "polygon",
          task.project.rewardMode as "free" | "paid"
        );

        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: "expired" },
        });
      },
      {
        connection: this.redis,
        concurrency: 10,
      }
    );

    this.worker.on("failed", (job, err) => {
      console.error(`[TimerService] Job échoué : ${job?.id}`, err);
    });

    // Recurring deadline-alert check via BullMQ (replaces setInterval).
    // BullMQ persists the schedule in Redis so it survives restarts and is
    // de-duplicated across multiple server instances (jobId collision = no duplicate).
    await this.queue.add(
      "deadline-alerts",
      { type: "deadline-alerts" },
      {
        jobId: ALERT_JOB_ID,
        repeat: { every: 3600000 },
        removeOnComplete: 1,
        removeOnFail: 10,
      }
    );

    console.log("[TimerService] Démarré");
  }

  async stop(): Promise<void> {
    await this.queue.removeRepeatableByKey(ALERT_JOB_ID).catch(() => { /* ignore if not present */ });
    await this.worker?.close();
    await this.queue.close();
  }
}
