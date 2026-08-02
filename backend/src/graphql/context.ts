import type { JwtPayload } from "../services/auth.service.js";
import type { IAuthService } from "../services/auth.service.js";
import type { IProjectService } from "../services/project.service.js";
import type { ITaskService } from "../services/task.service.js";
import type { IReputationService } from "../services/reputation.service.js";
import type { IWalletService } from "../services/wallet.service.js";
import type { IPunishmentService } from "../services/punishment.service.js";
import type { IEscrowService } from "../services/escrow.service.js";
import type { IValidationService } from "../services/validation.service.js";
import type { ITaskGeneratorService } from "../services/taskGenerator.service.js";
import type { IGithubService } from "../services/github.service.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

export interface IServiceContainer {
  auth: IAuthService;
  project: IProjectService;
  task: ITaskService;
  reputation: IReputationService;
  wallet: IWalletService;
  punishment: IPunishmentService;
  escrow: IEscrowService;
  validation: IValidationService;
  taskGenerator: ITaskGeneratorService;
  github: IGithubService;
}

export interface GraphQLContext {
  services: IServiceContainer;
  user: { ptfAddress: string } | null;
  token: string | null;
}

/**
 * Assert that the caller is authenticated.
 * Throws UNAUTHORIZED if user is null.
 */
export function assertAuthenticated(user: { ptfAddress: string } | null): asserts user is { ptfAddress: string } {
  if (!user) {
    throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
  }
}

/**
 * Backward-compatible alias — all resolvers now only need authentication, no wallet/github linking.
 * @deprecated Use assertAuthenticated instead.
 */
export { assertAuthenticated as assertFullyLinked };

// Re-export JwtPayload for use elsewhere
export type { JwtPayload };
