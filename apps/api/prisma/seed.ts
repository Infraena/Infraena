import { PrismaClient } from "@prisma/client";
import { isCleanMode, shouldSeed } from "./seedUtils.js";

const prisma = new PrismaClient();

const DEMO_USER = {
  githubId: "demo-user",
  username: "demo",
  email: "demo@infraena.dev",
  role: "member",
};

const DEMO_TEAMS = [
  { name: "Demo Platform", slug: "demo-platform" },
  { name: "Demo Data", slug: "demo-data" },
];

const DEMO_SERVICES = [
  {
    name: "demo-auth-api",
    slug: "demo-auth-api",
    description: "Authentication service (demo data)",
    category: "backend",
    languages: ["nodejs", "typescript"],
    team: "demo-platform",
    githubRepoUrl: "https://github.com/example/demo-auth-api",
    provisioning: ["github", "terraform", "vault"],
    status: "ready",
    healthUrl: "https://example.com",
    deployment: { version: "v1.2.0", environment: "staging" },
  },
  {
    name: "demo-billing-api",
    slug: "demo-billing-api",
    description: "Billing service (demo data)",
    category: "backend",
    languages: ["go"],
    team: "demo-platform",
    githubRepoUrl: "https://github.com/example/demo-billing-api",
    provisioning: ["github", "terraform", "vault"],
    status: "ready",
    healthUrl: "https://example.com",
    deployment: { version: "v0.9.1", environment: "production" },
  },
  {
    name: "demo-web-app",
    slug: "demo-web-app",
    description: "Customer-facing web app (demo data)",
    category: "frontend",
    languages: ["react", "nextjs"],
    team: "demo-platform",
    githubRepoUrl: "https://github.com/example/demo-web-app",
    provisioning: ["github"],
    status: "ready",
    healthUrl: "https://example.com",
  },
  {
    name: "demo-user-db",
    slug: "demo-user-db",
    description: "User database (demo data)",
    category: "database",
    languages: ["postgresql"],
    team: "demo-data",
    githubRepoUrl: "https://github.com/example/demo-user-db",
    provisioning: ["github", "vault"],
    status: "ready",
  },
  {
    name: "demo-legacy-app",
    slug: "demo-legacy-app",
    description: "Imported legacy application (demo data)",
    category: "frontend",
    languages: ["vue"],
    team: "demo-platform",
    githubRepoUrl: "https://github.com/example/demo-legacy-app",
    provisioning: [],
    status: "imported",
  },
  {
    name: "demo-analytics-worker",
    slug: "demo-analytics-worker",
    description: "Analytics worker — provisioning failed (demo data)",
    category: "infrastructure",
    languages: ["terraform"],
    team: "demo-data",
    githubRepoUrl: "https://github.com/example/demo-analytics-worker",
    provisioning: ["github", "terraform", "vault"],
    status: "failed",
  },
];

const JOB_TYPES = ["github", "terraform", "vault"] as const;
type JobType = (typeof JOB_TYPES)[number];

const isJobType = (t: string): t is JobType => (JOB_TYPES as readonly string[]).includes(t);

function successJobs(serviceId: string, types: JobType[]) {
  return types.map((type) => ({
    serviceId,
    type,
    status: "success",
    logs: [`demo: ${type} provisioning completed`],
    startedAt: new Date(),
    finishedAt: new Date(),
  }));
}

async function deleteDemoRows() {
  const demoServices = await prisma.service.findMany({
    where: { slug: { in: DEMO_SERVICES.map((s) => s.slug) } },
    select: { id: true },
  });
  const demoIds = demoServices.map((s) => s.id);

  if (demoIds.length > 0) {
    await prisma.serviceDependency.deleteMany({
      where: { OR: [{ sourceServiceId: { in: demoIds } }, { targetServiceId: { in: demoIds } }] },
    });
  }
  await prisma.provisionJob.deleteMany({ where: { serviceId: { in: demoIds } } });
  await prisma.deployment.deleteMany({ where: { serviceId: { in: demoIds } } });
  await prisma.service.deleteMany({ where: { slug: { in: DEMO_SERVICES.map((s) => s.slug) } } });
  await prisma.user.deleteMany({ where: { githubId: DEMO_USER.githubId } });
  await prisma.team.deleteMany({ where: { slug: { in: DEMO_TEAMS.map((t) => t.slug) } } });
}

async function clean() {
  await deleteDemoRows();
  console.log("Demo data removed.");
}

async function seed() {
  const existing = await prisma.service.count();
  if (!shouldSeed(existing, process.argv)) {
    console.log(`Catalog not empty (${existing} services) — skipping seed`);
    return;
  }

  await deleteDemoRows();

  const user = await prisma.user.create({ data: DEMO_USER });

  const teamIds = new Map<string, string>();
  for (const team of DEMO_TEAMS) {
    const created = await prisma.team.create({ data: team });
    teamIds.set(team.slug, created.id);
  }

  for (const svc of DEMO_SERVICES) {
    const created = await prisma.service.create({
      data: {
        name: svc.name,
        slug: svc.slug,
        description: svc.description,
        category: svc.category,
        languages: svc.languages,
        teamId: teamIds.get(svc.team)!,
        ownerId: user.id,
        githubRepoUrl: svc.githubRepoUrl,
        provisioning: svc.provisioning,
        status: svc.status,
        healthUrl: svc.healthUrl ?? null,
      },
    });

    if (svc.status === "ready" && svc.provisioning.length > 0) {
      await prisma.provisionJob.createMany({
        data: successJobs(created.id, svc.provisioning.filter(isJobType)),
      });
    }
    if (svc.status === "failed") {
      const types = svc.provisioning.filter(isJobType);
      const failedType = types[types.length - 1] ?? "vault";
      const okTypes = types.filter((t) => t !== failedType);
      await prisma.provisionJob.createMany({
        data: successJobs(created.id, okTypes),
      });
      await prisma.provisionJob.create({
        data: {
          serviceId: created.id,
          type: failedType,
          status: "failed",
          logs: [`demo: ${failedType} provisioning failed`],
          error: "demo: vault policy rejected (demo data)",
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });
    }
    if (svc.deployment) {
      await prisma.deployment.create({
        data: {
          serviceId: created.id,
          version: svc.deployment.version,
          environment: svc.deployment.environment,
          status: "success",
          triggeredById: user.id,
        },
      });
    }
  }

  console.log(`Seeded ${DEMO_SERVICES.length} demo services, ${DEMO_TEAMS.length} demo teams.`);
}

const isDirectRun = process.argv[1]?.endsWith("seed.ts") ?? false;

if (isDirectRun) {
  const run = isCleanMode(process.argv) ? clean() : seed();
  run
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}