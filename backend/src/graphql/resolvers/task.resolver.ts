import type { GraphQLContext } from "../context.js";
import { assertFullyLinked } from "../context.js";
import type { TaskFilter } from "../../types/index.js";
import { PtfError, PtfErrorCode } from "../../types/errors.js";

export const taskResolvers = {
  Query: {
    tasks: async (
      _: unknown,
      args: { filter?: TaskFilter },
      ctx: GraphQLContext
    ) => {
      const tasks = await ctx.services.task.list(args.filter ?? {});
      return tasks.map((t) => ctx.services.task.getPublicView(t, "public"));
    },

    task: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      const task = await ctx.services.task.findById(args.id);
      if (!task) return null;
      return ctx.services.task.getPublicView(task, "public");
    },

    myTasks: async (
      _: unknown,
      args: { status?: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      // myTasks only requires login, not full linking
      const tasks = await ctx.services.task.list({
        status: args.status as never,
        devAddress: ctx.user.userId,
      });
      return tasks.map((t) => ctx.services.task.getPublicView(t, "public"));
    },
  },

  Mutation: {
    claimTask: async (
      _: unknown,
      args: { taskId: string; chain: string; signedNonce?: string },
      ctx: GraphQLContext
    ) => {
      assertFullyLinked(ctx.user);

      const wallet = await ctx.services.wallet.getLinkedChains(ctx.user.userId);
      const chainWallet = wallet.find((w) => w.chain === args.chain);
      if (!chainWallet) {
        throw new PtfError(
          PtfErrorCode.WALLET_NOT_ACTIVATED,
          `Aucun wallet lié pour la chaîne ${args.chain}`
        );
      }

      return ctx.services.task.claim(
        args.taskId,
        chainWallet.address,
        args.chain,
        args.signedNonce
      );
    },

    submitTask: async (
      _: unknown,
      args: { taskId: string; commitHash: string; branchRef: string },
      ctx: GraphQLContext
    ) => {
      assertFullyLinked(ctx.user);

      const wallets = await ctx.services.wallet.getLinkedChains(ctx.user.userId);
      if (!wallets.length) {
        throw new PtfError(PtfErrorCode.WALLET_NOT_ACTIVATED, "Aucun wallet lié");
      }

      // The service verifies ownership against task.devAddress from the DB
      return ctx.services.task.submit(
        args.taskId,
        args.commitHash,
        args.branchRef,
        wallets[0].address
      );
    },

    cancelTask: async (
      _: unknown,
      args: { taskId: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");

      const wallets = await ctx.services.wallet.getLinkedChains(ctx.user.userId);
      if (!wallets.length) {
        throw new PtfError(PtfErrorCode.WALLET_NOT_ACTIVATED, "Aucun wallet lié");
      }

      // The service verifies ownership against task.devAddress from the DB
      await ctx.services.task.cancel(args.taskId, wallets[0].address);
      return true;
    },

    generateTasks: async (
      _: unknown,
      args: {
        projectId: string;
        architectureMd: string;
        planActionMd: string;
      },
      ctx: GraphQLContext
    ) => {
      assertFullyLinked(ctx.user);

      const result = await ctx.services.taskGenerator.generate(
        args.projectId,
        args.architectureMd,
        args.planActionMd,
        { provider: "mock" }
      );

      return {
        tasks: result.tasks.map((t) => ({
          title: t.title,
          type: t.type,
          priority: t.priority,
          rewardAmount: t.rewardAmount,
          duration: t.duration,
          scoring: t.scoring,
        })),
        estimation: result.estimation,
      };
    },
  },
};
