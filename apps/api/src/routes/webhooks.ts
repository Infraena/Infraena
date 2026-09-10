import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { WEBHOOK_EVENTS } from "@infraena/shared-types";
import { prisma } from "../db/prisma.js";
import { authMiddleware, requireAdmin } from "../lib/auth.js";
import { parseInboundBody, generateWebhookToken } from "../lib/webhooks.js";
import { emitWebhookEvent } from "../lib/socket.js";
import { notify, deliverNotification } from "../lib/notify.js";
import { validateOutboundUrlSync } from "../lib/net.js";

const outboundUrlSchema = z
  .string()
  .max(2048)
  .refine((u) => validateOutboundUrlSync(u).ok, "Must be an allowed http(s) URL");

const outboundSchema = z.object({
  kind: z.enum(["slack", "discord", "generic"]),
  url: outboundUrlSchema,
  events: z.array(z.enum([...WEBHOOK_EVENTS, "*"])).optional(),
});

const outboundPatchSchema = z.object({
  enabled: z.boolean().optional(),
  url: outboundUrlSchema.optional(),
  events: z.array(z.enum([...WEBHOOK_EVENTS, "*"])).optional(),
});

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/in/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    const webhook = await prisma.webhook.findUnique({ where: { token } });
    if (!webhook || webhook.direction !== "inbound" || !webhook.enabled) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    let parsed;
    try {
      parsed = parseInboundBody(request.body);
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Invalid payload" });
    }

    const event = parsed.event;
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        webhookId: webhook.id,
        serviceId: webhook.serviceId,
        direction: "inbound",
        event,
        status: "received",
        payload: (parsed.data as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });

    const service = await prisma.service.findUnique({
      where: { id: webhook.serviceId },
      select: { id: true, slug: true, name: true },
    });
    const message = `Webhook event ${event} received for ${service?.slug ?? webhook.serviceId}`;

    if (event === "deployment.started") {
      await prisma.deployment.create({
        data: {
          serviceId: webhook.serviceId,
          version: parsed.version ?? "latest",
          environment: parsed.environment ?? "staging",
          status: "running",
          argocdApp: `infraena-${service?.slug ?? ""}`,
          message: "Reported via webhook — awaiting Argo CD",
        },
      });
    }

    emitWebhookEvent(webhook.serviceId, {
      serviceId: webhook.serviceId,
      event,
      message,
      receivedAt: new Date().toISOString(),
    });
    void notify({ event: "webhook.received", serviceId: webhook.serviceId, message });

    return reply.status(202).send({ success: true, event, webhookEventId: webhookEvent.id });
  });

  app.get("/:slug", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const [inbound, outbound, recentEvents] = await Promise.all([
      prisma.webhook.findFirst({
        where: { serviceId: service.id, direction: "inbound" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.webhook.findMany({
        where: { serviceId: service.id, direction: "outbound" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.webhookEvent.findMany({
        where: { serviceId: service.id },
        select: {
          id: true,
          webhookId: true,
          serviceId: true,
          direction: true,
          event: true,
          status: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return { inbound, outbound, recentEvents };
  });

  app.post("/:slug/inbound/regenerate", { preHandler: [authMiddleware, requireAdmin] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const token = generateWebhookToken();
    let inbound = await prisma.webhook.findFirst({
      where: { serviceId: service.id, direction: "inbound" },
    });
    if (inbound) {
      inbound = await prisma.webhook.update({ where: { id: inbound.id }, data: { token } });
    } else {
      inbound = await prisma.webhook.create({
        data: { serviceId: service.id, direction: "inbound", kind: "generic", token },
      });
    }

    return { success: true, token: inbound.token };
  });

  app.get("/:slug/events", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20")));

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const [data, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where: { serviceId: service.id },
        select: {
          id: true,
          webhookId: true,
          serviceId: true,
          direction: true,
          event: true,
          status: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.webhookEvent.count({ where: { serviceId: service.id } }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.post("/:slug/outbound", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = outboundSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const webhook = await prisma.webhook.create({
      data: {
        serviceId: service.id,
        direction: "outbound",
        kind: parsed.data.kind,
        url: parsed.data.url,
        events: parsed.data.events ?? ["*"],
      },
    });

    return reply.status(201).send({ success: true, data: webhook });
  });

  app.patch("/:slug/outbound/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const parsed = outboundPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const existing = await prisma.webhook.findFirst({
      where: { id, serviceId: service.id, direction: "outbound" },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    const updated = await prisma.webhook.update({ where: { id }, data: parsed.data });
    return { success: true, data: updated };
  });

  app.delete("/:slug/outbound/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };

    const service = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const existing = await prisma.webhook.findFirst({
      where: { id, serviceId: service.id, direction: "outbound" },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    await prisma.webhook.delete({ where: { id } });
    return { success: true };
  });

  app.post("/:slug/outbound/:id/test", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };

    const service = await prisma.service.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!service) {
      return reply.status(404).send({ error: "Service not found" });
    }

    const webhook = await prisma.webhook.findFirst({
      where: { id, serviceId: service.id, direction: "outbound" },
    });
    if (!webhook?.url) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    const result = await deliverNotification(
      { id: webhook.id, kind: webhook.kind as "slack" | "discord" | "generic", url: webhook.url },
      "Test notification from Infraena",
      "webhook.test",
      service.slug
    );

    await prisma.webhookEvent.create({
      data: {
        webhookId: webhook.id,
        serviceId: service.id,
        direction: "outbound",
        event: "webhook.test",
        status: result.ok ? "delivered" : "failed",
        error: result.ok ? null : result.error ?? `HTTP ${result.status}`,
      },
    });

    return { success: true, ok: result.ok, status: result.status, error: result.error };
  });
}
