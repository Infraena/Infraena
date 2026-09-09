import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SetupPage } from "./SetupPage";

const baseChecks = {
  database: { ok: true, message: "PostgreSQL connected", required: true, envVars: ["DATABASE_URL"] },
  redis: { ok: true, message: "Redis connected", required: true, envVars: ["REDIS_URL"] },
  vault: { ok: false, message: "Not configured — set VAULT_ADDR and VAULT_TOKEN", required: true, envVars: ["VAULT_ADDR", "VAULT_TOKEN"], provider: "vault" },
  github: { ok: false, message: "Not configured — set GITHUB_TOKEN", required: true, envVars: ["GITHUB_TOKEN"], provider: "github-pat" },
  githubOAuth: { ok: true, message: "OAuth App configured", required: true, envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"], provider: "github-oauth" },
  terraform: { ok: true, message: "Terraform Cloud connected", required: true, envVars: ["TERRAFORM_CLOUD_TOKEN", "TERRAFORM_ORG"], provider: "terraform" },
  argocd: { ok: false, message: "Not configured — set ARGOCD_URL and ARGOCD_TOKEN", required: false, envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"], provider: "argocd" },
};

let currentChecks: typeof baseChecks;

function payload() {
  return {
    timestamp: new Date().toISOString(),
    allOk: Object.values(currentChecks).every((c) => c.ok),
    checks: currentChecks,
  };
}

beforeEach(() => {
  currentChecks = structuredClone(baseChecks);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.includes("/api/setup/validate") && body?.provider === "github") {
        return new Response(JSON.stringify({ ok: true, message: "Authenticated as tester with org access" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(payload()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetupPage", () => {
  it("shows all-ok state when every required check passes", async () => {
    currentChecks = {
      ...baseChecks,
      vault: { ...baseChecks.vault, ok: true, message: "Vault healthy" },
      github: { ...baseChecks.github, ok: true, message: "Authenticated as tester" },
      argocd: { ...baseChecks.argocd, ok: true, message: "Argo CD connected" },
    };
    render(<SetupPage onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText("All systems go!")).toBeDefined());
  });

  it("orders required checks before optional ones", async () => {
    render(<SetupPage onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText("PostgreSQL")).toBeDefined());

    const labels = screen.getAllByText(/GitHub API|Argo CD|PostgreSQL/);
    const githubIdx = labels.findIndex((el) => el.textContent === "GitHub API");
    const argocdIdx = labels.findIndex((el) => el.textContent === "Argo CD");
    const pgIdx = labels.findIndex((el) => el.textContent === "PostgreSQL");
    expect(pgIdx).toBeLessThan(argocdIdx);
    expect(githubIdx).toBeLessThan(argocdIdx);
  });

  it("expands a failing check into guided steps and validates a token", async () => {
    render(<SetupPage onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText("GitHub API")).toBeDefined());

    const githubCard = screen.getByText("GitHub API").closest("div")?.parentElement?.parentElement;
    expect(githubCard).toBeDefined();
    const { getByText, getByRole, getByPlaceholderText } = within(githubCard as HTMLElement);

    fireEvent.click(getByText("Fix this"));
    expect(getByText(/create a classic pat/i)).toBeDefined();

    fireEvent.change(getByPlaceholderText(/paste your github token/i), { target: { value: "ghp_test" } });
    fireEvent.click(getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(screen.getByText(/authenticated as tester/i)).toBeDefined());
  });
});