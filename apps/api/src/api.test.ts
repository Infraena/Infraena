import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { app } from "./app.js";
import { prisma } from "./db/prisma.js";
import * as jose from "jose";
import { env } from "./lib/env.js";

let baseUrl: string;
let authToken: string;

async function createTestToken() {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({ sub: "00000000-0000-0000-0000-000000000000", username: "tester", role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" };
}

function authHeadersNoBody() {
  return { Authorization: `Bearer ${authToken}` };
}

beforeAll(async () => {
  await app.ready();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
  authToken = await createTestToken();
});

afterAll(async () => {
  const testServices = await prisma.service.findMany({
    where: { name: { startsWith: "svc-" } },
    select: { id: true },
  });
  const testServiceIds = testServices.map((s) => s.id);

  if (testServiceIds.length > 0) {
    await prisma.serviceDependency.deleteMany({
      where: {
        OR: [
          { sourceServiceId: { in: testServiceIds } },
          { targetServiceId: { in: testServiceIds } },
        ],
      },
    });
  }
  await prisma.provisionJob.deleteMany({
    where: { service: { name: { startsWith: "svc-" } } },
  });
  await prisma.deployment.deleteMany({
    where: { service: { name: { startsWith: "svc-" } } },
  });
  await prisma.service.deleteMany({
    where: { name: { startsWith: "svc-" } },
  });
  await prisma.team.deleteMany({
    where: {
      OR: [
        { name: { startsWith: "svc-team-" } },
        { name: { startsWith: "test-team-" } },
      ],
    },
  });
  await app.close();
});

describe("Health", () => {
  it("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
  });
});

describe("Teams", () => {
  const teamName = `test-team-${Date.now()}`;

  it("POST /api/teams creates a team", async () => {
    const res = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: teamName }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe(teamName);
  });

  it("GET /api/teams lists teams", async () => {
    const res = await fetch(`${baseUrl}/api/teams`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /api/teams rejects duplicate", async () => {
    const res = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: teamName }),
    });
    expect(res.status).toBe(409);
  });
});

describe("Services", () => {
  const serviceName = `svc-${Date.now()}`;
  let serviceSlug = serviceName.toLowerCase();
  let teamId: string;
  let teamSlug: string;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: `svc-team-${Date.now()}` }),
    });
    const data = await res.json();
    teamId = data.data.id;
    teamSlug = data.data.slug;
  });

  afterAll(async () => {
    try {
      await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
    } catch {}
    try {
      await fetch(`${baseUrl}/api/teams/${teamSlug}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
    } catch {}
  });

  it("POST /api/services creates a service", async () => {
    const res = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: serviceName, category: "backend", languages: ["nodejs"], teamId }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe(serviceName);
    expect(data.data.category).toBe("backend");
    expect(data.data.languages).toEqual(["nodejs"]);
    expect(data.data.status).toBe("provisioning");
  });

  it("GET /api/services returns paginated response", async () => {
    const res = await fetch(`${baseUrl}/api/services`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("pagination");
  });

  it("GET /api/services/:slug returns detail", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe(serviceSlug);
  });

  it("GET /api/services/:slug/jobs returns jobs array", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/jobs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("PATCH /api/services/:slug edits description only", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ description: "Updated description for tests" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.description).toBe("Updated description for tests");
    expect(data.data.slug).toBe(serviceSlug);
  });

  it("PATCH /api/services/:slug rejects invalid name", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ name: "ab" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/services/:slug edits name (slug changes)", async () => {
    const newName = `svc-renamed-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe(newName);
    expect(data.data.slug).toBe(newName.toLowerCase());
    serviceSlug = data.data.slug;
  });

  it("GET /api/services/preview returns preview structure", async () => {
    const res = await fetch(`${baseUrl}/api/services/preview?name=my-service&template=nodejs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("slug");
    expect(data).toHaveProperty("github");
    expect(data).toHaveProperty("terraform");
    expect(data).toHaveProperty("vault");
    expect(data.slug).toBe("my-service");
  });

  it("GET /api/services/preview uses default name", async () => {
    const res = await fetch(`${baseUrl}/api/services/preview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe("my-service");
  });

  it("POST /api/services/import rejects invalid URL", async () => {
    const res = await fetch(`${baseUrl}/api/services/import`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ repoUrl: "not-a-url", teamId }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/services/import rejects missing teamId", async () => {
    const res = await fetch(`${baseUrl}/api/services/import`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ repoUrl: "https://example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/services/import rejects non-GitHub URL", async () => {
    const res = await fetch(`${baseUrl}/api/services/import`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ repoUrl: "https://gitlab.com/user/repo", teamId }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/services/:slug/provision starts provisioning new steps", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/provision`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ steps: ["vault"] }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.message).toBe("Provisioning started");
    expect(data.data.provisioned).toEqual(["vault"]);
  });

  it("POST /api/services/:slug/provision skips already completed steps", async () => {
    // Simulate that github and terraform jobs completed successfully
    await prisma.provisionJob.updateMany({
      where: { service: { slug: serviceSlug }, type: { in: ["github", "terraform"] } },
      data: { status: "success" },
    });

    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/provision`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ steps: ["github", "terraform"] }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("already provisioned");
  });

  it("POST /api/services/:slug/deploy creates a deployment", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/deploy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ environment: "staging", version: "1.0.0" }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.version).toBe("1.0.0");
    expect(data.data.environment).toBe("staging");
  });

  it("GET /api/services/:slug/deployments returns deployments", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/deployments`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("pagination");
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  it("POST /api/services/:slug/deploy with production environment", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/deploy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ environment: "production", version: "2.0.0" }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.environment).toBe("production");
  });

  it("GET /api/services/:slug/activity returns timeline", async () => {
    const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/activity`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/services/bulk-delete deletes services by ids", async () => {
    const createRes = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: `svc-bulkdel-${Date.now()}`, category: "backend", languages: [], teamId, provisioning: [] }),
    });
    const createData = await createRes.json();
    const bulkServiceId = createData.data.id;

    const res = await fetch(`${baseUrl}/api/services/bulk-delete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ids: [bulkServiceId] }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deleted).toBe(1);
  });

  it("POST /api/services/bulk-delete rejects empty ids", async () => {
    const res = await fetch(`${baseUrl}/api/services/bulk-delete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });

  describe("Service health endpoints", () => {
    beforeAll(() => {
      const realFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.startsWith(baseUrl)) {
            return realFetch(input, init);
          }
          if (url.includes("health.example/ok")) {
            return new Response(null, { status: 200 });
          }
          if (url.includes("health.example/bad")) {
            return new Response(null, { status: 503 });
          }
          return new Response(JSON.stringify({}), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch
      );
    });

    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it("PATCH sets a valid healthUrl and GET detail returns health fields", async () => {
      const patchRes = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ healthUrl: "https://health.example/ok" }),
      });
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.data.healthUrl).toBe("https://health.example/ok");
      expect(patchData.data.healthStatus).toBe("unknown");

      const detailRes = await fetch(`${baseUrl}/api/services/${serviceSlug}`);
      const detailData = await detailRes.json();
      expect(detailData.healthUrl).toBe("https://health.example/ok");
      expect(detailData.healthStatus).toBe("unknown");
      expect(detailData).toHaveProperty("healthDetail");
      expect(detailData).toHaveProperty("healthLatencyMs");
      expect(detailData).toHaveProperty("lastHealthCheckAt");
    });

    it("PATCH rejects an invalid healthUrl", async () => {
      const res = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ healthUrl: "ftp://example.com" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST health/check returns healthy and persists", async () => {
      const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/health/check`, {
        method: "POST",
        headers: authHeadersNoBody(),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("healthy");
      expect(typeof data.data.latencyMs).toBe("number");
      expect(data.data.persisted).toBe(true);
    });

    it("POST health/check returns unhealthy on 5xx", async () => {
      await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ healthUrl: "https://health.example/bad" }),
      });
      const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/health/check`, {
        method: "POST",
        headers: authHeadersNoBody(),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe("unhealthy");
      expect(data.data.detail).toContain("503");
    });

    it("POST health/check returns 400 when healthUrl is cleared", async () => {
      const patchRes = await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ healthUrl: null }),
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.data.healthUrl).toBeNull();
      expect(patchData.data.healthStatus).toBe("unknown");

      const res = await fetch(`${baseUrl}/api/services/${serviceSlug}/health/check`, {
        method: "POST",
        headers: authHeadersNoBody(),
      });
      expect(res.status).toBe(400);
    });
  });
});

describe("Dependencies", () => {
  const svcA = `svc-depa-${Date.now()}`;
  const svcB = `svc-depb-${Date.now()}`;
  let slugA: string;
  let slugB: string;
  let teamSlug: string;
  let depId: string;

  beforeAll(async () => {
    const teamRes = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: `svc-team-${Date.now()}` }),
    });
    const teamData = await teamRes.json();
    const teamId = teamData.data.id;
    teamSlug = teamData.data.slug;

    const resA = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: svcA, category: "backend", languages: [], teamId, provisioning: [] }),
    });
    const dataA = await resA.json();
    slugA = dataA.data.slug;

    const resB = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: svcB, category: "backend", languages: [], teamId, provisioning: [] }),
    });
    const dataB = await resB.json();
    slugB = dataB.data.slug;
  });

  afterAll(async () => {
    try { await fetch(`${baseUrl}/api/services/${slugA}`, { method: "DELETE", headers: authHeadersNoBody() }); } catch {}
    try { await fetch(`${baseUrl}/api/services/${slugB}`, { method: "DELETE", headers: authHeadersNoBody() }); } catch {}
    try { await fetch(`${baseUrl}/api/teams/${teamSlug}`, { method: "DELETE", headers: authHeadersNoBody() }); } catch {}
  });

  it("GET /api/services/:slug/dependencies returns empty graph", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("dependsOn");
    expect(data).toHaveProperty("dependedOnBy");
    expect(data.dependsOn).toEqual([]);
    expect(data.dependedOnBy).toEqual([]);
  });

  it("POST /api/services/:slug/dependencies creates dependency", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ targetSlug: slugB, type: "api", label: "HTTP API" }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.targetService.slug).toBe(slugB);
    expect(data.data.type).toBe("api");
    expect(data.data.label).toBe("HTTP API");
    depId = data.data.id;
  });

  it("GET /api/services/:slug/dependencies shows depends-on", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dependsOn.length).toBe(1);
    expect(data.dependsOn[0].targetService.slug).toBe(slugB);
    expect(data.dependedOnBy.length).toBe(0);
  });

  it("GET /api/services/:slug/dependencies shows depended-on-by on target", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugB}/dependencies`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dependedOnBy.length).toBe(1);
    expect(data.dependedOnBy[0].sourceService.slug).toBe(slugA);
    expect(data.dependsOn.length).toBe(0);
  });

  it("POST /api/services/:slug/dependencies rejects duplicate", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ targetSlug: slugB }),
    });
    expect(res.status).toBe(409);
  });

  it("POST /api/services/:slug/dependencies rejects self-dependency", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ targetSlug: slugA }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/services/:slug/dependencies/:id removes dependency", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies/${depId}`, {
      method: "DELETE",
      headers: authHeadersNoBody(),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("GET /api/services/:slug/dependencies confirms removal", async () => {
    const res = await fetch(`${baseUrl}/api/services/${slugA}/dependencies`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dependsOn).toEqual([]);
  });
});

describe("Setup", () => {
  beforeAll(() => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("api.github.com/user")) {
          return new Response(JSON.stringify({ login: "tester" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("api.github.com/orgs/") && url.includes("/members/")) {
          const authHeader = (init?.headers as Record<string, string> | undefined)?.["Authorization"] ?? "";
          if (authHeader.includes("ghp_noorg")) {
            return new Response(
              JSON.stringify({ message: "Not Found" }),
              { status: 404, headers: { "content-type": "application/json" } }
            );
          }
          return new Response(null, {
            status: 204,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith(baseUrl)) {
          return realFetch(input, init);
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/setup/check returns checks object", async () => {
    const res = await fetch(`${baseUrl}/api/setup/check`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("allOk");
    expect(data).toHaveProperty("checks");
    expect(data.checks).toHaveProperty("database");
    expect(data.checks).toHaveProperty("redis");
    expect(data.checks).toHaveProperty("vault");
    expect(data.checks).toHaveProperty("github");
    expect(data.checks).toHaveProperty("githubOAuth");
    expect(data.checks).toHaveProperty("terraform");
    expect(data.checks).toHaveProperty("argocd");
    expect(data.checks.database.ok).toBe(true);
  });

  it("GET /api/setup/check returns structured metadata (required, envVars, provider)", async () => {
    const res = await fetch(`${baseUrl}/api/setup/check`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const checks = data.checks as Record<
      string,
      { required: boolean; envVars: string[]; provider?: string }
    >;
    const providerKeys = ["github", "githubOAuth", "terraform", "vault", "argocd"];
    const infraKeys = ["database", "redis"];

    for (const key of Object.keys(checks)) {
      expect(typeof checks[key].required).toBe("boolean");
      expect(Array.isArray(checks[key].envVars)).toBe(true);
    }
    for (const key of providerKeys) {
      expect(typeof checks[key].provider).toBe("string");
    }
    for (const key of infraKeys) {
      expect(checks[key].provider).toBeUndefined();
    }
    expect(checks.argocd.required).toBe(false);
    for (const key of ["database", "redis", "vault", "github", "githubOAuth", "terraform"]) {
      expect(checks[key].required).toBe(true);
    }
    expect(checks.github.provider).toBe("github-pat");
    expect(checks.githubOAuth.provider).toBe("github-oauth");
    expect(checks.terraform.provider).toBe("terraform");
    expect(checks.vault.provider).toBe("vault");
    expect(checks.argocd.provider).toBe("argocd");
    expect(checks.github.envVars).toContain("GITHUB_TOKEN");
    expect(checks.github.envVars).toContain("GITHUB_ORG");
    expect(checks.githubOAuth.envVars).toContain("GITHUB_CLIENT_ID");
    expect(checks.terraform.envVars).toContain("TERRAFORM_CLOUD_TOKEN");
  });

  it("POST /api/setup/validate rejects invalid body", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gitlab", token: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/setup/validate rejects overly long tokens", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", token: "x".repeat(300) }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/setup/validate returns ok for a valid github token", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", token: "ghp_valid" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain("tester");
  });

  it("POST /api/setup/validate returns ok:false when the token is not a member of the org", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", token: "ghp_noorg" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain("not a member");
  });

  it("POST /api/setup/validate does not leak the token in the response", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", token: "ghp_secret_value" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("ghp_secret_value");
  });

  it("POST /api/setup/validate handles terraform (not configured org)", async () => {
    const res = await fetch(`${baseUrl}/api/setup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "terraform", token: "tf_token" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.ok).toBe("boolean");
  });
});

describe("Team repo access", () => {
  let teamSlug2: string;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: `test-team-${Date.now()}` }),
    });
    const data = await res.json();
    teamSlug2 = data.data.slug;
  });

  afterAll(async () => {
    try {
      await fetch(`${baseUrl}/api/teams/${teamSlug2}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
    } catch {}
  });

  it("POST /api/teams/:slug/repo-access rejects missing username", async () => {
    const res = await fetch(`${baseUrl}/api/teams/${teamSlug2}/repo-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/teams/:slug/repo-access returns 400 for empty team or missing token", async () => {
    const res = await fetch(`${baseUrl}/api/teams/${teamSlug2}/repo-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ username: "tester" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/teams/:slug/repo-access/:userId returns not found for unknown user", async () => {
    const res = await fetch(`${baseUrl}/api/teams/${teamSlug2}/repo-access/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: authHeadersNoBody(),
    });
    expect(res.status).toBe(404);
  });
});

describe("Metrics", () => {
  it("GET /metrics returns Prometheus metrics", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("http_requests_total");
    expect(text).toContain("idp_provision_jobs_total");
  });
});

describe("Auth", () => {
  it("GET /auth/me returns 401 without token", async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    expect(res.status).toBe(401);
  });

  it("POST /api/services returns 401 without auth", async () => {
    const res = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "noauth", category: "backend", teamId: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(401);
  });
});
