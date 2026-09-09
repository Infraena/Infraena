import { describe, it, expect } from "vitest";
import { generateWebhookToken, tokensEqual, parseInboundBody, MAX_INBOUND_PAYLOAD_BYTES } from "./lib/webhooks.js";

describe("generateWebhookToken", () => {
  it("returns a 64-char hex string", () => {
    const token = generateWebhookToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different token each call", () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken());
  });
});

describe("tokensEqual", () => {
  it("returns true for equal tokens", () => {
    expect(tokensEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different tokens", () => {
    expect(tokensEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(tokensEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for empty values", () => {
    expect(tokensEqual("", "abc")).toBe(false);
    expect(tokensEqual("abc", "")).toBe(false);
    expect(tokensEqual("", "")).toBe(false);
  });
});

describe("parseInboundBody", () => {
  it("accepts a minimal valid body", () => {
    expect(parseInboundBody({ event: "custom.event" })).toEqual({ event: "custom.event" });
  });

  it("accepts a full body", () => {
    const parsed = parseInboundBody({
      event: "deployment.started",
      version: "v1.2.3",
      environment: "production",
      message: "Deploying",
      data: { ref: "main" },
    });
    expect(parsed).toMatchObject({
      event: "deployment.started",
      version: "v1.2.3",
      environment: "production",
      message: "Deploying",
      data: { ref: "main" },
    });
  });

  it("rejects a missing or empty event", () => {
    expect(() => parseInboundBody({})).toThrow();
    expect(() => parseInboundBody({ event: "" })).toThrow();
  });

  it("rejects an invalid environment", () => {
    expect(() => parseInboundBody({ event: "deployment.started", environment: "qa" })).toThrow();
  });

  it("rejects a payload over the size cap", () => {
    const big = { event: "custom.event", data: { blob: "x".repeat(MAX_INBOUND_PAYLOAD_BYTES) } };
    expect(() => parseInboundBody(big)).toThrow("Payload too large");
  });

  it("rejects non-object bodies", () => {
    expect(() => parseInboundBody(null)).toThrow();
    expect(() => parseInboundBody("event")).toThrow();
  });
});
