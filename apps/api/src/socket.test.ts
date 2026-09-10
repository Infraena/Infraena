import { describe, it, expect } from "vitest";
import { extractToken, isAllowedRoom } from "./lib/socket.js";

describe("extractToken", () => {
  it("prefers the handshake auth token", () => {
    expect(extractToken("abc", "infraena_token=def")).toBe("abc");
  });

  it("reads the token from the cookie header", () => {
    expect(extractToken(undefined, "theme=dark; infraena_token=xyz; other=1")).toBe("xyz");
  });

  it("returns null when no token is present", () => {
    expect(extractToken(undefined, undefined)).toBe(null);
    expect(extractToken(undefined, "theme=dark")).toBe(null);
    expect(extractToken(123, undefined)).toBe(null);
  });

  it("returns null for a malformed percent-encoded cookie instead of throwing", () => {
    expect(extractToken(undefined, "infraena_token=%")).toBe(null);
    expect(extractToken(undefined, "infraena_token=%E0%A4%A")).toBe(null);
  });
});

describe("isAllowedRoom", () => {
  it("allows the catalog room and service rooms", () => {
    expect(isAllowedRoom("catalog")).toBe(true);
    expect(isAllowedRoom("service:123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects arbitrary rooms", () => {
    expect(isAllowedRoom("service:not-a-uuid")).toBe(false);
    expect(isAllowedRoom("admin")).toBe(false);
    expect(isAllowedRoom("service:123e4567-e89b-12d3-a456-426614174000;drop")).toBe(false);
  });
});
