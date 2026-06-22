import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
    expect(data.name).toBe(teamName);
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
  const serviceSlug = serviceName.toLowerCase();
  let teamId: string;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: `svc-team-${Date.now()}` }),
    });
    const data = await res.json();
    teamId = data.id;
  });

  afterAll(async () => {
    try {
      await fetch(`${baseUrl}/api/services/${serviceSlug}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {}
    try {
      await fetch(`${baseUrl}/api/teams/${teamId}`, {
        method: "DELETE",
        headers: authHeaders(),
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
    expect(data.name).toBe(serviceName);
    expect(data.category).toBe("backend");
    expect(data.languages).toEqual(["nodejs"]);
    expect(data.status).toBe("provisioning");
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
