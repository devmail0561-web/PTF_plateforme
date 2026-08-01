import type { PrismaClient, Project } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IGithubService } from "./github.service.js";
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

export interface CreateProjectResult {
  project:        Project;
  licenseStatus:  "ok" | "missing" | "ineligible" | "not_github";
  licenseInstruction: string | null;
}

export interface IProjectService {
  create(input: CreateProjectInput): Promise<CreateProjectResult>;
  findById(id: string): Promise<Project | null>;
  list(filter: ProjectFilter): Promise<PublicProjectView[]>;
  getPublicView(project: Project): PublicProjectView;
  updateMerkleRoot(projectId: string, root: string): Promise<void>;
  updateSyncStatus(projectId: string, status: string): Promise<void>;
  calculateCommission(rewardPool: number): number;
  estimateCost(tasks: TaskDraft[]): ProjectEstimation;
  activate(projectId: string, callerId: string): Promise<Project>;
  /**
   * Auto-create or update the LICENSE.md file in the project's GitHub repo.
   * Requires the user's GitHub OAuth access token (write scope).
   */
  createProjectLicense(params: {
    projectId:   string;
    callerId:    string;
    spdxId:      string;
    authorName:  string;
    userToken:   string;
  }): Promise<{ fileUrl: string; commitSha: string; isOpenSource: boolean; license: string }>;
}

export class ProjectService implements IProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly githubService: IGithubService
  ) {}

  async create(input: CreateProjectInput): Promise<CreateProjectResult> {
    const timestamp = Date.now();
    const projectId = ethers.solidityPackedKeccak256(
      ["string", "string", "uint256"],
      [input.ownerAddress, input.name, timestamp]
    );

    // Non-blocking license check at creation — the project is always created.
    // licenseStatus and licenseInstruction inform the client what to do next.
    let isOpenSource:         boolean     = false;
    let license:              string | null = null;
    let licenseVerifiedAt:    Date | null   = null;
    let licenseStatus:        CreateProjectResult["licenseStatus"] = "not_github";
    let licenseInstruction:   string | null = null;

    if (input.repoType === "github" && input.repoUrl) {
      const check = await this.githubService.checkRepoLicense(input.repoUrl);
      isOpenSource      = check.passes;
      license           = check.spdxId;
      licenseVerifiedAt = new Date();

      if (check.passes) {
        licenseStatus = "ok";
      } else if (!check.spdxId) {
        licenseStatus      = "missing";
        licenseInstruction = check.instruction;
      } else {
        licenseStatus      = "ineligible";
        licenseInstruction = check.instruction;
      }
    }

    const project = await this.prisma.project.create({
      data: {
        id: projectId,
        name: input.name,
        type: input.type,
        rewardMode: input.rewardMode,
        chain: input.chain,
        token: input.rewardMode === "paid" ? (input.token ?? "PTF") : undefined,
        repoType: input.repoType,
        repoUrl: input.repoUrl,
        language: input.language,
        stack: input.stack ?? [],
        description: input.description,
        ownerAddress: input.ownerAddress.toLowerCase(),
        ownerId: input.ownerId,
        status: "draft",
        syncStatus: input.repoType === "ptf-temp" ? "pending" : "synced",
        isOpenSource,
        license,
        licenseVerifiedAt,
      },
    });

    const adapter = this.chainRegistry.get(input.chain);
    await adapter.anchorMerkleRoot(projectId, ethers.ZeroHash);

    return { project, licenseStatus, licenseInstruction };
  }

  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } });
  }

  async list(filter: ProjectFilter): Promise<PublicProjectView[]> {
    const limit  = Math.min(filter.limit  ?? 50, 200);
    const offset = filter.offset ?? 0;
    const projects = await this.prisma.project.findMany({
      where: {
        ...(filter.type && filter.type !== "all" ? { type: filter.type } : {}),
        ...(filter.ownerAddress ? { ownerAddress: filter.ownerAddress.toLowerCase() } : {}),
        ...(filter.mine
          ? (filter.status ? { status: filter.status } : {})
          : { status: filter.status ?? { not: "draft" } }
        ),
      },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: "desc" },
      take:    limit,
      skip:    offset,
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
      id: project.id,
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
          : `${project.escrowBalance.toFixed(6)} PTF`,
      stack:        project.stack,
      status:       project.status,
      isOpenSource: project.isOpenSource,
      license:      project.license ?? undefined,
      createdAt:    project.createdAt.toISOString(),
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

  async createProjectLicense(params: {
    projectId:  string;
    callerId:   string;
    spdxId:     string;
    authorName: string;
    userToken:  string;
  }): Promise<{ fileUrl: string; commitSha: string; isOpenSource: boolean; license: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: params.projectId } });
    if (!project) throw new PtfError(PtfErrorCode.PROJECT_NOT_FOUND, `Projet introuvable : ${params.projectId}`);
    if (project.ownerId !== params.callerId) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Seul le propriétaire peut modifier la licence");
    if (project.repoType !== "github" || !project.repoUrl) {
      throw new PtfError(PtfErrorCode.INVALID_INPUT, "La création automatique de licence n'est disponible que pour les dépôts GitHub.");
    }

    const { fileUrl, commitSha } = await this.githubService.createLicenseFile({
      repoUrl:    project.repoUrl,
      spdxId:     params.spdxId,
      authorName: params.authorName,
      userToken:  params.userToken,
    });

    // Re-verify immediately after creating the file
    const check      = await this.githubService.checkRepoLicense(project.repoUrl);
    const isOpenSource = check.passes;

    await this.prisma.project.update({
      where: { id: params.projectId },
      data:  {
        isOpenSource,
        license:           params.spdxId,
        licenseVerifiedAt: new Date(),
      },
    });

    return { fileUrl, commitSha, isOpenSource, license: params.spdxId };
  }

  async activate(projectId: string, callerId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PtfError(PtfErrorCode.PROJECT_NOT_FOUND, `Projet introuvable : ${projectId}`);
    }
    if (project.ownerId !== callerId) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Seul le propriétaire peut publier ce projet");
    }

    // Re-check license before publication. Non-blocking: ineligible projects can
    // still be published but will not grant reputation points.
    let isOpenSource      = project.isOpenSource;
    let license           = project.license;
    let licenseVerifiedAt = project.licenseVerifiedAt;

    if (project.repoType === "github" && project.repoUrl) {
      const check   = await this.githubService.checkRepoLicense(project.repoUrl);
      isOpenSource  = check.passes;
      license       = check.spdxId;
      licenseVerifiedAt = new Date();
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data:  { status: "active", isOpenSource, license, licenseVerifiedAt },
    });
  }
}
