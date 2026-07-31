import type { PrismaClient, Project } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type {
  ProjectFilter,
  PublicProjectView,
  ProjectEstimation,
  TaskDraft,
  ProjectRewardMode,
  ProjectType,
} from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";
import { ethers } from "ethers";

export interface CreateProjectInput {
  name: string;
  type: ProjectType;
  rewardMode: ProjectRewardMode;
  chain: string;
  token?: string;
  repoType: "github" | "self-hosted" | "ptf-temp";
  repoUrl?: string;
  language?: string;
  stack?: string[];
  description?: string;
  ownerAddress: string;
  ownerId?: string;
}

export interface IProjectService {
  create(input: CreateProjectInput): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  list(filter: ProjectFilter): Promise<PublicProjectView[]>;
  getPublicView(project: Project): PublicProjectView;
  updateMerkleRoot(projectId: string, root: string): Promise<void>;
  updateSyncStatus(projectId: string, status: string): Promise<void>;
  calculateCommission(rewardPool: number): number;
  estimateCost(tasks: TaskDraft[]): ProjectEstimation;
  activate(projectId: string): Promise<Project>;
}

export class ProjectService implements IProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry
  ) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const timestamp = Date.now();
    const projectId = ethers.solidityPackedKeccak256(
      ["string", "string", "uint256"],
      [input.ownerAddress, input.name, timestamp]
    );

    const project = await this.prisma.project.create({
      data: {
        id: projectId,
        name: input.name,
        type: input.type,
        rewardMode: input.rewardMode,
        chain: input.chain,
        token: input.rewardMode === "paid" ? (input.token ?? "USDC") : undefined,
        repoType: input.repoType,
        repoUrl: input.repoUrl,
        language: input.language,
        stack: input.stack ?? [],
        description: input.description,
        ownerAddress: input.ownerAddress.toLowerCase(),
        ownerId: input.ownerId,
        status: "draft",
        syncStatus: input.repoType === "ptf-temp" ? "pending" : "synced",
      },
    });

    // Ancrage on-chain de l'ID du projet
    const adapter = this.chainRegistry.get(input.chain);
    const emptyRoot = ethers.ZeroHash;
    await adapter.anchorMerkleRoot(projectId, emptyRoot);

    return project;
  }

  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } });
  }

  async list(filter: ProjectFilter): Promise<PublicProjectView[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        ...(filter.type && filter.type !== "all" ? { type: filter.type } : {}),
        ...(filter.ownerAddress ? { ownerAddress: filter.ownerAddress.toLowerCase() } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        status: filter.mine ? undefined : { not: "draft" },
      },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: "desc" },
    });

    const withOpenCount = await Promise.all(
      projects.map(async (p) => {
        const openCount = await this.prisma.task.count({
          where: { projectId: p.id, status: "open" },
        });
        return { ...p, openTaskCount: openCount };
      })
    );

    return withOpenCount.map((p) =>
      this.getPublicView({ ...p, taskCount: p._count.tasks } as unknown as Project)
    );
  }

  getPublicView(project: Project): PublicProjectView {
    const isPrivate = project.type === "private";
    const taskCount = (project as unknown as { taskCount?: number }).taskCount ?? 0;
    const openTaskCount = (project as unknown as { openTaskCount?: number }).openTaskCount ?? 0;

    return {
      projectId: project.id,
      type: project.type as ProjectType,
      rewardMode: project.rewardMode as ProjectRewardMode,
      name: isPrivate ? `Private Project #${project.id.slice(2, 6)}` : project.name,
      owner: isPrivate
        ? `0x****...${project.ownerAddress.slice(-4)}`
        : project.ownerAddress,
      description: isPrivate ? undefined : (project.description ?? undefined),
      repository: isPrivate ? undefined : (project.repoUrl ?? undefined),
      taskCount,
      openTaskCount,
      totalRewardPool:
        project.rewardMode === "free"
          ? "0"
          : `${project.escrowBalance.toFixed(2)} USDC`,
      stack: project.stack,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
    };
  }

  async updateMerkleRoot(projectId: string, root: string): Promise<void> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { merkleRoot: root },
    });

    const adapter = this.chainRegistry.get(project.chain);
    await adapter.anchorMerkleRoot(projectId, root);
  }

  async updateSyncStatus(projectId: string, status: string): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        syncStatus: status,
        lastSyncAt: status === "synced" ? new Date() : undefined,
      },
    });
  }

  calculateCommission(rewardPool: number): number {
    if (rewardPool < 5000) return rewardPool * 0.12;
    if (rewardPool <= 50000) return rewardPool * 0.10;
    return rewardPool * 0.08;
  }

  estimateCost(tasks: TaskDraft[]): ProjectEstimation {
    const totalReward = tasks.reduce((s, t) => s + (t.rewardAmount ?? 0), 0);
    const avgEffort =
      tasks.reduce((s, t) => s + t.scoring.effort, 0) / (tasks.length || 1);
    const totalEffortHours = Math.round(tasks.length * avgEffort * 8);

    const commissionRate =
      totalReward < 5000 ? 0.12 : totalReward <= 50000 ? 0.10 : 0.08;
    const commissionAmount = totalReward * commissionRate;

    return {
      taskCount: tasks.length,
      totalEffortHours,
      rewardPoolSuggested: totalReward,
      commissionRate,
      commissionAmount,
      totalDeposit: totalReward + commissionAmount,
    };
  }

  async activate(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PtfError(PtfErrorCode.PROJECT_NOT_FOUND, `Projet introuvable : ${projectId}`);
    }
    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: "active" },
    });
  }
}
