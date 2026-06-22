import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Octokit } from "octokit";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { githubQueue, terraformQueue, vaultQueue } from "../lib/queue.js";
import { authMiddleware, getUser } from "../lib/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesPath = join(__dirname, "..", "..", "..", "..", "templates", "index.json");

let templatesCache: { id: string; name: string; category: string; description: string; icon: string }[] | null = null;

function getTemplates() {
  if (templatesCache) return templatesCache;
  try {
    if (existsSync(templatesPath)) {
      templatesCache = JSON.parse(readFileSync(templatesPath, "utf-8"));
    }
  } catch {}
  return templatesCache ?? [];
}

async function syncArgoCDApp(appName: string): Promise<string | null> {
  if (!env.ARGOCD_URL || !env.ARGOCD_TOKEN) return null;
  try {
    const url = `${env.ARGOCD_URL.replace(/\/$/, "")}/api/v1/applications/${appName}/sync`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ARGOCD_TOKEN}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.text();
      return `Argo CD sync failed: ${err.slice(0, 200)}`;
    }
    return `Argo CD sync triggered for ${appName}`;
  } catch (err) {
    return `Argo CD sync error: ${err instanceof Error ? err.message : "unknown"}`;
  }
}

async function deleteGitHubRepo(url: string | null) {
  if (!url || !env.GITHUB_TOKEN) return;
  try {
    const parts = url.replace("https://github.com/", "").replace(/\/$/, "").split("/");
    if (parts.length < 2) return;
    const [owner, repo] = parts;
    const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    await octokit.rest.repos.delete({ owner, repo });
  } catch {
    // repo may already be deleted or token lacks permissions
  }
}

const categories = {
  frontend: ["react", "vue", "angular", "nextjs", "svelte", "remix", "astro"],
  backend: ["nodejs", "go", "python", "java", "rust", "dotnet", "elixir"],
  database: ["postgresql", "mongodb", "redis", "mysql", "clickhouse", "neo4j"],
  infrastructure: ["terraform", "docker", "kubernetes"],
  mobile: ["react-native", "flutter"],
  other: ["custom"],
} as const;

type CategoryKey = keyof typeof categories;

const createServiceSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z][a-z0-9-]*$/, "Only lowercase, numbers and hyphens"),
  description: z.string().max(200).optional(),
  teamId: z.string().uuid(),
  category: z.enum(Object.keys(categories) as [CategoryKey, ...CategoryKey[]]),
  languages: z.array(z.string()),
  template: z.string().optional(),
});

export async function serviceRoutes(app: FastifyInstance) {
  app.get("/templates", async () => {
    return getTemplates();
  });

  app.get("/", async (request) => {
    const query = request.query as Record<string, string | string[] | undefined>;
    const team = typeof query.team === "string" ? query.team : undefined;
    const category = (typeof query.stack === "string" ? query.stack : typeof query.category === "string" ? query.category : undefined);
    const status = typeof query.status === "string" ? query.status : undefined;
    const page = typeof query.page === "string" ? query.page : undefined;
    const limit = typeof query.limit === "string" ? query.limit : undefined;
    const languageParam = query.language;
    const sort = typeof query.sort === "string" ? query.sort : "created";
    const order = typeof query.order === "string" ? query.order : "desc";

    const sortField = sort === "name" ? "name" : sort === "status" ? "status" : "createdAt";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const languageFilters: string[] = Array.isArray(languageParam)
      ? languageParam.filter((l): l is string => typeof l === "string")
      : typeof languageParam === "string" ? [languageParam] : [];

    const pageNum = Math.max(1, parseInt(page ?? "1"));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? "20")));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (team) where.teamId = team;
    if (category) where.category = category;
    if (status) where.status = status;
    if (languageFilters.length > 0) {
      where.OR = languageFilters.map((lang) => ({ languages: { has: lang } }));
    }

    const [services, total, statusCounts] = await Promise.all([
      prisma.service.findMany({
        where,
        include: {
          team: true,
          owner: true,
          deployments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { [sortField]: sortOrder },
        skip,
        take: limitNum,
      }),
      prisma.service.count({ where }),
      prisma.service.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const data = services.map(({ deployments, ...s }) => ({
      ...s,
      lastDeployment: deployments[0] ?? null,
    }));

    const counters: Record<string, number> = {};
    for (const g of statusCounts) {
      counters[g.status] = g._count.status;
    }

    return {
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      counters,
    };
  });

  app.get("/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({
      where: { slug },
      include: {
        team: true,
        owner: true,
        provisionJobs: { orderBy: { createdAt: "asc" } },
        deployments: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    return service;
  });

  app.post("/", { preHandler: [authMiddleware] }, async (request, reply) => {
    const parseResult = createServiceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: parseResult.error.flatten().fieldErrors });
    }

    const { name, description, teamId, category, languages, template } = parseResult.data;
    const user = getUser(request);
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const existing = await prisma.service.findFirst({
      where: { OR: [{ name }, { slug }] },
    });

    if (existing) {
      return reply
        .status(409)
        .send({ error: "Service with this name or slug already exists" });
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      return reply.status(404).send({ error: "Team not found" });
    }

    const service = await prisma.service.create({
      data: {
        name,
        slug,
        description: description ?? null,
        category,
        languages: languages ?? [],
        teamId,
        ownerId: user?.sub
          ? await prisma.user.findUnique({ where: { id: user.sub } }).then((u) => u?.id ?? null)
          : null,
        status: "provisioning",
      },
      include: { team: true, owner: true },
    });

    const jobTypes = [
      { type: "github" as const, queue: githubQueue },
      { type: "terraform" as const, queue: terraformQueue },
      { type: "vault" as const, queue: vaultQueue },
    ];

    const jobs = await Promise.all(
      jobTypes.map(({ type }) =>
        prisma.provisionJob.create({
          data: {
            serviceId: service.id,
            type,
            status: "pending",
          },
        })
      )
    );

    const isTest = process.env.NODE_ENV === "test" || process.env.VITEST;

    for (let i = 0; i < jobTypes.length; i++) {
      const { queue } = jobTypes[i];
      const job = jobs[i];

      if (!isTest) {
        await queue.add(job.type, {
          serviceId: service.id,
          jobId: job.id,
          slug: service.slug,
          category: service.category,
          languages: service.languages,
          template: template ?? languages?.[0] ?? category,
        }, {
          jobId: job.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        });
      }
    }

    return reply.status(201).send(service);
  });

  app.get("/:slug/jobs", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    return prisma.provisionJob.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: "asc" },
    });
  });

  app.get("/:slug/deployments", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as Record<string, string | undefined>;
    const page = parseInt(query.page ?? "1");
    const limit = parseInt(query.limit ?? "5");

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const [data, total] = await Promise.all([
      prisma.deployment.findMany({
        where: { serviceId: service.id },
        orderBy: { createdAt: "desc" },
        skip: (Math.max(1, page) - 1) * Math.min(50, Math.max(1, limit)),
        take: Math.min(50, Math.max(1, limit)),
      }),
      prisma.deployment.count({ where: { serviceId: service.id } }),
    ]);

    return {
      data,
      pagination: {
        page: Math.max(1, page),
        limit: Math.min(50, Math.max(1, limit)),
        total,
        totalPages: Math.ceil(total / Math.min(50, Math.max(1, limit))),
      },
    };
  });

  app.post("/:slug/deploy", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = (request.body ?? {}) as {
      environment?: string;
      version?: string;
    };
    const { environment = "staging", version = "latest" } = body;

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const user = getUser(request);
    const existingUser = user?.sub
      ? await prisma.user.findUnique({ where: { id: user.sub } }).catch(() => null)
      : null;

    const deployment = await prisma.deployment.create({
      data: {
        serviceId: service.id,
        version,
        environment,
        status: "running",
        triggeredById: existingUser?.id ?? null,
        argocdApp: `infraena-${service.slug}`,
      },
    });

    const syncResult = await syncArgoCDApp(`infraena-${service.slug}`);

    return reply.status(201).send({ ...deployment, syncResult });
  });

  app.patch("/:slug", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = (request.body ?? {}) as {
      name?: string;
      description?: string | null;
    };

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.length >= 3 && /^[a-z][a-z0-9-]*$/.test(body.name)) {
      data.name = body.name;
      data.slug = body.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    }
    if (body.description !== undefined) {
      data.description = body.description;
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const updated = await prisma.service.update({
      where: { id: service.id },
      data,
      include: { team: true, owner: true },
    });

    return updated;
  });

  app.get("/:slug/activity", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const [jobs, deployments] = await Promise.all([
      prisma.provisionJob.findMany({
        where: { serviceId: service.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.deployment.findMany({
        where: { serviceId: service.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const activity = [
      ...jobs.map((j) => ({
        id: j.id,
        type: "job" as const,
        subType: j.type,
        status: j.status,
        message: j.logs.length > 0 ? j.logs[j.logs.length - 1] : `${j.type} job ${j.status}`,
        error: j.error,
        createdAt: j.createdAt.toISOString(),
      })),
      ...deployments.map((d) => ({
        id: d.id,
        type: "deployment" as const,
        version: d.version,
        environment: d.environment,
        status: d.status,
        message: `Deployed ${d.version} to ${d.environment}`,
        createdAt: d.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return activity.slice(0, 20);
  });

  app.post("/bulk-delete", { preHandler: [authMiddleware] }, async (request, reply) => {
    const body = request.body as { ids: string[] } | undefined;
    if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "Provide an array of service ids" });
    }

    const services = await prisma.service.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, githubRepoUrl: true },
    });

    for (const svc of services) {
      await deleteGitHubRepo(svc.githubRepoUrl);
      await prisma.provisionJob.deleteMany({ where: { serviceId: svc.id } });
      await prisma.deployment.deleteMany({ where: { serviceId: svc.id } });
    }
    await prisma.service.deleteMany({ where: { id: { in: body.ids } } });

    return { success: true, deleted: body.ids.length };
  });

  app.post("/:slug/sync", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const appName = `infraena-${service.slug}`;
    const result = await syncArgoCDApp(appName);

    return { success: true, app: appName, result };
  });

  app.delete("/:slug", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    await deleteGitHubRepo(service.githubRepoUrl);
    await prisma.provisionJob.deleteMany({ where: { serviceId: service.id } });
    await prisma.deployment.deleteMany({ where: { serviceId: service.id } });
    await prisma.service.delete({ where: { id: service.id } });

    return { success: true, repoDeleted: !!service.githubRepoUrl };
  });
}
