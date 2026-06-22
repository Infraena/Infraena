import { Worker, Job } from "bullmq";
import { Octokit } from "octokit";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { updateJobLog, markJobRunning, markJobSuccess, markJobFailed, checkAllJobsComplete } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "..", "..", "..", "..", "templates");

const templateCache = new Map<string, Map<string, string>>();

function loadTemplate(templateId: string): Map<string, string> | null {
  if (templateCache.has(templateId)) return templateCache.get(templateId)!;

  const dir = join(templatesDir, templateId);
  if (!existsSync(dir)) return null;

  const files = new Map<string, string>();
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name === "template.json") continue;
      const rel = relative(dir, full);
      files.set(rel, readFileSync(full, "utf-8"));
    }
  }
  walk(dir);
  templateCache.set(templateId, files);
  return files;
}

interface GitHubJobData {
  serviceId: string;
  jobId: string;
  slug: string;
  category: string;
  languages: string[];
  template?: string;
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
      org, name: slug, private: true, auto_init: true,
      description: `Managed by Infraena`,
    });
    return repo.html_url;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 403) {
      const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: slug, private: true, auto_init: true,
        description: `Managed by Infraena`,
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
  message: string
) {
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
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
  log: (msg: string) => void
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
      `Add ${filePath} from Infraena template ${templateId}`
    );
    await log(`  ✓ ${filePath}`);
  }
}

async function addIdpTopic(octokit: Octokit, org: string, slug: string) {
  try {
    await octokit.rest.repos.replaceAllTopics({ owner: org, repo: slug, names: ["infraena-managed"] });
    return "Added topic 'infraena-managed' to repo";
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
  } catch {
    return "Branch protection skipped (may need admin permissions)";
  }
}

export async function buildGitHubWorker() {
  const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

  const worker = new Worker<GitHubJobData>(
    "github-queue",
    async (job: Job<GitHubJobData>) => {
      const { serviceId, jobId, slug, category, languages, template } = job.data;

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
        select: { id: true, status: true, ownerId: true },
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
      const org = env.GITHUB_ORG;
      const templateId = template ?? (languages.length > 0 ? languages[0] : category);

      await markJobRunning(provisionJob);
      const log = (msg: string) => updateJobLog(provisionJob, msg);

      try {
        const exists = await repoExists(octokit, org, slug);
        if (exists) {
          await log(`Repo ${org}/${slug} already exists, skipping creation.`);
        } else {
          await log(`Creating blank repo: ${org}/${slug}...`);
          const repoUrl = await createBlankRepo(octokit, org, slug);
          await log(`Repo created: ${repoUrl}`);

          await log(`Pushing template files: ${templateId}...`);
          await pushTemplateFiles(octokit, org, slug, templateId, slug, log);

          await prisma.service.update({
            where: { id: serviceId },
            data: { githubRepoUrl: repoUrl },
          });
          await log(`GitHub repo URL saved: ${repoUrl}`);
        }

        await log("Adding infraena-managed topic...");
        const topicResult = await addIdpTopic(octokit, org, slug);
        await log(topicResult);

        await log("Configuring branch protection...");
        const protectionResult = await setBranchProtection(octokit, org, slug);
        await log(protectionResult);

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
