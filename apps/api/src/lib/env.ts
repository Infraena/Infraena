import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  VAULT_ADDR: z.string().url(),
  VAULT_TOKEN: z.string(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_ORG: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITLAB_TOKEN: z.string().optional(),
  GITLAB_URL: z.string().url().default("https://gitlab.com"),
  GITLAB_GROUP: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  TERRAFORM_CLOUD_TOKEN: z.string().optional(),
  TERRAFORM_ORG: z.string().optional(),
  ARGOCD_URL: z.string().url().optional(),
  ARGOCD_TOKEN: z.string().optional(),
  API_PORT: z.coerce.number().default(8080),
  API_PUBLIC_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(60000).refine((v) => v > 0, "must be a positive number"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(5000).refine((v) => v > 0, "must be a positive number"),
  ARGOCD_POLL_INTERVAL_MS: z.coerce.number().default(5000).refine((v) => v > 0, "must be a positive number"),
  ARGOCD_WATCH_TIMEOUT_MS: z.coerce.number().default(1800000).refine((v) => v > 0, "must be a positive number"),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  NOTIFY_TIMEOUT_MS: z.coerce.number().default(5000).refine((v) => v > 0, "must be a positive number"),
  TRUST_PROXY: z.string().optional().transform((v) => v === "true" || v === "1"),
  ENABLE_DOCS: z.string().optional().transform((v) => v === "true" || v === "1"),
  METRICS_TOKEN: z.string().optional(),
  ADMIN_LOGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  const placeholders = new Set([
    "dev-secret-change-me-in-production-min-32-chars",
    "your-jwt-secret-change-in-production",
  ]);
  if (placeholders.has(parsed.data.JWT_SECRET)) {
    console.error("JWT_SECRET is a known placeholder — generate one with: openssl rand -hex 32");
    process.exit(1);
  }
  if (parsed.data.VAULT_TOKEN === "root") {
    console.warn("VAULT_TOKEN is the dev default \"root\" — rotate it for production");
  }
}

export const env = parsed.data;
