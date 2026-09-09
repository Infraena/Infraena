import { describe, it, expect, vi } from "vitest";
import { buildPayload, deliverNotification, notify, shouldReceive } from "./lib/notify.js";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe("buildPayload", () => {
  it("builds a slack payload with text", () => {
    expect(buildPayload("slack", "hello")).toEqual({ text: "hello" });
  });

  it("builds a discord payload with content", () => {
    expect(buildPayload("discord", "hello")).toEqual({ content: "hello" });
  });

  it("builds a generic payload with metadata", () => {
    expect(buildPayload("generic", "hello", "service.ready", "demo-api")).toEqual({
      text: "hello",
      event: "service.ready",
      service: "demo-api",
    });
  });
});

describe("deliverNotification", () => {
  it("returns ok on 2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200));
    const result = await deliverNotification(
      { id: null, kind: "slack", url: "https://hooks.slack.com/test" },
      "hello",
      "service.ready",
      "demo-api",
      fetchFn as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, opts] = fetchFn.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ text: "hello" });
  });

  it("returns not-ok with status on 5xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(500));
    const result = await deliverNotification(
      { id: null, kind: "discord", url: "https://discord.com/api/webhooks/test" },
      "hello",
      undefined,
      undefined,
      fetchFn as unknown as typeof fetch
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it("returns not-ok with error on network failure and never throws", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await deliverNotification(
      { id: null, kind: "generic", url: "https://example.com/hook" },
      "hello",
      undefined,
      undefined,
      fetchFn as unknown as typeof fetch
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("shouldReceive", () => {
  it("matches explicit events", () => {
    expect(shouldReceive(["service.ready"], "service.ready")).toBe(true);
    expect(shouldReceive(["service.ready"], "deployment.started")).toBe(false);
  });

  it("wildcard matches all events except webhook.received", () => {
    expect(shouldReceive(["*"], "service.ready")).toBe(true);
    expect(shouldReceive(["*"], "deployment.finished")).toBe(true);
    expect(shouldReceive(["*"], "webhook.received")).toBe(false);
  });

  it("explicit webhook.received still works", () => {
    expect(shouldReceive(["webhook.received"], "webhook.received")).toBe(true);
  });
});

describe("notify", () => {
  it("is a no-op in test mode without hitting prisma or fetch", async () => {
    const result = await notify({ event: "service.ready", serviceId: "any", message: "hello" });
    expect(result).toEqual({ delivered: 0, failed: 0 });
  });
});
