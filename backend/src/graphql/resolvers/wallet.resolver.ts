import type { User } from "@prisma/client";
import type { GraphQLContext } from "../context.js";
import type { CreditUTXO } from "../../services/utxo.service.js";
import { PtfError, PtfErrorCode } from "../../types/errors.js";
import { ethers } from "ethers";

// Strip eip712Signature before returning UTXOs to GraphQL clients (CIA-C4).
function safeUtxo(u: CreditUTXO) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { eip712Signature: _sig, ...rest } = u;
  return { ...rest, createdAt: u.createdAt.toISOString() };
}

function isValidAddress(addr: string): boolean {
  try { return ethers.isAddress(addr); } catch { return false; }
}

async function buildUserProfile(user: User, ctx: GraphQLContext) {
  const wallets = await ctx.services.wallet.getLinkedChains(user.id);
  return {
    id:           user.id,
    ptfAddress:   user.ptfAddress!,
    ptfPublicKey: (user as unknown as { ptfPublicKey?: string }).ptfPublicKey ?? null,
    githubHandle: user.githubHandle,
    githubLinked: !!user.githubId,
    wallets:      wallets.map((w) => ({ id: w.id, chain: w.chain, address: w.address, isPrimary: w.isPrimary })),
  };
}

export const walletResolvers = {
  Query: {
    myDevices: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      return ctx.services.auth.listDevices(ctx.user.userId, ctx.user.deviceId);
    },

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
      // walletStatus is called for a specific address+chain — return the queried chain as linked
      const chains = [{ chain: args.chain }];

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
    ) => ctx.services.wallet.getBalance(args.address, args.chain),

    reputationScore: async (
      _: unknown,
      args: { address: string },
      ctx: GraphQLContext
    ) => {
      const score = await ctx.services.reputation.getScore(args.address);
      return { address: args.address, ...score };
    },

    reputationHistory: async (
      _: unknown,
      args: { address: string; limit?: number; offset?: number },
      ctx: GraphQLContext
    ) => {
      const entries = await ctx.services.reputation.getHistory(
        args.address,
        args.limit ?? 50,
        args.offset ?? 0
      );
      return entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
    },

    creditHistory: async (
      _: unknown,
      args: { address: string; limit?: number; offset?: number; type?: string },
      ctx: GraphQLContext
    ) => {
      const entries = await ctx.services.creditLedger.getHistory(args.address, {
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
        type: args.type as never,
      });
      return entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
    },

    creditBalance: async (
      _: unknown,
      args: { address: string },
      ctx: GraphQLContext
    ) => {
      const bal = await ctx.services.creditLedger.getBalance(args.address);
      return { address: args.address, ...bal };
    },

    utxos: async (
      _: unknown,
      args: { address: string; status?: string; chain?: string; limit?: number; offset?: number },
      ctx: GraphQLContext
    ) => {
      const limit  = Math.min(args.limit  ?? 50, 200);
      const offset = args.offset ?? 0;
      if (!args.status || args.status === "unspent") {
        const list = await ctx.services.utxo.getUnspent(args.address, args.chain);
        return list.slice(offset, offset + limit).map(safeUtxo);
      }
      const all = await ctx.services.utxo.getProvenance(args.address);
      return all
        .filter((u) => u.status === args.status)
        .slice(offset, offset + limit)
        .map(safeUtxo);
    },

    utxoBalance: async (
      _: unknown,
      args: { address: string },
      ctx: GraphQLContext
    ) => {
      const bal = await ctx.services.utxo.getBalance(args.address);
      return { address: args.address, ...bal };
    },

    utxoProvenance: async (
      _: unknown,
      args: { address: string; limit?: number; offset?: number },
      ctx: GraphQLContext
    ) => {
      const limit  = Math.min(args.limit  ?? 50, 200);
      const offset = args.offset ?? 0;
      const all = await ctx.services.utxo.getProvenance(args.address, { limit, offset });
      return all.map(safeUtxo);
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

    // ── Challenge-response step 2 : vérifie la signature, crée la session ────
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
      const { token, user } = await ctx.services.auth.verifyChallenge(args.input);
      return { token, user: await buildUserProfile(user, ctx) };
    },

    // ── Request GitHub OAuth state (step 1, optionnel) ───────────────────────
    requestGithubOAuthState: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      return ctx.services.auth.requestGithubOAuthState(ctx.user.userId);
    },

    // ── Link GitHub (step 2: code + CSRF state) ───────────────────────────────
    linkGithub: async (
      _: unknown,
      args: { code: string; state: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      const { token, user } = await ctx.services.auth.linkGithub(ctx.user.userId, args.code, args.state, ctx.user.deviceId);
      return { token, user: await buildUserProfile(user, ctx) };
    },

    // ── Request wallet-link challenge ─────────────────────────────────────────
    requestWalletChallenge: async (
      _: unknown,
      args: { chain: string; address: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      return ctx.services.auth.requestWalletChallenge(ctx.user.userId, args.chain, args.address);
    },

    // ── Confirm wallet-link ───────────────────────────────────────────────────
    confirmLinkWallet: async (
      _: unknown,
      args: { challengeId: string; signature: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      const { token, walletLink } = await ctx.services.auth.confirmLinkWallet(
        ctx.user.userId, args.challengeId, args.signature, ctx.user.deviceId,
      );
      return {
        token,
        walletLink: { id: walletLink.id, chain: walletLink.chain, address: walletLink.address, isPrimary: walletLink.isPrimary },
      };
    },

    // ── Revoke a specific device ──────────────────────────────────────────────
    revokeDevice: async (
      _: unknown,
      args: { deviceId: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      await ctx.services.auth.revokeDevice(ctx.user.userId, args.deviceId);
      return true;
    },

    // ── Revoke all other devices (keep current) ───────────────────────────────
    revokeAllOtherDevices: async (
      _: unknown,
      __: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      await ctx.services.auth.revokeAllOtherDevices(ctx.user.userId, ctx.user.deviceId);
      return true;
    },

    // ── UTXO withdrawal (fully-linked account required) ──────────────────────
    withdrawCredits: async (
      _: unknown,
      args: { input: { amount: number; destination: string; chain: string } },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");

      const { amount, destination, chain } = args.input;

      if (amount < 1.0) {
        throw new PtfError(PtfErrorCode.INSUFFICIENT_PTF_BALANCE, "Le montant minimum de retrait est 1.0 PTF");
      }
      if (!isValidAddress(destination)) {
        throw new PtfError(PtfErrorCode.INVALID_ADDRESS, `Adresse de destination invalide : ${destination}`);
      }

      const wallets = await ctx.services.wallet.getLinkedChains(ctx.user.userId);
      const walletLink = wallets.find((w) => w.chain === chain);
      if (!walletLink) {
        throw new PtfError(
          PtfErrorCode.WALLET_NOT_ACTIVATED,
          `Aucun wallet lié pour la chaîne ${chain}`
        );
      }

      const result = await ctx.services.utxo.spend({
        ownerAddress: walletLink.address,
        amount,
        type: "withdrawal",
        chain,
        destination,
      });

      return {
        txId:      result.txId,
        netAmount: result.netAmount,
        proofHash: result.proofHash,
        consumed:  result.consumed.map(safeUtxo),
        change:    result.change ? safeUtxo(result.change) : null,
      };
    },

    // ── Report (authentication required, no full-link needed) ────────────────
    reportUser: async (
      _: unknown,
      args: { input: { reportedAddress: string; taskId?: string; reason: string; evidence: string } },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      const { reportId } = await ctx.services.report.submit({
        reporterId:      ctx.user.userId,
        reportedAddress: args.input.reportedAddress,
        taskId:          args.input.taskId,
        reason:          args.input.reason as never,
        evidence:        args.input.evidence,
      });
      return { id: reportId, reason: args.input.reason, status: "pending", createdAt: new Date().toISOString() };
    },
  },
};
