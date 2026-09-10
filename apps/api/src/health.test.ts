import { describe, it, expect, vi } from "vitest";
import { runHealthCheck, isHealthUrlAllowed, MAX_HEALTH_URL_LENGTH } from "./lib/health.js";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

const lookup = (addresses: string[]) =>
  vi.fn().mockResolvedValue(addresses.map((address) => ({ address, family: 4 })));

describe("isHealthUrlAllowed", () => {
  it("allows http and https", () => {
    expect(isHealthUrlAllowed("http://example.com/health")).toBe(true);
    expect(isHealthUrlAllowed("https://example.com/health")).toBe(true);
  });

  it("rejects other schemes", () => {
    expect(isHealthUrlAllowed("ftp://example.com/file")).toBe(false);
    expect(isHealthUrlAllowed("file:///etc/passwd")).toBe(false);
    expect(isHealthUrlAllowed("javascript:alert(1)")).toBe(false);
  });

  it("rejects malformed urls", () => {
    expect(isHealthUrlAllowed("not a url")).toBe(false);
    expect(isHealthUrlAllowed("")).toBe(false);
  });

  it("rejects literal loopback, link-local and metadata IPs", () => {
    expect(isHealthUrlAllowed("http://127.0.0.1:8080/health")).toBe(false);
    expect(isHealthUrlAllowed("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isHealthUrlAllowed("http://[::1]:8080/health")).toBe(false);
    expect(isHealthUrlAllowed("http://metadata.google.internal/")).toBe(false);
  });

  it("allows RFC1918 hosts for internal health checks", () => {
    expect(isHealthUrlAllowed("http://10.0.0.5:8080/health")).toBe(true);
    expect(isHealthUrlAllowed("http://192.168.1.10/health")).toBe(true);
  });

  it("rejects urls longer than the limit", () => {
    const url = `https://example.com/${"a".repeat(MAX_HEALTH_URL_LENGTH)}`;
    expect(isHealthUrlAllowed(url)).toBe(false);
  });
});

describe("runHealthCheck", () => {
  it("returns healthy for 2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200));
    const result = await runHealthCheck("https://example.com", 5000, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]));
    expect(result.status).toBe("healthy");
    expect(result.detail).toBe("HTTP 200");
    expect(typeof result.latencyMs).toBe("number");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("blocks redirects instead of following them", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(302));
    const result = await runHealthCheck("https://example.com", 5000, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]));
    expect(result.status).toBe("unhealthy");
    expect(result.detail).toContain("Redirect blocked");
    const [, opts] = fetchFn.mock.calls[0];
    expect(opts.redirect).toBe("manual");
  });

  it("returns unhealthy for 5xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(503));
    const result = await runHealthCheck("https://example.com", 5000, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]));
    expect(result.status).toBe("unhealthy");
    expect(result.detail).toBe("HTTP 503");
  });

  it("returns unhealthy on timeout", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    const fetchFn = vi.fn().mockRejectedValue(err);
    const result = await runHealthCheck("https://example.com", 50, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]));
    expect(result.status).toBe("unhealthy");
    expect(result.detail).toContain("Timeout");
  });

  it("returns unhealthy on network error with a capped detail", async () => {
    const longMessage = "ECONNREFUSED " + "x".repeat(500);
    const fetchFn = vi.fn().mockRejectedValue(new Error(longMessage));
    const result = await runHealthCheck("https://example.com", 50, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]));
    expect(result.status).toBe("unhealthy");
    expect(result.detail.length).toBeLessThanOrEqual(200);
  });

  it("does not throw on fetch rejection", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      runHealthCheck("https://example.com", 50, fetchFn as unknown as typeof fetch, lookup(["93.184.216.34"]))
    ).resolves.toMatchObject({ status: "unhealthy" });
  });

  it("does not fetch when the host resolves to a reserved address", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200));
    const result = await runHealthCheck("http://sneaky.test/", 5000, fetchFn as unknown as typeof fetch, lookup(["169.254.169.254"]));
    expect(result.status).toBe("unhealthy");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
