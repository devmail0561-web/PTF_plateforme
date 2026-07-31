import type { PrismaClient } from "@prisma/client";

export type NotificationType =
  | "task_claimed"
  | "task_submitted"
  | "task_validated"
  | "task_rejected"
  | "task_expired"
  | "deadline_alert"
  | "punishment_applied"
  | "report_submitted";

export interface INotificationService {
  notify(address: string, type: NotificationType, payload: object): Promise<void>;
  notifyBatch(addresses: string[], type: NotificationType, payload: object): Promise<void>;
}

export class NotificationService implements INotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async notify(address: string, type: NotificationType, payload: object): Promise<void> {
    // En production : webhook, email, push selon la config du user
    // Pour l'instant : log + persistence en DB via NetworkBroadcast
    console.log(`[Notification] ${type} → ${address}`, payload);

    await this.prisma.networkBroadcast.create({
      data: {
        type,
        payload: payload as object,
        signature: "ptf-notification-sig",
        chain: "polygon",
      },
    });
  }

  async notifyBatch(
    addresses: string[],
    type: NotificationType,
    payload: object
  ): Promise<void> {
    await Promise.all(addresses.map((a) => this.notify(a, type, payload)));
  }
}
