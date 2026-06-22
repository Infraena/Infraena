import { Worker, Job } from "bullmq";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { updateJobLog, markJobRunning, markJobSuccess, markJobFailed, checkAllJobsComplete } from "./helpers.js";

interface TerraformJobData {
  serviceId: string;
  jobId: string;
  slug: string;
  teamSlug: string;
}

interface TFWorkspaceResponse {
  data: {
    id: string;
    attributes: { name: string };
  };
}

interface TFRunResponse {
  data: {
    id: string;
    attributes: { status: string };
  };
}

class TerraformCloudClient {
  private baseUrl = "https://app.terraform.io/api/v2";
  private token: string;
  private org: string;

  constructor(token: string, org: string) {
    this.token = token;
    this.org = org;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/vnd.api+json",
    };
  }

  async workspaceExists(name: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/organizations/${this.org}/workspaces/${name}`,
      { headers: this.headers() }
    );
    return response.ok;
  }

  async createWorkspace(name: string): Promise<string> {
    const exists = await this.workspaceExists(name);
    if (exists) {
      return `Workspace ${name} already exists`;
    }

    const response = await fetch(
      `${this.baseUrl}/organizations/${this.org}/workspaces`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          data: {
            type: "workspaces",
            attributes: {
              name,
              executionMode: "remote",
              terraformVersion: "1.7.0",
              description: `Workspace for ${name} - managed by Infraena`,
              tagNames: ["infraena-managed"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create workspace: ${err}`);
    }

    const workspace = (await response.json()) as TFWorkspaceResponse;
    return `Workspace created: ${workspace.data.attributes.name}`;
  }

  async setVariable(
    workspaceName: string,
    key: string,
    value: string,
    category: "terraform" | "env" = "terraform",
    sensitive = false
  ) {
    const response = await fetch(
      `${this.baseUrl}/workspaces/${workspaceName}`,
      { headers: this.headers() }
    );

    if (!response.ok) {
      throw new Error(`Workspace ${workspaceName} not found`);
    }

    const workspace = (await response.json()) as TFWorkspaceResponse;
    const workspaceId = workspace.data.id;

    await fetch(
      `${this.baseUrl}/workspaces/${workspaceId}/vars`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          data: {
            type: "vars",
            attributes: {
              key,
              value,
              category,
              hcl: false,
              sensitive,
            },
          },
        }),
      }
    );

    return `Variable ${key} set`;
  }
}

export async function buildTerraformWorker() {
  const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

  const worker = new Worker<TerraformJobData>(
    "terraform-queue",
    async (job: Job<TerraformJobData>) => {
      const { serviceId, jobId, slug } = job.data;

      const provisionJob = await prisma.provisionJob.findUnique({
        where: { id: jobId },
      });
      if (!provisionJob) throw new Error(`Job ${jobId} not found`);

      if (!env.TERRAFORM_CLOUD_TOKEN || !env.TERRAFORM_ORG) {
        await markJobRunning(provisionJob);
        await updateJobLog(
          provisionJob,
          "Terraform Cloud not configured — skipping infrastructure provisioning."
        );
        await updateJobLog(
          provisionJob,
          "Set TERRAFORM_CLOUD_TOKEN and TERRAFORM_ORG to enable."
        );
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }

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

      const client = new TerraformCloudClient(
        env.TERRAFORM_CLOUD_TOKEN,
        env.TERRAFORM_ORG
      );
      const log = (msg: string) => updateJobLog(provisionJob, msg);

      try {
        const workspaceName = `infraena-${slug}`;

        await log(`Creating Terraform workspace: ${workspaceName}...`);
        const wsResult = await client.createWorkspace(workspaceName);
        await log(wsResult);

        await log("Setting namespace variable...");
        const nsResult = await client.setVariable(
          workspaceName,
          "namespace_name",
          slug
        );
        await log(nsResult);

        await log("Setting team variable...");
        const teamResult = await client.setVariable(
          workspaceName,
          "team_name",
          "platform-engineering"
        );
        await log(teamResult);

        await log("Terraform workspace configured successfully");
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
    console.log(`Terraform job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Terraform job ${job?.id} failed:`, err.message);
  });

  console.log("Terraform worker started");
  return worker;
}
