import type { GraphQLContext } from "../context.js";
import { assertAuthenticated } from "../context.js";
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
      const projectIds = [...new Set(tasks.map((t) => t.projectId))];
      const projects = await Promise.all(
        projectIds.map((id) => ctx.services.project.findById(id))
      );
      const projectTypeMap = new Map(
        projects.filter(Boolean).map((p) => [p!.id, p!.type])
      );
      return tasks.map((t) =>
        ctx.services.task.getPublicView(t, projectTypeMap.get(t.projectId) ?? "public")
      );
    },

    task: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      const task = await ctx.services.task.findById(args.id);
      if (!task) return null;
      const project = await ctx.services.project.findById(task.projectId);
      return ctx.services.task.getPublicView(task, project?.type ?? "public");
    },

    myTasks: async (
      _: unknown,
      args: { status?: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      const tasks = await ctx.services.task.list({
        status: args.status as never,
        devAddress: ctx.user.ptfAddress,
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
      assertAuthenticated(ctx.user);

      return ctx.services.task.claim(
        args.taskId,
        ctx.user.ptfAddress,
        args.chain,
        args.signedNonce
      );
    },

    submitTask: async (
      _: unknown,
      args: { taskId: string; commitHash: string; branchRef: string },
      ctx: GraphQLContext
    ) => {
      assertAuthenticated(ctx.user);

      return ctx.services.task.submit(
        args.taskId,
        args.commitHash,
        args.branchRef,
        ctx.user.ptfAddress
      );
    },

    cancelTask: async (
      _: unknown,
      args: { taskId: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");

      await ctx.services.task.cancel(args.taskId, ctx.user.ptfAddress);
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
      assertAuthenticated(ctx.user);

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
