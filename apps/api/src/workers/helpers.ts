import { ProvisionJob } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { emitJobUpdate } from "../lib/socket.js";
import { provisionJobsTotal, recordProvisionJob, servicesGauge } from "../lib/metrics.js";

export async function updateJobLog(
  job: ProvisionJob,
  message: string
): Promise<ProvisionJob> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;

  const updated = await prisma.provisionJob.update({
    where: { id: job.id },
    data: {
      logs: { push: logEntry },
      status: job.status,
    },
  });

  emitJobUpdate(job.serviceId, {
    jobId: job.id,
    serviceId: job.serviceId,
    type: job.type as "github" | "terraform" | "vault",
    status: job.status as "pending" | "running" | "success" | "failed",
    log: logEntry,
  });

  return updated;
}

export async function markJobRunning(job: ProvisionJob): Promise<ProvisionJob> {
  const updated = await prisma.provisionJob.update({
    where: { id: job.id },
    data: {
      status: "running",
      startedAt: new Date(),
    },
  });

  emitJobUpdate(job.serviceId, {
    jobId: job.id,
    serviceId: job.serviceId,
    type: job.type as "github" | "terraform" | "vault",
    status: "running",
    log: `Job ${job.type} started`,
  });

  return updated;
}

export async function markJobSuccess(job: ProvisionJob): Promise<void> {
  await prisma.provisionJob.update({
    where: { id: job.id },
    data: {
      status: "success",
      finishedAt: new Date(),
    },
  });

  if (job.startedAt) {
    const duration = new Date().getTime() - job.startedAt.getTime();
    recordProvisionJob(job.type, duration);
  }

  provisionJobsTotal.inc({ type: job.type, status: "success" });

  emitJobUpdate(job.serviceId, {
    jobId: job.id,
    serviceId: job.serviceId,
    type: job.type as "github" | "terraform" | "vault",
    status: "success",
    log: `Job ${job.type} completed successfully`,
  });
}

export async function markJobFailed(
  job: ProvisionJob,
  error: Error
): Promise<void> {
  const errorMessage = error.message ?? "Unknown error";

  await prisma.provisionJob.update({
    where: { id: job.id },
    data: {
      status: "failed",
      error: errorMessage,
      finishedAt: new Date(),
    },
  });

  provisionJobsTotal.inc({ type: job.type, status: "failed" });

  emitJobUpdate(job.serviceId, {
    jobId: job.id,
    serviceId: job.serviceId,
    type: job.type as "github" | "terraform" | "vault",
    status: "failed",
    log: `Job ${job.type} failed: ${errorMessage}`,
  });
}

export async function checkAllJobsComplete(serviceId: string) {
  const jobs = await prisma.provisionJob.findMany({
    where: { serviceId },
  });

  const allDone = jobs.every((j) => j.status === "success" || j.status === "failed");
  const hasErrors = jobs.some((j) => j.status === "failed");

  if (allDone) {
    const newStatus = hasErrors ? "failed" : "ready";
    await prisma.service.update({
      where: { id: serviceId },
      data: { status: newStatus },
    });

    const allServices = await prisma.service.groupBy({
      by: ["status"],
      _count: true,
    });
    for (const s of allServices) {
      servicesGauge.set({ status: s.status }, s._count);
    }
  }
}
