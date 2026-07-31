import type { GraphQLContext } from "../context.js";
import { PtfError, PtfErrorCode } from "../../types/errors.js";

export const walletResolvers = {
  Query: {
    walletStatus: async (
      _: unknown,
      args: { address: string; chain: string },
      ctx: GraphQLContext
    ) => {
      const [verification, balance, score] = await Promise.all([
        ctx.services.wallet.verifyWallet(args.address, args.chain),
        ctx.services.wallet.getBalance(args.address, args.chain),
        ctx.services.reputation.getScore(args.address),
      ]);

      const meetsMinBalance = await ctx.services.wallet.meetsMinBalance(args.address, args.chain);

      const chains = await ctx.services.wallet.getLinkedChains(
        args.address
      ).catch(() => []);

      return {
        address: args.address,
        ptfBalance: balance.balance,
        softLocked: balance.softLocked,
        available: balance.available,
        reputationScore: score.total,
        reputationLevel: score.level,
        linkedChains: chains.map((c) => c.chain),
        isValidAddress: verification.isValidAddress,
        isActivated: verification.isActivated,
        hasGasFees: verification.hasGasFees,
        isNotBanned: verification.isNotBanned,
        ownershipProven: verification.ownershipProven,
        meetsMinBalance,
      };
    },

    walletBalance: async (
      _: unknown,
      args: { address: string; chain: string },
      ctx: GraphQLContext
    ) => {
      return ctx.services.wallet.getBalance(args.address, args.chain);
    },

    reputationScore: async (
      _: unknown,
      args: { address: string },
      ctx: GraphQLContext
    ) => {
      const score = await ctx.services.reputation.getScore(args.address);
      return { address: args.address, ...score };
    },
  },

  Mutation: {
    loginWithGithub: async (
      _: unknown,
      args: { code: string },
      ctx: GraphQLContext
    ) => {
      const { token, user } = await ctx.services.auth.loginWithGithub(args.code);
      const wallets = await ctx.services.wallet.getLinkedChains(user.id);
      return {
        token,
        user: {
          id: user.id,
          githubHandle: user.githubHandle,
          wallets: wallets.map((w) => ({
            id: w.id,
            chain: w.chain,
            address: w.address,
            isPrimary: w.isPrimary,
          })),
        },
      };
    },

    linkWallet: async (
      _: unknown,
      args: { chain: string; address: string; signature: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      return ctx.services.auth.linkWallet(
        ctx.user.userId,
        args.chain,
        args.address,
        args.signature
      );
    },

    reportUser: async (
      _: unknown,
      args: { input: { reportedAddress: string; taskId?: string; reason: string; evidence: string } },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      const { reportId } = await ctx.services.report.submit({
        reporterId: ctx.user.userId,
        reportedAddress: args.input.reportedAddress,
        taskId: args.input.taskId,
        reason: args.input.reason as never,
        evidence: args.input.evidence,
      });
      return { id: reportId, reason: args.input.reason, status: "pending", createdAt: new Date().toISOString() };
    },
  },
};
