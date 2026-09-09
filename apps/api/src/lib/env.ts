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
  JWT_SECRET: z.string().min(32),
  TERRAFORM_CLOUD_TOKEN: z.string().optional(),
  TERRAFORM_ORG: z.string().optional(),
  ARGOCD_URL: z.string().url().optional(),
  ARGOCD_TOKEN: z.string().optional(),
  API_PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(60000).refine((v) => v > 0, "must be a positive number"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(5000).refine((v) => v > 0, "must be a positive number"),
  ARGOCD_POLL_INTERVAL_MS: z.coerce.number().default(5000).refine((v) => v > 0, "must be a positive number"),
  ARGOCD_WATCH_TIMEOUT_MS: z.coerce.number().default(1800000).refine((v) => v > 0, "must be a positive number"),
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

export const env = parsed.data;
