import type { IAuthService, JwtPayload } from "../services/auth.service.js";
import type { IProjectService } from "../services/project.service.js";
import type { ITaskService } from "../services/task.service.js";
import type { IReputationService } from "../services/reputation.service.js";
import type { IWalletService } from "../services/wallet.service.js";
import type { IPunishmentService } from "../services/punishment.service.js";
import type { ITaskGeneratorService } from "../services/taskGenerator.service.js";
import type { IReportService } from "../services/report.service.js";

export interface IServiceContainer {
  auth: IAuthService;
  project: IProjectService;
  task: ITaskService;
  reputation: IReputationService;
  wallet: IWalletService;
  punishment: IPunishmentService;
  taskGenerator: ITaskGeneratorService;
  report: IReportService;
}

export interface GraphQLContext {
  services: IServiceContainer;
  user: JwtPayload | null;
}
