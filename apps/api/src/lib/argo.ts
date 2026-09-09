import { env } from "./env.js";
import { prisma } from "../db/prisma.js";
import { emitDeploymentUpdate } from "./socket.js";
import { notify } from "./notify.js";
import type { DeploymentStatus } from "@infraena/shared-types";

export type ArgoConfig = {
  url?: string;
  token?: string;
};

export type ArgoAppState = {
  missing?: boolean;
  httpError?: boolean;
  phase?: string;
  syncStatus?: string;
  healthStatus?: string;
  revision?: string;
  opMessage?: string;
};

export type SyncResult = {
  ok: boolean;
  configured: boolean;
  message: string;
};

export type DeploymentOutcome = {
  status: "running" | "success" | "failed";
  message: string | null;
};

function resolveConfig(config: ArgoConfig): { url: string; token: string } {
  const url = config.url ?? env.ARGOCD_URL;
  const token = config.token ?? env.ARGOCD_TOKEN;
  if (!url || !token) return { url: "", token: "" };
  return { url: url.replace(/\/$/, ""), token };
}

function isConfigured(config: ArgoConfig): boolean {
  const { url, token } = resolveConfig(config);
  return url.length > 0 && token.length > 0;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function triggerAppSync(
  appName: string,
  fetchFn: typeof fetch = fetch,
  config: ArgoConfig = {}
): Promise<SyncResult> {
  const { url, token } = resolveConfig(config);
  if (!url || !token) return { ok: false, configured: false, message: "Argo CD not configured" };
  try {
    const res = await fetchFn(`${url}/api/v1/applications/${appName}/sync`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, configured: true, message: `Argo CD sync failed: ${err.slice(0, 200)}` };
    }
    return { ok: true, configured: true, message: `Argo CD sync triggered for ${appName}` };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      message: `Argo CD sync error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export async function getAppState(
  appName: string,
  fetchFn: typeof fetch = fetch,
  config: ArgoConfig = {}
): Promise<ArgoAppState> {
  const { url, token } = resolveConfig(config);
  if (!url || !token) return { httpError: true };
  try {
    const res = await fetchFn(`${url}/api/v1/applications/${appName}`, {
      method: "GET",
      headers: authHeaders(token),
    });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { httpError: true };
    const body = (await res.json()) as {
      status?: {
        sync?: { status?: string };
        health?: { status?: string };
        operationState?: { phase?: string; message?: string; syncResult?: { revision?: string } };
      };
    };
    const op = body.status?.operationState;
    return {
      phase: op?.phase,
      opMessage: op?.message,
      syncStatus: body.status?.sync?.status,
      healthStatus: body.status?.health?.status,
      revision: op?.syncResult?.revision,
    };
  } catch {
    return { httpError: true };
  }
}

export function decideDeploymentOutcome(state: ArgoAppState): DeploymentOutcome {
  if (state.httpError) {
    return { status: "running", message: null };
  }
  if (state.missing) {
    return { status: "failed", message: "Argo CD application not found" };
  }
  if (state.phase === "Succeeded") {
    const revision = state.revision ? ` to ${state.revision}` : "";
    const health = state.healthStatus ? ` — ${state.healthStatus}` : "";
    return { status: "success", message: `Synced${revision}${health}` };
  }
  if (state.phase === "Failed" || state.phase === "Error") {
    return { status: "failed", message: state.opMessage || `Argo CD sync ${state.phase}` };
  }
  return { status: "running", message: null };
}

type DeployTarget = { id: string; serviceId: string; argocdApp: string; createdAt: Date };

async function watchDeployment(deployment: DeployTarget) {
  const state = await getAppState(deployment.argocdApp);
  let outcome = decideDeploymentOutcome(state);

  if (outcome.status === "running" && !state.httpError) {
    const ageMs = Date.now() - deployment.createdAt.getTime();
    if (ageMs > env.ARGOCD_WATCH_TIMEOUT_MS) {
      outcome = { status: "failed", message: "Timed out waiting for Argo CD" };
    }
  }

  if (outcome.status === "running") return;

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      status: outcome.status,
      message: outcome.message,
      finishedAt: new Date(),
    },
  });

  emitDeploymentUpdate(deployment.serviceId, {
    serviceId: deployment.serviceId,
    deploymentId: deployment.id,
    status: outcome.status as DeploymentStatus,
    message: outcome.message,
    finishedAt: new Date().toISOString(),
  });

  void notify({
    event: "deployment.finished",
    serviceId: deployment.serviceId,
    message: `Deployment ${outcome.status} for ${deployment.argocdApp}${outcome.message ? ` — ${outcome.message}` : ""}`,
  });
}

export function startArgoWatcher(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  if (!isConfigured({})) return null;

  const tick = async () => {
    try {
      const deployments = await prisma.deployment.findMany({
        where: {
          status: { in: ["pending", "running"] },
          argocdApp: { not: null },
        },
        select: { id: true, serviceId: true, argocdApp: true, createdAt: true },
      });
      const targets = deployments.filter(
        (d): d is DeployTarget => d.argocdApp !== null
      );
      if (targets.length === 0) return;
      await Promise.allSettled(targets.map((d) => watchDeployment(d)));
    } catch (err) {
      console.error("Argo watcher tick failed:", err instanceof Error ? err.message : "unknown");
    }
  };

  tick();
  const timer = setInterval(tick, env.ARGOCD_POLL_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
