import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SetupIncompleteBanner } from "./SetupIncompleteBanner";

const checks = (githubOk: boolean) => ({
  database: { ok: true, message: "PostgreSQL connected", required: true, envVars: ["DATABASE_URL"] },
  github: { ok: githubOk, message: githubOk ? "Authenticated" : "Not configured — set GITHUB_TOKEN", required: true, envVars: ["GITHUB_TOKEN"], provider: "github-pat" },
  argocd: { ok: false, message: "Not configured", required: false, envVars: ["ARGOCD_URL"], provider: "argocd" },
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ checks: checks(false) }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as typeof fetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetupIncompleteBanner", () => {
  it("shows the banner when a required check fails", async () => {
    render(<SetupIncompleteBanner onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText(/setup is incomplete/i)).toBeDefined());
    expect(screen.getByRole("button", { name: /fix setup/i })).toBeDefined();
  });

  it("renders nothing when all required checks pass", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ checks: checks(true) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const { container } = render(<SetupIncompleteBanner onNavigate={() => {}} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders nothing when the check request fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const { container } = render(<SetupIncompleteBanner onNavigate={() => {}} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});