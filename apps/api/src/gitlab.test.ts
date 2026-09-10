import { describe, it, expect, vi } from "vitest";
import {
  gitlabApiUrl,
  detectRepoProvider,
  encodeProjectPath,
  resolveNamespace,
  buildProjectPayload,
  buildCommitActions,
  parseRepoPath,
} from "./lib/gitlab.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gitlabApiUrl", () => {
  it("joins base and path under /api/v4 without double slashes", () => {
    expect(gitlabApiUrl("https://gitlab.com", "users/me")).toBe("https://gitlab.com/api/v4/users/me");
    expect(gitlabApiUrl("https://gitlab.com/", "/projects/1")).toBe("https://gitlab.com/api/v4/projects/1");
    expect(gitlabApiUrl("https://git.company.io/", "groups/a%2Fb")).toBe("https://git.company.io/api/v4/groups/a%2Fb");
  });
});

describe("detectRepoProvider", () => {
  it("detects github.com", () => {
    expect(detectRepoProvider("https://github.com/acme/api", "https://gitlab.com")).toBe("github");
  });

  it("detects gitlab.com and a custom self-managed host", () => {
    expect(detectRepoProvider("https://gitlab.com/acme/api", "https://gitlab.com")).toBe("gitlab");
    expect(detectRepoProvider("https://git.company.io/acme/api", "https://git.company.io")).toBe("gitlab");
  });

  it("returns null for unknown hosts and invalid urls", () => {
    expect(detectRepoProvider("https://bitbucket.org/acme/api", "https://gitlab.com")).toBe(null);
    expect(detectRepoProvider("not a url", "https://gitlab.com")).toBe(null);
  });
});

describe("encodeProjectPath", () => {
  it("url-encodes slashes in group/subgroup paths", () => {
    expect(encodeProjectPath("org/team/proj")).not.toContain("/");
    expect(encodeProjectPath("org/team/proj")).toBe("org%2Fteam%2Fproj");
  });
});

describe("parseRepoPath", () => {
  it("extracts group/project and strips .git", () => {
    expect(parseRepoPath("https://gitlab.com/acme/api.git")).toBe("acme/api");
    expect(parseRepoPath("https://git.company.io/org/sub/proj/")).toBe("org/sub/proj");
    expect(parseRepoPath("nope")).toBe(null);
  });
});

describe("resolveNamespace", () => {
  it("returns the namespace id when the group exists", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: 42 }));
    const result = await resolveNamespace("https://gitlab.com", "tok", "acme", fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ namespaceId: 42, usedFallback: false });
  });

  it("falls back to the personal namespace when the group is missing or inaccessible", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const result = await resolveNamespace("https://gitlab.com", "tok", "acme", fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ usedFallback: true });
  });

  it("falls back immediately when no group is configured", async () => {
    const fetchFn = vi.fn();
    const result = await resolveNamespace("https://gitlab.com", "tok", undefined, fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ usedFallback: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("falls back on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await resolveNamespace("https://gitlab.com", "tok", "acme", fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ usedFallback: true });
  });
});

describe("buildProjectPayload", () => {
  it("builds a private project payload with namespace_id when provided", () => {
    expect(buildProjectPayload("my-api", 42)).toMatchObject({
      name: "my-api",
      path: "my-api",
      visibility: "private",
      initialize_with_readme: false,
      namespace_id: 42,
    });
  });

  it("omits namespace_id when not provided", () => {
    const payload = buildProjectPayload("my-api");
    expect(payload).not.toHaveProperty("namespace_id");
  });
});

describe("buildCommitActions", () => {
  it("creates one action per file, substitutes serviceName and skips template.json", () => {
    const files = new Map<string, string>([
      ["README.md", "# {{serviceName}}"],
      ["template.json", '{"name":"x"}'],
      ["src/index.ts", "// {{serviceName}}"],
    ]);
    const actions = buildCommitActions(files, "my-api");
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.file_path)).toEqual(["README.md", "src/index.ts"]);
    expect(actions[0].content).toBe("# my-api");
    expect(actions.every((a) => a.action === "create")).toBe(true);
  });
});
