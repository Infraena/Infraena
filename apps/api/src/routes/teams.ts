import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Octokit } from "octokit";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { authMiddleware, getUser } from "../lib/auth.js";

const createTeamSchema = z.object({
  name: z.string().min(2).max(50),
});

const updateTeamSchema = z.object({
  name: z.string().min(2).max(50),
});

const addMemberSchema = z.object({
  username: z.string().min(1),
  grantRepoAccess: z.boolean().optional(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function teamRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.team.findMany({
      include: { _count: { select: { services: true, users: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", { preHandler: [authMiddleware] }, async (request, reply) => {
    const parseResult = createTeamSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: parseResult.error.flatten().fieldErrors });
    }

    const { name } = parseResult.data;
    const slug = slugify(name);

    const existing = await prisma.team.findFirst({
      where: { OR: [{ name }, { slug }] },
    });

    if (existing) {
      return reply.status(409).send({ error: "Team already exists" });
    }

    const team = await prisma.team.create({
      data: { name, slug },
    });

    return reply.status(201).send(team);
  });

  app.get("/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const team = await prisma.team.findUnique({
      where: { slug },
      include: {
        users: true,
        services: true,
        _count: { select: { services: true, users: true } },
      },
    });

    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    return team;
  });

  app.patch("/:slug", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parseResult = updateTeamSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten().fieldErrors });
    }

    const team = await prisma.team.findUnique({ where: { slug } });
    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    const newSlug = slugify(parseResult.data.name);
    const conflict = await prisma.team.findFirst({
      where: { OR: [{ name: parseResult.data.name }, { slug: newSlug }], NOT: { id: team.id } },
    });
    if (conflict) {
      return reply.status(409).send({ error: "Team name already taken" });
    }

    const updated = await prisma.team.update({
      where: { id: team.id },
      data: { name: parseResult.data.name, slug: newSlug },
      include: { _count: { select: { services: true, users: true } } },
    });

    return updated;
  });

  app.post("/:slug/members", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parseResult = addMemberSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten().fieldErrors });
    }

    const team = await prisma.team.findUnique({ where: { slug } });
    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    const user = await prisma.user.findUnique({
      where: { githubId: parseResult.data.username },
    }) ?? await prisma.user.findFirst({
      where: { username: parseResult.data.username },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found in platform" });
    }

    if (user.teamId === team.id) {
      return reply.status(409).send({ error: "User is already a member of this team" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { teamId: team.id },
    });

    let reposGranted = 0;
    if (parseResult.data.grantRepoAccess && env.GITHUB_TOKEN) {
      const services = await prisma.service.findMany({
        where: { teamId: team.id, githubRepoUrl: { not: null } },
        select: { githubRepoUrl: true },
      });

      const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
      for (const svc of services) {
        const parts = svc.githubRepoUrl!.replace("https://github.com/", "").replace(/\/$/, "").split("/");
        if (parts.length < 2) continue;
        try {
          await octokit.rest.repos.addCollaborator({
            owner: parts[0],
            repo: parts[1],
            username: user.username,
            permission: "push",
          });
          reposGranted++;
        } catch {
          // skip repos where invite fails (already collaborator, rate limit, etc.)
        }
      }
    }

    return {
      success: true,
      user: { id: updated.id, username: updated.username, role: updated.role },
      reposGranted: reposGranted > 0 ? reposGranted : undefined,
    };
  });

  app.delete("/:slug/members/:userId", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug, userId } = request.params as { slug: string; userId: string };

    const team = await prisma.team.findUnique({ where: { slug } });
    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.teamId !== team.id) {
      return reply.status(404).send({ error: "User not a member of this team" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { teamId: null },
    });

    return { success: true };
  });

  app.delete("/:slug", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const team = await prisma.team.findUnique({
      where: { slug },
      include: { _count: { select: { services: true, users: true } } },
    });

    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    if (team._count.services > 0 || team._count.users > 0) {
      return reply.status(409).send({
        error: `Cannot delete team "${team.name}". It has ${team._count.services} service(s) and ${team._count.users} user(s). Remove them first.`,
      });
    }

    await prisma.team.delete({ where: { id: team.id } });
    return { success: true };
  });
}
