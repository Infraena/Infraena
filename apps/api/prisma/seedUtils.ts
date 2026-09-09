export const DEMO_PREFIX = "demo-";

export function isDemoSlug(slug: string): boolean {
  return slug.startsWith(DEMO_PREFIX);
}

export function isDemoTeam(name: string): boolean {
  return name.startsWith("Demo ");
}

export function shouldSeed(existingCount: number, args: string[]): boolean {
  return existingCount === 0 || args.includes("--force");
}

export function isCleanMode(args: string[]): boolean {
  return args.includes("--clean");
}