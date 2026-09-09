import { describe, it, expect } from "vitest";
import { orderChecks, buildEnvSnippet, providerGuides } from "./setupGuide";
import type { CheckResult } from "./setupGuide";

const mkCheck = (overrides: Partial<CheckResult>): CheckResult => ({
  ok: false,
  message: "not configured",
  required: true,
  envVars: [],
  ...overrides,
});

describe("orderChecks", () => {
  it("puts required checks before optional ones", () => {
    const checks: Record<string, CheckResult> = {
      argocd: mkCheck({ required: false, envVars: ["ARGOCD_URL"] }),
      github: mkCheck({ required: true, envVars: ["GITHUB_TOKEN"] }),
      database: mkCheck({ required: true, envVars: ["DATABASE_URL"] }),
    };
    const ordered = orderChecks(checks).map(({ key }) => key);
    expect(ordered.indexOf("github")).toBeLessThan(ordered.indexOf("argocd"));
    expect(ordered.indexOf("database")).toBeLessThan(ordered.indexOf("argocd"));
    expect(ordered).toHaveLength(3);
  });

  it("preserves stable order for checks with the same priority", () => {
    const checks: Record<string, CheckResult> = {
      redis: mkCheck({ envVars: ["REDIS_URL"] }),
      database: mkCheck({ envVars: ["DATABASE_URL"] }),
    };
    const ordered = orderChecks(checks).map(({ key }) => key);
    expect(ordered).toEqual(["redis", "database"]);
  });
});

describe("buildEnvSnippet", () => {
  it("produces one KEY=<your-value> line per env var", () => {
    const snippet = buildEnvSnippet(["GITHUB_TOKEN", "GITHUB_ORG"]);
    expect(snippet).toContain("GITHUB_TOKEN=<your-value>");
    expect(snippet).toContain("GITHUB_ORG=<your-value>");
  });
});

describe("providerGuides", () => {
  it("covers every provider with title, steps and env snippet builder", () => {
    for (const provider of ["github-pat", "github-oauth", "terraform", "vault", "argocd"] as const) {
      const guide = providerGuides[provider];
      expect(guide).toBeDefined();
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.steps.length).toBeGreaterThan(0);
    }
  });

  it("github-pat guide links to token creation with repo scope", () => {
    const guide = providerGuides["github-pat"];
    expect(guide.links?.some((l) => l.href.includes("settings/tokens/new"))).toBe(true);
    expect(guide.steps.join(" ").toLowerCase()).toContain("repo");
  });

  it("github-oauth guide contains the exact callback URL", () => {
    const guide = providerGuides["github-oauth"];
    expect(guide.steps.join(" ")).toContain("http://localhost:8080/auth/github/callback");
  });
});