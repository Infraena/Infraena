import { Worker, Job } from "bullmq";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { updateJobLog, markJobRunning, markJobSuccess, markJobFailed, checkAllJobsComplete } from "./helpers.js";

interface VaultJobData {
  serviceId: string;
  jobId: string;
  slug: string;
}

class VaultClient {
  private addr: string;
  private token: string;

  constructor(addr: string, token: string) {
    this.addr = addr.replace(/\/$/, "");
    this.token = token;
  }

  private headers() {
    return {
      "X-Vault-Token": this.token,
      "Content-Type": "application/json",
    };
  }

  async mountExists(path: string): Promise<boolean> {
    const response = await fetch(
      `${this.addr}/v1/sys/mounts/${path}`,
      { headers: this.headers() }
    );
    return response.ok;
  }

  async enableSecretMount(slug: string): Promise<string> {
    const path = `services/${slug}`;
    const exists = await this.mountExists(path);
    if (exists) {
      return `KV mount services/${slug} already exists`;
    }

    const response = await fetch(`${this.addr}/v1/sys/mounts/${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        type: "kv",
        options: { version: "2" },
        description: `Secrets for service ${slug} - managed by Infraena`,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to mount KV secrets engine: ${err}`);
    }

    return `KV v2 mount enabled at services/${slug}`;
  }

  async createPolicy(slug: string): Promise<string> {
    const policyName = `infraena-${slug}`;
    const policy = `
path "services/${slug}/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
`;

    const response = await fetch(
      `${this.addr}/v1/sys/policies/acl/${policyName}`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ policy }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create policy: ${err}`);
    }

    return `Policy ${policyName} created`;
  }

  async createAppRole(slug: string): Promise<{ roleId: string; secretId: string }> {
    const roleName = `infraena-${slug}`;

    // Create AppRole auth method if not exists
    try {
      await fetch(`${this.addr}/v1/sys/auth/approle`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ type: "approle" }),
      });
    } catch {
      // Already exists
    }

    // Create role
    await fetch(`${this.addr}/v1/auth/approle/role/${roleName}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        token_policies: [`infraena-${slug}`],
        token_ttl: "1h",
        token_max_ttl: "4h",
        secret_id_num_uses: 0,
      }),
    });

    // Get role_id
    const roleIdRes = await fetch(
      `${this.addr}/v1/auth/approle/role/${roleName}/role-id`,
      { method: "GET", headers: this.headers() }
    );
    const roleIdData = (await roleIdRes.json()) as {
      data: { role_id: string };
    };

    // Generate secret_id
    const secretIdRes = await fetch(
      `${this.addr}/v1/auth/approle/role/${roleName}/secret-id`,
      { method: "POST", headers: this.headers() }
    );
    const secretIdData = (await secretIdRes.json()) as {
      data: { secret_id: string };
    };

    return {
      roleId: roleIdData.data.role_id,
      secretId: secretIdData.data.secret_id,
    };
  }

  async storeInitialSecret(slug: string, appRoleSecretId: string): Promise<string> {
    const path = `services/${slug}`;

    const response = await fetch(`${this.addr}/v1/${path}/data/credentials`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        data: {
          approle_role_id: `infraena-${slug}`,
          approle_secret_id: appRoleSecretId,
          created_by: "infraena",
          created_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to store initial secret: ${err}`);
    }

    return `Initial credentials stored at ${path}/credentials`;
  }
}

export async function buildVaultWorker() {
  const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

  const worker = new Worker<VaultJobData>(
    "vault-queue",
    async (job: Job<VaultJobData>) => {
      const { serviceId, jobId, slug } = job.data;

      const provisionJob = await prisma.provisionJob.findUnique({
        where: { id: jobId },
      });
      if (!provisionJob) throw new Error(`Job ${jobId} not found`);

      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Test mode — skipping external API calls.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }

      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, status: true, ownerId: true },
      });
      if (!service || service.ownerId === "00000000-0000-0000-0000-000000000000") {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Service deleted or test user — skipping.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }

      await markJobRunning(provisionJob);

      const client = new VaultClient(env.VAULT_ADDR, env.VAULT_TOKEN);
      const log = (msg: string) => updateJobLog(provisionJob, msg);

      try {
        await log(`Enabling KV v2 mount at services/${slug}...`);
        const mountResult = await client.enableSecretMount(slug);
        await log(mountResult);

        await log("Creating ACL policy...");
        const policyResult = await client.createPolicy(slug);
        await log(policyResult);

        await log("Creating AppRole...");
        const approle = await client.createAppRole(slug);
        await log(`AppRole created: ${approle.roleId}`);

        await log("Storing initial credentials...");
        const storeResult = await client.storeInitialSecret(
          slug,
          approle.secretId
        );
        await log(storeResult);

        await log("Vault setup completed successfully");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await log(`Error: ${error.message}`);
        await markJobFailed(provisionJob, error);
        await checkAllJobsComplete(serviceId);
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(`Vault job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Vault job ${job?.id} failed:`, err.message);
  });

  console.log("Vault worker started");
  return worker;
}
