import { describe, it, expect } from "vitest";
import { isDemoSlug, isDemoTeam, shouldSeed, isCleanMode } from "../prisma/seedUtils.js";

describe("isDemoSlug", () => {
  it("returns true for demo- prefixed slugs", () => {
    expect(isDemoSlug("demo-auth-api")).toBe(true);
    expect(isDemoSlug("demo-platform")).toBe(true);
  });

  it("returns false for non-demo slugs", () => {
    expect(isDemoSlug("auth-api")).toBe(false);
    expect(isDemoSlug("demoX")).toBe(false);
    expect(isDemoSlug("")).toBe(false);
  });
});

describe("isDemoTeam", () => {
  it("returns true for team names starting with Demo", () => {
    expect(isDemoTeam("Demo Platform")).toBe(true);
  });

  it("returns false otherwise", () => {
    expect(isDemoTeam("Platform")).toBe(false);
  });
});

describe("shouldSeed", () => {
  it("seeds an empty catalog", () => {
    expect(shouldSeed(0, [])).toBe(true);
  });

  it("skips a non-empty catalog without --force", () => {
    expect(shouldSeed(5, [])).toBe(false);
  });

  it("seeds a non-empty catalog with --force", () => {
    expect(shouldSeed(5, ["--force"])).toBe(true);
  });
});

describe("isCleanMode", () => {
  it("detects the --clean flag", () => {
    expect(isCleanMode(["--clean"])).toBe(true);
    expect(isCleanMode([])).toBe(false);
    expect(isCleanMode(["--force"])).toBe(false);
  });
});