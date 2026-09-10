import { Worker } from "bullmq";
import { INFRAENA_MANAGED_TAG, INFRAENA_MANAGED_DESCRIPTION } from "@infraena/shared-types";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import {
  gitlabApiUrl,
  encodeProjectPath,
  resolveNamespace,
  buildProjectPayload,
  buildCommitActions,
  parseRepoPath,
  type CommitAction,
} from "../lib/gitlab.js";
import { loadTemplate } from "./templates.js";
import {
  updateJobLog,
  markJobRunning,
  markJobSuccess,
  markJobFailed,
  checkAllJobsComplete,
} from "./helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

interface GitLabJobData {
  serviceId: string;
  jobId: string;
  slug: string;
  category: string;
  languages: string[];
  template?: string;
  enableBranchProtection?: boolean;
  repoPath?: string;
}

async function gitlabFetch(
  url: string,
  init: { method?: string; body?: string } = {}
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "PRIVATE-TOKEN": env.GITLAB_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
}

export async function buildGitLabWorker() {
  const worker = new Worker<GitLabJobData>(
    "gitlab-queue",
    async (job) => {
      const { serviceId, jobId, slug, category, languages, template, enableBranchProtection, repoPath } = job.data;

      const provisionJob = await prisma.provisionJob.findUnique({ where: { id: jobId } });
      if (!provisionJob) {
        throw new Error(`ProvisionJob ${jobId} not found`);
      }

      if (!env.GITLAB_TOKEN || (!env.GITLAB_GROUP && !repoPath)) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "GitLab token/group not configured — skipping project creation.");
        await updateJobLog(provisionJob, "Set GITLAB_TOKEN and GITLAB_GROUP in .env to enable.");
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

      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Service deleted — skipping.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }
      if (service.ownerId === TEST_USER_ID) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Test user service — skipping external API calls.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }

      await markJobRunning(provisionJob);
      const log = (msg: string) => updateJobLog(provisionJob, msg);

      try {
        const templateId = template ?? (languages.length > 0 ? languages[0] : category);
        const { namespaceId, usedFallback } = await resolveNamespace(
          env.GITLAB_URL,
          env.GITLAB_TOKEN,
          repoPath ? undefined : env.GITLAB_GROUP
        );
        if (usedFallback && !repoPath) {
          await log("GitLab group not accessible — using the token's personal namespace.");
        }

        const projectPath = repoPath ?? `${env.GITLAB_GROUP}/${slug}`;
        const encoded = encodeProjectPath(projectPath);
        let repoUrl = `${env.GITLAB_URL.replace(/\/+$/, "")}/${projectPath}`;

        if (repoPath && service.repoUrl) {
          const expected = parseRepoPath(service.repoUrl);
          if (expected && expected !== repoPath) {
            throw new Error("Refusing to operate: project path does not match the service's registered repository");
          }
        } else if (repoPath && env.GITLAB_GROUP && !repoPath.startsWith(`${env.GITLAB_GROUP}/`)) {
          throw new Error("Refusing to operate outside the configured GITLAB_GROUP");
        }

        const existsRes = await gitlabFetch(gitlabApiUrl(env.GITLAB_URL, `projects/${encoded}`));
        const exists = existsRes.ok;

        if (exists) {
          await log(`Project ${projectPath} already exists, skipping creation.`);
        } else {
          await log(`Creating project: ${projectPath}...`);
          const createRes = await gitlabFetch(gitlabApiUrl(env.GITLAB_URL, "projects"), {
            method: "POST",
            body: JSON.stringify(buildProjectPayload(slug, namespaceId)),
          });
          if (!createRes.ok) {
            throw new Error(`Project creation failed (${createRes.status}): ${(await createRes.text()).slice(0, 200)}`);
          }
          const created = (await createRes.json()) as { id: number; web_url?: string };
          repoUrl = created.web_url ?? repoUrl;
          await log(`Project created: ${repoUrl}`);

          const ownerUser = service.ownerId
            ? await prisma.user.findUnique({ where: { id: service.ownerId }, select: { username: true, email: true } })
            : null;
          const files = loadTemplate(templateId);
          const actions: CommitAction[] = files && files.size > 0
            ? buildCommitActions(files, slug)
            : [{ action: "create", file_path: "README.md", content: `# ${slug}\n\n${INFRAENA_MANAGED_DESCRIPTION}.` }];

          await log(`Pushing ${actions.length} files in one commit...`);
          const commitRes = await gitlabFetch(gitlabApiUrl(env.GITLAB_URL, `projects/${created.id}/repository/commits`), {
            method: "POST",
            body: JSON.stringify({
              branch: "main",
              commit_message: `Initial commit from Infraena (${INFRAENA_MANAGED_DESCRIPTION})`,
              actions,
              ...(ownerUser ? { author_name: ownerUser.username, author_email: ownerUser.email ?? undefined } : {}),
            }),
          });
          if (!commitRes.ok) {
            throw new Error(`Commit failed (${commitRes.status}): ${(await commitRes.text()).slice(0, 200)}`);
          }
          await log("Initial commit pushed.");
        }

        await log(`Adding ${INFRAENA_MANAGED_TAG} topic...`);
        const topicRes = await gitlabFetch(gitlabApiUrl(env.GITLAB_URL, `projects/${encoded}`), {
          method: "PUT",
          body: JSON.stringify({ topics: [INFRAENA_MANAGED_TAG] }),
        });
        await log(topicRes.ok ? `Topic ${INFRAENA_MANAGED_TAG} set.` : "Could not add topic (may already exist).");

        if (enableBranchProtection !== false) {
          await log("Configuring branch protection...");
          const protRes = await gitlabFetch(gitlabApiUrl(env.GITLAB_URL, `projects/${encoded}/protected_branches`), {
            method: "POST",
            body: JSON.stringify({ name: "main", push_access_level: 40, merge_access_level: 40 }),
          });
          if (protRes.ok) await log("Branch protection configured for main.");
          else if (protRes.status === 409) await log("Branch protection already set.");
          else await log(`Branch protection skipped (${protRes.status}).`);
        } else {
          await log("Branch protection skipped (disabled by user).");
        }

        const currentSvc = await prisma.service.findUnique({
          where: { id: serviceId },
          select: { repoUrl: true },
        });
        if (!currentSvc?.repoUrl) {
          await prisma.service.update({
            where: { id: serviceId },
            data: { repoUrl, repoProvider: "gitlab" },
          });
          await log(`GitLab repo URL saved: ${repoUrl}`);
        }

        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await log(`Error: ${error.message}`);
        await markJobFailed(provisionJob, error);
        await checkAllJobsComplete(serviceId);
      }
    },
    { connection: { url: env.REDIS_URL, maxRetriesPerRequest: null }, concurrency: 3 }
  );

  worker.on("completed", (job) => console.log(`GitLab job ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`GitLab job ${job?.id} failed:`, err.message));
  console.log("GitLab worker started");
  return worker;
}
