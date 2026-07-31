import type { JwtPayload } from "../services/auth.service.js";
import type { IAuthService } from "../services/auth.service.js";
import type { IProjectService } from "../services/project.service.js";
import type { ITaskService } from "../services/task.service.js";
import type { IReputationService } from "../services/reputation.service.js";
import type { IWalletService } from "../services/wallet.service.js";
import type { IPunishmentService } from "../services/punishment.service.js";
import type { ITaskGeneratorService } from "../services/taskGenerator.service.js";
import type { IReportService } from "../services/report.service.js";
import type { ICreditLedgerService } from "../services/creditLedger.service.js";
import type { IUTXOService } from "../services/utxo.service.js";
import type { IGithubService } from "../services/github.service.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

export interface IServiceContainer {
  auth: IAuthService;
  project: IProjectService;
  task: ITaskService;
  reputation: IReputationService;
  wallet: IWalletService;
  punishment: IPunishmentService;
  taskGenerator: ITaskGeneratorService;
  report: IReportService;
  creditLedger: ICreditLedgerService;
  utxo: IUTXOService;
  github: IGithubService;
}

export interface GraphQLContext {
  services: IServiceContainer;
  user: JwtPayload | null;
  // Raw JWT token — passed through to touch DeviceSession.lastSeenAt
  token: string | null;
}

/**
 * Assert that the caller is authenticated with a fully-linked account
 * (wallet + GitHub both linked).
 * Throws with a specific error code so the client can redirect to the
 * appropriate linking step.
 */
export function assertFullyLinked(user: JwtPayload | null): asserts user is JwtPayload {
  if (!user) {
    throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
  }
  if (!user.walletLinked) {
    throw new PtfError(
      PtfErrorCode.WALLET_NOT_LINKED,
      "Vous devez lier un wallet avant de pouvoir effectuer cette action"
    );
  }
  if (!user.githubLinked) {
    throw new PtfError(
      PtfErrorCode.GITHUB_NOT_LINKED,
      "Vous devez lier votre compte GitHub avant de pouvoir effectuer cette action"
    );
  }
}
