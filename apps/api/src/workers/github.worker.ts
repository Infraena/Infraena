import { Worker, Job } from "bullmq";
import { Octokit } from "octokit";
import { INFRAENA_MANAGED_TAG, INFRAENA_MANAGED_DESCRIPTION } from "@infraena/shared-types";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { loadTemplate } from "./templates.js";
import { updateJobLog, markJobRunning, markJobSuccess, markJobFailed, checkAllJobsComplete } from "./helpers.js";

interface GitHubJobData {
  serviceId: string;
  jobId: string;
  slug: string;
  category: string;
  languages: string[];
  template?: string;
  enableBranchProtection?: boolean;
  repoOwner?: string;
  repoName?: string;
}

async function repoExists(octokit: Octokit, org: string, repo: string): Promise<boolean> {
  try {
    await octokit.rest.repos.get({ owner: org, repo });
    return true;
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return false;
    throw e;
  }
}

async function createBlankRepo(
  octokit: Octokit,
  org: string,
  slug: string
): Promise<string> {
  try {
    const { data: repo } = await octokit.rest.repos.createInOrg({
      org, name: slug, private: true, auto_init: false,
      description: INFRAENA_MANAGED_DESCRIPTION,
    });
    return repo.html_url;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 403) {
      const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: slug, private: true, auto_init: false,
        description: INFRAENA_MANAGED_DESCRIPTION,
      });
      return repo.html_url;
    }
    throw e;
  }
}

async function pushFileToRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  committer?: { name: string; email: string }
) {
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      ...(committer ? { committer, author: committer } : {}),
    });
  } catch {
    // file may already exist, skip
  }
}

async function pushTemplateFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  templateId: string,
  slug: string,
  log: (msg: string) => void,
  committer?: { name: string; email: string }
) {
  const files = loadTemplate(templateId);
  if (!files) {
    await log(`Template "${templateId}" not found, using blank repo.`);
    return;
  }

  await log(`Loading template: ${templateId} (${files.size} files)`);

  for (const [filePath, content] of files) {
    const finalContent = content.replace(/\{\{serviceName\}\}/g, slug);
    await pushFileToRepo(
      octokit,
      owner,
      repo,
      filePath,
      finalContent,
      `Add ${filePath} from Infraena template ${templateId}`,
      committer
    );
    await log(`  ✓ ${filePath}`);
  }
}

async function addIdpTopic(octokit: Octokit, org: string, slug: string) {
  try {
    await octokit.rest.repos.replaceAllTopics({ owner: org, repo: slug, names: [INFRAENA_MANAGED_TAG] });
    return `Added topic '${INFRAENA_MANAGED_TAG}' to repo`;
  } catch {
    return "Could not add topic (may already exist)";
  }
}

async function setBranchProtection(octokit: Octokit, org: string, slug: string) {
  try {
    await octokit.rest.repos.updateBranchProtection({
      owner: org, repo: slug, branch: "main",
      required_status_checks: { strict: true, contexts: [] },
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1 },
      restrictions: null,
    });
    return "Branch protection configured on main";
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    const message = (e as { message?: string }).message ?? String(e);
    if (status === 403) {
      return `Branch protection skipped: token lacks admin permission (${message}). Ensure your PAT has "repo" and "admin:repo_hook" scopes.`;
    }
    return `Branch protection skipped: ${message}`;
  }
}

export async function buildGitHubWorker() {
  const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

  const worker = new Worker<GitHubJobData>(
    "github-queue",
    async (job: Job<GitHubJobData>) => {
      const { serviceId, jobId, slug, category, languages, template, enableBranchProtection, repoOwner, repoName } = job.data;

      const provisionJob = await prisma.provisionJob.findUnique({
        where: { id: jobId },
      });
      if (!provisionJob) throw new Error(`Job ${jobId} not found`);

      if (!env.GITHUB_TOKEN || !env.GITHUB_ORG) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "GitHub token/org not configured — skipping repository creation.");
        await updateJobLog(provisionJob, "Set GITHUB_TOKEN and GITHUB_ORG in .env to enable.");
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
        select: { id: true, status: true, ownerId: true, repoUrl: true },
      });
      if (!service) {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Service deleted — skipping.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }
      if (service.ownerId === "00000000-0000-0000-0000-000000000000") {
        await markJobRunning(provisionJob);
        await updateJobLog(provisionJob, "Test user service — skipping external API calls.");
        await markJobSuccess(provisionJob);
        await checkAllJobsComplete(serviceId);
        return;
      }

      const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
      const org = repoOwner ?? env.GITHUB_ORG;
      const repo = repoName ?? slug;
      const templateId = template ?? (languages.length > 0 ? languages[0] : category);

      await markJobRunning(provisionJob);
      const log = (msg: string) => updateJobLog(provisionJob, msg);

      try {
        const repoUrl = `https://github.com/${org}/${repo}`;

        if (repoOwner && service.repoUrl) {
          const expectedOwner = service.repoUrl.replace(/^https?:\/\/github\.com\//, "").split("/")[0];
          if (expectedOwner && expectedOwner.toLowerCase() !== repoOwner.toLowerCase()) {
            throw new Error("Refusing to operate: repo owner does not match the service's registered repository");
          }
        } else if (repoOwner && env.GITHUB_ORG && repoOwner.toLowerCase() !== env.GITHUB_ORG.toLowerCase()) {
          throw new Error("Refusing to operate outside the configured GITHUB_ORG");
        }

        const exists = await repoExists(octokit, org, repo);

        // Fetch owner for consistent commit identity
        const ownerUser = service.ownerId
          ? await prisma.user.findUnique({ where: { id: service.ownerId }, select: { username: true, email: true, githubId: true } })
          : null;
        const committer = ownerUser ? {
          name: ownerUser.username,
          email: ownerUser.email || `${ownerUser.githubId}+${ownerUser.username}@users.noreply.github.com`,
        } : undefined;

        if (exists) {
          await log(`Repo ${org}/${repo} already exists, skipping creation.`);
        } else {
          await log(`Creating blank repo: ${org}/${repo}...`);
          const newRepoUrl = await createBlankRepo(octokit, org, repo);
          await log(`Repo created: ${newRepoUrl}`);

          await log("Initializing repo...");
          await pushFileToRepo(
            octokit, org, repo, "README.md",
            `# ${slug}\n\n${INFRAENA_MANAGED_DESCRIPTION}.`,
            "Initial commit from Infraena",
            committer
          );

          await log(`Pushing template files: ${templateId}...`);
          await pushTemplateFiles(octokit, org, repo, templateId, slug, log, committer);
        }

        const currentSvc = await prisma.service.findUnique({
          where: { id: serviceId },
          select: { repoUrl: true },
        });
        if (!currentSvc?.repoUrl) {
          await prisma.service.update({
            where: { id: serviceId },
            data: { repoUrl, repoProvider: "github" },
          });
          await log(`GitHub repo URL saved: ${repoUrl}`);
        }

        await log(`Adding ${INFRAENA_MANAGED_TAG} topic...`);
        const topicResult = await addIdpTopic(octokit, org, repo);
        await log(topicResult);

        if (enableBranchProtection !== false) {
          await log("Configuring branch protection...");
          const protectionResult = await setBranchProtection(octokit, org, repo);
          await log(protectionResult);
        } else {
          await log("Branch protection skipped (disabled by user).");
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
    { connection, concurrency: 3 }
  );

  worker.on("completed", (job) => console.log(`GitHub job ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`GitHub job ${job?.id} failed:`, err.message));
  console.log("GitHub worker started");
  return worker;
}
