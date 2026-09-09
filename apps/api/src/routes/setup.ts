import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../lib/env.js";

type Provider = "github-oauth" | "github-pat" | "terraform" | "vault" | "argocd";

interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
  required: boolean;
  envVars: string[];
  provider?: Provider;
}

export async function setupRoutes(app: FastifyInstance) {
  app.get("/check", async () => {
    const checks: Record<string, CheckResult> = {};

    // Database (already running since we're serving this request)
    checks.database = { ok: true, message: "PostgreSQL connected", required: true, envVars: ["DATABASE_URL"] };

    // Redis
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    try {
      await redis.ping();
      checks.redis = { ok: true, message: "Redis connected", required: true, envVars: ["REDIS_URL"] };
    } catch (e) {
      checks.redis = { ok: false, message: "Redis unreachable", detail: (e as Error).message, required: true, envVars: ["REDIS_URL"] };
    } finally {
      redis.disconnect();
    }

    // Vault
    if (!env.VAULT_ADDR || !env.VAULT_TOKEN) {
      checks.vault = { ok: false, message: "Not configured — set VAULT_ADDR and VAULT_TOKEN", required: true, envVars: ["VAULT_ADDR", "VAULT_TOKEN"], provider: "vault" };
    } else {
      try {
        const res = await fetch(`${env.VAULT_ADDR}/v1/sys/health`, {
          headers: { "X-Vault-Token": env.VAULT_TOKEN },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          checks.vault = { ok: true, message: "Vault healthy", required: true, envVars: ["VAULT_ADDR", "VAULT_TOKEN"], provider: "vault" };
        } else {
          checks.vault = { ok: false, message: `Vault responded with ${res.status}`, detail: await res.text().catch(() => ""), required: true, envVars: ["VAULT_ADDR", "VAULT_TOKEN"], provider: "vault" };
        }
      } catch (e) {
        checks.vault = { ok: false, message: "Vault unreachable", detail: (e as Error).message, required: true, envVars: ["VAULT_ADDR", "VAULT_TOKEN"], provider: "vault" };
      }
    }

    // GitHub
    if (!env.GITHUB_TOKEN || !env.GITHUB_ORG) {
      checks.github = { ok: false, message: "Not configured — set GITHUB_TOKEN and GITHUB_ORG", required: true, envVars: ["GITHUB_TOKEN", "GITHUB_ORG"], provider: "github-pat" };
    } else {
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = (await res.json()) as { login?: string };
          checks.github = { ok: true, message: `Authenticated as ${data.login ?? "unknown"}`, required: true, envVars: ["GITHUB_TOKEN", "GITHUB_ORG"], provider: "github-pat" };
        } else {
          checks.github = { ok: false, message: `GitHub returned ${res.status}`, detail: await res.text().catch(() => ""), required: true, envVars: ["GITHUB_TOKEN", "GITHUB_ORG"], provider: "github-pat" };
        }
      } catch (e) {
        checks.github = { ok: false, message: "GitHub API unreachable", detail: (e as Error).message, required: true, envVars: ["GITHUB_TOKEN", "GITHUB_ORG"], provider: "github-pat" };
      }
    }

    // GitHub OAuth
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      checks.githubOAuth = { ok: false, message: "Not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET", required: true, envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"], provider: "github-oauth" };
    } else {
      checks.githubOAuth = { ok: true, message: `OAuth App configured (${env.GITHUB_CLIENT_ID.slice(0, 8)}...)`, required: true, envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"], provider: "github-oauth" };
    }

    // Terraform Cloud
    if (!env.TERRAFORM_CLOUD_TOKEN || !env.TERRAFORM_ORG) {
      checks.terraform = { ok: false, message: "Not configured — set TERRAFORM_CLOUD_TOKEN and TERRAFORM_ORG", required: true, envVars: ["TERRAFORM_CLOUD_TOKEN", "TERRAFORM_ORG"], provider: "terraform" };
    } else {
      try {
        const res = await fetch(`https://app.terraform.io/api/v2/organizations?q=${env.TERRAFORM_ORG}`, {
          headers: { Authorization: `Bearer ${env.TERRAFORM_CLOUD_TOKEN}`, "Content-Type": "application/vnd.api+json" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          checks.terraform = { ok: true, message: `Terraform Cloud connected (org: ${env.TERRAFORM_ORG})`, required: true, envVars: ["TERRAFORM_CLOUD_TOKEN", "TERRAFORM_ORG"], provider: "terraform" };
        } else {
          checks.terraform = { ok: false, message: `Terraform returned ${res.status}`, detail: await res.text().catch(() => ""), required: true, envVars: ["TERRAFORM_CLOUD_TOKEN", "TERRAFORM_ORG"], provider: "terraform" };
        }
      } catch (e) {
        checks.terraform = { ok: false, message: "Terraform Cloud unreachable", detail: (e as Error).message, required: true, envVars: ["TERRAFORM_CLOUD_TOKEN", "TERRAFORM_ORG"], provider: "terraform" };
      }
    }

    // Argo CD
    if (!env.ARGOCD_URL || !env.ARGOCD_TOKEN) {
      checks.argocd = { ok: false, message: "Not configured — set ARGOCD_URL and ARGOCD_TOKEN", required: false, envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"], provider: "argocd" };
    } else {
      try {
        const res = await fetch(`${env.ARGOCD_URL}/api/version`, {
          headers: { Authorization: `Bearer ${env.ARGOCD_TOKEN}` },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          checks.argocd = { ok: true, message: "Argo CD connected", required: false, envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"], provider: "argocd" };
        } else {
          checks.argocd = { ok: false, message: `Argo CD returned ${res.status}`, required: false, envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"], provider: "argocd" };
        }
      } catch (e) {
        checks.argocd = { ok: false, message: "Argo CD unreachable", detail: (e as Error).message, required: false, envVars: ["ARGOCD_URL", "ARGOCD_TOKEN"], provider: "argocd" };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      allOk: Object.values(checks).every((c) => c.ok),
      checks,
    };
  });

  const validateSchema = z.object({
    provider: z.enum(["github", "terraform"]),
    token: z.string().min(1).max(200),
  });

  app.post(
    "/validate",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = validateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
      }
      const { provider, token } = parsed.data;

      try {
        if (provider === "github") {
          if (!env.GITHUB_ORG) {
            return { ok: false, message: "GITHUB_ORG not configured — set it in apps/api/.env" };
          }
          const userRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (!userRes.ok) {
            const detail = await userRes.text().catch(() => "");
            return { ok: false, message: `GitHub rejected the token (${userRes.status})`, detail: detail.slice(0, 200) };
          }
          const user = (await userRes.json()) as { login?: string };
          const memberRes = await fetch(`https://api.github.com/orgs/${env.GITHUB_ORG}/members/${user.login}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (!memberRes.ok) {
            const detail = await memberRes.text().catch(() => "");
            return { ok: false, message: `Token valid, but not a member of org ${env.GITHUB_ORG}`, detail: detail.slice(0, 200) };
          }
          return { ok: true, message: `Authenticated as ${user.login ?? "unknown"} with org access` };
        }

        if (!env.TERRAFORM_ORG) {
          return { ok: false, message: "TERRAFORM_ORG not configured — set it in apps/api/.env" };
        }
        const res = await fetch(`https://app.terraform.io/api/v2/organizations?q=${env.TERRAFORM_ORG}`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return { ok: false, message: `Terraform rejected the token (${res.status})`, detail: detail.slice(0, 200) };
        }
        return { ok: true, message: `Terraform Cloud connected (org: ${env.TERRAFORM_ORG})` };
      } catch (e) {
        app.log.error(e);
        return { ok: false, message: "Connection failed" };
      }
    }
  );
}
