import { describe, it, expect, vi } from "vitest";
import {
  isReservedAddress,
  isPrivateAddress,
  validateOutboundUrlSync,
  validateOutboundUrl,
  redactUrl,
  MAX_OUTBOUND_URL_LENGTH,
} from "./lib/net.js";

const lookup = (addresses: string[]) =>
  vi.fn().mockResolvedValue(addresses.map((address) => ({ address, family: 4 })));

const lookupFails = () => vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

describe("redactUrl", () => {
  it("redacts the webhook token but leaves other urls intact", () => {
    expect(redactUrl("/api/webhooks/in/abc123def")).toBe("/api/webhooks/in/[redacted]");
    expect(redactUrl("/api/webhooks/in/abc123/events")).toBe("/api/webhooks/in/[redacted]/events");
    expect(redactUrl("/api/services/foo?x=1")).toBe("/api/services/foo?x=1");
  });
});

describe("isReservedAddress", () => {
  it("flags loopback, link-local, unspecified and metadata ranges", () => {
    for (const ip of ["127.0.0.1", "127.1.2.3", "169.254.169.254", "0.0.0.0", "::1", "::", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isReservedAddress(ip)).toBe(true);
    }
  });

  it("does not flag public or RFC1918 addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "10.0.0.5", "172.16.4.4", "192.168.1.10"]) {
      expect(isReservedAddress(ip)).toBe(false);
    }
  });

  it("flags hex IPv4-mapped and IPv6 metadata forms (WHATWG canonical)", () => {
    for (const ip of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "fd00:ec2::254", "0:0:0:0:0:ffff:a9fe:a9fe"]) {
      expect(isReservedAddress(ip)).toBe(true);
    }
  });
});

describe("validateOutboundUrl — IPv6 bypass regressions", () => {
  const lookup = (address: string) =>
    vi.fn().mockResolvedValue([{ address, family: 6 }]);

  it("blocks IPv4-mapped and IPv6 metadata hosts after URL canonicalization", async () => {
    const cases: [string, string][] = [
      ["http://[::ffff:169.254.169.254]/", "::ffff:a9fe:a9fe"],
      ["http://[::ffff:127.0.0.1]/", "::ffff:7f00:1"],
      ["http://[fd00:ec2::254]/", "fd00:ec2::254"],
    ];
    for (const [url, address] of cases) {
      const result = await validateOutboundUrl(url, { allowPrivate: true }, lookup(address));
      expect(result.ok).toBe(false);
    }
  });
});

describe("isPrivateAddress", () => {
  it("flags RFC1918 and unique-local ranges", () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "fd00::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("does not flag public addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
  });
});

describe("validateOutboundUrlSync", () => {
  it("accepts http and https without credentials", () => {
    expect(validateOutboundUrlSync("http://example.com/health").ok).toBe(true);
    expect(validateOutboundUrlSync("https://example.com/health").ok).toBe(true);
  });

  it("rejects other schemes and malformed urls", () => {
    expect(validateOutboundUrlSync("ftp://example.com/file").ok).toBe(false);
    expect(validateOutboundUrlSync("file:///etc/passwd").ok).toBe(false);
    expect(validateOutboundUrlSync("not a url").ok).toBe(false);
    expect(validateOutboundUrlSync("").ok).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(validateOutboundUrlSync("http://user:pass@example.com").ok).toBe(false);
  });

  it("rejects urls longer than the limit", () => {
    const url = `https://example.com/${"a".repeat(MAX_OUTBOUND_URL_LENGTH)}`;
    expect(validateOutboundUrlSync(url).ok).toBe(false);
  });
});

describe("validateOutboundUrl", () => {
  it("blocks metadata host without resolving", async () => {
    const lookupFn = lookup(["127.0.0.1"]);
    const result = await validateOutboundUrl("http://metadata.google.internal/computeMetadata", { allowPrivate: true }, lookupFn);
    expect(result.ok).toBe(false);
    expect(lookupFn).not.toHaveBeenCalled();
  });

  it("accepts a public host that resolves to a public ip", async () => {
    const result = await validateOutboundUrl("https://example.com/health", { allowPrivate: true }, lookup(["93.184.216.34"]));
    expect(result.ok).toBe(true);
  });

  it("blocks a host that resolves to loopback or link-local", async () => {
    expect((await validateOutboundUrl("http://sneaky.test/", { allowPrivate: true }, lookup(["127.0.0.1"]))).ok).toBe(false);
    expect((await validateOutboundUrl("http://sneaky.test/", { allowPrivate: true }, lookup(["169.254.169.254"]))).ok).toBe(false);
    expect((await validateOutboundUrl("http://sneaky.test/", { allowPrivate: true }, lookup(["::1"]))).ok).toBe(false);
  });

  it("allows RFC1918 when allowPrivate is true", async () => {
    const result = await validateOutboundUrl("http://internal.test/health", { allowPrivate: true }, lookup(["10.0.0.5"]));
    expect(result.ok).toBe(true);
  });

  it("blocks RFC1918 when allowPrivate is false", async () => {
    const result = await validateOutboundUrl("http://internal.test/health", { allowPrivate: false }, lookup(["10.0.0.5"]));
    expect(result.ok).toBe(false);
  });

  it("blocks any address when one of several resolved addresses is reserved", async () => {
    const result = await validateOutboundUrl("http://mixed.test/", { allowPrivate: true }, lookup(["93.184.216.34", "127.0.0.1"]));
    expect(result.ok).toBe(false);
  });

  it("rejects when the host cannot be resolved", async () => {
    const result = await validateOutboundUrl("http://nope.test/", { allowPrivate: true }, lookupFails());
    expect(result.ok).toBe(false);
  });
});
