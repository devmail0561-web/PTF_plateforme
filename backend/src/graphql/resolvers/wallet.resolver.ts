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
        ctx.services.reputation.getScore(args.address, args.chain),
      ]);

      const meetsMinBalance = await ctx.services.wallet.meetsMinBalance(args.address, args.chain);

      return {
        address: args.address,
        ptfBalance: balance.balance,
        softLocked: balance.softLocked,
        available: balance.available,
        reputationScore: score.total,
        reputationLevel: score.level,
        linkedChains: [args.chain],
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
    ) => ctx.services.wallet.getBalance(args.address, args.chain),

    reputationScore: async (
      _: unknown,
      args: { address: string; chain?: string },
      ctx: GraphQLContext
    ) => {
      const chain = args.chain ?? (process.env["DEFAULT_CHAIN"] ?? "mock");
      const score = await ctx.services.reputation.getScore(args.address, chain);
      return { address: args.address, ...score };
    },
  },

  Mutation: {
    // ── Challenge-response step 1 : génère un nonce ──────────────────────────
    requestChallenge: async (
      _: unknown,
      args: { ptfAddress: string },
      ctx: GraphQLContext
    ) => {
      return ctx.services.auth.requestChallenge(args.ptfAddress);
    },

    // ── Challenge-response step 2 : vérifie la signature, retourne un JWT ────
    verifyChallenge: async (
      _: unknown,
      args: {
        input: {
          ptfAddress: string;
          nonce:      string;
          signature:  string;
          deviceName: string;
          userAgent?: string;
        };
      },
      ctx: GraphQLContext
    ) => {
      const { token } = await ctx.services.auth.verifyChallenge(args.input);
      return { token };
    },
  },
};
