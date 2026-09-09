import { describe, it, expect, vi } from "vitest";
import {
  triggerAppSync,
  getAppState,
  decideDeploymentOutcome,
  startArgoWatcher,
  ArgoAppState,
} from "./lib/argo.js";

const CONFIG = { url: "http://argo.example", token: "secret-token" };

function mockFetch(status: number, body: unknown = null): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("triggerAppSync", () => {
  it("returns not configured without env/config", async () => {
    const result = await triggerAppSync("infraena-demo", fetch, {});
    expect(result).toEqual({ ok: false, configured: false, message: "Argo CD not configured" });
  });

  it("triggers a sync when configured", async () => {
    const fetchFn = mockFetch(200);
    const result = await triggerAppSync("infraena-demo", fetchFn, CONFIG);
    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.message).toContain("triggered");
    const url = String((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("/api/v1/applications/infraena-demo/sync");
    const headers = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("reports failure when Argo returns an error", async () => {
    const fetchFn = mockFetch(400, { message: "bad request" });
    const result = await triggerAppSync("infraena-demo", fetchFn, CONFIG);
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.message).toContain("sync failed");
  });

  it("reports network errors without crashing", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const result = await triggerAppSync("infraena-demo", fetchFn, CONFIG);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });
});

describe("getAppState", () => {
  it("returns missing on 404", async () => {
    const state = await getAppState("infraena-demo", mockFetch(404), CONFIG);
    expect(state.missing).toBe(true);
  });

  it("returns httpError on non-ok status", async () => {
    const state = await getAppState("infraena-demo", mockFetch(401), CONFIG);
    expect(state.httpError).toBe(true);
  });

  it("parses the application state", async () => {
    const body = {
      status: {
        sync: { status: "Synced" },
        health: { status: "Healthy" },
        operationState: {
          phase: "Succeeded",
          message: "",
          syncResult: { revision: "abc123" },
        },
      },
    };
    const state = await getAppState("infraena-demo", mockFetch(200, body), CONFIG);
    expect(state).toMatchObject({
      phase: "Succeeded",
      syncStatus: "Synced",
      healthStatus: "Healthy",
      revision: "abc123",
    });
    expect(state.missing).toBeUndefined();
    expect(state.httpError).toBeUndefined();
  });

  it("returns httpError without config", async () => {
    const state = await getAppState("infraena-demo", fetch, {});
    expect(state.httpError).toBe(true);
  });
});

describe("decideDeploymentOutcome", () => {
  it("marks success when the operation Succeeded", () => {
    const state: ArgoAppState = { phase: "Succeeded", revision: "abc123", healthStatus: "Healthy" };
    expect(decideDeploymentOutcome(state)).toEqual({
      status: "success",
      message: "Synced to abc123 — Healthy",
    });
  });

  it("marks success without revision details", () => {
    const state: ArgoAppState = { phase: "Succeeded" };
    expect(decideDeploymentOutcome(state).status).toBe("success");
  });

  it("marks failed on Error phase", () => {
    const state: ArgoAppState = { phase: "Error", opMessage: "comparison failed" };
    expect(decideDeploymentOutcome(state)).toEqual({
      status: "failed",
      message: "comparison failed",
    });
  });

  it("marks failed on Failed phase with fallback message", () => {
    const state: ArgoAppState = { phase: "Failed" };
    expect(decideDeploymentOutcome(state)).toEqual({
      status: "failed",
      message: "Argo CD sync Failed",
    });
  });

  it("keeps running while the operation is running", () => {
    const state: ArgoAppState = { phase: "Running" };
    expect(decideDeploymentOutcome(state).status).toBe("running");
  });

  it("keeps running when operationState is absent", () => {
    const state: ArgoAppState = { syncStatus: "Synced" };
    expect(decideDeploymentOutcome(state).status).toBe("running");
  });

  it("marks failed when the app is missing", () => {
    const state: ArgoAppState = { missing: true };
    expect(decideDeploymentOutcome(state)).toEqual({
      status: "failed",
      message: "Argo CD application not found",
    });
  });

  it("keeps running on transient http errors", () => {
    const state: ArgoAppState = { httpError: true };
    expect(decideDeploymentOutcome(state).status).toBe("running");
    expect(decideDeploymentOutcome(state).message).toBeNull();
  });
});

describe("startArgoWatcher", () => {
  it("is a no-op in the test environment", () => {
    expect(startArgoWatcher()).toBeNull();
  });
});
