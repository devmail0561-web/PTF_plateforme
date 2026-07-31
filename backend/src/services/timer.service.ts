import type { PrismaClient } from "@prisma/client";
import type { IPunishmentService } from "./punishment.service.js";
import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";

const QUEUE_NAME = "task-expiry";

export interface ITimerService {
  scheduleExpiry(taskId: string, deadline: Date, chain: string): Promise<void>;
  cancelExpiry(taskId: string): Promise<void>;
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
      async (job: Job<{ taskId: string; chain: string }>) => {
        const { taskId, chain } = job.data;

        const task = await this.prisma.task.findUnique({
          where: { id: taskId },
          select: {
            status: true,
            devAddress: true,
            project: { select: { rewardMode: true } },
          },
        });

        if (!task || task.status !== "claimed") return;
        if (!task.devAddress) return;

        await this.punishmentService.execute(
          "lateDelivery",
          task.devAddress,
          taskId,
          chain,
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

    // Cron check alertes deadline toutes les heures
    setInterval(() => this.checkDeadlineAlerts(), 3600000);
    console.log("[TimerService] Démarré");
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
