import { describe, it, expect } from "vitest";
import { isValidTemplateId, loadTemplate } from "./workers/templates.js";

describe("isValidTemplateId", () => {
  it("accepts catalog-style ids", () => {
    expect(isValidTemplateId("nodejs")).toBe(true);
    expect(isValidTemplateId("react-native")).toBe(true);
  });

  it("rejects path traversal and separators", () => {
    expect(isValidTemplateId("../../../../etc")).toBe(false);
    expect(isValidTemplateId("..")).toBe(false);
    expect(isValidTemplateId("a/b")).toBe(false);
    expect(isValidTemplateId("a\\b")).toBe(false);
    expect(isValidTemplateId("")).toBe(false);
    expect(isValidTemplateId(".hidden")).toBe(false);
  });
});

describe("loadTemplate", () => {
  it("returns null for a traversal id without touching the filesystem outside templates", () => {
    expect(loadTemplate("../../../../etc")).toBe(null);
  });

  it("loads a real template and excludes template.json", () => {
    const files = loadTemplate("nodejs");
    expect(files).not.toBeNull();
    expect(files?.has("template.json")).toBe(false);
  });
});
