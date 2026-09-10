import { env } from "./env.js";
import { prisma } from "../db/prisma.js";
import { validateOutboundUrl, type LookupFn } from "./net.js";
import type { WebhookKind } from "@infraena/shared-types";

export type NotifyEvent = {
  event: string;
  serviceId: string;
  message: string;
  data?: Record<string, unknown>;
};

export type NotifyTarget = {
  id: string | null;
  kind: WebhookKind;
  url: string;
};

export type DeliverySummary = {
  delivered: number;
  failed: number;
};

export function buildPayload(
  kind: WebhookKind,
  message: string,
  event?: string,
  service?: string
): Record<string, unknown> {
  if (kind === "slack") return { text: message };
  if (kind === "discord") return { content: message };
  return { text: message, event, service };
}

export async function deliverNotification(
  target: NotifyTarget,
  message: string,
  event?: string,
  service?: string,
  fetchFn: typeof fetch = fetch,
  lookupFn?: LookupFn
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const guard = await validateOutboundUrl(target.url, { allowPrivate: true }, lookupFn ?? undefined);
  if (!guard.ok) {
    return { ok: false, error: `Blocked destination: ${guard.reason ?? "not allowed"}` };
  }

  try {
    const res = await fetchFn(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(target.kind, message, event, service)),
      redirect: "manual",
      signal: AbortSignal.timeout(env.NOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: err.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "Unknown error",
    };
  }
}

export function shouldReceive(events: string[], event: string): boolean {
  if (events.includes(event)) return true;
  return events.includes("*") && event !== "webhook.received";
}

export async function resolveTargets(serviceId: string, event: string): Promise<NotifyTarget[]> {
  const targets: NotifyTarget[] = [];
  if (env.SLACK_WEBHOOK_URL) targets.push({ id: null, kind: "slack", url: env.SLACK_WEBHOOK_URL });
  if (env.DISCORD_WEBHOOK_URL) targets.push({ id: null, kind: "discord", url: env.DISCORD_WEBHOOK_URL });

  const rows = await prisma.webhook.findMany({
    where: { serviceId, direction: "outbound", enabled: true },
  });
  for (const row of rows) {
    if (row.url && shouldReceive(row.events, event)) {
      targets.push({ id: row.id, kind: (row.kind as WebhookKind) ?? "generic", url: row.url });
    }
  }

  const seen = new Set<string>();
  return targets.filter((t) => {
    if (seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
}

export async function notify(event: NotifyEvent): Promise<DeliverySummary> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return { delivered: 0, failed: 0 };

  const service = await prisma.service.findUnique({
    where: { id: event.serviceId },
    select: { id: true, slug: true, name: true, repoUrl: true },
  });
  if (!service) return { delivered: 0, failed: 0 };

  const targets = await resolveTargets(service.id, event.event);
  if (targets.length === 0) return { delivered: 0, failed: 0 };

  const results = await Promise.allSettled(
    targets.map((t) => deliverNotification(t, event.message, event.event, service.slug))
  );

  let delivered = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (t, i) => {
      const r = results[i];
      const ok = r.status === "fulfilled" && r.value.ok;
      const error =
        r.status === "fulfilled" && !r.value.ok
          ? r.value.error ?? `HTTP ${r.value.status}`
          : r.status === "rejected"
            ? "Delivery failed"
            : null;
      if (ok) delivered++;
      else failed++;
      await prisma.webhookEvent.create({
        data: {
          webhookId: t.id,
          serviceId: service.id,
          direction: "outbound",
          event: event.event,
          status: ok ? "delivered" : "failed",
          error,
        },
      });
    })
  );

  return { delivered, failed };
}
