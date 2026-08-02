import type { GraphQLContext } from "../context.js";
import { assertAuthenticated } from "../context.js";
import type { ProjectFilter } from "../../types/index.js";
import { PtfError, PtfErrorCode } from "../../types/errors.js";
import { LICENSE_CATALOG } from "../../services/licenses.js";

export const projectResolvers = {
  Query: {
    verifyRepoLicense: async (
      _: unknown,
      args: { repoUrl: string },
      ctx: GraphQLContext
    ) => {
      return ctx.services.github.checkRepoLicense(args.repoUrl);
    },

    getLicenses: async (
      _: unknown,
      args: { category?: string },
      _ctx: GraphQLContext
    ) => {
      const list = args.category
        ? LICENSE_CATALOG.filter((l) => l.category === args.category)
        : LICENSE_CATALOG;
      return list;
    },

    projects: async (
      _: unknown,
      args: { filter?: ProjectFilter },
      ctx: GraphQLContext
    ) => {
      return ctx.services.project.list(args.filter ?? {});
    },

    project: async (
      _: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      const p = await ctx.services.project.findById(args.id);
      if (!p) return null;
      return ctx.services.project.getPublicView(p);
    },

    myProjects: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Non authentifié");
      return ctx.services.project.list({ mine: true, ownerAddress: ctx.user.ptfAddress });
    },

    projectContributors: async (
      _: unknown,
      args: { projectId: string },
      ctx: GraphQLContext
    ) => {
      const project = await ctx.services.project.findById(args.projectId);
      if (!project) return [];
      if (project.type === "private") {
        throw new PtfError(
          PtfErrorCode.PRIVATE_PROJECT_CONTRIBUTORS_HIDDEN,
          "Les contributeurs des projets privés ne sont pas visibles publiquement"
        );
      }
      return [];
    },
  },

  Mutation: {
    createProject: async (
      _: unknown,
      args: { input: Record<string, unknown> },
      ctx: GraphQLContext
    ) => {
      assertAuthenticated(ctx.user);

      const { project, licenseStatus, licenseInstruction } = await ctx.services.project.create({
        name: args.input["name"] as string,
        type: args.input["type"] as "public" | "private",
        rewardMode: args.input["rewardMode"] as "free" | "paid",
        chain: args.input["chain"] as string,
        token: args.input["token"] as string | undefined,
        repoType: args.input["repoType"] as "github" | "self-hosted" | "ptf-temp",
        repoUrl: args.input["repoUrl"] as string | undefined,
        language: args.input["language"] as string | undefined,
        stack: args.input["stack"] as string[] | undefined,
        description: args.input["description"] as string | undefined,
        ownerAddress: ctx.user.ptfAddress,
      });

      return {
        ...ctx.services.project.getPublicView(project),
        licenseStatus,
        licenseInstruction,
      };
    },

    createProjectLicense: async (
      _: unknown,
      args: { projectId: string; spdxId: string; authorName: string; userToken: string },
      ctx: GraphQLContext
    ) => {
      assertAuthenticated(ctx.user);
      return ctx.services.project.createProjectLicense({
        projectId:  args.projectId,
        callerId:   ctx.user.ptfAddress,
        spdxId:     args.spdxId,
        authorName: args.authorName,
        userToken:  args.userToken,
      });
    },

    publishProject: async (
      _: unknown,
      args: { projectId: string },
      ctx: GraphQLContext
    ) => {
      assertAuthenticated(ctx.user);
      const project = await ctx.services.project.activate(args.projectId, ctx.user.ptfAddress);
      return ctx.services.project.getPublicView(project);
    },
  },
};
