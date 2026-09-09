export type Provider = "github-oauth" | "github-pat" | "terraform" | "vault" | "argocd";

export interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
  required: boolean;
  envVars: string[];
  provider?: Provider;
}

export interface ProviderGuide {
  title: string;
  steps: string[];
  links?: { label: string; href: string }[];
}

export const TOKEN_PROVIDERS: Record<string, "github" | "terraform"> = {
  "github-pat": "github",
  terraform: "terraform",
};

export function orderChecks(
  checks: Record<string, CheckResult>
): { key: string; check: CheckResult }[] {
  const required = Object.entries(checks).filter(([, check]) => check.required);
  const optional = Object.entries(checks).filter(([, check]) => !check.required);
  return [...required, ...optional].map(([key, check]) => ({ key, check }));
}

export function buildEnvSnippet(envVars: string[]): string {
  return envVars.map((v) => `${v}=<your-value>`).join("\n");
}

export const providerGuides: Record<Provider, ProviderGuide> = {
  "github-pat": {
    title: "GitHub PAT (Personal Access Token)",
    steps: [
      "Create a classic PAT at github.com/settings/tokens/new",
      "Select scopes: repo, delete_repo (add admin:repo_hook to enable branch protection)",
      "Paste the token below and validate it",
      "Add GITHUB_TOKEN=... and GITHUB_ORG=... to apps/api/.env, then restart pnpm dev",
    ],
    links: [{ label: "Create GitHub PAT", href: "https://github.com/settings/tokens/new" }],
  },
  "github-oauth": {
    title: "GitHub OAuth App",
    steps: [
      "Go to GitHub Developer Settings → OAuth Apps → New OAuth App",
      "Homepage URL: http://localhost:3000",
      "Authorization callback URL: http://localhost:8080/auth/github/callback",
      "Copy Client ID and Client Secret into apps/api/.env, then restart pnpm dev",
    ],
    links: [{ label: "GitHub Developer Settings", href: "https://github.com/settings/developers" }],
  },
  terraform: {
    title: "Terraform Cloud token",
    steps: [
      "Create an API token at app.terraform.io/app/settings/tokens",
      "Set your organization name in TERRAFORM_ORG",
      "Paste the token below and validate it",
      "Add TERRAFORM_CLOUD_TOKEN=... and TERRAFORM_ORG=... to apps/api/.env, then restart pnpm dev",
    ],
    links: [{ label: "Create Terraform token", href: "https://app.terraform.io/app/settings/tokens" }],
  },
  vault: {
    title: "HashiCorp Vault",
    steps: [
      "Vault runs locally via docker compose in dev mode",
      "Add VAULT_ADDR=http://localhost:8200 and VAULT_TOKEN=root to apps/api/.env, then restart pnpm dev",
    ],
  },
  argocd: {
    title: "Argo CD (optional)",
    steps: [
      "Optional integration — deployments still work without it",
      "Set ARGOCD_URL and ARGOCD_TOKEN in apps/api/.env to enable sync",
    ],
  },
};