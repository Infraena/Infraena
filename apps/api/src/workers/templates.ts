import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, relative, resolve, sep, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const templatesDir = resolve(__dirname, "..", "..", "..", "..", "templates");

const templateCache = new Map<string, Map<string, string>>();

export function isValidTemplateId(templateId: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/i.test(templateId);
}

export function loadTemplate(templateId: string): Map<string, string> | null {
  if (templateCache.has(templateId)) return templateCache.get(templateId)!;
  if (!isValidTemplateId(templateId)) return null;

  const dir = resolve(templatesDir, templateId);
  if (dir !== templatesDir && !dir.startsWith(templatesDir + sep)) return null;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;

  const files = new Map<string, string>();
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name === "template.json") continue;
      files.set(relative(dir, full), readFileSync(full, "utf-8"));
    }
  }
  walk(dir);
  templateCache.set(templateId, files);
  return files;
}
