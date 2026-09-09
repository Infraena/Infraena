import { env } from "./env.js";
import { prisma } from "../db/prisma.js";
import { emitHealthUpdate } from "./socket.js";
import { healthChecksTotal } from "./metrics.js";
import type { HealthStatus } from "@infraena/shared-types";

export type HealthResult = {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  detail: string;
};

export const MAX_HEALTH_URL_LENGTH = 500;

export function isHealthUrlAllowed(url: string): boolean {
  if (url.length > MAX_HEALTH_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function runHealthCheck(
  url: string,
  timeoutMs = 5000,
  fetchFn: typeof fetch = fetch
): Promise<HealthResult> {
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const detail = err instanceof Error && err.name === "TimeoutError"
      ? `Timeout after ${timeoutMs}ms`
      : err instanceof Error ? err.message : "Network error";
    return { status: "unhealthy", latencyMs: Date.now() - startedAt, detail: detail.slice(0, 200) };
  }
  return {
    status: res.status >= 200 && res.status < 400 ? "healthy" : "unhealthy",
    latencyMs: Date.now() - startedAt,
    detail: `HTTP ${res.status}`,
  };
}

export type HealthCheckOutcome = {
  status: HealthStatus;
  latencyMs: number;
  detail: string;
  checkedAt: string;
  persisted: boolean;
};

export async function performHealthCheck(
  serviceId: string,
  source: "poll" | "manual" = "manual"
): Promise<HealthCheckOutcome | null> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, healthUrl: true },
  });
  if (!service?.healthUrl) return null;

  const result = await runHealthCheck(service.healthUrl, env.HEALTH_CHECK_TIMEOUT_MS);
  healthChecksTotal.inc({ status: result.status, source });

  const checkedAt = new Date().toISOString();
  const forcePersist = source === "manual";
  const existing = forcePersist
    ? null
    : await prisma.service.findUnique({
        where: { id: serviceId },
        select: { healthStatus: true, healthDetail: true },
      });

  const changed = !existing || existing.healthStatus !== result.status || existing.healthDetail !== result.detail;

  if (forcePersist || changed) {
    await prisma.service.update({
      where: { id: serviceId },
      data: {
        healthStatus: result.status,
        healthDetail: result.detail,
        healthLatencyMs: result.latencyMs,
        lastHealthCheckAt: new Date(checkedAt),
      },
    });
  }

  const outcome: HealthCheckOutcome = {
    status: result.status,
    latencyMs: result.latencyMs,
    detail: result.detail,
    checkedAt,
    persisted: forcePersist || changed,
  };

  emitHealthUpdate(serviceId, {
    serviceId,
    status: outcome.status,
    latencyMs: outcome.latencyMs,
    detail: outcome.detail,
    checkedAt: outcome.checkedAt,
  });

  return outcome;
}

export function startHealthChecker(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;

  const tick = async () => {
    try {
      const services = await prisma.service.findMany({
        where: { healthUrl: { not: null } },
        select: { id: true },
      });
      if (services.length === 0) return;
      await Promise.allSettled(services.map((s) => performHealthCheck(s.id, "poll")));
    } catch (err) {
      console.error("Health checker tick failed:", err instanceof Error ? err.message : "unknown");
    }
  };

  tick();
  const timer = setInterval(tick, env.HEALTH_CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
