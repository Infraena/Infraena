import { Queue, QueueEvents } from "bullmq";
import { env } from "./env.js";

const connection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

export const githubQueue = new Queue("github-queue", { connection });
export const terraformQueue = new Queue("terraform-queue", { connection });
export const vaultQueue = new Queue("vault-queue", { connection });

export const githubEvents = new QueueEvents("github-queue", { connection });
export const terraformEvents = new QueueEvents("terraform-queue", { connection });
export const vaultEvents = new QueueEvents("vault-queue", { connection });
