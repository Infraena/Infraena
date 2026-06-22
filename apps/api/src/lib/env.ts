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
